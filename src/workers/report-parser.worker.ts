import { processImportFile } from "../features/import-report/import-file-processor";
import { toImportFailure } from "../features/import-report/import-errors";
import type { ParserWorkerRequest } from "../features/import-report/worker-messages";

const workerScope = self;

workerScope.onmessage = (event: MessageEvent<ParserWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "parse") {
    return;
  }

  void processImportFile(request.file, (progress) => {
    workerScope.postMessage({ type: "progress", progress });
  }).then(
    ({ report, assets }) => {
      workerScope.postMessage({ type: "success", report, assets });
    },
    (error: unknown) => {
      workerScope.postMessage({
        type: "failure",
        error: toImportFailure(error),
      });
    },
  );
};
