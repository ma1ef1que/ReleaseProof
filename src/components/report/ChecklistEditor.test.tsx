import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultChecklistItems } from "../../features/checklist/default-checklist";
import ChecklistEditor from "./ChecklistEditor";

function ChecklistHarness() {
  const [items, setItems] = useState(createDefaultChecklistItems);
  return <ChecklistEditor items={items} onChange={setItems} />;
}

describe("ChecklistEditor", () => {
  it("starts with unchecked required items and updates their answers and notes", () => {
    const items = createDefaultChecklistItems();
    const onChange = vi.fn();
    render(<ChecklistEditor items={items} onChange={onChange} />);

    const firstStatus = screen.getByLabelText(
      "Critical user flows checked status",
    );
    const firstItem = firstStatus.closest("li");
    if (!firstItem) {
      throw new Error("Checklist item list element is missing.");
    }
    const status = within(firstItem).getByLabelText(
      "Critical user flows checked status",
    );
    expect(status).toHaveValue("not_checked");
    expect(
      within(firstItem).getByLabelText("Critical user flows checked required"),
    ).toBeChecked();

    fireEvent.change(status, { target: { value: "pass" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "critical-user-flows",
          status: "pass",
        }),
      ]),
    );

    fireEvent.change(
      within(firstItem).getByLabelText("Critical user flows checked note"),
      { target: { value: "Verified in staging." } },
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "critical-user-flows",
          note: "Verified in staging.",
        }),
      ]),
    );
  });

  it("adds and deletes items without marking them passed", () => {
    const items = createDefaultChecklistItems();
    const onChange = vi.fn();
    render(<ChecklistEditor items={items} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("New checklist item"), {
      target: { value: "  Verify rollback  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add checklist item" }));
    expect(onChange).toHaveBeenLastCalledWith([
      ...items,
      {
        id: "custom-checklist-1",
        label: "Verify rollback",
        status: "not_checked",
        required: true,
      },
    ]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete Critical user flows checked",
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      items.filter((item) => item.id !== "critical-user-flows"),
    );
  });

  it("marks an empty edited item label as invalid", () => {
    render(<ChecklistHarness />);

    const itemLabel = screen.getByLabelText(
      "Critical user flows checked label",
    );
    expect(itemLabel).toHaveAttribute("aria-invalid", "false");
    fireEvent.change(itemLabel, { target: { value: "  " } });
    expect(itemLabel).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Checklist item text is required."),
    ).toBeInTheDocument();
  });
});
