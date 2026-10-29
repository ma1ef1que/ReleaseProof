import { createContext, useContext } from "react";
import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";

export interface AuthContextValue {
  client: SupabaseClient | null;
  session: Session | null;
  isLoading: boolean;
  sessionError: string | null;
  lastAuthEvent: AuthChangeEvent | null;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
