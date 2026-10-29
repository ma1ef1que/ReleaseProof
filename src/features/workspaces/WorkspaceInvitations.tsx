import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/auth-context";
import {
  areWorkspaceInvitationsEnabled,
  isLocalSupabaseProject,
} from "../auth/supabase";
import {
  createWorkspaceInvitation,
  getWorkspaceErrorMessage,
  listWorkspaceInvitations,
  revokeWorkspaceInvitation,
  workspaceRoleSchema,
  type WorkspaceInvitation as WorkspaceInvitationRecord,
  type WorkspaceRole,
} from "./workspaces";

interface WorkspaceInvitationsProps {
  workspaceId: string;
  actorRole: WorkspaceRole | undefined;
}

function WorkspaceInvitations({
  workspaceId,
  actorRole,
}: WorkspaceInvitationsProps) {
  const { client } = useAuth();
  const [invitations, setInvitations] = useState<WorkspaceInvitationRecord[]>(
    [],
  );
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("editor");
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!client) {
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    void listWorkspaceInvitations(client, workspaceId)
      .then((items) => {
        if (active) {
          setInvitations(items);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            getWorkspaceErrorMessage(
              cause,
              "We could not load workspace invitations.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, workspaceId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !areWorkspaceInvitationsEnabled()) {
      return;
    }

    setError(null);
    setNotice(null);
    setCreatedLink(null);
    setPendingId("create");
    try {
      const invitation = await createWorkspaceInvitation(
        client,
        workspaceId,
        email,
        role,
      );
      if ("invitation_token" in invitation) {
        const link = new URL(window.location.href);
        link.hash = `/invite/${invitation.invitation_token}`;
        setCreatedLink(link.toString());
      }
      setEmail("");
      setNotice(
        "invitation_token" in invitation
          ? `Invitation link created. Email delivery is not configured. It expires ${new Date(invitation.invitation_expires_at).toLocaleString()}.`
          : `Invitation sent. It expires ${new Date(invitation.invitation_expires_at).toLocaleString()}.`,
      );
      setInvitations(await listWorkspaceInvitations(client, workspaceId));
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "We could not create the invitation. Check the email and try again.",
        ),
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleRevoke(invitation: WorkspaceInvitationRecord) {
    if (!client) {
      return;
    }
    setPendingId(invitation.invitation_id);
    setError(null);
    setNotice(null);
    try {
      await revokeWorkspaceInvitation(client, invitation.invitation_id);
      setInvitations(await listWorkspaceInvitations(client, workspaceId));
      setNotice("The invitation has been revoked.");
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "We could not revoke the invitation. Try again.",
        ),
      );
    } finally {
      setPendingId(null);
    }
  }

  async function copyInvitationLink() {
    if (!createdLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdLink);
      setNotice(
        "Invitation link copied. Share it only with the invited email address.",
      );
    } catch {
      setError(
        "The invitation link could not be copied. Select and copy the link manually.",
      );
    }
  }

  if (actorRole !== "owner" && actorRole !== "admin") {
    return null;
  }

  return (
    <section
      className="workspace-invitations"
      aria-labelledby="workspace-invitations-title"
    >
      <h3 id="workspace-invitations-title">Invitations</h3>
      {!areWorkspaceInvitationsEnabled() ? (
        <p className="workspace-stage-note">
          Invitation creation is temporarily disabled for this deployment.
        </p>
      ) : (
        <>
          <p className="workspace-stage-note">
            {isLocalSupabaseProject()
              ? "Local development only: email is not sent. Share the one-time link only with the invited email address. It expires after seven days."
              : "An invitation email will be sent to this address. The link expires after seven days."}
          </p>
          <form
            className="workspace-invitation-form"
            onSubmit={(event) => void handleCreate(event)}
          >
            <label>
              Invite by email
              <input
                type="email"
                required
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Role
              <select
                value={role}
                onChange={(event) =>
                  setRole(
                    workspaceRoleSchema
                      .exclude(["owner"])
                      .parse(event.target.value),
                  )
                }
              >
                {actorRole === "owner" && <option value="admin">Admin</option>}
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button
              className="secondary-button"
              type="submit"
              disabled={pendingId !== null || !email.trim()}
            >
              {pendingId === "create" ? "Creating…" : "Create invitation"}
            </button>
          </form>
          {createdLink && (
            <div className="workspace-invitation-link">
              <label>
                One-time invitation link
                <input
                  readOnly
                  value={createdLink}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void copyInvitationLink()}
              >
                Copy invitation link
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="auth-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      )}

      {isLoading ? (
        <p role="status">Loading invitations…</p>
      ) : invitations.length > 0 ? (
        <ul className="workspace-invitation-list">
          {invitations.map((invitation) => (
            <li key={invitation.invitation_id}>
              <span>
                <strong>{invitation.email_normalized}</strong> ·{" "}
                {invitation.role}
                {" · "}
                {invitation.status}
                {invitation.status === "pending" &&
                  ` · Expires ${new Date(invitation.expires_at).toLocaleDateString()}`}
              </span>
              {invitation.status === "pending" && (
                <button
                  className="text-button workspace-remove-button"
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => void handleRevoke(invitation)}
                >
                  {pendingId === invitation.invitation_id
                    ? "Revoking…"
                    : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No invitations have been created.</p>
      )}
    </section>
  );
}

export default WorkspaceInvitations;
