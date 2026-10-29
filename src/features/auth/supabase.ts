import type { SupabaseClient } from "@supabase/supabase-js";

export type SupabaseClientStatus =
  | { kind: "disabled" }
  | { kind: "invalid"; message: string }
  | { kind: "configured" };

export function getSupabaseClientStatus(
  url: string,
  key: string,
): SupabaseClientStatus {
  if (url.length === 0 && key.length === 0) {
    return { kind: "disabled" };
  }
  if (url.length === 0 || key.length === 0) {
    return {
      kind: "invalid",
      message:
        "Supabase authentication is partially configured. Set both the project URL and publishable key.",
    };
  }
  if (!isValidSupabaseUrl(url)) {
    return {
      kind: "invalid",
      message:
        "Supabase authentication is unavailable because the project URL is invalid.",
    };
  }
  if (isSecretKey(key)) {
    return {
      kind: "invalid",
      message:
        "A Supabase secret key cannot be used in the browser. Configure a publishable key.",
    };
  }
  if (!isPublishableKey(key)) {
    return {
      kind: "invalid",
      message:
        "The browser key is not a Supabase publishable key. Use a publishable key or legacy anon key.",
    };
  }
  return { kind: "configured" };
}

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const isLocal =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";

    return (
      (url.protocol === "https:" || (isLocal && url.protocol === "http:")) &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isSecretKey(value: string): boolean {
  return value.startsWith("sb_secret_") || getJwtRole(value) === "service_role";
}

function isPublishableKey(value: string): boolean {
  return (
    (value.startsWith("sb_publishable_") &&
      value.length > "sb_publishable_".length) ||
    getJwtRole(value) === "anon"
  );
}

function getJwtRole(value: string): string | null {
  const payload = value.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const role: unknown = JSON.parse(decoded).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export const supabaseClientStatus = getSupabaseClientStatus(
  supabaseUrl,
  publishableKey,
);
let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabaseClientStatus.kind !== "configured") {
    return Promise.resolve(null);
  }

  clientPromise ??= import("@supabase/supabase-js")
    .then(({ createClient }) =>
      createClient(supabaseUrl, publishableKey, {
        auth: {
          flowType: "pkce",
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storageKey: "releaseproof-auth",
        },
      }),
    )
    .catch((error: unknown) => {
      clientPromise = null;
      throw error;
    });

  return clientPromise;
}

export function getAuthRedirectUrl(path: "callback" | "reset-password") {
  const redirectUrl = new URL(window.location.pathname, window.location.origin);
  redirectUrl.hash = path === "callback" ? "/auth/callback" : "/reset-password";
  return redirectUrl.toString();
}
