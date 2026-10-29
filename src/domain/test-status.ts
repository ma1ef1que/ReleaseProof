import type { TestStatus } from "./report";

export const TEST_STATUSES: readonly TestStatus[] = [
  "passed",
  "failed",
  "skipped",
  "timedOut",
  "interrupted",
  "flaky",
  "expectedToFail",
  "unknown",
];

export const TEST_STATUS_LABELS: Readonly<Record<TestStatus, string>> = {
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
  timedOut: "Timed out",
  interrupted: "Interrupted",
  flaky: "Flaky",
  expectedToFail: "Expected to fail",
  unknown: "Unknown / unmapped",
};
