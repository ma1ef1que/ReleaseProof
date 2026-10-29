import { useRef } from "react";
import { useDialogFocus } from "../hooks/use-dialog-focus";

interface PrivacyDialogProps {
  onClose: () => void;
}

function PrivacyDialog({ onClose }: PrivacyDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(dialogRef, closeButtonRef, onClose);

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
        className="privacy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-dialog-title"
        tabIndex={-1}
      >
        <header className="export-dialog-header">
          <div>
            <p className="eyebrow">Privacy and limitations</p>
            <h2 id="privacy-dialog-title">Your report stays in this browser</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="secondary-button"
            type="button"
            onClick={onClose}
          >
            Close privacy information
          </button>
        </header>

        <div className="privacy-dialog-content">
          <section aria-labelledby="privacy-data-title">
            <h3 id="privacy-data-title">How report data is handled</h3>
            <ul>
              <li>
                JSON and ZIP files are parsed in your browser. The application
                does not upload report content, metadata, notes or screenshots.
              </li>
              <li>
                Reports and edits exist only in page memory. Clear the report,
                refresh the page or close the tab to remove the current session
                data.
              </li>
              <li>
                There are no accounts, report storage, analytics or telemetry in
                this demo. The static hosting provider may receive ordinary web
                request metadata such as your IP address and browser.
              </li>
              <li>
                Downloaded HTML is created locally and only saved when you
                choose to download it.
              </li>
            </ul>
          </section>

          <section aria-labelledby="privacy-limits-title">
            <h3 id="privacy-limits-title">Supported files and limits</h3>
            <ul>
              <li>
                Playwright JSON reports and ZIP bundles up to 50 MB are
                supported.
              </li>
              <li>
                ZIP imports are limited to 5,000 entries, 200 MB total
                uncompressed data and 50 MB per file.
              </li>
              <li>
                Standalone HTML exports are limited to 15 MiB. Verified PNG,
                JPEG and WebP screenshots may be embedded; when the limit is
                exceeded, export without screenshots.
              </li>
            </ul>
          </section>

          <section aria-labelledby="privacy-sharing-title">
            <h3 id="privacy-sharing-title">Review before sharing</h3>
            <p>
              Test titles, URLs, source paths, errors, stack traces, notes and
              screenshots may contain secrets or personal data. Inspect the
              exported report before sharing it.
            </p>
            <p>
              Evidence status summarizes only the imported results and
              checklist. It is not a guarantee of release safety or a release
              approval.
            </p>
          </section>
        </div>

        <footer className="export-dialog-actions">
          <button className="primary-button" type="button" onClick={onClose}>
            I understand
          </button>
        </footer>
      </section>
    </div>
  );
}

export default PrivacyDialog;
