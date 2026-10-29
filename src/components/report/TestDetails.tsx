import { useEffect, useState } from "react";
import type { TestAttachment, NormalizedTest } from "../../domain/report";
import { TEST_STATUS_LABELS } from "../../domain/test-status";
import type { ImportedReport } from "../../features/import-report/worker-messages";
import { isSupportedImageContentType } from "../../features/import-report/image-signature";
import { formatDuration } from "../../lib/format-duration";

const MAX_ATTACHMENT_PREVIEW_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_PREVIEW_BYTES = 64 * 1024;

interface TestDetailsProps {
  test: NormalizedTest;
  assets: ImportedReport["assets"];
  onUpdateAnnotation: (testId: string, annotation: string) => void;
}

function TestDetails({ test, assets, onUpdateAnnotation }: TestDetailsProps) {
  const screenshots = test.attachments.filter(
    (attachment) => attachment.kind === "image",
  );

  return (
    <section className="test-details" aria-labelledby="selected-test-title">
      <header className="details-header">
        <div>
          <p className="eyebrow">Selected test</p>
          <h4 id="selected-test-title">{test.fullTitle}</h4>
        </div>
        <span className={`status-badge status-${test.status}`}>
          {TEST_STATUS_LABELS[test.status]}
        </span>
      </header>

      <dl className="details-metadata">
        {test.filePath && (
          <div>
            <dt>File</dt>
            <dd>
              {test.filePath}
              {test.line !== undefined && `:${test.line}`}
              {test.column !== undefined && `:${test.column}`}
            </dd>
          </div>
        )}
        {test.projectName && (
          <div>
            <dt>Project / browser</dt>
            <dd>{test.projectName}</dd>
          </div>
        )}
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(test.durationMs)}</dd>
        </div>
        <div>
          <dt>Retries</dt>
          <dd>{test.retryCount}</dd>
        </div>
      </dl>

      {test.annotations.length > 0 && (
        <section className="detail-section" aria-label="Test annotations">
          <h5>Source annotations</h5>
          <ul>
            {test.annotations.map((annotation, index) => (
              <li key={`${annotation.type}-${index}`}>
                {annotation.type}
                {annotation.description && `: ${annotation.description}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="annotation-field">
        <label htmlFor={`annotation-${test.id}`}>QA annotation</label>
        <textarea
          id={`annotation-${test.id}`}
          value={test.userAnnotation ?? ""}
          maxLength={500}
          rows={3}
          onChange={(event) =>
            onUpdateAnnotation(test.id, event.currentTarget.value)
          }
          placeholder="Add a short note for this test"
        />
        <span>{(test.userAnnotation ?? "").length}/500 characters</span>
      </div>

      <section className="detail-section" aria-label="Test attempts">
        <h5>Attempts</h5>
        {test.attempts.length === 0 ? (
          <p className="empty-state">No attempt details were included.</p>
        ) : (
          <ol className="attempt-list">
            {test.attempts.map((attempt) => (
              <li key={attempt.attemptIndex}>
                <div className="attempt-heading">
                  <strong>Attempt {attempt.attemptIndex + 1}</strong>
                  <span>{TEST_STATUS_LABELS[attempt.status]}</span>
                  {attempt.durationMs !== undefined && (
                    <span>{formatDuration(attempt.durationMs)}</span>
                  )}
                </div>
                {attempt.errorMessages.length > 0 ? (
                  <div className="error-messages">
                    <h6>Error</h6>
                    {attempt.errorMessages.map((message, index) => (
                      <pre key={`${index}-${message}`}>{message}</pre>
                    ))}
                  </div>
                ) : (
                  attempt.status !== "passed" && (
                    <p>No error message was provided.</p>
                  )
                )}
                {attempt.stackTraceText && (
                  <details className="stack-trace">
                    <summary>Show stack trace</summary>
                    <pre>{attempt.stackTraceText}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="detail-section" aria-label="Attachments">
        <h5>Attachments</h5>
        {screenshots.length === 0 && (
          <p className="empty-state">
            No screenshots are available for this test.
          </p>
        )}
        {test.attachments.length === 0 ? (
          <p>No attachments were included for this test.</p>
        ) : (
          <ul className="attachment-list">
            {test.attachments.map((attachment) => (
              <li key={attachment.id}>
                <AttachmentPreview
                  attachment={attachment}
                  blob={assets.get(attachment.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

interface AttachmentPreviewProps {
  attachment: TestAttachment;
  blob: Blob | undefined;
}

function AttachmentPreview({ attachment, blob }: AttachmentPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const contentType = attachment.contentType.toLowerCase();
  const canPreviewImage =
    attachment.kind === "image" &&
    isSupportedImageContentType(contentType) &&
    blob?.type.toLowerCase() === contentType &&
    blob.size <= MAX_ATTACHMENT_PREVIEW_BYTES;

  useEffect(() => {
    if (!canPreviewImage || !blob) {
      setImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob, canPreviewImage]);

  return (
    <article className="attachment-card">
      <h6>{attachment.name}</h6>
      <p className="attachment-type">{attachment.contentType}</p>
      {attachment.missing ? (
        <p className="attachment-warning">
          Attachment not included in imported bundle.
        </p>
      ) : !blob ? (
        <p className="attachment-warning">Attachment data is unavailable.</p>
      ) : blob.size > MAX_ATTACHMENT_PREVIEW_BYTES ? (
        <p className="attachment-warning">
          This attachment is too large to preview.
        </p>
      ) : attachment.kind === "image" ? (
        canPreviewImage && imageUrl ? (
          <img
            className="attachment-image"
            src={imageUrl}
            alt={attachment.name}
          />
        ) : (
          <p className="attachment-warning">
            This image could not be verified and was not previewed.
          </p>
        )
      ) : attachment.kind === "text" ? (
        <TextAttachmentPreview blob={blob} />
      ) : (
        <p className="attachment-warning">
          Preview is not available for this attachment type.
        </p>
      )}
    </article>
  );
}

function TextAttachmentPreview({ blob }: { blob: Blob }) {
  const [preview, setPreview] = useState<{
    blob: Blob;
    content?: string;
    error?: boolean;
  } | null>(null);
  const isTruncated = blob.size > MAX_TEXT_PREVIEW_BYTES;
  const currentPreview = preview?.blob === blob ? preview : null;

  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (active) {
        if (typeof reader.result === "string") {
          setPreview({ blob, content: reader.result });
        } else {
          setPreview({ blob, error: true });
        }
      }
    };
    reader.onerror = () => {
      if (active) {
        setPreview({ blob, error: true });
      }
    };
    reader.onabort = () => {
      if (active) {
        setPreview({ blob, error: true });
      }
    };
    reader.readAsText(blob.slice(0, MAX_TEXT_PREVIEW_BYTES));
    return () => {
      active = false;
      reader.abort();
    };
  }, [blob]);

  if (currentPreview?.error) {
    return (
      <p className="attachment-warning">Text attachment could not be read.</p>
    );
  }
  if (currentPreview?.content === undefined) {
    return <p>Loading text attachment...</p>;
  }

  return (
    <>
      {isTruncated && (
        <p className="attachment-warning">
          Preview limited to the first 64 KB.
        </p>
      )}
      <pre className="text-attachment">{currentPreview.content}</pre>
    </>
  );
}

export default TestDetails;
