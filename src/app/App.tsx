import { useEffect, useState } from "react";
import { appConfig } from "../config/app-config";
import ReportImporter from "../components/import/ReportImporter";
import PrivacyDialog from "../components/PrivacyDialog";

function App() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  useEffect(() => {
    document.title = `${appConfig.productName} — QA evidence reports`;
  }, []);

  return (
    <main className="app-shell">
      <div className="welcome-card">
        <header className="site-header">
          <a className="site-brand" href="#welcome-title">
            {appConfig.productName}
          </a>
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <button
              className="text-button"
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
            >
              Privacy
            </button>
          </nav>
        </header>

        <section className="landing-hero" aria-labelledby="welcome-title">
          <p className="eyebrow">Local-first QA evidence</p>
          <h1 id="welcome-title">
            Turn Playwright results into a clear QA evidence report
          </h1>
          <p className="intro">
            Import locally. Review failures. Add manual checks. Export a
            shareable report.
          </p>
          <p className="privacy-note">
            Your report is processed in this browser; the application does not
            upload it.
          </p>
        </section>

        <ReportImporter />

        <section
          id="how-it-works"
          className="how-it-works"
          aria-labelledby="how-it-works-title"
        >
          <p className="eyebrow">Getting started</p>
          <h2 id="how-it-works-title">How it works</h2>
          <ol>
            <li>
              Try the synthetic demo or import a Playwright JSON / ZIP file.
            </li>
            <li>
              Review outcomes, failures, attachments and the manual checklist.
            </li>
            <li>
              Preview and download a standalone HTML report, or print to PDF.
            </li>
          </ol>
          <details className="playwright-instructions">
            <summary>How to export from Playwright</summary>
            <p>
              Add the JSON reporter to your Playwright configuration, then run
              your tests to create a report file:
            </p>
            <pre>
              <code>
                {`reporter: [["list"], ["json", { outputFile: "artifacts/playwright-report.json" }]]`}
              </code>
            </pre>
            <p>
              Import that JSON file directly. To include referenced screenshots,
              place the report and its attachments in a ZIP while preserving
              their relative paths.
            </p>
          </details>
          <p className="status-note">
            Report data and edits are temporary. Refreshing or closing this tab
            clears them.
          </p>
        </section>
      </div>

      {isPrivacyOpen && (
        <PrivacyDialog onClose={() => setIsPrivacyOpen(false)} />
      )}
    </main>
  );
}

export default App;
