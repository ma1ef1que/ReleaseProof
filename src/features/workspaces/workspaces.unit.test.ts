import { describe, expect, it } from "vitest";
import {
  canChangeMemberRole,
  canLeaveWorkspace,
  canManageMember,
  type WorkspaceMember,
} from "./workspaces";

const actorId = "30000000-0000-0000-0000-000000000001";

function member(
  userId: string,
  role: WorkspaceMember["role"],
): WorkspaceMember {
  return {
    user_id: userId,
    display_name: null,
    role,
    joined_at: "2026-10-29T18:30:00+00:00",
  };
}

describe("workspace role controls", () => {
  it("allows owners to manage members without allowing self-role changes", () => {
    const editor = member("30000000-0000-0000-0000-000000000002", "editor");
    const owner = member("30000000-0000-0000-0000-000000000003", "owner");

    expect(canManageMember("owner", actorId, editor, 1)).toBe(true);
    expect(canChangeMemberRole("owner", actorId, editor, 1)).toBe(true);
    expect(canManageMember("owner", actorId, member(actorId, "owner"), 1)).toBe(
      false,
    );
    expect(canChangeMemberRole("owner", actorId, owner, 1)).toBe(false);
    expect(canChangeMemberRole("owner", actorId, owner, 2)).toBe(true);
  });

  it("limits admins to editor and viewer members", () => {
    const editor = member("30000000-0000-0000-0000-000000000002", "editor");
    const viewer = member("30000000-0000-0000-0000-000000000003", "viewer");

    expect(canChangeMemberRole("admin", actorId, editor, 1)).toBe(true);
    expect(canChangeMemberRole("admin", actorId, viewer, 1)).toBe(true);
    expect(
      canManageMember(
        "admin",
        actorId,
        member("30000000-0000-0000-0000-000000000004", "admin"),
        1,
      ),
    ).toBe(false);
    expect(
      canManageMember(
        "viewer",
        actorId,
        member("30000000-0000-0000-0000-000000000002", "editor"),
        1,
      ),
    ).toBe(false);
  });

  it("allows members to leave but protects the last owner", () => {
    expect(canLeaveWorkspace(actorId, member(actorId, "editor"), 1)).toBe(true);
    expect(canLeaveWorkspace(actorId, member(actorId, "owner"), 1)).toBe(false);
    expect(canLeaveWorkspace(actorId, member(actorId, "owner"), 2)).toBe(true);
  });
});
