import type {
  ChecklistItem,
  NormalizedReport,
  NormalizedTest,
  RunOutcome,
  TestAttachment,
  TestAttempt,
  TestStatus,
} from "../../domain/report";
import { calculateEvidenceStatus } from "../evidence/evidence-rules";
import { createStableId } from "../../lib/ids";
import {
  playwrightJsonReportSchema,
  type PlaywrightJsonReport,
  type PlaywrightSuite,
} from "./playwright-json-schema";

const PARSER_VERSION = "1.0.0";
const REQUIRED_STATS = ["expected", "skipped", "unexpected", "flaky"] as const;

export type ReportParseErrorCategory = "empty" | "malformed" | "unsupported";

export interface ReportParseError {
  category: ReportParseErrorCategory;
  message: string;
}

export type ReportParseResult =
  | { ok: true; report: NormalizedReport }
  | { ok: false; error: ReportParseError };

export interface NormalizeOptions {
  sourceFileName?: string;
  runTitle?: string;
  importedAt?: string;
}

interface LocatedSpec {
  spec: NonNullable<PlaywrightSuite["specs"]>[number];
  suitePath: string[];
  suiteFile?: string;
}

interface AttachmentInput {
  name: string;
  contentType?: string;
  path?: string;
}

interface ResultInput {
  status: string;
  retry?: number;
  duration?: number;
  error?: unknown;
  errors?: unknown[];
  annotations?: Array<{ type: string; description?: string }>;
  attachments?: AttachmentInput[];
}

export function mapPlaywrightStatus(status: string): TestStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "timedOut":
      return "timedOut";
    case "interrupted":
      return "interrupted";
    case "flaky":
      return "flaky";
    case "expectedToFail":
      return "expectedToFail";
    default:
      return "unknown";
  }
}

export function parsePlaywrightJson(
  source: string,
  options: NormalizeOptions = {},
): ReportParseResult {
  if (source.trim().length === 0) {
    return {
      ok: false,
      error: { category: "empty", message: "The selected file is empty." },
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    return {
      ok: false,
      error: {
        category: "malformed",
        message: "The selected file is not valid JSON.",
      },
    };
  }

  return normalizePlaywrightReport(input, options);
}

export function normalizePlaywrightReport(
  input: unknown,
  options: NormalizeOptions = {},
): ReportParseResult {
  const parsed = playwrightJsonReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        category: "unsupported",
        message:
          "This Playwright report version or format is not supported yet.",
      },
    };
  }

  return { ok: true, report: normalizeReport(parsed.data, options) };
}

function normalizeReport(
  source: PlaywrightJsonReport,
  options: NormalizeOptions,
): NormalizedReport {
  const locatedSpecs = collectSpecs(source.suites);
  const warnings: string[] = [];
  const missingRequiredFields = REQUIRED_STATS.filter(
    (field) => source.stats[field] === undefined,
  ).map((field) => `stats.${field}`);

  if (missingRequiredFields.length > 0) {
    warnings.push("Some required Playwright summary fields are missing.");
  }

  const tests: NormalizedTest[] = [];
  for (const { spec, suitePath, suiteFile } of locatedSpecs) {
    for (const testCase of spec.tests ?? []) {
      const test = normalizeTest(
        spec,
        suitePath,
        suiteFile,
        testCase,
        missingRequiredFields,
        warnings,
      );
      tests.push(test);
    }
  }

  const sourceErrors = source.errors ?? [];
  if (sourceErrors.length > 0) {
    warnings.push("The Playwright report contains reporter errors.");
  }

  const statusCounts = countStatuses(tests);
  const runOutcome = determineRunOutcome(
    source,
    tests,
    missingRequiredFields,
    sourceErrors.length > 0,
  );
  const metadata = {
    id: createStableId([
      "report",
      options.sourceFileName ?? "playwright-report.json",
      source.stats.startTime ?? "",
    ]),
    sourceFormat: "playwright-json" as const,
    sourceFileName: options.sourceFileName ?? "playwright-report.json",
    importedAt: options.importedAt ?? new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    ...(typeof source.config.version === "string"
      ? { playwrightVersion: source.config.version }
      : {}),
    runTitle:
      options.runTitle ?? options.sourceFileName ?? "Playwright test run",
    ...(source.stats.startTime ? { runDate: source.stats.startTime } : {}),
    ...(source.stats.duration !== undefined
      ? { runDurationMs: source.stats.duration }
      : {}),
    runOutcome,
    isPartial:
      missingRequiredFields.length > 0 ||
      sourceErrors.length > 0 ||
      statusCounts.unknown > 0 ||
      statusCounts.interrupted > 0 ||
      tests.some((test) =>
        test.attempts.some((attempt) => attempt.status === "unknown"),
      ),
    missingRequiredFields: [...new Set(missingRequiredFields)],
    warnings: [...new Set(warnings)],
  };
  const checklist: ChecklistItem[] = [];
  const attempts = tests.flatMap((test) => test.attempts);
  const totalAttemptDurationMs =
    attempts.length > 0 &&
    attempts.every((attempt) => attempt.durationMs !== undefined)
      ? attempts.reduce(
          (total, attempt) => total + (attempt.durationMs ?? 0),
          0,
        )
      : undefined;

  const report: NormalizedReport = {
    metadata,
    tests,
    checklist,
    aggregate: {
      totalLogicalTests: tests.length,
      ...statusCounts,
      totalAttempts: attempts.length,
      ...(totalAttemptDurationMs !== undefined
        ? { totalAttemptDurationMs }
        : {}),
    },
    evidence: { status: "evidence_incomplete", reasons: [] },
  };
  report.evidence = calculateEvidenceStatus(report);

  return report;
}

function collectSpecs(
  suites: PlaywrightSuite[],
  parentPath: string[] = [],
  parentFile?: string,
): LocatedSpec[] {
  const located: LocatedSpec[] = [];

  for (const suite of suites) {
    const suitePath =
      suite.title.length > 0 ? [...parentPath, suite.title] : parentPath;
    const suiteFile = suite.file ?? parentFile;

    for (const spec of suite.specs ?? []) {
      located.push({ spec, suitePath, suiteFile });
    }

    located.push(...collectSpecs(suite.suites ?? [], suitePath, suiteFile));
  }

  return located;
}

function normalizeTest(
  spec: LocatedSpec["spec"],
  suitePath: string[],
  suiteFile: string | undefined,
  testCase: NonNullable<LocatedSpec["spec"]["tests"]>[number],
  missingRequiredFields: string[],
  warnings: string[],
): NormalizedTest {
  const filePath = spec.file ?? suiteFile;
  const projectName = testCase.projectName || undefined;
  const fullTitle = [...suitePath, spec.title]
    .filter((title) => title.length > 0)
    .join(" › ");
  const testId = createStableId([
    "test",
    filePath ?? "",
    ...suitePath,
    spec.title,
    projectName ?? "",
  ]);
  const results = testCase.results ?? [];

  if (testCase.results === undefined) {
    missingRequiredFields.push(`${fullTitle || spec.title}.results`);
    warnings.push(`Results are missing for "${fullTitle || spec.title}".`);
  }

  const attempts = results.map((result, index) =>
    normalizeAttempt(result, index, testId),
  );
  for (const result of results) {
    if (mapPlaywrightStatus(result.status) === "unknown") {
      warnings.push(
        `Unsupported test status "${result.status}" was mapped to unknown.`,
      );
    }
  }

  const lastResult = results.at(-1);
  const lastStatus = lastResult
    ? mapPlaywrightStatus(lastResult.status)
    : "unknown";
  const hadEarlierFailure = results
    .slice(0, -1)
    .some((result) =>
      ["failed", "timedOut", "interrupted"].includes(result.status),
    );
  let status: TestStatus = lastStatus;

  if (lastStatus === "passed" && hadEarlierFailure) {
    status = "flaky";
  } else if (lastStatus === "failed" && testCase.expectedStatus === "failed") {
    status = "expectedToFail";
  }

  const retryCount =
    results.length === 0
      ? 0
      : Math.max(
          results.length - 1,
          ...results.map((result, index) => result.retry ?? index),
        );
  const annotations = normalizeAnnotations([
    ...(testCase.annotations ?? []),
    ...results.flatMap((result) => result.annotations ?? []),
  ]);
  const attachments = attempts.flatMap((attempt) => attempt.attachments);
  const durationMs =
    attempts.length > 0 &&
    attempts.every((attempt) => attempt.durationMs !== undefined)
      ? attempts.reduce(
          (total, attempt) => total + (attempt.durationMs ?? 0),
          0,
        )
      : undefined;

  return {
    id: testId,
    title: spec.title,
    fullTitle,
    suitePath,
    ...(filePath !== undefined ? { filePath } : {}),
    ...(spec.line !== undefined ? { line: spec.line } : {}),
    ...(spec.column !== undefined ? { column: spec.column } : {}),
    ...(projectName !== undefined ? { projectName } : {}),
    status,
    ...(durationMs !== undefined ? { durationMs } : {}),
    retryCount,
    attempts,
    annotations,
    attachments,
  };
}

function normalizeAttempt(
  result: ResultInput,
  index: number,
  testId: string,
): TestAttempt {
  const attemptIndex = result.retry ?? index;
  const rawErrors = [
    ...(result.errors ?? []),
    ...(result.error !== undefined ? [result.error] : []),
  ];
  const errorMessages = [
    ...new Set(
      rawErrors
        .map(extractErrorMessage)
        .filter((message): message is string => message !== undefined),
    ),
  ];
  const stackTraceText = rawErrors
    .map(extractStackTrace)
    .filter((stack): stack is string => stack !== undefined)
    .join("\n\n");
  const attachments = (result.attachments ?? []).map(
    (attachment, attachmentIndex) =>
      normalizeAttachment(attachment, testId, attemptIndex, attachmentIndex),
  );

  return {
    attemptIndex,
    status: mapPlaywrightStatus(result.status),
    ...(result.duration !== undefined ? { durationMs: result.duration } : {}),
    errorMessages,
    ...(stackTraceText.length > 0 ? { stackTraceText } : {}),
    attachments,
  };
}

function normalizeAttachment(
  attachment: AttachmentInput,
  testId: string,
  attemptIndex: number,
  attachmentIndex: number,
): TestAttachment {
  const contentType = attachment.contentType ?? "application/octet-stream";

  return {
    id: createStableId([
      "attachment",
      testId,
      String(attemptIndex),
      attachment.name,
      attachment.path ?? "",
      String(attachmentIndex),
    ]),
    name: attachment.name,
    contentType,
    kind: classifyAttachment(contentType),
    ...(attachment.path ? { sourcePath: attachment.path } : {}),
    missing: true,
  };
}

function classifyAttachment(contentType: string): TestAttachment["kind"] {
  const normalizedType = contentType.toLowerCase();
  if (["image/png", "image/jpeg", "image/webp"].includes(normalizedType)) {
    return "image";
  }
  if (
    normalizedType.startsWith("text/") ||
    ["application/json", "application/xml"].includes(normalizedType)
  ) {
    return "text";
  }
  return "unsupported";
}

function extractErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }

  const record = asRecord(error);
  if (typeof record?.message === "string") {
    return record.message;
  }
  if (typeof record?.value === "string") {
    return record.value;
  }
  return undefined;
}

function extractStackTrace(error: unknown): string | undefined {
  const stack = asRecord(error)?.stack;
  return typeof stack === "string" ? stack : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeAnnotations(
  annotations: Array<{ type: string; description?: string }>,
): Array<{ type: string; description?: string }> {
  const seen = new Set<string>();
  return annotations.filter((annotation) => {
    const key = `${annotation.type}\u001f${annotation.description ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function countStatuses(tests: NormalizedTest[]) {
  return {
    passed: count(tests, "passed"),
    failed: count(tests, "failed"),
    skipped: count(tests, "skipped"),
    timedOut: count(tests, "timedOut"),
    interrupted: count(tests, "interrupted"),
    flaky: count(tests, "flaky"),
    expectedToFail: count(tests, "expectedToFail"),
    unknown: count(tests, "unknown"),
  };
}

function count(tests: NormalizedTest[], status: TestStatus): number {
  return tests.filter((test) => test.status === status).length;
}

function determineRunOutcome(
  source: PlaywrightJsonReport,
  tests: NormalizedTest[],
  missingRequiredFields: string[],
  hasReporterErrors: boolean,
): RunOutcome {
  if (
    hasReporterErrors ||
    tests.some((test) => test.status === "interrupted")
  ) {
    return "interrupted";
  }
  if (
    missingRequiredFields.length > 0 ||
    tests.some(
      (test) =>
        test.status === "unknown" ||
        test.attempts.some((attempt) => attempt.status === "unknown"),
    )
  ) {
    return "unknown";
  }
  if (source.stats.unexpected !== undefined && source.stats.unexpected > 0) {
    return "failed";
  }
  if (tests.length === 0) {
    return "unknown";
  }
  if (
    tests.some((test) => test.status === "failed" || test.status === "timedOut")
  ) {
    return "failed";
  }
  return "passed";
}
