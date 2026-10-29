import type { ChecklistItem } from "../../domain/report";

const DEFAULT_CHECKLIST: readonly ChecklistItem[] = [
  {
    id: "critical-user-flows",
    label: "Critical user flows checked",
    status: "not_checked",
    required: true,
  },
  {
    id: "known-blockers",
    label: "Known blockers reviewed",
    status: "not_checked",
    required: true,
  },
  {
    id: "failed-tests-triaged",
    label: "Failed tests triaged",
    status: "not_checked",
    required: true,
  },
  {
    id: "environment-build-verified",
    label: "Environment and build verified",
    status: "not_checked",
    required: true,
  },
  {
    id: "manual-checks-completed",
    label: "Relevant manual checks completed",
    status: "not_checked",
    required: true,
  },
];

export function createDefaultChecklistItems(): ChecklistItem[] {
  return DEFAULT_CHECKLIST.map((item) => ({ ...item }));
}
