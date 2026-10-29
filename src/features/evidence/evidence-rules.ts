import type {
  EvidenceStatus,
  NormalizedReport,
  TestStatus,
} from "../../domain/report";

export const NO_KNOWN_BLOCKERS_DISCLAIMER =
  "This summary reflects only the evidence imported into this report. It is not a guarantee of release safety or a release approval.";

type EvidenceInput = Pick<NormalizedReport, "metadata" | "tests" | "checklist">;

const reviewStatuses = new Set<TestStatus>([
  "failed",
  "timedOut",
  "interrupted",
  "flaky",
  "expectedToFail",
]);

export function calculateEvidenceStatus(report: EvidenceInput): {
  status: EvidenceStatus;
  reasons: string[];
} {
  const incompleteReasons: string[] = [];

  if (report.metadata.isPartial) {
    incompleteReasons.push("The imported report is partial.");
  }

  if (report.metadata.missingRequiredFields.length > 0) {
    incompleteReasons.push(
      `Required source fields are missing: ${report.metadata.missingRequiredFields.join(", ")}.`,
    );
  }

  if (report.tests.length === 0) {
    incompleteReasons.push("The report contains no tests.");
  }

  if (report.tests.some((test) => test.status === "unknown")) {
    incompleteReasons.push("One or more tests have an unknown status.");
  }

  if (report.metadata.runOutcome === "interrupted") {
    incompleteReasons.push("The Playwright run was interrupted.");
  } else if (report.metadata.runOutcome === "unknown") {
    incompleteReasons.push(
      "The Playwright run outcome could not be determined.",
    );
  }

  if (
    report.checklist.some(
      (item) => item.required && item.status === "not_checked",
    )
  ) {
    incompleteReasons.push("A required checklist item has not been checked.");
  }

  if (report.checklist.some((item) => item.label.trim().length === 0)) {
    incompleteReasons.push("One or more checklist items are missing a label.");
  }

  if (incompleteReasons.length > 0) {
    return { status: "evidence_incomplete", reasons: incompleteReasons };
  }

  const reviewReasons: string[] = [];

  if (report.tests.some((test) => reviewStatuses.has(test.status))) {
    reviewReasons.push(
      "One or more tests failed, timed out, were interrupted, were flaky, or were expected to fail.",
    );
  }

  if (report.checklist.some((item) => item.status === "fail")) {
    reviewReasons.push("A checklist item is marked as failed.");
  }

  if (report.metadata.userReportedBlocker) {
    reviewReasons.push(
      "A user marked the release notes as indicating a blocker.",
    );
  }

  if (reviewReasons.length > 0) {
    return { status: "review_required", reasons: reviewReasons };
  }

  return {
    status: "no_known_blockers",
    reasons: [
      "All mapped tests passed or were skipped, the report is complete, and all required checklist items were marked pass or not applicable.",
    ],
  };
}
