import type { NormalizedReport } from "../../domain/report";
import type { ImportFailure } from "./import-errors";
import type { ImportProgress, ImportedAsset } from "./zip-reader";

export type ParserWorkerRequest = {
  type: "parse";
  file: File;
};

export type ParserWorkerResponse =
  | { type: "progress"; progress: ImportProgress }
  | {
      type: "success";
      report: NormalizedReport;
      assets: ImportedAsset[];
    }
  | { type: "failure"; error: ImportFailure };

export interface ImportedReport {
  report: NormalizedReport;
  assets: ReadonlyMap<string, Blob>;
}

export type ReportImportResult =
  { ok: true; value: ImportedReport } | { ok: false; error: ImportFailure };

export interface ImportOperation {
  promise: Promise<ReportImportResult>;
  cancel: () => void;
}
