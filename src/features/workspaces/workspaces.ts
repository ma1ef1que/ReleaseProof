import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  areWorkspaceInvitationsEnabled,
  isLocalSupabaseProject,
} from "../auth/supabase";

export const workspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "viewer",
]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
});

const workspaceMemberSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().nullable(),
  role: workspaceRoleSchema,
  joined_at: z.string().datetime({ offset: true }),
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

const workspaceInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  email_normalized: z.string().email(),
  role: workspaceRoleSchema.exclude(["owner"]),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expires_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
});

const createdInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  invitation_token: z.string().regex(/^[0-9a-f]{64}$/),
  invitation_expires_at: z.string().datetime({ offset: true }),
});
const deliveredInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  invitation_expires_at: z.string().datetime({ offset: true }),
});

export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;

export async function listWorkspaces(
  client: SupabaseClient,
): Promise<Workspace[]> {
  const { data, error } = await client
    .from("workspaces")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return z.array(workspaceSchema).parse(data);
}

export async function createWorkspace(
  client: SupabaseClient,
  name: string,
  description: string,
): Promise<string> {
  const normalizedName = name.trim();
  const normalizedDescription = description.trim();
  if (normalizedName.length < 1 || normalizedName.length > 100) {
    throw new Error(
      "Workspace name must contain between 1 and 100 characters.",
    );
  }
  if (normalizedDescription.length > 1000) {
    throw new Error("Workspace description cannot exceed 1000 characters.");
  }

  const { data, error } = await client.rpc("create_workspace", {
    p_name: normalizedName,
    p_description: normalizedDescription || null,
  });

  if (error) {
    throw error;
  }

  return z.string().uuid().parse(data);
}

export async function listWorkspaceMembers(
  client: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const { data, error } = await client.rpc("get_workspace_members", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw error;
  }

  return z.array(workspaceMemberSchema).parse(data);
}

export async function changeWorkspaceMemberRole(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  role: Exclude<WorkspaceRole, "owner">,
): Promise<void> {
  const { error } = await client.rpc("change_workspace_member_role", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    throw error;
  }
}

export async function removeWorkspaceMember(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { error } = await client.rpc("remove_workspace_member", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export async function listWorkspaceInvitations(
  client: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceInvitation[]> {
  const { data, error } = await client.rpc("list_workspace_invitations", {
    p_workspace_id: workspaceId,
  });
  if (error) {
    throw error;
  }
  return z.array(workspaceInvitationSchema).parse(data);
}

export async function createWorkspaceInvitation(
  client: SupabaseClient,
  workspaceId: string,
  email: string,
  role: Exclude<WorkspaceRole, "owner">,
): Promise<
  | z.infer<typeof createdInvitationSchema>
  | z.infer<typeof deliveredInvitationSchema>
> {
  if (!areWorkspaceInvitationsEnabled()) {
    throw new Error(
      "Workspace invitations are not enabled for this deployment.",
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const validation = z.string().email().safeParse(normalizedEmail);
  if (!validation.success) {
    throw new Error("Enter a valid email address.");
  }

  if (!isLocalSupabaseProject()) {
    const { data, error } = await client.functions.invoke(
      "send-workspace-invitation",
      {
        body: { workspaceId, email: normalizedEmail, role },
      },
    );
    if (error) {
      throw error;
    }
    return deliveredInvitationSchema.parse(data);
  }

  const { data, error } = await client.rpc("create_workspace_invitation", {
    p_workspace_id: workspaceId,
    p_email: normalizedEmail,
    p_role: role,
  });
  if (error) throw error;
  const [invitation] = z.array(createdInvitationSchema).length(1).parse(data);
  return invitation;
}

export async function acceptWorkspaceInvitation(
  client: SupabaseClient,
  token: string,
): Promise<string | null> {
  const { data, error } = await client.rpc("accept_workspace_invitation", {
    p_token: token,
  });
  if (error) {
    throw error;
  }
  return data === null ? null : z.string().uuid().parse(data);
}

export async function revokeWorkspaceInvitation(
  client: SupabaseClient,
  invitationId: string,
): Promise<void> {
  const { error } = await client.rpc("revoke_workspace_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) {
    throw error;
  }
}

export function getWorkspaceErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : null;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  if (code === "42501") {
    return "You do not have permission to perform this action in the workspace.";
  }
  if (code === "40001") {
    return "This report changed in another session. Reload it before saving your changes.";
  }
  if (
    code === "22023" &&
    message === "The last workspace owner cannot leave or be removed"
  ) {
    return "The last owner cannot leave this workspace. Assign another owner first.";
  }
  if (
    code === "22023" &&
    message === "The last workspace owner cannot be demoted"
  ) {
    return "The last owner cannot be demoted. Assign another owner first.";
  }
  return fallback;
}

export function canManageMember(
  actorRole: WorkspaceRole | undefined,
  actorId: string,
  member: WorkspaceMember,
  ownerCount: number,
): boolean {
  if (member.user_id === actorId) {
    return false;
  }
  if (actorRole === "owner") {
    return member.role !== "owner" || ownerCount > 1;
  }
  return (
    actorRole === "admin" &&
    (member.role === "editor" || member.role === "viewer")
  );
}

export function canChangeMemberRole(
  actorRole: WorkspaceRole | undefined,
  actorId: string,
  member: WorkspaceMember,
  ownerCount: number,
): boolean {
  if (!canManageMember(actorRole, actorId, member, ownerCount)) {
    return false;
  }
  return (
    actorRole === "owner" ||
    member.role === "editor" ||
    member.role === "viewer"
  );
}

export function canLeaveWorkspace(
  actorId: string,
  member: WorkspaceMember,
  ownerCount: number,
): boolean {
  return (
    member.user_id === actorId && (member.role !== "owner" || ownerCount > 1)
  );
}
