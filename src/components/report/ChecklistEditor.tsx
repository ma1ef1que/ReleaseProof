import { useRef, useState } from "react";
import type { ChecklistItem } from "../../domain/report";

interface ChecklistEditorProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  readOnly?: boolean;
}

function ChecklistEditor({
  items,
  onChange,
  readOnly = false,
}: ChecklistEditorProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newItemRequired, setNewItemRequired] = useState(true);
  const nextId = useRef(1);

  function updateItem(id: string, update: Partial<ChecklistItem>) {
    onChange(
      items.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  function addItem() {
    const label = newLabel.trim();
    if (!label) {
      return;
    }

    let id = `custom-checklist-${nextId.current}`;
    while (items.some((item) => item.id === id)) {
      nextId.current += 1;
      id = `custom-checklist-${nextId.current}`;
    }
    nextId.current += 1;
    onChange([
      ...items,
      {
        id,
        label,
        status: "not_checked",
        required: newItemRequired,
      },
    ]);
    setNewLabel("");
  }

  return (
    <section
      className="editor-section checklist-editor"
      aria-labelledby="checklist-title"
    >
      <h3 id="checklist-title" className="section-title">
        Manual QA checklist
      </h3>
      <p className="editor-description">
        A review aid only; checklist answers are never marked as passed
        automatically and do not certify release quality.
      </p>

      {items.length === 0 ? (
        <p className="empty-state">No checklist items have been added.</p>
      ) : (
        <ul className="checklist-list">
          {items.map((item) => (
            <li className="checklist-item" key={item.id}>
              <div className="checklist-item-fields">
                <label>
                  Item
                  <input
                    type="text"
                    maxLength={160}
                    value={item.label}
                    readOnly={readOnly}
                    aria-label={`${item.label || "Checklist item"} label`}
                    aria-invalid={item.label.trim().length === 0}
                    onChange={(event) =>
                      updateItem(item.id, {
                        label: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={item.status}
                    disabled={readOnly}
                    aria-label={`${item.label || "Checklist item"} status`}
                    onChange={(event) => {
                      const status = event.currentTarget.value;
                      if (isChecklistStatus(status)) {
                        updateItem(item.id, { status });
                      }
                    }}
                  >
                    <option value="not_checked">Not checked</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="not_applicable">Not applicable</option>
                  </select>
                </label>
              </div>
              <label className="checklist-note">
                Note
                <textarea
                  rows={2}
                  maxLength={500}
                  value={item.note ?? ""}
                  readOnly={readOnly}
                  aria-label={`${item.label || "Checklist item"} note`}
                  onChange={(event) =>
                    updateItem(item.id, { note: event.currentTarget.value })
                  }
                />
              </label>
              <div className="checklist-item-actions">
                <label className="checklist-required">
                  <input
                    type="checkbox"
                    checked={item.required}
                    disabled={readOnly}
                    aria-label={`${item.label || "Checklist item"} required`}
                    onChange={(event) =>
                      updateItem(item.id, {
                        required: event.currentTarget.checked,
                      })
                    }
                  />
                  Required for evidence
                </label>
                {!readOnly && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      onChange(
                        items.filter((candidate) => candidate.id !== item.id),
                      )
                    }
                    aria-label={`Delete ${item.label || "unnamed checklist item"}`}
                  >
                    Delete
                  </button>
                )}
              </div>
              {item.label.trim().length === 0 && (
                <p className="field-error">Checklist item text is required.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="add-checklist-item">
          <label>
            New checklist item
            <input
              type="text"
              maxLength={160}
              value={newLabel}
              onChange={(event) => setNewLabel(event.currentTarget.value)}
            />
          </label>
          <label className="checklist-required">
            <input
              type="checkbox"
              checked={newItemRequired}
              onChange={(event) =>
                setNewItemRequired(event.currentTarget.checked)
              }
            />
            Required for evidence
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={!newLabel.trim()}
            onClick={addItem}
          >
            Add checklist item
          </button>
        </div>
      )}
    </section>
  );
}

function isChecklistStatus(value: string): value is ChecklistItem["status"] {
  return (
    value === "not_checked" ||
    value === "pass" ||
    value === "fail" ||
    value === "not_applicable"
  );
}

export default ChecklistEditor;
