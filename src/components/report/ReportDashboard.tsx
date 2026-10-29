import { useMemo, useState } from "react";
import type {
  ChecklistItem,
  RunOutcome,
  TestStatus,
} from "../../domain/report";
import { TEST_STATUSES, TEST_STATUS_LABELS } from "../../domain/test-status";
import type { ImportedReport } from "../../features/import-report/worker-messages";
import { formatDuration } from "../../lib/format-duration";
import ChecklistEditor from "./ChecklistEditor";
import EvidenceSummary from "./EvidenceSummary";
import ExportPreview from "../export/ExportPreview";
import MetadataEditor from "./MetadataEditor";
import type { MetadataUpdate } from "./MetadataEditor";
import TestDetails from "./TestDetails";

type StatusFilter = "all" | TestStatus;
type SortField = "status" | "title" | "duration";
const SORT_FIELDS: readonly SortField[] = ["status", "title", "duration"];
const RUN_OUTCOME_LABELS: Readonly<Record<RunOutcome, string>> = {
  passed: "Passed",
  failed: "Failed",
  interrupted: "Interrupted",
  unknown: "Unknown",
};

interface ReportDashboardProps {
  imported: ImportedReport;
  onClear: () => void;
  onUpdateAnnotation: (testId: string, annotation: string) => void;
  onUpdateChecklist: (items: ChecklistItem[]) => void;
  onUpdateMetadata: (update: MetadataUpdate) => void;
}

const STATUS_ORDER: Record<TestStatus, number> = {
  failed: 0,
  timedOut: 1,
  interrupted: 2,
  unknown: 3,
  flaky: 4,
  expectedToFail: 5,
  skipped: 6,
  passed: 7,
};

function ReportDashboard({
  imported,
  onClear,
  onUpdateAnnotation,
  onUpdateChecklist,
  onUpdateMetadata,
}: ReportDashboardProps) {
  const { report, assets } = imported;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("title");
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState(
    report.tests[0]?.id ?? "",
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleTests = useMemo(() => {
    const filtered = report.tests.filter((test) => {
      if (statusFilter !== "all" && test.status !== statusFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        test.title,
        test.fullTitle,
        test.filePath,
        test.projectName,
        ...test.attempts.flatMap((attempt) => attempt.errorMessages),
      ]
        .filter((value): value is string => value !== undefined)
        .join(" ")
        .toLocaleLowerCase();

      return searchableText.includes(normalizedQuery);
    });

    return filtered.sort((left, right) => {
      const comparison =
        sortField === "title"
          ? left.fullTitle.localeCompare(right.fullTitle)
          : sortField === "status"
            ? STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
            : (right.durationMs ?? -1) - (left.durationMs ?? -1);

      return comparison || left.fullTitle.localeCompare(right.fullTitle);
    });
  }, [normalizedQuery, report.tests, sortField, statusFilter]);

  const selectedTest =
    visibleTests.find((test) => test.id === selectedTestId) ?? visibleTests[0];
  const { aggregate, metadata } = report;
  const needsWarning =
    metadata.isPartial ||
    metadata.runOutcome === "interrupted" ||
    metadata.runOutcome === "unknown" ||
    aggregate.unknown > 0;

  const summaryCards: Array<{ label: string; value: number }> = [
    { label: "Logical tests", value: aggregate.totalLogicalTests },
    { label: "Passed", value: aggregate.passed },
    { label: "Failed", value: aggregate.failed },
    { label: "Skipped", value: aggregate.skipped },
    { label: "Flaky", value: aggregate.flaky },
    { label: "Timed out", value: aggregate.timedOut },
    { label: "Interrupted", value: aggregate.interrupted },
    { label: "Expected to fail", value: aggregate.expectedToFail },
    { label: "Unknown / unmapped", value: aggregate.unknown },
  ];

  return (
    <section className="report-dashboard" aria-labelledby="report-ready-title">
      <header className="report-header">
        <div>
          <p className="eyebrow">
            {metadata.isDemo ? "Synthetic demo report" : "Imported report"}
          </p>
          {metadata.isDemo && (
            <p className="demo-disclaimer">
              Illustrative synthetic data — not production test evidence.
            </p>
          )}
          <h2 id="report-ready-title">Report ready</h2>
          <p className="report-run-title">{metadata.runTitle}</p>
          <p className="report-count">
            {aggregate.totalLogicalTests} logical tests and{" "}
            {aggregate.totalAttempts} attempts
          </p>
        </div>
        <div className="report-header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsExportPreviewOpen(true)}
          >
            Preview export
          </button>
          <button className="secondary-button" type="button" onClick={onClear}>
            Clear report
          </button>
        </div>
      </header>

      {needsWarning && (
        <aside className="report-warning" role="status">
          <strong>Review this report for completeness.</strong>
          <p>
            The imported evidence is partial, interrupted, or contains unknown
            test statuses. Do not treat test counts alone as release approval.
          </p>
          {metadata.warnings.length > 0 && (
            <ul>
              {metadata.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </aside>
      )}

      <section aria-label="Run summary">
        <h3 className="section-title">Run summary</h3>
        <dl className="summary-grid">
          {summaryCards.map((card) => (
            <div className="summary-card" key={card.label}>
              <dt>{card.label}</dt>
              <dd>{card.value}</dd>
            </div>
          ))}
          <div className="summary-card">
            <dt>Total attempts</dt>
            <dd>{aggregate.totalAttempts}</dd>
          </div>
        </dl>
      </section>

      <section className="run-metadata" aria-label="Report information">
        <h3 className="section-title">Report information</h3>
        <dl className="metadata-grid">
          <div>
            <dt>Imported file</dt>
            <dd>{metadata.sourceFileName}</dd>
          </div>
          <div>
            <dt>Imported</dt>
            <dd>{formatTimestamp(metadata.importedAt)}</dd>
          </div>
          <div>
            <dt>Playwright run outcome</dt>
            <dd>{RUN_OUTCOME_LABELS[metadata.runOutcome]}</dd>
          </div>
          {metadata.runDurationMs !== undefined && (
            <div>
              <dt>Run duration</dt>
              <dd>{formatDuration(metadata.runDurationMs)}</dd>
            </div>
          )}
          {metadata.runDate && (
            <div>
              <dt>Run started</dt>
              <dd>{formatTimestamp(metadata.runDate)}</dd>
            </div>
          )}
          {metadata.playwrightVersion && (
            <div>
              <dt>Playwright version</dt>
              <dd>{metadata.playwrightVersion}</dd>
            </div>
          )}
        </dl>
      </section>

      <MetadataEditor metadata={metadata} onChange={onUpdateMetadata} />
      <EvidenceSummary
        status={report.evidence.status}
        reasons={report.evidence.reasons}
      />
      <ChecklistEditor items={report.checklist} onChange={onUpdateChecklist} />

      <section className="test-results" aria-labelledby="test-results-title">
        <div className="test-results-header">
          <div>
            <h3 id="test-results-title" className="section-title">
              Test results
            </h3>
            <p aria-live="polite">
              Showing {visibleTests.length} of {report.tests.length} tests
            </p>
          </div>
          <div className="test-controls">
            <label>
              Search tests
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Title, file, project, or error"
              />
            </label>
            <label>
              Filter by status
              <select
                value={statusFilter}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value === "all" || isTestStatus(value)) {
                    setStatusFilter(value);
                  }
                }}
              >
                <option value="all">All statuses</option>
                {TEST_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TEST_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort tests by
              <select
                value={sortField}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isSortField(value)) {
                    setSortField(value);
                  }
                }}
              >
                <option value="title">Title (A to Z)</option>
                <option value="status">Status</option>
                <option value="duration">Duration (longest first)</option>
              </select>
            </label>
          </div>
        </div>

        {report.tests.length === 0 ? (
          <p className="empty-state">This report contains no tests.</p>
        ) : visibleTests.length === 0 ? (
          <p className="empty-state">
            {statusFilter === "failed" && aggregate.failed === 0
              ? "No failed tests were found."
              : "No tests match your search and filters."}
          </p>
        ) : (
          <div className="test-workspace">
            <ul className="test-list" aria-label="Matching tests">
              {visibleTests.map((test) => (
                <li key={test.id}>
                  <button
                    className="test-list-item"
                    type="button"
                    aria-pressed={test.id === selectedTest?.id}
                    onClick={() => setSelectedTestId(test.id)}
                  >
                    <span className="test-list-heading">
                      <span className="test-list-title">{test.fullTitle}</span>
                      <span
                        className={`status-badge status-${test.status}`}
                        aria-label={`Status: ${TEST_STATUS_LABELS[test.status]}`}
                      >
                        {TEST_STATUS_LABELS[test.status]}
                      </span>
                    </span>
                    <span className="test-list-meta">
                      {test.projectName && <span>{test.projectName}</span>}
                      <span>{formatDuration(test.durationMs)}</span>
                      <span>
                        {test.retryCount}{" "}
                        {test.retryCount === 1 ? "retry" : "retries"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selectedTest && (
              <TestDetails
                test={selectedTest}
                assets={assets}
                onUpdateAnnotation={onUpdateAnnotation}
              />
            )}
          </div>
        )}
      </section>
      {isExportPreviewOpen && (
        <ExportPreview
          imported={imported}
          onClose={() => setIsExportPreviewOpen(false)}
        />
      )}
    </section>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isTestStatus(value: string): value is TestStatus {
  return TEST_STATUSES.some((status) => status === value);
}

function isSortField(value: string): value is SortField {
  return SORT_FIELDS.some((field) => field === value);
}

export default ReportDashboard;
