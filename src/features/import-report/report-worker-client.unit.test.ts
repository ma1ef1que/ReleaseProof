import generatedFixture from "../../test-fixtures/playwright-json/generated.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePlaywrightReport } from "../playwright/playwright-normalizer";
import type { ImportProgress } from "./zip-reader";
import type { ParserWorkerResponse } from "./worker-messages";
import { createImportOperation } from "./report-worker-client";

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent<ParserWorkerResponse>) => void) | null =
    null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    MockWorker.instances.push(this);
  }
}

function getNormalizedReport() {
  const result = normalizePlaywrightReport(generatedFixture);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.report;
}

function sendMessage(worker: MockWorker, data: ParserWorkerResponse) {
  worker.onmessage?.(new MessageEvent("message", { data }));
}

describe("report worker client", () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports progress and returns normalized data with an ephemeral asset map", async () => {
    const progress: ImportProgress[] = [];
    const blob = new Blob(["image data"], { type: "image/png" });
    const operation = createImportOperation(
      new File(["{}"], "report.json"),
      (update) => progress.push(update),
    );
    const worker = MockWorker.instances[0];
    if (!worker) {
      throw new Error("The parser worker was not created.");
    }

    sendMessage(worker, {
      type: "progress",
      progress: {
        phase: "reading",
        percent: 40,
        message: "Reading report",
      },
    });
    sendMessage(worker, {
      type: "success",
      report: getNormalizedReport(),
      assets: [{ attachmentId: "asset-1", blob }],
    });

    const result = await operation.promise;
    expect(progress[0]?.percent).toBe(40);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.assets.get("asset-1")).toBe(blob);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("validates the file before creating a worker", async () => {
    const result = await createImportOperation(
      new File(["report"], "report.html"),
      () => {},
    ).promise;

    expect(result).toMatchObject({
      ok: false,
      error: { category: "unsupported_type" },
    });
    expect(MockWorker.instances).toHaveLength(0);
  });

  it("terminates work and returns a typed cancellation result", async () => {
    const operation = createImportOperation(
      new File(["{}"], "report.json"),
      () => {},
    );
    const worker = MockWorker.instances[0];
    if (!worker) {
      throw new Error("The parser worker was not created.");
    }

    operation.cancel();
    expect(await operation.promise).toMatchObject({
      ok: false,
      error: { category: "cancelled" },
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
