import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":
    Deno.env.get("INVITATION_ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(left: string, right: string): boolean {
  return left.length === right.length && left === right;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = Deno.env.get("INVITATION_ALLOWED_ORIGIN") ?? "";
  const headers = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": allowedOrigin,
  };

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }
  if (!allowedOrigin || !safeEqual(origin, allowedOrigin)) {
    return json(403, { error: "Origin is not allowed" });
  }

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("INVITATION_FROM");
  const siteUrl = Deno.env.get("INVITATION_SITE_URL");
  if (
    !authorization ||
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !resendApiKey ||
    !from ||
    !siteUrl
  ) {
    return json(503, { error: "Invitation delivery is not configured" });
  }
  try {
    const configuredSiteUrl = new URL(siteUrl);
    if (
      configuredSiteUrl.protocol !== "https:" ||
      configuredSiteUrl.origin !== allowedOrigin
    ) {
      return json(503, { error: "Invitation delivery is not configured" });
    }
  } catch {
    return json(503, { error: "Invitation delivery is not configured" });
  }

  let cleanupInvitation: (() => Promise<unknown>) | undefined;
  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } =
      await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json(401, { error: "A valid signed-in session is required" });
    }

    const payload = await request.json();
    if (
      typeof payload.workspaceId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.workspaceId,
      ) ||
      typeof payload.email !== "string" ||
      payload.email.length > 320 ||
      typeof payload.role !== "string" ||
      !["admin", "editor", "viewer"].includes(payload.role)
    ) {
      return json(400, { error: "Invalid invitation details" });
    }
    const email = payload.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: "Enter a valid email address" });
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = hex(tokenBytes);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const tokenHash = hex(new Uint8Array(digest));
    const trustedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await trustedClient.rpc(
      "create_workspace_invitation_for_delivery",
      {
        p_actor_id: userData.user.id,
        p_workspace_id: payload.workspaceId,
        p_email: email,
        p_role: payload.role,
        p_token_hash: tokenHash,
      },
    );
    if (error) {
      return json(error.code === "42501" ? 403 : 400, { error: error.message });
    }
    const invitation = Array.isArray(data) ? data[0] : null;
    if (!invitation || typeof invitation.invitation_id !== "string") {
      return json(500, { error: "Invitation could not be created" });
    }
    cleanupInvitation = async () =>
      userClient.rpc("revoke_workspace_invitation", {
        p_invitation_id: invitation.invitation_id,
      });

    const acceptanceUrl = new URL("#/invite/" + token, siteUrl).toString();
    const escapedUrl = escapeHtml(acceptanceUrl);
    const escapedEmail = escapeHtml(email);
    const sendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": invitation.invitation_id,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "You have been invited to a ReleaseProof workspace",
        text: `You were invited to join a ReleaseProof workspace as ${payload.role}. Sign in with ${email} and accept the invitation here: ${acceptanceUrl}\n\nThis link expires in seven days. If you did not expect this invitation, ignore this email.`,
        html: `<p>You were invited to join a ReleaseProof workspace as <strong>${payload.role}</strong>.</p><p><a href="${escapedUrl}">Review and accept the invitation</a></p><p>This invitation was addressed to ${escapedEmail} and expires in seven days. If you did not expect it, ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!sendResponse.ok) {
      // The secret token was not delivered; revoke the unusable pending record.
      await userClient.rpc("revoke_workspace_invitation", {
        p_invitation_id: invitation.invitation_id,
      });
      return json(502, {
        error: "Invitation email could not be delivered. Try again later.",
      });
    }

    return json(200, {
      invitation_id: invitation.invitation_id,
      invitation_expires_at: invitation.invitation_expires_at,
    });
  } catch {
    await cleanupInvitation?.();
    return json(400, {
      error: "The invitation request could not be processed",
    });
  }
});
