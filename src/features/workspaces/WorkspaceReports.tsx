import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { ChecklistItem, NormalizedReport } from "../../domain/report";
import { calculateEvidenceStatus } from "../evidence/evidence-rules";
import { useAuth } from "../auth/auth-context";
import { getWorkspaceErrorMessage } from "./workspaces";
import {
  createSharedReport,
  downloadSharedReportSource,
  deleteSharedReport,
  listSharedReports,
  loadSharedReport,
  PrivateReportCleanupError,
  PRIVATE_REPORT_IMPORT_LIMITS,
  removePrivateReportSource,
  saveSharedReportState,
  withDefaultChecklist,
  validateSharedReportFile,
  type SharedReport,
} from "./reports";
import type { ImportProgress } from "../import-report/zip-reader";
import { createImportOperation } from "../import-report/report-worker-client";
import type { ImportedReport } from "../import-report/worker-messages";
import ReportDashboard from "../../components/report/ReportDashboard";
import type { MetadataUpdate } from "../../components/report/MetadataEditor";

interface WorkspaceReportsProps {
  workspaceId: string;
  actorRole: string | undefined;
}

function WorkspaceReports({ workspaceId, actorRole }: WorkspaceReportsProps) {
  const { client } = useAuth();
  const [records, setRecords] = useState<SharedReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedReportId, setLoadedReportId] = useState<string | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [imported, setImported] = useState<ImportedReport | null>(null);
  const [workingReport, setWorkingReport] = useState<NormalizedReport | null>(
    null,
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expectedUpload, setExpectedUpload] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [cleanupPath, setCleanupPath] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );
  const canEdit = ["owner", "admin", "editor"].includes(actorRole ?? "");
  const canDelete = actorRole === "owner" || actorRole === "admin";

  useEffect(() => {
    if (!client) {
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);
    void listSharedReports(client, workspaceId)
      .then((items) => {
        if (active) {
          setRecords(items);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            getWorkspaceErrorMessage(
              cause,
              "We could not load reports for this workspace.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, workspaceId]);

  useEffect(() => {
    if (!client || !selectedRecord) {
      setImported(null);
      setWorkingReport(null);
      setIsDirty(false);
      setLoadedReportId(null);
      setLoadedVersion(null);
      return;
    }

    if (
      loadedReportId === selectedRecord.id &&
      loadedVersion === selectedRecord.version
    ) {
      return;
    }

    if (
      loadedReportId === selectedRecord.id &&
      loadedVersion !== null &&
      loadedVersion !== selectedRecord.version &&
      isDirty
    ) {
      setError(
        "This report changed in another session. Your unsaved edits are preserved; reload before saving.",
      );
      setIsLoading(false);
      return;
    }

    let active = true;
    setImported(null);
    setWorkingReport(null);
    setIsDirty(false);
    setError(null);
    setIsLoading(true);
    void loadSharedReport(client, selectedRecord)
      .then((loaded) => {
        if (active) {
          setImported(loaded);
          setWorkingReport(loaded.report);
          setLoadedReportId(selectedRecord.id);
          setLoadedVersion(selectedRecord.version);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            getWorkspaceErrorMessage(
              cause,
              "The private report file could not be loaded or parsed.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, isDirty, loadedReportId, loadedVersion, selectedRecord]);

  useEffect(() => {
    if (!client) {
      return;
    }

    let active = true;
    const channel = client
      .channel(`workspace-reports-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reports",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void listSharedReports(client, workspaceId)
            .then((items) => {
              if (active) {
                setRecords(items);
              }
            })
            .catch((cause: unknown) => {
              if (active) {
                setError(
                  getWorkspaceErrorMessage(
                    cause,
                    "Live report updates could not be refreshed.",
                  ),
                );
              }
            });
        },
      )
      .subscribe((status) => {
        if (active && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          setError(
            "Live report updates are unavailable. Use Refresh reports to check for changes.",
          );
        }
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [client, workspaceId]);

  async function refreshRecords() {
    if (!client) {
      return [];
    }
    const items = await listSharedReports(client, workspaceId);
    setRecords(items);
    return items;
  }

  async function handleRefreshRecords() {
    setIsLoading(true);
    setError(null);
    try {
      await refreshRecords();
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "The workspace report list could not be refreshed.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !client) {
      return;
    }
    if (!expectedUpload) {
      setError(
        "Confirm that the report file and any included attachments may be uploaded to this workspace.",
      );
      return;
    }

    setError(null);
    setNotice(null);
    setIsImporting(true);
    setProgress({
      phase: "validating",
      percent: 0,
      message: "Validating the report locally before upload",
    });

    let reportId: string;
    try {
      validateSharedReportFile(file);
      const operation = createImportOperation(
        file,
        setProgress,
        PRIVATE_REPORT_IMPORT_LIMITS,
      );
      const result = await operation.promise;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      const report = withDefaultChecklist(result.value.report);
      reportId = await createSharedReport(client, workspaceId, file, report);
    } catch (cause) {
      if (cause instanceof PrivateReportCleanupError) {
        setCleanupPath(cause.storagePath);
        setError(cause.message);
      } else {
        setError(
          getWorkspaceErrorMessage(
            cause,
            "The report could not be uploaded. It was parsed locally first.",
          ),
        );
      }
      return;
    } finally {
      setIsImporting(false);
      setProgress(null);
      setExpectedUpload(false);
    }

    setSelectedId(reportId);
    setNotice(
      "Report uploaded to private workspace storage. Members with access can view the stored report.",
    );
    try {
      const updatedRecords = await refreshRecords();
      if (!updatedRecords.some((record) => record.id === reportId)) {
        setError(
          "The report was uploaded, but it is not visible in the refreshed list. Reload the page before retrying.",
        );
      }
    } catch (cause) {
      setError(
        `The report was uploaded, but its list could not be refreshed. ${getWorkspaceErrorMessage(
          cause,
          "Refresh reports to verify the upload.",
        )}`,
      );
    }
  }

  function updateReport(
    transform: (report: NormalizedReport) => NormalizedReport,
  ) {
    if (!workingReport) {
      return;
    }
    const updated = transform(workingReport);
    const next = { ...updated, evidence: calculateEvidenceStatus(updated) };
    setWorkingReport(next);
    setImported((current) => (current ? { ...current, report: next } : null));
    setIsDirty(true);
  }

  async function reloadSelectedReport() {
    if (!selectedId) {
      return;
    }
    if (
      isDirty &&
      !window.confirm(
        "Reloading will discard your unsaved report changes. Continue?",
      )
    ) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setIsDirty(false);
    setImported(null);
    setWorkingReport(null);
    setLoadedReportId(null);
    setLoadedVersion(null);
    try {
      const updatedRecords = await refreshRecords();
      if (!updatedRecords.some((record) => record.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "The report list could not be refreshed.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (
      !client ||
      !selectedRecord ||
      !workingReport ||
      loadedVersion === null
    ) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const version = await saveSharedReportState(
        client,
        { ...selectedRecord, version: loadedVersion },
        workingReport,
      );
      const updatedRecord = {
        ...selectedRecord,
        title: workingReport.metadata.runTitle.trim(),
        environment: workingReport.metadata.environment?.trim() || null,
        build_version: workingReport.metadata.buildVersion?.trim() || null,
        commit_sha: workingReport.metadata.commitSha?.trim() || null,
        run_date: workingReport.metadata.runDate ?? null,
        notes: workingReport.metadata.notes?.trim() || null,
        user_reported_blocker:
          workingReport.metadata.userReportedBlocker ?? false,
        version,
        updated_at: new Date().toISOString(),
      };
      setRecords((current) =>
        current.map((record) =>
          record.id === updatedRecord.id ? updatedRecord : record,
        ),
      );
      setLoadedReportId(selectedRecord.id);
      setLoadedVersion(version);
      setIsDirty(false);
      setNotice("Report details and checklist saved for workspace members.");
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "The report could not be saved. Reload it to check for another member's changes.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDownload(record: SharedReport) {
    if (!client) {
      return;
    }
    setIsDownloading(true);
    setError(null);
    try {
      const source = await downloadSharedReportSource(client, record);
      const url = URL.createObjectURL(source);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.source_filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "The private report file could not be downloaded.",
        ),
      );
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleRetryCleanup() {
    if (!client || !cleanupPath) {
      return;
    }
    setIsCleaning(true);
    setError(null);
    try {
      await removePrivateReportSource(client, cleanupPath);
      setCleanupPath(null);
      setNotice("The private report file was cleaned up.");
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "Private report file cleanup is still pending. Try again when Storage is available.",
        ),
      );
    } finally {
      setIsCleaning(false);
    }
  }

  async function handleDelete(record: SharedReport) {
    if (!client) {
      return;
    }
    const unsavedWarning =
      selectedId === record.id && isDirty
        ? " This also discards your unsaved changes."
        : "";
    if (
      !window.confirm(
        `Delete "${record.title}" and its private source file?${unsavedWarning}`,
      )
    ) {
      return;
    }

    setPendingDeleteId(record.id);
    setError(null);
    setNotice(null);
    try {
      await deleteSharedReport(client, record);
    } catch (cause) {
      if (cause instanceof PrivateReportCleanupError) {
        setCleanupPath(cause.storagePath);
        setError(cause.message);
      } else {
        setError(
          getWorkspaceErrorMessage(
            cause,
            "The report deletion or private file cleanup did not complete.",
          ),
        );
      }
      try {
        const remaining = await refreshRecords();
        if (
          !remaining.some((item) => item.id === record.id) &&
          selectedId === record.id
        ) {
          setSelectedId(null);
        }
      } catch (refreshError) {
        setError(
          `${getWorkspaceErrorMessage(
            cause,
            "The report deletion or private file cleanup did not complete.",
          )} ${getWorkspaceErrorMessage(
            refreshError,
            "The report list could not be refreshed.",
          )}`,
        );
      }
      setPendingDeleteId(null);
      return;
    }

    try {
      const remaining = await refreshRecords();
      if (selectedId === record.id) {
        setSelectedId(remaining[0]?.id ?? null);
      }
      setNotice("The report and its private source file were deleted.");
    } catch (cause) {
      setError(
        `The report and private file were deleted, but the list could not be refreshed. ${getWorkspaceErrorMessage(
          cause,
          "Refresh reports to verify the current list.",
        )}`,
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  function updateAnnotation(testId: string, annotation: string) {
    updateReport((report) => ({
      ...report,
      tests: report.tests.map((test) =>
        test.id === testId ? { ...test, userAnnotation: annotation } : test,
      ),
    }));
  }

  function updateMetadata(update: MetadataUpdate) {
    updateReport((report) => ({
      ...report,
      metadata: { ...report.metadata, ...update },
    }));
  }

  function updateChecklist(checklist: ChecklistItem[]) {
    updateReport((report) => ({ ...report, checklist }));
  }

  function selectReport(id: string) {
    if (id === selectedId) {
      return;
    }
    if (
      isDirty &&
      !window.confirm(
        "Discard your unsaved report changes and open another report?",
      )
    ) {
      return;
    }
    setIsDirty(false);
    setSelectedId(id);
  }

  function closeSelectedReport() {
    if (
      isDirty &&
      !window.confirm("Close this report and discard your unsaved changes?")
    ) {
      return;
    }
    setSelectedId(null);
  }

  return (
    <section
      className="workspace-reports"
      aria-labelledby="workspace-reports-title"
    >
      <div className="workspace-reports-heading">
        <h2 id="workspace-reports-title">Shared reports</h2>
        <button
          className="secondary-button"
          type="button"
          disabled={isLoading}
          onClick={() => void handleRefreshRecords()}
        >
          {isLoading ? "Refreshing…" : "Refresh reports"}
        </button>
      </div>
      <p className="workspace-stage-note">
        Upload is explicit. The selected JSON or ZIP and included attachments
        will be stored in this workspace's private bucket. Members can download
        the source; editors can save metadata and checklist changes.
      </p>

      {canEdit && (
        <div className="workspace-report-upload">
          <label className="workspace-report-upload-consent">
            <input
              type="checkbox"
              checked={expectedUpload}
              onChange={(event) => setExpectedUpload(event.target.checked)}
            />
            I understand this report and its included attachments will be
            uploaded to this workspace.
          </label>
          <label>
            Choose a Playwright JSON or ZIP report
            <input
              type="file"
              accept=".json,.zip,application/json,application/zip"
              disabled={isImporting || !expectedUpload}
              onChange={(event) => void handleUpload(event)}
            />
          </label>
        </div>
      )}

      {progress && (
        <div className="import-progress" role="status" aria-live="polite">
          <p>{progress.message}</p>
          <progress
            aria-label="Report processing progress"
            max={100}
            value={progress.percent}
          />
        </div>
      )}
      {error && (
        <p className="auth-alert" role="alert">
          {error}
          {cleanupPath && (
            <button
              className="secondary-button"
              type="button"
              disabled={isCleaning}
              onClick={() => void handleRetryCleanup()}
            >
              {isCleaning ? "Cleaning up…" : "Retry private file cleanup"}
            </button>
          )}
          {selectedRecord && /changed in another session/i.test(error) && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void reloadSelectedReport()}
            >
              Reload report
            </button>
          )}
        </p>
      )}
      {notice && (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      )}

      {isLoading && !selectedRecord ? (
        <p role="status">Loading workspace reports…</p>
      ) : records.length === 0 ? (
        <p className="empty-state">No shared reports have been uploaded.</p>
      ) : (
        <div className="workspace-report-layout">
          <nav aria-label="Workspace reports">
            <ul className="workspace-report-list">
              {records.map((record) => (
                <li
                  key={record.id}
                  className={record.id === selectedId ? "selected" : ""}
                >
                  <button
                    className={
                      record.id === selectedId
                        ? "workspace-report-selected"
                        : ""
                    }
                    type="button"
                    onClick={() => selectReport(record.id)}
                  >
                    <strong>{record.title}</strong>
                    <span>
                      {record.source_filename} ·{" "}
                      {new Date(record.updated_at).toLocaleDateString()}
                    </span>
                    <span>Version {record.version}</span>
                  </button>
                  {canDelete && (
                    <button
                      className="text-button workspace-remove-button"
                      type="button"
                      disabled={pendingDeleteId !== null}
                      onClick={() => void handleDelete(record)}
                    >
                      {pendingDeleteId === record.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          {selectedRecord && (
            <div className="workspace-report-content">
              {isLoading || !imported || !workingReport ? (
                <p role="status">Loading private report file…</p>
              ) : (
                <>
                  <div className="workspace-report-savebar">
                    <p>
                      {isDirty
                        ? "Unsaved changes"
                        : `Saved version ${selectedRecord.version}`}
                    </p>
                    <div className="workspace-report-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isDownloading}
                        onClick={() => void handleDownload(selectedRecord)}
                      >
                        {isDownloading ? "Downloading…" : "Download source"}
                      </button>
                      {canEdit && (
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!isDirty || isSaving}
                          onClick={() => void handleSave()}
                        >
                          {isSaving ? "Saving…" : "Save changes"}
                        </button>
                      )}
                    </div>
                  </div>
                  <ReportDashboard
                    imported={imported}
                    clearLabel="Close report"
                    readOnly={!canEdit}
                    annotationReadOnly
                    onClear={closeSelectedReport}
                    onUpdateAnnotation={canEdit ? updateAnnotation : () => {}}
                    onUpdateChecklist={canEdit ? updateChecklist : () => {}}
                    onUpdateMetadata={canEdit ? updateMetadata : () => {}}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default WorkspaceReports;
