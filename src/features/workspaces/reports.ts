import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedReport } from "../../domain/report";
import { calculateEvidenceStatus } from "../evidence/evidence-rules";
import {
  DEFAULT_IMPORT_LIMITS,
  validateImportFile,
  type ImportLimits,
} from "../import-report/file-validation";
import { createDefaultChecklistItems } from "../checklist/default-checklist";
import { createImportOperation } from "../import-report/report-worker-client";
import type { ImportedReport } from "../import-report/worker-messages";

export const PRIVATE_REPORT_BUCKET = "releaseproof-private-reports";
const megabyte = 1024 * 1024;
const MAX_JSON_BYTES = 10 * megabyte;
const MAX_ZIP_BYTES = 25 * megabyte;
export const PRIVATE_REPORT_IMPORT_LIMITS: ImportLimits = {
  ...DEFAULT_IMPORT_LIMITS,
  maxCompressedFileBytes: MAX_ZIP_BYTES,
  maxZipEntries: 200,
  maxTotalUncompressedBytes: 100 * megabyte,
  maxSingleUncompressedBytes: 50 * megabyte,
  maxImageAttachmentBytes: 5 * megabyte,
};
const checklistItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  status: z.enum(["not_checked", "pass", "fail", "not_applicable"]),
  note: z.string().max(500).optional(),
  required: z.boolean(),
});

const reportRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  title: z.string(),
  environment: z.string().nullable(),
  build_version: z.string().nullable(),
  commit_sha: z.string().nullable(),
  run_date: z.string().nullable(),
  notes: z.string().nullable(),
  user_reported_blocker: z.boolean(),
  source_format: z.enum(["json", "zip"]),
  source_filename: z.string(),
  source_content_type: z.string(),
  source_storage_path: z.string(),
  source_size_bytes: z.number(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
});

const checklistRecordSchema = z.object({
  item_key: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  status: z.enum(["not_checked", "pass", "fail", "not_applicable"]),
  note: z.string().nullable(),
  required: z.boolean(),
  sort_order: z.number().int().nonnegative(),
});

export type SharedReport = z.infer<typeof reportRecordSchema>;

export class PrivateReportCleanupError extends Error {
  constructor(
    readonly storagePath: string,
    message: string,
  ) {
    super(message);
    this.name = "PrivateReportCleanupError";
  }
}

export function validateSharedReportFile(
  sourceFile: Pick<File, "name" | "size">,
): void {
  const validated = validateImportFile(sourceFile);
  if (!validated.ok) {
    throw new Error(validated.error.message);
  }
  const maxBytes = validated.type === "json" ? MAX_JSON_BYTES : MAX_ZIP_BYTES;
  if (sourceFile.size > maxBytes) {
    throw new Error(
      validated.type === "json"
        ? "JSON reports must be 10 MB or smaller for cloud storage."
        : "ZIP reports must be 25 MB or smaller for cloud storage.",
    );
  }
}

export async function listSharedReports(
  client: SupabaseClient,
  workspaceId: string,
): Promise<SharedReport[]> {
  const { data, error } = await client
    .from("reports")
    .select(
      "id, workspace_id, title, environment, build_version, commit_sha, run_date, notes, user_reported_blocker, source_format, source_filename, source_content_type, source_storage_path, source_size_bytes, created_by, created_at, updated_at, version",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }
  return z.array(reportRecordSchema).parse(data);
}

export async function createSharedReport(
  client: SupabaseClient,
  workspaceId: string,
  sourceFile: File,
  report: NormalizedReport,
): Promise<string> {
  validateSharedReportFile(sourceFile);
  const validated = validateImportFile(sourceFile);
  if (!validated.ok) {
    throw new Error(validated.error.message);
  }

  const reportId = crypto.randomUUID();
  const storagePath = `${workspaceId}/${reportId}/source.${validated.type}`;
  const contentType =
    validated.type === "json" ? "application/json" : "application/zip";
  const { error: uploadError } = await client.storage
    .from(PRIVATE_REPORT_BUCKET)
    .upload(storagePath, sourceFile, {
      contentType,
      cacheControl: "0",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data, error } = await client.rpc("create_report", {
    p_workspace_id: workspaceId,
    p_report_id: reportId,
    p_source_format: validated.type,
    p_source_filename: sourceFile.name.slice(0, 255),
    p_source_size_bytes: sourceFile.size,
    p_source_content_type: contentType,
    p_metadata: getReportMetadataPayload(report.metadata),
    p_checklist: report.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      note: item.note ?? null,
      required: item.required,
    })),
  });

  if (error) {
    const { error: cleanupError } = await client.storage
      .from(PRIVATE_REPORT_BUCKET)
      .remove([storagePath]);
    if (cleanupError) {
      throw new PrivateReportCleanupError(
        storagePath,
        `The report could not be registered and its uploaded file could not be cleaned up (${cleanupError.message}).`,
      );
    }
    throw error;
  }

  return z.string().uuid().parse(data);
}

export async function downloadSharedReportSource(
  client: SupabaseClient,
  record: SharedReport,
): Promise<Blob> {
  const { data, error } = await client.storage
    .from(PRIVATE_REPORT_BUCKET)
    .download(record.source_storage_path);
  if (error) {
    throw error;
  }
  if (data.size !== record.source_size_bytes) {
    throw new Error(
      "The stored report file does not match its saved metadata.",
    );
  }
  return data;
}

export async function loadSharedReport(
  client: SupabaseClient,
  record: SharedReport,
): Promise<ImportedReport> {
  const source = await downloadSharedReportSource(client, record);
  const file = new File([source], record.source_filename, {
    type: record.source_content_type,
  });
  const operation = createImportOperation(
    file,
    () => {},
    PRIVATE_REPORT_IMPORT_LIMITS,
  );
  const result = await operation.promise;
  if (!result.ok) {
    throw new Error(
      `The stored report could not be parsed: ${result.error.message}`,
    );
  }

  const { data: checklistData, error: checklistError } = await client
    .from("qa_checklist_items")
    .select("item_key, label, status, note, required, sort_order")
    .eq("workspace_id", record.workspace_id)
    .eq("report_id", record.id)
    .order("sort_order", { ascending: true });

  if (checklistError) {
    throw checklistError;
  }

  const checklistRows = z.array(checklistRecordSchema).parse(checklistData);
  const report = result.value.report;
  const restoredReport: NormalizedReport = {
    ...report,
    metadata: {
      ...report.metadata,
      runTitle: record.title,
      environment: record.environment ?? undefined,
      buildVersion: record.build_version ?? undefined,
      commitSha: record.commit_sha ?? undefined,
      runDate: record.run_date ?? undefined,
      notes: record.notes ?? undefined,
      userReportedBlocker: record.user_reported_blocker,
    },
    checklist: checklistRows.map((item) => ({
      id: item.item_key,
      label: item.label,
      status: item.status,
      note: item.note ?? undefined,
      required: item.required,
    })),
  };
  restoredReport.evidence = calculateEvidenceStatus(restoredReport);
  return { ...result.value, report: restoredReport };
}

export async function saveSharedReportState(
  client: SupabaseClient,
  record: SharedReport,
  report: NormalizedReport,
): Promise<number> {
  const checklist = z.array(checklistItemSchema).parse(report.checklist);
  const { data, error } = await client.rpc("save_report_state", {
    p_report_id: record.id,
    p_expected_version: record.version,
    p_metadata: getReportMetadataPayload(report.metadata),
    p_checklist: checklist.map((item) => ({
      ...item,
      note: item.note ?? null,
    })),
  });

  if (error) {
    throw error;
  }
  return z.number().int().positive().parse(data);
}

export async function deleteSharedReport(
  client: SupabaseClient,
  record: SharedReport,
): Promise<void> {
  const { error } = await client.rpc("delete_report", {
    p_report_id: record.id,
  });
  if (error) {
    throw error;
  }

  const { error: cleanupError } = await client.storage
    .from(PRIVATE_REPORT_BUCKET)
    .remove([record.source_storage_path]);
  if (cleanupError) {
    throw new PrivateReportCleanupError(
      record.source_storage_path,
      `The report record was deleted, but its private file cleanup failed (${cleanupError.message}). The source is no longer readable by workspace members.`,
    );
  }
}

export async function removePrivateReportSource(
  client: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const { error } = await client.storage
    .from(PRIVATE_REPORT_BUCKET)
    .remove([storagePath]);
  if (error) {
    throw error;
  }
}

export function withDefaultChecklist(
  report: NormalizedReport,
): NormalizedReport {
  const checklist =
    report.checklist.length > 0
      ? report.checklist
      : createDefaultChecklistItems();
  const reportWithChecklist = { ...report, checklist };
  return {
    ...reportWithChecklist,
    evidence: calculateEvidenceStatus(reportWithChecklist),
  };
}

function getReportMetadataPayload(metadata: NormalizedReport["metadata"]) {
  return {
    runTitle: metadata.runTitle,
    environment: metadata.environment ?? "",
    buildVersion: metadata.buildVersion ?? "",
    commitSha: metadata.commitSha ?? "",
    runDate: metadata.runDate ?? "",
    notes: metadata.notes ?? "",
    userReportedBlocker: metadata.userReportedBlocker ?? false,
  };
}
