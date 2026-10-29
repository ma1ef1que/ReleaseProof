import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EvidenceSummary from "./EvidenceSummary";

describe("EvidenceSummary", () => {
  it("displays the exact incomplete status and triggered rules", () => {
    render(
      <EvidenceSummary
        status="evidence_incomplete"
        reasons={[
          "The imported report is partial.",
          "A required checklist item has not been checked.",
        ]}
      />,
    );

    expect(screen.getByText("Evidence incomplete")).toBeInTheDocument();
    expect(screen.getByText("Why am I seeing this?")).toBeInTheDocument();
    expect(
      screen.getByText("The imported report is partial."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A required checklist item has not been checked."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a guarantee of release safety/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it("shows the review status without implying release approval", () => {
    render(
      <EvidenceSummary
        status="review_required"
        reasons={["A checklist item is marked as failed."]}
      />,
    );

    expect(screen.getByText("Review required")).toBeInTheDocument();
    expect(
      screen.getByText("A checklist item is marked as failed."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No known blockers in imported evidence"),
    ).toBeNull();
  });

  it("explains the no-known-blockers status and always includes the disclaimer", () => {
    render(
      <EvidenceSummary
        status="no_known_blockers"
        reasons={[
          "All mapped tests passed or were skipped, the report is complete, and all required checklist items were marked pass or not applicable.",
        ]}
      />,
    );

    expect(
      screen.getByText("No known blockers in imported evidence"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/all mapped tests passed or were skipped/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a guarantee of release safety/i),
    ).toBeInTheDocument();
  });
});
