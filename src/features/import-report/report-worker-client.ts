import { getImportErrorMessage, toImportFailure } from "./import-errors";
import { validateImportFile } from "./file-validation";
import type { ImportProgress } from "./zip-reader";
import type {
  ImportOperation,
  ParserWorkerResponse,
  ReportImportResult,
} from "./worker-messages";

export function createImportOperation(
  file: File,
  onProgress: (progress: ImportProgress) => void,
): ImportOperation {
  const validation = validateImportFile(file);
  if (!validation.ok) {
    return {
      promise: Promise.resolve({ ok: false, error: validation.error }),
      cancel: () => {},
    };
  }

  let worker: Worker;
  try {
    worker = new Worker(
      new URL("../../workers/report-parser.worker.ts", import.meta.url),
      { type: "module" },
    );
  } catch {
    return {
      promise: Promise.resolve({
        ok: false,
        error: {
          category: "worker_unavailable",
          message: getImportErrorMessage("worker_unavailable"),
        },
      }),
      cancel: () => {},
    };
  }

  let resolvePromise: (result: ReportImportResult) => void = () => {};
  const promise = new Promise<ReportImportResult>((resolve) => {
    resolvePromise = resolve;
  });
  let settled = false;

  const finish = (result: ReportImportResult) => {
    if (settled) {
      return;
    }
    settled = true;
    worker.terminate();
    resolvePromise(result);
  };

  worker.onmessage = (event: MessageEvent<ParserWorkerResponse>) => {
    const response = event.data;
    if (response.type === "progress") {
      onProgress(response.progress);
      return;
    }
    if (response.type === "failure") {
      finish({ ok: false, error: response.error });
      return;
    }

    finish({
      ok: true,
      value: {
        report: response.report,
        assets: new Map(
          response.assets.map((asset) => [asset.attachmentId, asset.blob]),
        ),
      },
    });
  };

  worker.onerror = (event) => {
    event.preventDefault();
    finish({
      ok: false,
      error: {
        category: "worker_failure",
        message: getImportErrorMessage("worker_failure"),
      },
    });
  };

  worker.onmessageerror = () => {
    finish({
      ok: false,
      error: {
        category: "worker_failure",
        message: getImportErrorMessage("worker_failure"),
      },
    });
  };

  try {
    worker.postMessage({ type: "parse", file });
  } catch (error) {
    finish({ ok: false, error: toImportFailure(error) });
  }

  return {
    promise,
    cancel: () => {
      finish({
        ok: false,
        error: {
          category: "cancelled",
          message: getImportErrorMessage("cancelled"),
        },
      });
    },
  };
}
