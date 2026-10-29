import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { getAuthErrorMessage } from "./auth-errors";
import { getAuthRedirectUrl, supabaseClientStatus } from "./supabase";
import { useAuth } from "./auth-context";

export type AuthRoute =
  "login" | "signup" | "forgot-password" | "reset-password" | "auth/callback";

interface AuthPageProps {
  route: AuthRoute;
  navigate: (route: AuthRoute | "account" | "home") => void;
}

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8);

function AuthPage({ route, navigate }: AuthPageProps) {
  const { client, isLoading, session, sessionError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!client && isLoading) {
    return (
      <AuthLayout navigate={navigate}>
        <p id="auth-title" role="status">
          Connecting to the account service…
        </p>
      </AuthLayout>
    );
  }

  if (!client) {
    return (
      <AuthLayout navigate={navigate}>
        <p className="auth-alert" role="alert">
          {sessionError ??
            (supabaseClientStatus.kind === "invalid"
              ? supabaseClientStatus.message
              : "Account features are not configured. Local report import remains available.")}
        </p>
        <AuthBackLink navigate={navigate} />
      </AuthLayout>
    );
  }
  const authClient = client;

  if (route === "auth/callback") {
    return (
      <AuthLayout navigate={navigate}>
        <h1 id="auth-title">Checking your sign-in link</h1>
        <p role="status">
          Your email link is being verified. This page will update when
          verification completes.
        </p>
        {session && (
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate("account")}
          >
            Continue to your account
          </button>
        )}
      </AuthLayout>
    );
  }

  const isSignup = route === "signup";
  const isForgotPassword = route === "forgot-password";
  const isResetPassword = route === "reset-password";
  if (isResetPassword && isLoading) {
    return (
      <AuthLayout navigate={navigate}>
        <p id="auth-title" role="status">
          Checking your password reset link…
        </p>
      </AuthLayout>
    );
  }

  const title = isSignup
    ? "Create your account"
    : isForgotPassword
      ? "Reset your password"
      : isResetPassword
        ? "Choose a new password"
        : "Sign in to ReleaseProof";
  const submitLabel = isSignup
    ? "Create account"
    : isForgotPassword
      ? "Send reset link"
      : isResetPassword
        ? "Update password"
        : "Sign in";

  if (isResetPassword && !session) {
    return (
      <AuthLayout navigate={navigate}>
        <h1 id="auth-title">Reset link unavailable</h1>
        <p className="auth-alert" role="alert">
          This password reset link is invalid or has expired. Request a new link
          to continue.
        </p>
        <a href="#/forgot-password">Request another reset link</a>
      </AuthLayout>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);

    if (isResetPassword) {
      const validation = passwordSchema.safeParse(password);
      if (!validation.success) {
        setErrorMessage("Choose a password with at least 8 characters.");
        return;
      }
      if (password !== passwordConfirmation) {
        setErrorMessage("The password entries do not match.");
        return;
      }
    } else {
      const validation = emailSchema.safeParse(email);
      if (!validation.success) {
        setErrorMessage("Enter a valid email address.");
        return;
      }
      if (!isForgotPassword && !passwordSchema.safeParse(password).success) {
        setErrorMessage("Choose a password with at least 8 characters.");
        return;
      }
      if (isSignup && password !== passwordConfirmation) {
        setErrorMessage("The password entries do not match.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        const { data, error } = await authClient.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl("callback"),
          },
        });
        if (error) {
          setErrorMessage(getAuthErrorMessage(error));
        } else if (data.session) {
          navigate("account");
        } else {
          setNotice(
            "If this address can be registered, check your inbox for a confirmation link before signing in.",
          );
        }
      } else if (isForgotPassword) {
        const { error } = await authClient.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: getAuthRedirectUrl("reset-password") },
        );
        if (error) {
          setErrorMessage(getAuthErrorMessage(error));
        } else {
          setNotice(
            "If an account exists for this address, a password reset link will be sent.",
          );
        }
      } else if (isResetPassword) {
        const { error } = await authClient.auth.updateUser({ password });
        if (error) {
          setErrorMessage(getAuthErrorMessage(error));
        } else {
          setNotice("Your password has been updated.");
          setPassword("");
          setPasswordConfirmation("");
        }
      } else {
        const { error } = await authClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setErrorMessage(getAuthErrorMessage(error));
        } else {
          navigate("account");
        }
      }
    } catch {
      setErrorMessage(
        "We could not reach the authentication service. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout navigate={navigate}>
      <h1 id="auth-title">{title}</h1>
      <p className="auth-description">
        Your Playwright reports remain in this browser unless you explicitly
        choose a future cloud upload.
      </p>
      {sessionError && (
        <p className="auth-alert" role="alert">
          {sessionError}
        </p>
      )}
      <form
        className="auth-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {!isResetPassword && (
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        )}
        {!isForgotPassword && (
          <label>
            {isResetPassword ? "New password" : "Password"}
            <input
              type="password"
              name="password"
              autoComplete={
                isSignup || isResetPassword
                  ? "new-password"
                  : "current-password"
              }
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        {(isSignup || isResetPassword) && (
          <label>
            Confirm password
            <input
              type="password"
              name="passwordConfirmation"
              autoComplete="new-password"
              minLength={8}
              required
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
            />
          </label>
        )}
        {errorMessage && (
          <p className="auth-alert" role="alert">
            {errorMessage}
          </p>
        )}
        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Please wait…" : submitLabel}
        </button>
      </form>

      <nav className="auth-links" aria-label="Account options">
        {route === "login" && (
          <>
            <a href="#/forgot-password">Forgot password?</a>
            <a href="#/signup">Create an account</a>
          </>
        )}
        {route === "signup" && <a href="#/login">Already have an account?</a>}
        {route === "forgot-password" && <a href="#/login">Back to sign in</a>}
        {route === "reset-password" && <a href="#/login">Return to sign in</a>}
      </nav>
    </AuthLayout>
  );
}

interface AuthLayoutProps {
  children: ReactNode;
  navigate: AuthPageProps["navigate"];
}

function AuthLayout({ children, navigate }: AuthLayoutProps) {
  return (
    <main className="app-shell">
      <section className="welcome-card auth-card" aria-labelledby="auth-title">
        <header className="site-header">
          <a
            className="site-brand"
            href="#welcome-title"
            onClick={() => navigate("home")}
          >
            ReleaseProof
          </a>
          <a href="#welcome-title" onClick={() => navigate("home")}>
            Back to local reports
          </a>
        </header>
        {children}
      </section>
    </main>
  );
}

function AuthBackLink({ navigate }: Pick<AuthLayoutProps, "navigate">) {
  return (
    <button
      className="secondary-button"
      type="button"
      onClick={() => navigate("home")}
    >
      Back to local reports
    </button>
  );
}

export default AuthPage;
