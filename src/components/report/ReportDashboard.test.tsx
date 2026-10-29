import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import generatedFixture from "../../test-fixtures/playwright-json/generated.json";
import type { NormalizedReport, TestAttachment } from "../../domain/report";
import { createDefaultChecklistItems } from "../../features/checklist/default-checklist";
import { calculateEvidenceStatus } from "../../features/evidence/evidence-rules";
import { normalizePlaywrightReport } from "../../features/playwright/playwright-normalizer";
import ReportDashboard from "./ReportDashboard";

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL",
);
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL",
);

function createReport(): NormalizedReport {
  const parsed = normalizePlaywrightReport(generatedFixture, {
    sourceFileName: "playwright-report.json",
    importedAt: "2026-10-29T12:00:00.000Z",
  });
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  const report = {
    ...parsed.report,
    checklist: createDefaultChecklistItems(),
  };
  return { ...report, evidence: calculateEvidenceStatus(report) };
}

function restoreUrlMethod(
  name: "createObjectURL" | "revokeObjectURL",
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(URL, name, descriptor);
  } else {
    Reflect.deleteProperty(URL, name);
  }
}

afterEach(() => {
  restoreUrlMethod("createObjectURL", originalCreateObjectUrl);
  restoreUrlMethod("revokeObjectURL", originalRevokeObjectUrl);
});

describe("ReportDashboard", () => {
  it("shows report summaries and supports status filters and error search", () => {
    const report = createReport();
    render(
      <ReportDashboard
        imported={{ report, assets: new Map() }}
        onClear={vi.fn()}
        onUpdateAnnotation={vi.fn()}
        onUpdateChecklist={vi.fn()}
        onUpdateMetadata={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Report ready" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("4 logical tests and 5 attempts"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Report information" }),
      ).getByText("playwright-report.json"),
    ).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Run summary" });
    expect(within(summary).getByText("Flaky")).toBeInTheDocument();
    expect(within(summary).getByText("Unknown / unmapped")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "flaky" },
    });
    const testList = screen.getByRole("list", { name: "Matching tests" });
    expect(
      within(testList).getByRole("button", {
        name: /recovers after a retry/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(testList).queryByRole("button", { name: /passes normally/i }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("Search tests"), {
      target: { value: "Error:" },
    });
    expect(
      within(screen.getByRole("list", { name: "Matching tests" })).getByRole(
        "button",
        { name: /expected failure is reported/i },
      ),
    ).toBeInTheDocument();
  });

  it("renders error and stack content as text and permits a test annotation", () => {
    const report = createReport();
    const test = report.tests.find((item) =>
      item.title.includes("expected failure"),
    );
    if (!test) {
      throw new Error("Generated fixture has no expected-failure test.");
    }
    test.attempts[0]!.errorMessages = ["<img src=x onerror=alert(1)>"];
    test.attempts[0]!.stackTraceText =
      "Error: sample stack\n  at test.spec.ts:1";
    const onUpdateAnnotation = vi.fn();

    render(
      <ReportDashboard
        imported={{ report, assets: new Map() }}
        onClear={vi.fn()}
        onUpdateAnnotation={onUpdateAnnotation}
        onUpdateChecklist={vi.fn()}
        onUpdateMetadata={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /expected failure is reported/i }),
    );
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(document.querySelector("img[src='x']")).toBeNull();

    const stackDisclosure = screen.getByText("Show stack trace");
    expect(stackDisclosure.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(stackDisclosure);
    expect(screen.getByText(/Error: sample stack/)).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", { name: "QA annotation" }), {
      target: { value: "Reviewed with the release team." },
    });
    expect(onUpdateAnnotation).toHaveBeenLastCalledWith(
      test.id,
      "Reviewed with the release team.",
    );
    expect(test.status).toBe("expectedToFail");
  });

  it("previews supported images and escaped text, reports missing attachments, and revokes URLs", async () => {
    const createObjectUrl = vi.fn(() => "blob:synthetic-image");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    const report = createReport();
    const test = report.tests[0];
    if (!test) {
      throw new Error("Generated fixture has no tests.");
    }

    const imageAttachment: TestAttachment = {
      id: "image-attachment",
      name: "screenshot.png",
      contentType: "image/png",
      kind: "image",
      sourcePath: "assets/screenshot.png",
      missing: false,
    };
    const textAttachment: TestAttachment = {
      id: "text-attachment",
      name: "details.txt",
      contentType: "text/plain",
      kind: "text",
      missing: false,
    };
    const missingAttachment: TestAttachment = {
      id: "missing-attachment",
      name: "missing.png",
      contentType: "image/png",
      kind: "image",
      missing: true,
    };
    test.attachments = [imageAttachment, textAttachment, missingAttachment];
    const textBlob = new Blob(["<script>not executable</script>"], {
      type: "text/plain",
    });
    const view = render(
      <ReportDashboard
        imported={{
          report,
          assets: new Map([
            [
              imageAttachment.id,
              new Blob(["synthetic"], { type: "image/png" }),
            ],
            [textAttachment.id, textBlob],
          ]),
        }}
        onClear={vi.fn()}
        onUpdateAnnotation={vi.fn()}
        onUpdateChecklist={vi.fn()}
        onUpdateMetadata={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("img", { name: "screenshot.png" }),
    ).toHaveAttribute("src", "blob:synthetic-image");
    expect(
      await screen.findByText("<script>not executable</script>"),
    ).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(
      screen.getByText("Attachment not included in imported bundle."),
    ).toBeVisible();

    view.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:synthetic-image");
  });

  it("shows clear empty states when no tests match", () => {
    const report = createReport();
    render(
      <ReportDashboard
        imported={{ report, assets: new Map() }}
        onClear={vi.fn()}
        onUpdateAnnotation={vi.fn()}
        onUpdateChecklist={vi.fn()}
        onUpdateMetadata={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search tests"), {
      target: { value: "no-such-test" },
    });
    expect(
      screen.getByText("No tests match your search and filters."),
    ).toBeVisible();
  });

  it("sorts by duration and explains when no failed tests exist", () => {
    const report = createReport();
    report.tests[0]!.durationMs = 9000;
    report.tests[1]!.durationMs = 1000;
    render(
      <ReportDashboard
        imported={{ report, assets: new Map() }}
        onClear={vi.fn()}
        onUpdateAnnotation={vi.fn()}
        onUpdateChecklist={vi.fn()}
        onUpdateMetadata={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No screenshots are available for this test."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sort tests by"), {
      target: { value: "status" },
    });
    const testList = screen.getByRole("list", { name: "Matching tests" });
    expect(within(testList).getAllByRole("button")[0]).toHaveTextContent(
      "recovers after a retry",
    );

    fireEvent.change(screen.getByLabelText("Sort tests by"), {
      target: { value: "duration" },
    });
    expect(within(testList).getAllByRole("button")[0]).toHaveTextContent(
      "passes normally",
    );

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "failed" },
    });
    expect(screen.getByText("No failed tests were found.")).toBeVisible();
  });

  it("warns when the source report is partial or contains unknown statuses", () => {
    const report = createReport();
    report.metadata.isPartial = true;
    report.metadata.warnings = ["An unsupported status was found."];
    report.aggregate.unknown = 1;
    render(
      <ReportDashboard
        imported={{ report, assets: new Map() }}
        onClear={vi.fn()}
        onUpdateAnnotation={vi.fn()}
        onUpdateChecklist={vi.fn()}
        onUpdateMetadata={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Review this report for completeness.",
    );
    expect(
      screen.getByText("An unsupported status was found."),
    ).toBeInTheDocument();
  });
});
