import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/auth-context";
import WorkspaceInvitations from "./WorkspaceInvitations";
import WorkspaceReports from "./WorkspaceReports";
import {
  canChangeMemberRole,
  canLeaveWorkspace,
  canManageMember,
  changeWorkspaceMemberRole,
  createWorkspace,
  getWorkspaceErrorMessage,
  listWorkspaceMembers,
  listWorkspaces,
  removeWorkspaceMember,
  workspaceRoleSchema,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from "./workspaces";

interface WorkspacePageProps {
  workspaceId: string | null;
  navigate: (route: "account" | "home" | `workspace/${string}`) => void;
}

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function WorkspacePage({ workspaceId, navigate }: WorkspacePageProps) {
  const { client, session, sessionError, refreshSession } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(
    Boolean(workspaceId),
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, WorkspaceRole>>(
    {},
  );

  useEffect(() => {
    if (!client) {
      setIsLoadingWorkspaces(false);
      return;
    }

    let active = true;
    setIsLoadingWorkspaces(true);
    setWorkspaceError(null);
    void listWorkspaces(client)
      .then((items) => {
        if (active) {
          setWorkspaces(items);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setWorkspaceError(
            getWorkspaceErrorMessage(
              error,
              "We could not load your workspaces. Try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingWorkspaces(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!client || !workspaceId) {
      setMembers([]);
      setIsLoadingMembers(false);
      setMemberError(null);
      return;
    }

    let active = true;
    setIsLoadingMembers(true);
    setMemberError(null);
    void listWorkspaceMembers(client, workspaceId)
      .then((items) => {
        if (active) {
          setMembers(items);
          setRoleDrafts({});
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMemberError(
            getWorkspaceErrorMessage(
              error,
              "We could not load workspace members. Check your access and try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingMembers(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, workspaceId]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId),
    [workspaces, workspaceId],
  );
  const actorId = session?.user.id ?? "";
  const actorRole = members.find((member) => member.user_id === actorId)?.role;
  const ownerCount = members.filter((member) => member.role === "owner").length;

  async function refreshWorkspaces() {
    if (!client) {
      return [];
    }
    const items = await listWorkspaces(client);
    setWorkspaces(items);
    return items;
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) {
      return;
    }

    setWorkspaceError(null);
    setIsCreating(true);
    let workspaceWasCreated = false;
    try {
      const newWorkspaceId = await createWorkspace(
        client,
        workspaceName,
        workspaceDescription,
      );
      workspaceWasCreated = true;
      await refreshWorkspaces();
      setWorkspaceName("");
      setWorkspaceDescription("");
      navigate(`workspace/${newWorkspaceId}`);
    } catch (error) {
      setWorkspaceError(
        getWorkspaceErrorMessage(
          error,
          workspaceWasCreated
            ? "The workspace was created, but its list could not be refreshed. Reload the page to continue."
            : "We could not create the workspace. Check the name and try again.",
        ),
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRoleChange(member: WorkspaceMember) {
    if (!client || !workspaceId) {
      return;
    }
    const role = roleDrafts[member.user_id] ?? member.role;
    if (role === "owner" || role === member.role) {
      return;
    }

    setPendingMemberId(member.user_id);
    setMemberError(null);
    try {
      await changeWorkspaceMemberRole(
        client,
        workspaceId,
        member.user_id,
        role,
      );
      setMembers((current) =>
        current.map((item) =>
          item.user_id === member.user_id ? { ...item, role } : item,
        ),
      );
      setRoleDrafts((current) => {
        const next = { ...current };
        delete next[member.user_id];
        return next;
      });
    } catch (error) {
      setMemberError(
        getWorkspaceErrorMessage(
          error,
          "We could not update this member's role. Try again.",
        ),
      );
    } finally {
      setPendingMemberId(null);
    }
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    if (!client || !workspaceId) {
      return;
    }
    const isSelf = member.user_id === actorId;
    const memberName = getMemberName(member);
    const confirmed = window.confirm(
      isSelf
        ? `Leave ${selectedWorkspace?.name ?? "this workspace"}?`
        : `Remove ${memberName} from ${selectedWorkspace?.name ?? "this workspace"}?`,
    );
    if (!confirmed) {
      return;
    }

    setPendingMemberId(member.user_id);
    setMemberError(null);
    try {
      await removeWorkspaceMember(client, workspaceId, member.user_id);
      if (isSelf) {
        setWorkspaces((current) =>
          current.filter((workspace) => workspace.id !== workspaceId),
        );
        navigate("account");
        return;
      }
      setMembers((current) =>
        current.filter((item) => item.user_id !== member.user_id),
      );
    } catch (error) {
      setMemberError(
        getWorkspaceErrorMessage(
          error,
          "We could not remove this member. Try again.",
        ),
      );
    } finally {
      setPendingMemberId(null);
    }
  }

  return (
    <main className="app-shell">
      <section className="welcome-card account-card workspace-card">
        <header className="site-header">
          <a className="site-brand" href="#welcome-title">
            ReleaseProof
          </a>
          <nav aria-label="Account navigation">
            <a href="#welcome-title">Local reports</a>
            <a href="#/account">Workspaces</a>
          </nav>
        </header>

        <p className="eyebrow">Signed-in account</p>
        <h1>
          {selectedWorkspace ? selectedWorkspace.name : "Your workspaces"}
        </h1>
        <p className="auth-description">
          Signed in as <strong>{session?.user.email}</strong>
        </p>

        {sessionError && (
          <div className="auth-alert" role="alert">
            <p>{sessionError}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void refreshSession()}
            >
              Retry session check
            </button>
          </div>
        )}

        {workspaceError && (
          <p className="auth-alert" role="alert">
            {workspaceError}
          </p>
        )}

        {workspaceId && isLoadingWorkspaces ? (
          <section className="workspace-panel" role="status">
            Loading workspace details…
          </section>
        ) : workspaceId && !selectedWorkspace ? (
          <section className="workspace-panel" aria-live="polite">
            <h2>Workspace unavailable</h2>
            <p>
              This workspace does not exist or your membership no longer grants
              access.
            </p>
            <a className="secondary-button" href="#/account">
              Back to workspaces
            </a>
          </section>
        ) : selectedWorkspace ? (
          <WorkspaceDetails
            workspace={selectedWorkspace}
            workspaces={workspaces}
            navigate={navigate}
            members={members}
            actorId={actorId}
            actorRole={actorRole}
            ownerCount={ownerCount}
            isLoading={isLoadingMembers}
            error={memberError}
            pendingMemberId={pendingMemberId}
            roleDrafts={roleDrafts}
            onRoleDraftChange={(userId, role) =>
              setRoleDrafts((current) => ({ ...current, [userId]: role }))
            }
            onRoleChange={(member) => void handleRoleChange(member)}
            onRemoveMember={(member) => void handleRemoveMember(member)}
          />
        ) : (
          <div className="workspace-dashboard">
            <section
              className="workspace-panel"
              aria-labelledby="workspace-list-title"
            >
              <h2 id="workspace-list-title">Available workspaces</h2>
              {isLoadingWorkspaces ? (
                <p role="status">Loading your workspaces…</p>
              ) : workspaces.length === 0 ? (
                <p>
                  You are not a member of any workspaces yet. Create one to get
                  started.
                </p>
              ) : (
                <ul className="workspace-list">
                  {workspaces.map((workspace) => (
                    <li key={workspace.id}>
                      <a href={`#/workspace/${workspace.id}`}>
                        <strong>{workspace.name}</strong>
                        <span>{workspace.description || "No description"}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="workspace-panel"
              aria-labelledby="create-workspace-title"
            >
              <h2 id="create-workspace-title">Create a workspace</h2>
              <form
                className="workspace-form"
                onSubmit={(event) => void handleCreateWorkspace(event)}
              >
                <label>
                  Name
                  <input
                    name="workspaceName"
                    maxLength={100}
                    required
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                </label>
                <label>
                  Description <span>(optional)</span>
                  <textarea
                    name="workspaceDescription"
                    maxLength={1000}
                    rows={3}
                    value={workspaceDescription}
                    onChange={(event) =>
                      setWorkspaceDescription(event.target.value)
                    }
                  />
                </label>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isCreating || workspaceName.trim().length === 0}
                >
                  {isCreating ? "Creating…" : "Create workspace"}
                </button>
              </form>
            </section>
          </div>
        )}

        <div className="auth-actions">
          <a className="secondary-button" href="#welcome-title">
            Continue with local reports
          </a>
          <button
            className="primary-button"
            type="button"
            disabled={isSigningOut}
            onClick={() => void signOut()}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </main>
  );

  async function signOut() {
    if (!client) {
      return;
    }
    setIsSigningOut(true);
    setWorkspaceError(null);
    try {
      const { error } = await client.auth.signOut();
      if (error) {
        setWorkspaceError(
          getWorkspaceErrorMessage(
            error,
            "We could not sign you out. Check your connection and try again.",
          ),
        );
      }
    } catch (error) {
      setWorkspaceError(
        getWorkspaceErrorMessage(
          error,
          "We could not sign you out. Check your connection and try again.",
        ),
      );
    } finally {
      setIsSigningOut(false);
    }
  }
}

interface WorkspaceDetailsProps {
  workspace: Workspace;
  workspaces: Workspace[];
  navigate: WorkspacePageProps["navigate"];
  members: WorkspaceMember[];
  actorId: string;
  actorRole: WorkspaceRole | undefined;
  ownerCount: number;
  isLoading: boolean;
  error: string | null;
  pendingMemberId: string | null;
  roleDrafts: Record<string, WorkspaceRole>;
  onRoleDraftChange: (userId: string, role: WorkspaceRole) => void;
  onRoleChange: (member: WorkspaceMember) => void;
  onRemoveMember: (member: WorkspaceMember) => void;
}

function WorkspaceDetails({
  workspace,
  workspaces,
  navigate,
  members,
  actorId,
  actorRole,
  ownerCount,
  isLoading,
  error,
  pendingMemberId,
  roleDrafts,
  onRoleDraftChange,
  onRoleChange,
  onRemoveMember,
}: WorkspaceDetailsProps) {
  const canManageMembers = actorRole === "owner" || actorRole === "admin";

  return (
    <section
      className="workspace-panel workspace-details"
      aria-labelledby="workspace-members-title"
    >
      <div className="workspace-detail-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>{workspace.name}</h2>
          {workspace.description && <p>{workspace.description}</p>}
        </div>
        <span className="workspace-role-badge">
          Your role: {actorRole ? roleLabels[actorRole] : "Checking…"}
        </span>
      </div>

      <p className="workspace-id">
        Workspace ID: <code>{workspace.id}</code>
      </p>

      <label className="workspace-switcher">
        Switch workspace
        <select
          value={workspace.id}
          onChange={(event) => {
            const selected = workspaces.find(
              (item) => item.id === event.target.value,
            );
            if (selected) {
              navigate(`workspace/${selected.id}`);
            }
          }}
        >
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="auth-alert" role="alert">
          {error}
        </p>
      )}

      <h2 id="workspace-members-title">Members</h2>
      {isLoading ? (
        <p role="status">Loading workspace members…</p>
      ) : members.length === 0 ? (
        <p>No members are currently available.</p>
      ) : (
        <ul className="workspace-member-list">
          {members.map((member) => {
            const isSelf = member.user_id === actorId;
            const canManage = canManageMember(
              actorRole,
              actorId,
              member,
              ownerCount,
            );
            const canChangeRole = canChangeMemberRole(
              actorRole,
              actorId,
              member,
              ownerCount,
            );
            const canLeave = canLeaveWorkspace(actorId, member, ownerCount);
            const draftRole = roleDrafts[member.user_id] ?? member.role;
            const roleOptions: WorkspaceRole[] =
              actorRole === "owner"
                ? member.role === "owner"
                  ? ["owner", "admin", "editor", "viewer"]
                  : ["admin", "editor", "viewer"]
                : ["editor", "viewer"];
            const isPending = pendingMemberId === member.user_id;
            const displayName = getMemberName(member);

            return (
              <li key={member.user_id}>
                <div className="workspace-member-details">
                  <strong>
                    {displayName}
                    {isSelf ? " (you)" : ""}
                  </strong>
                  <span>{roleLabels[member.role]}</span>
                  <code title={member.user_id}>
                    {member.user_id.slice(0, 8)}
                  </code>
                </div>
                {(canChangeRole || canManage || isSelf) && (
                  <div className="workspace-member-actions">
                    {canChangeRole && (
                      <label>
                        <span className="visually-hidden">
                          Role for {displayName}
                        </span>
                        <select
                          value={draftRole}
                          disabled={isPending}
                          onChange={(event) =>
                            onRoleDraftChange(
                              member.user_id,
                              workspaceRoleSchema.parse(event.target.value),
                            )
                          }
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {canChangeRole && draftRole !== member.role && (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isPending}
                        onClick={() => onRoleChange(member)}
                      >
                        {isPending ? "Saving…" : "Save role"}
                      </button>
                    )}
                    {((canManage && canManageMembers) ||
                      canLeave ||
                      (isSelf && member.role === "owner")) && (
                      <button
                        className="text-button workspace-remove-button"
                        type="button"
                        disabled={isPending || (isSelf && !canLeave)}
                        title={
                          isSelf && !canLeave
                            ? "The last workspace owner cannot leave."
                            : undefined
                        }
                        onClick={() => onRemoveMember(member)}
                      >
                        {isPending
                          ? "Working…"
                          : isSelf
                            ? canLeave
                              ? "Leave workspace"
                              : "Last owner"
                            : "Remove"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <WorkspaceInvitations workspaceId={workspace.id} actorRole={actorRole} />
      <WorkspaceReports workspaceId={workspace.id} actorRole={actorRole} />
      {actorRole === "owner" && ownerCount === 1 && (
        <p className="workspace-stage-note">
          The last owner cannot leave or be removed. Ownership transfer is not
          available in this stage.
        </p>
      )}
      <a className="secondary-button" href="#/account">
        Back to all workspaces
      </a>
    </section>
  );
}

function getMemberName(member: WorkspaceMember): string {
  return member.display_name?.trim() || `Member ${member.user_id.slice(0, 8)}`;
}

export default WorkspacePage;
