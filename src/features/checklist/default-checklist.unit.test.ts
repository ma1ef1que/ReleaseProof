import { describe, expect, it } from "vitest";
import { createDefaultChecklistItems } from "./default-checklist";

describe("createDefaultChecklistItems", () => {
  it("returns all requested manual checks as required and unchecked", () => {
    const items = createDefaultChecklistItems();

    expect(items.map((item) => item.label)).toEqual([
      "Critical user flows checked",
      "Known blockers reviewed",
      "Failed tests triaged",
      "Environment and build verified",
      "Relevant manual checks completed",
    ]);
    expect(items.every((item) => item.required)).toBe(true);
    expect(items.every((item) => item.status === "not_checked")).toBe(true);
  });

  it("returns independent mutable checklist items", () => {
    const first = createDefaultChecklistItems();
    const second = createDefaultChecklistItems();
    first[0]!.status = "pass";

    expect(second[0]?.status).toBe("not_checked");
  });
});
