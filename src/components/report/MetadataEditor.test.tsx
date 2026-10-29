import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import generatedFixture from "../../test-fixtures/playwright-json/generated.json";
import { normalizePlaywrightReport } from "../../features/playwright/playwright-normalizer";
import MetadataEditor from "./MetadataEditor";

describe("MetadataEditor", () => {
  it("updates run metadata and captures an explicit blocker declaration", () => {
    const parsed = normalizePlaywrightReport(generatedFixture);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const onChange = vi.fn();
    render(
      <MetadataEditor metadata={parsed.report.metadata} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText("Run / release title"), {
      target: { value: "Release candidate 12" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      runTitle: "Release candidate 12",
    });

    fireEvent.change(screen.getByLabelText("Environment"), {
      target: { value: "staging" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ environment: "staging" });

    fireEvent.change(screen.getByLabelText("Release notes"), {
      target: { value: "The service is ready for review." },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      notes: "The service is ready for review.",
    });

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "These notes identify a release blocker",
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ userReportedBlocker: true });
  });
});
