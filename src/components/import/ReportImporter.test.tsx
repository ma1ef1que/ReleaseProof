import generatedFixture from "../../test-fixtures/playwright-json/generated.json";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportOperation } from "../../features/import-report/worker-messages";
import { normalizePlaywrightReport } from "../../features/playwright/playwright-normalizer";
import type { ImportProgress } from "../../features/import-report/zip-reader";
import type { ReportImportResult } from "../../features/import-report/worker-messages";
import ReportImporter from "./ReportImporter";
import { createImportOperation } from "../../features/import-report/report-worker-client";

vi.mock("../../features/import-report/report-worker-client", () => ({
  createImportOperation: vi.fn(),
}));

const createImportOperationMock = vi.mocked(createImportOperation);

function importedResult(): ReportImportResult {
  const parsed = normalizePlaywrightReport(generatedFixture);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return {
    ok: true,
    value: { report: parsed.report, assets: new Map() },
  };
}

function chooseFile(fileName = "report.json") {
  const file = new File(["synthetic report"], fileName, {
    type: "application/json",
  });
  fireEvent.change(screen.getByLabelText(/Report file/), {
    target: { files: [file] },
  });
}

describe("ReportImporter", () => {
  beforeEach(() => {
    createImportOperationMock.mockReset();
  });

  it("explains local processing and supported file types", () => {
    render(<ReportImporter />);

    expect(
      screen.getByRole("heading", { name: "Import a Playwright report" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/\.json or \.zip/)).toHaveAttribute(
      "accept",
      ".json,.zip,application/json,application/zip",
    );
    expect(screen.getByText(/processed locally/)).toBeInTheDocument();
  });

  it("shows loading progress and lets the user cancel", async () => {
    const user = userEvent.setup();
    let resolveImport: (result: ReportImportResult) => void = () => {};
    const promise = new Promise<ReportImportResult>((resolve) => {
      resolveImport = resolve;
    });
    const operation: ImportOperation = {
      promise,
      cancel: vi.fn(() => {
        resolveImport({
          ok: false,
          error: { category: "cancelled", message: "Import cancelled." },
        });
      }),
    };
    createImportOperationMock.mockImplementation(
      (_file: File, onProgress: (progress: ImportProgress) => void) => {
        onProgress({
          phase: "reading",
          percent: 50,
          message: "Reading report",
        });
        return operation;
      },
    );

    render(<ReportImporter />);
    chooseFile();
    await user.click(screen.getByRole("button", { name: "Import report" }));

    expect(screen.getByRole("progressbar")).toHaveValue(50);
    await user.click(screen.getByRole("button", { name: "Cancel import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Import cancelled.",
    );
    expect(operation.cancel).toHaveBeenCalledOnce();
  });

  it("shows successful import details and clears the in-memory report", async () => {
    const user = userEvent.setup();
    createImportOperationMock.mockReturnValue({
      promise: Promise.resolve(importedResult()),
      cancel: vi.fn(),
    });

    render(<ReportImporter />);
    chooseFile();
    await user.click(screen.getByRole("button", { name: "Import report" }));

    expect(
      await screen.findByRole("heading", { name: "Report ready" }),
    ).toBeVisible();
    expect(
      screen.getByText("4 logical tests and 5 attempts"),
    ).toBeInTheDocument();

    expect(screen.getByText("Evidence incomplete")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Critical user flows checked status"),
    ).toHaveValue("not_checked");
    await user.selectOptions(
      screen.getByLabelText("Critical user flows checked status"),
      "pass",
    );
    for (const label of [
      "Known blockers reviewed",
      "Failed tests triaged",
      "Environment and build verified",
      "Relevant manual checks completed",
    ]) {
      await user.selectOptions(
        screen.getByLabelText(`${label} status`),
        "not_applicable",
      );
    }
    expect(screen.getByText("Review required")).toBeInTheDocument();

    const titleInput = screen.getByLabelText("Run / release title");
    await user.clear(titleInput);
    await user.type(titleInput, "Staging release candidate");
    expect(titleInput).toHaveValue("Staging release candidate");
    expect(screen.getByText("Staging release candidate")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear report" }));
    expect(screen.queryByRole("heading", { name: "Report ready" })).toBeNull();
  });

  it("displays actionable parser errors without exposing exception details", async () => {
    const user = userEvent.setup();
    createImportOperationMock.mockReturnValue({
      promise: Promise.resolve({
        ok: false,
        error: {
          category: "unsupported_report",
          message:
            "This Playwright report version or format is not supported yet.",
        },
      }),
      cancel: vi.fn(),
    });

    render(<ReportImporter />);
    chooseFile();
    await user.click(screen.getByRole("button", { name: "Import report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This Playwright report version or format is not supported yet.",
    );
  });
});
