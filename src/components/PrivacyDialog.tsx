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
            <h2 id="privacy-dialog-title">
              Your report stays local unless you choose to upload it
            </h2>
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
                Local imports are parsed in your browser and are not uploaded.
                In a workspace, an editor must explicitly select a report and
                confirm before its JSON or ZIP source file is uploaded.
              </li>
              <li>
                Workspace uploads are stored in a private Supabase bucket.
                Report metadata and checklist answers are saved for workspace
                members. These items remain until an owner or admin deletes the
                report; automatic report retention is not configured.
              </li>
              <li>
                If account access is configured, your account email and
                workspace names, descriptions, member identities and roles are
                stored in the selected Supabase project. ZIP uploads include any
                attachments contained in the archive. Workspace members can read
                report files; editors can upload and edit; owners and admins can
                delete. The static hosting provider may receive ordinary request
                metadata such as your IP address and browser.
              </li>
              <li>
                Locally imported reports and edits exist only in page memory.
                Clear the local report, refresh the page or close the tab to
                remove that current local session data.
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
                Local Playwright JSON reports and ZIP bundles may be up to 50
                MB. Workspace uploads are limited to 10 MB for JSON and 25 MB
                for ZIP.
              </li>
              <li>
                Local ZIP imports are limited to 5,000 entries and 200 MB total
                uncompressed data. Workspace ZIP uploads are limited to 200
                entries, 100 MB total uncompressed data, 50 MB per entry and 5
                MB per image attachment.
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
