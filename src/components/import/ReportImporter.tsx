import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ChecklistItem, NormalizedReport } from "../../domain/report";
import { calculateEvidenceStatus } from "../../features/evidence/evidence-rules";
import { createDefaultChecklistItems } from "../../features/checklist/default-checklist";
import { createDemoReport } from "../../features/demo/demo-report";
import type { ImportProgress } from "../../features/import-report/zip-reader";
import type {
  ImportOperation,
  ImportedReport,
} from "../../features/import-report/worker-messages";
import { createImportOperation } from "../../features/import-report/report-worker-client";
import ReportDashboard from "../report/ReportDashboard";
import type { MetadataUpdate } from "../report/MetadataEditor";

function ReportImporter() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imported, setImported] = useState<ImportedReport | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const operationRef = useRef<ImportOperation | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      const operation = operationRef.current;
      operationRef.current = null;
      operation?.cancel();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await importSelectedFile();
  }

  async function importSelectedFile() {
    if (!selectedFile) {
      return;
    }

    operationRef.current?.cancel();
    setImported(null);
    setErrorMessage(null);
    setProgress({
      phase: "validating",
      percent: 0,
      message: "Starting local import",
    });
    setIsImporting(true);

    const operation = createImportOperation(selectedFile, setProgress);
    operationRef.current = operation;
    const result = await operation.promise;

    if (operationRef.current !== operation) {
      return;
    }

    operationRef.current = null;
    setIsImporting(false);
    if (result.ok) {
      setImported(withEvidenceAndChecklist(result.value));
      setSelectedFile(null);
      setProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setProgress(null);
    setErrorMessage(result.error.message);
  }

  async function loadDemoReport() {
    operationRef.current?.cancel();
    operationRef.current = null;
    setSelectedFile(null);
    setErrorMessage(null);
    setIsImporting(false);
    setIsLoadingDemo(true);

    try {
      const demo = await createDemoReport();
      setImported(withEvidenceAndChecklist(demo));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `The synthetic demo report could not be loaded: ${error.message}`
          : "The synthetic demo report could not be loaded. Please try again.",
      );
    } finally {
      setIsLoadingDemo(false);
    }
  }

  function cancelImport() {
    operationRef.current?.cancel();
    operationRef.current = null;
    setIsImporting(false);
    setProgress(null);
    setErrorMessage("Import cancelled.");
  }

  function clearReport() {
    operationRef.current?.cancel();
    operationRef.current = null;
    setSelectedFile(null);
    setImported(null);
    setProgress(null);
    setErrorMessage(null);
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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

  function updateReport(
    transform: (report: NormalizedReport) => NormalizedReport,
  ) {
    setImported((current) => {
      if (!current) {
        return null;
      }

      const report = transform(current.report);
      return {
        ...current,
        report: {
          ...report,
          evidence: calculateEvidenceStatus(report),
        },
      };
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.currentTarget.files?.[0] ?? null);
    setErrorMessage(null);
  }

  return (
    <section
      id="report-import"
      className="import-panel"
      aria-labelledby="import-title"
    >
      <h2 id="import-title">Import a Playwright report</h2>
      <p>Import a JSON report or ZIP bundle with its attachments.</p>
      <p className="privacy-note">
        Files are processed locally in your browser and are not uploaded.
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="report-file">
          Report file (.json or .zip, up to 50 MB)
        </label>
        <input
          ref={fileInputRef}
          id="report-file"
          type="file"
          accept=".json,.zip,application/json,application/zip"
          onChange={handleFileChange}
          disabled={isImporting || isLoadingDemo}
        />
        {selectedFile && (
          <p className="selected-file" role="status">
            Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
          </p>
        )}
        <div className="import-actions">
          <button
            type="submit"
            disabled={!selectedFile || isImporting || isLoadingDemo}
            onClick={(event) => {
              event.preventDefault();
              void importSelectedFile();
            }}
          >
            Import report
          </button>
          {!imported && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadDemoReport()}
              disabled={isImporting || isLoadingDemo}
            >
              Try demo report
            </button>
          )}
          {isImporting && (
            <button type="button" onClick={cancelImport}>
              Cancel import
            </button>
          )}
        </div>
      </form>

      {isLoadingDemo && (
        <p className="import-progress" role="status" aria-live="polite">
          Preparing illustrative synthetic demo data…
        </p>
      )}

      {progress && (
        <div className="import-progress" role="status" aria-live="polite">
          <p>{progress.message}</p>
          <progress
            aria-label="Import progress"
            max={100}
            value={progress.percent}
          />
        </div>
      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}

      {imported && (
        <ReportDashboard
          imported={imported}
          onClear={clearReport}
          onUpdateAnnotation={updateAnnotation}
          onUpdateChecklist={updateChecklist}
          onUpdateMetadata={updateMetadata}
        />
      )}
    </section>
  );
}

function withEvidenceAndChecklist(imported: ImportedReport): ImportedReport {
  const reportWithChecklist = {
    ...imported.report,
    checklist:
      imported.report.checklist.length === 0
        ? createDefaultChecklistItems()
        : imported.report.checklist,
  };
  return {
    ...imported,
    report: {
      ...reportWithChecklist,
      evidence: calculateEvidenceStatus(reportWithChecklist),
    },
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default ReportImporter;
