import { useEffect, useRef, useState } from "react";
import type { ImportedReport } from "../../features/import-report/worker-messages";
import { useDialogFocus } from "../../hooks/use-dialog-focus";
import {
  buildStandaloneHtmlReport,
  createHtmlExportFilename,
  DEFAULT_MAX_HTML_EXPORT_BYTES,
} from "../../features/export/html-report-builder";
import type { HtmlExportResult } from "../../features/export/html-report-builder";

interface ExportPreviewProps {
  imported: ImportedReport;
  onClose: () => void;
}

function ExportPreview({ imported, onClose }: ExportPreviewProps) {
  const [includeImages, setIncludeImages] = useState(true);
  const [result, setResult] = useState<HtmlExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generatedAt] = useState(() => new Date().toISOString());
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useDialogFocus(dialogRef, closeButtonRef, onClose);

  useEffect(() => {
    let active = true;
    setResult(null);
    setErrorMessage(null);
    setActionError(null);

    void buildStandaloneHtmlReport(imported.report, imported.assets, {
      includeImages,
      generatedAt,
    })
      .then((nextResult) => {
        if (active) {
          setResult(nextResult);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? `The HTML report could not be prepared: ${error.message}`
              : "The HTML report could not be prepared. Please try again.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [generatedAt, imported.assets, imported.report, includeImages]);

  function downloadHtml() {
    if (result?.kind !== "ready") {
      return;
    }

    try {
      const url = URL.createObjectURL(
        new Blob([result.html], { type: "text/html;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = createHtmlExportFilename(
        imported.report.metadata.runTitle,
      );
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setActionError(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? `The HTML download could not be started: ${error.message}`
          : "The HTML download could not be started. Please try again.",
      );
    }
  }

  function printPreview() {
    const previewWindow = iframeRef.current?.contentWindow;
    if (!previewWindow) {
      setActionError("The export preview is not ready to print.");
      return;
    }

    try {
      previewWindow.focus();
      previewWindow.print();
      setActionError(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? `The print dialog could not be opened: ${error.message}`
          : "The print dialog could not be opened. Please try again.",
      );
    }
  }

  const byteLimitLabel = formatBytes(DEFAULT_MAX_HTML_EXPORT_BYTES);

  return (
    <div
      className="export-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        tabIndex={-1}
      >
        <header className="export-dialog-header">
          <div>
            <p className="eyebrow">Local HTML export</p>
            <h2 id="export-dialog-title">Export preview</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="secondary-button"
            type="button"
            onClick={onClose}
          >
            Close preview
          </button>
        </header>

        <p className="export-privacy-warning">
          Before sharing, review this report. Test names, URLs, stack traces,
          notes and screenshots may contain secrets or personal data.
        </p>

        {result?.kind === "ready" && (
          <p className="export-size" role="status">
            HTML size: {formatBytes(result.sizeBytes)} of {byteLimitLabel}.{" "}
            {result.embeddedImageCount} screenshots embedded;{" "}
            {result.omittedImageCount} not embedded.
          </p>
        )}

        {result?.kind === "too_large" && (
          <div className="export-error" role="alert">
            <p>
              {result.cause === "images"
                ? `This report with screenshots would be ${formatBytes(result.estimatedSizeBytes)}, above the ${byteLimitLabel} export limit.`
                : `The report without screenshots is ${formatBytes(result.estimatedSizeBytes)}, above the ${byteLimitLabel} export limit.`}
            </p>
            {result.cause === "images" && includeImages && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIncludeImages(false)}
              >
                Prepare without screenshots
              </button>
            )}
          </div>
        )}

        {errorMessage && (
          <p className="export-error" role="alert">
            {errorMessage}
          </p>
        )}
        {actionError && (
          <p className="export-error" role="alert">
            {actionError}
          </p>
        )}

        {result?.kind === "ready" ? (
          <iframe
            ref={iframeRef}
            className="export-preview-frame"
            title="Standalone HTML report preview"
            sandbox="allow-same-origin allow-modals"
            srcDoc={result.html}
          />
        ) : !errorMessage && !result ? (
          <p role="status">Preparing the standalone HTML report…</p>
        ) : null}

        <footer className="export-dialog-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={printPreview}
            disabled={result?.kind !== "ready"}
          >
            Print / Save as PDF
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={downloadHtml}
            disabled={result?.kind !== "ready"}
          >
            Download HTML
          </button>
        </footer>
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default ExportPreview;
