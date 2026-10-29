import { useEffect, useRef, useState } from "react";
import { appConfig } from "../config/app-config";
import ReportImporter from "../components/import/ReportImporter";
import PrivacyDialog from "../components/PrivacyDialog";
import AccountPage from "../features/auth/AccountPage";
import AuthPage, { type AuthRoute } from "../features/auth/AuthPage";
import { AuthProvider } from "../features/auth/AuthProvider";
import { useAuth } from "../features/auth/auth-context";
import { supabaseClientStatus } from "../features/auth/supabase";
import InvitationAcceptancePage from "../features/workspaces/InvitationAcceptancePage";

type AppRoute =
  AuthRoute | "account" | "home" | `invite/${string}` | `workspace/${string}`;

const authRoutes: AuthRoute[] = [
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "auth/callback",
];

function getRouteFromHash(): AppRoute {
  const route = window.location.hash.slice(2);
  if (route === "account" || authRoutes.includes(route as AuthRoute)) {
    return route as AppRoute;
  }
  const workspaceRoute = route.match(
    /^workspace\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  if (workspaceRoute) {
    return `workspace/${workspaceRoute[1]}`;
  }
  const invitationRoute = route.match(/^invite\/([0-9a-f]{64})$/i);
  if (invitationRoute) {
    return `invite/${invitationRoute[1]}`;
  }
  return "home";
}

function navigateToRoute(route: AppRoute) {
  window.location.hash = route === "home" ? "welcome-title" : `/${route}`;
}

function AppContent() {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [route, setRoute] = useState<AppRoute>(getRouteFromHash);
  const { client, isLoading, session, lastAuthEvent } = useAuth();
  const handledAuthEvent = useRef(lastAuthEvent);

  useEffect(() => {
    document.title = `${appConfig.productName} — QA evidence reports`;
  }, []);

  useEffect(() => {
    function syncRoute() {
      setRoute(getRouteFromHash());
    }

    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (!lastAuthEvent || handledAuthEvent.current === lastAuthEvent) {
      return;
    }

    handledAuthEvent.current = lastAuthEvent;
    if (lastAuthEvent === "PASSWORD_RECOVERY") {
      navigateToRoute("reset-password");
    } else if (
      lastAuthEvent === "SIGNED_IN" &&
      getRouteFromHash() !== "reset-password" &&
      !getRouteFromHash().startsWith("invite/")
    ) {
      navigateToRoute("account");
    }
  }, [lastAuthEvent]);

  if (route === "account" || route.startsWith("workspace/")) {
    if (isLoading) {
      return (
        <main className="app-shell">
          <section className="welcome-card" role="status">
            Checking your sign-in session…
          </section>
        </main>
      );
    }
    if (!session) {
      return <AuthPage route="login" navigate={navigateToRoute} />;
    }
    const workspaceId = route.startsWith("workspace/")
      ? route.slice("workspace/".length)
      : null;
    return <AccountPage workspaceId={workspaceId} navigate={navigateToRoute} />;
  }

  if (route.startsWith("invite/")) {
    return (
      <InvitationAcceptancePage
        token={route.slice("invite/".length)}
        navigate={navigateToRoute}
      />
    );
  }

  if (authRoutes.includes(route as AuthRoute)) {
    return <AuthPage route={route as AuthRoute} navigate={navigateToRoute} />;
  }

  return (
    <main className="app-shell">
      <div className="welcome-card">
        <header className="site-header">
          <a className="site-brand" href="#welcome-title">
            {appConfig.productName}
          </a>
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <button
              className="text-button"
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
            >
              Privacy
            </button>
            {client ? (
              session ? (
                <a href="#/account">Account</a>
              ) : (
                <>
                  <a href="#/login">Sign in</a>
                  <a href="#/signup">Create account</a>
                </>
              )
            ) : supabaseClientStatus.kind === "invalid" ? (
              <span className="auth-config-warning" role="status">
                {supabaseClientStatus.message}
              </span>
            ) : null}
          </nav>
        </header>

        <section className="landing-hero" aria-labelledby="welcome-title">
          <p className="eyebrow">Local-first QA evidence</p>
          <h1 id="welcome-title">
            Turn Playwright results into a clear QA evidence report
          </h1>
          <p className="intro">
            Import locally. Review failures. Add manual checks. Export a
            shareable report.
          </p>
          <p className="privacy-note">
            Local imports stay in this browser. Workspace reports are uploaded
            only after you explicitly choose a file and confirm.
          </p>
        </section>

        <ReportImporter />

        <section
          id="how-it-works"
          className="how-it-works"
          aria-labelledby="how-it-works-title"
        >
          <p className="eyebrow">Getting started</p>
          <h2 id="how-it-works-title">How it works</h2>
          <ol>
            <li>
              Try the synthetic demo or import a Playwright JSON / ZIP file.
            </li>
            <li>
              Review outcomes, failures, attachments and the manual checklist.
            </li>
            <li>
              Preview and download a standalone HTML report, or print to PDF.
            </li>
          </ol>
          <details className="playwright-instructions">
            <summary>How to export from Playwright</summary>
            <p>
              Add the JSON reporter to your Playwright configuration, then run
              your tests to create a report file:
            </p>
            <pre>
              <code>
                {`reporter: [["list"], ["json", { outputFile: "artifacts/playwright-report.json" }]]`}
              </code>
            </pre>
            <p>
              Import that JSON file directly. To include referenced screenshots,
              place the report and its attachments in a ZIP while preserving
              their relative paths.
            </p>
          </details>
          <p className="status-note">
            Report data and edits are temporary. Refreshing or closing this tab
            clears them.
          </p>
        </section>
      </div>

      {isPrivacyOpen && (
        <PrivacyDialog onClose={() => setIsPrivacyOpen(false)} />
      )}
    </main>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
