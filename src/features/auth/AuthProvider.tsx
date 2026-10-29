import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import { AuthContext } from "./auth-context";
import { getAuthErrorMessage } from "./auth-errors";
import { getSupabaseClient, supabaseClientStatus } from "./supabase";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(
    supabaseClientStatus.kind === "configured",
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthChangeEvent | null>(
    null,
  );

  const refreshSession = useCallback(async () => {
    if (!client) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setSessionError(null);
    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        setSessionError(getAuthErrorMessage(error));
        return;
      }

      setSession(data.session);
    } catch {
      setSessionError(
        "We could not check your sign-in session. Check your connection and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (supabaseClientStatus.kind !== "configured") {
      return;
    }

    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;

    async function initializeAuth() {
      try {
        const authClient = await getSupabaseClient();
        if (active) {
          setClient(authClient);
        }

        if (!active || !authClient) {
          return;
        }

        const {
          data: { subscription: authSubscription },
        } = authClient.auth.onAuthStateChange((event, nextSession) => {
          if (active) {
            setLastAuthEvent(event);
            setSession(nextSession);
            setSessionError(null);
            setIsLoading(false);
          }
        });
        subscription = authSubscription;

        const { data, error } = await authClient.auth.getSession();
        if (active) {
          if (error) {
            setSessionError(getAuthErrorMessage(error));
          } else {
            setSession(data.session);
          }
        }
      } catch {
        if (active) {
          setSessionError(
            "We could not initialize authentication. Check your configuration and connection.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void initializeAuth();

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      client,
      session,
      isLoading,
      sessionError,
      lastAuthEvent,
      refreshSession,
    }),
    [client, isLoading, lastAuthEvent, refreshSession, session, sessionError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
