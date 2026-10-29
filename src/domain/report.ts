export type TestStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timedOut"
  | "interrupted"
  | "flaky"
  | "expectedToFail"
  | "unknown";

export type EvidenceStatus =
  "evidence_incomplete" | "review_required" | "no_known_blockers";

export type RunOutcome = "passed" | "failed" | "interrupted" | "unknown";

export interface ReportMetadata {
  id: string;
  sourceFormat: "playwright-json";
  sourceFileName: string;
  importedAt: string;
  parserVersion: string;
  isDemo?: boolean;
  playwrightVersion?: string;
  runTitle: string;
  environment?: string;
  buildVersion?: string;
  commitSha?: string;
  runDate?: string;
  notes?: string;
  userReportedBlocker?: boolean;
  runDurationMs?: number;
  runOutcome: RunOutcome;
  isPartial: boolean;
  missingRequiredFields: string[];
  warnings: string[];
}

export interface TestAttachment {
  id: string;
  name: string;
  contentType: string;
  kind: "image" | "text" | "unsupported";
  sourcePath?: string;
  objectUrl?: string;
  sizeBytes?: number;
  missing: boolean;
}

export interface TestAttempt {
  attemptIndex: number;
  status: TestStatus;
  durationMs?: number;
  errorMessages: string[];
  stackTraceText?: string;
  attachments: TestAttachment[];
}

export interface NormalizedTest {
  id: string;
  title: string;
  fullTitle: string;
  suitePath: string[];
  filePath?: string;
  line?: number;
  column?: number;
  projectName?: string;
  status: TestStatus;
  durationMs?: number;
  retryCount: number;
  attempts: TestAttempt[];
  annotations: Array<{ type: string; description?: string }>;
  attachments: TestAttachment[];
  userAnnotation?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: "pass" | "fail" | "not_checked" | "not_applicable";
  note?: string;
  required: boolean;
}

export interface NormalizedReport {
  metadata: ReportMetadata;
  tests: NormalizedTest[];
  checklist: ChecklistItem[];
  aggregate: {
    totalLogicalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    interrupted: number;
    flaky: number;
    expectedToFail: number;
    unknown: number;
    totalAttempts: number;
    totalAttemptDurationMs?: number;
  };
  evidence: {
    status: EvidenceStatus;
    reasons: string[];
  };
}
