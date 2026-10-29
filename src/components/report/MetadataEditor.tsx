import type { ReportMetadata } from "../../domain/report";

export type EditableMetadataField =
  | "runTitle"
  | "environment"
  | "buildVersion"
  | "commitSha"
  | "runDate"
  | "notes"
  | "userReportedBlocker";

export type MetadataUpdate = Partial<
  Pick<ReportMetadata, EditableMetadataField>
>;

interface MetadataEditorProps {
  metadata: ReportMetadata;
  onChange: (update: MetadataUpdate) => void;
}

function MetadataEditor({ metadata, onChange }: MetadataEditorProps) {
  return (
    <section className="editor-section" aria-labelledby="metadata-editor-title">
      <h3 id="metadata-editor-title" className="section-title">
        Release metadata
      </h3>
      <p className="editor-description">
        These notes stay in this browser session and do not change the imported
        test results.
      </p>
      <div className="metadata-editor-grid">
        <label>
          Run / release title
          <input
            type="text"
            maxLength={200}
            value={metadata.runTitle}
            onChange={(event) =>
              onChange({ runTitle: event.currentTarget.value })
            }
          />
        </label>
        <label>
          Environment
          <input
            type="text"
            maxLength={120}
            value={metadata.environment ?? ""}
            onChange={(event) =>
              onChange({ environment: event.currentTarget.value })
            }
          />
        </label>
        <label>
          Build / version
          <input
            type="text"
            maxLength={120}
            value={metadata.buildVersion ?? ""}
            onChange={(event) =>
              onChange({ buildVersion: event.currentTarget.value })
            }
          />
        </label>
        <label>
          Commit SHA
          <input
            type="text"
            maxLength={80}
            value={metadata.commitSha ?? ""}
            onChange={(event) =>
              onChange({ commitSha: event.currentTarget.value })
            }
          />
        </label>
        <label>
          Run date and time
          <input
            type="datetime-local"
            value={toLocalDateTime(metadata.runDate)}
            onChange={(event) =>
              onChange({
                runDate: event.currentTarget.value
                  ? new Date(event.currentTarget.value).toISOString()
                  : undefined,
              })
            }
          />
        </label>
        <label className="metadata-notes-editor">
          Release notes
          <textarea
            rows={4}
            maxLength={2000}
            value={metadata.notes ?? ""}
            onChange={(event) => onChange({ notes: event.currentTarget.value })}
            placeholder="Add context for this test run"
          />
        </label>
      </div>
      <label className="blocker-flag">
        <input
          type="checkbox"
          checked={metadata.userReportedBlocker ?? false}
          onChange={(event) =>
            onChange({ userReportedBlocker: event.currentTarget.checked })
          }
        />
        These notes identify a release blocker
      </label>
    </section>
  );
}

function toLocalDateTime(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localTime.toISOString().slice(0, 16);
}

export default MetadataEditor;
