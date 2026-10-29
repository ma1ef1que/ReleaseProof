import { useState } from "react";
import { useAuth } from "../auth/auth-context";
import {
  acceptWorkspaceInvitation,
  getWorkspaceErrorMessage,
} from "./workspaces";

interface InvitationAcceptancePageProps {
  token: string;
  navigate: (route: "account" | "home" | `workspace/${string}`) => void;
}

function InvitationAcceptancePage({
  token,
  navigate,
}: InvitationAcceptancePageProps) {
  const { client, session } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (!client || !session) {
      return;
    }

    setIsAccepting(true);
    setError(null);
    try {
      const workspaceId = await acceptWorkspaceInvitation(client, token);
      if (!workspaceId) {
        setError(
          "This invitation has expired. Ask the workspace owner for a new one.",
        );
        return;
      }
      navigate(`workspace/${workspaceId}`);
    } catch (cause) {
      setError(
        getWorkspaceErrorMessage(
          cause,
          "This invitation is invalid, expired, revoked or already used.",
        ),
      );
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="welcome-card auth-card">
        <header className="site-header">
          <a className="site-brand" href="#welcome-title">
            ReleaseProof
          </a>
          <a href="#welcome-title">Local reports</a>
        </header>
        <p className="eyebrow">Workspace invitation</p>
        <h1>Join a workspace</h1>
        {session ? (
          <>
            <p className="auth-description">
              Accepting will add <strong>{session.user.email}</strong> to the
              workspace with the role assigned by its inviter. The workspace
              name and contents are not shown before acceptance.
            </p>
            {error && (
              <p className="auth-alert" role="alert">
                {error}
              </p>
            )}
            <div className="auth-actions">
              <button
                className="primary-button"
                type="button"
                disabled={isAccepting}
                onClick={() => void handleAccept()}
              >
                {isAccepting ? "Accepting…" : "Accept invitation"}
              </button>
              <a className="secondary-button" href="#/account">
                Decline
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="auth-description">
              Sign in with the invited email address, then open this invitation
              link again to accept it.
            </p>
            <a className="primary-button" href="#/login">
              Sign in
            </a>
          </>
        )}
      </section>
    </main>
  );
}

export default InvitationAcceptancePage;
