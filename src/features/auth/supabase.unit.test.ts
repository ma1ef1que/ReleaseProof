import { describe, expect, it } from "vitest";
import { getSupabaseClientStatus } from "./supabase";

describe("Supabase browser configuration", () => {
  it("keeps local report mode when no auth values are set", () => {
    expect(getSupabaseClientStatus("", "")).toEqual({ kind: "disabled" });
  });

  it("requires both a project URL and publishable key", () => {
    expect(
      getSupabaseClientStatus("https://project.supabase.co", ""),
    ).toMatchObject({ kind: "invalid" });
    expect(getSupabaseClientStatus("", "publishable-key")).toMatchObject({
      kind: "invalid",
    });
  });

  it("accepts HTTPS hosted URLs and local HTTP URLs", () => {
    expect(
      getSupabaseClientStatus(
        "https://project.supabase.co",
        "sb_publishable_test",
      ),
    ).toEqual({ kind: "configured" });
    expect(
      getSupabaseClientStatus("http://127.0.0.1:54321", "sb_publishable_local"),
    ).toEqual({ kind: "configured" });
  });

  it("rejects insecure remote URLs and URL paths", () => {
    expect(
      getSupabaseClientStatus("http://project.example", "publishable-key"),
    ).toMatchObject({ kind: "invalid" });
    expect(
      getSupabaseClientStatus(
        "https://project.supabase.co/unexpected",
        "publishable-key",
      ),
    ).toMatchObject({ kind: "invalid" });
  });

  it("rejects keys that are not publishable or legacy anon keys", () => {
    expect(
      getSupabaseClientStatus(
        "https://project.supabase.co",
        "not-a-supabase-key",
      ),
    ).toMatchObject({ kind: "invalid" });
  });

  it("prevents a Supabase secret key from being used in browser code", () => {
    expect(
      getSupabaseClientStatus(
        "https://project.supabase.co",
        "sb_secret_do_not_use",
      ),
    ).toMatchObject({ kind: "invalid" });
  });

  it("rejects legacy service-role JWTs", () => {
    const serviceRolePayload = btoa(JSON.stringify({ role: "service_role" }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect(
      getSupabaseClientStatus(
        "https://project.supabase.co",
        `header.${serviceRolePayload}.signature`,
      ),
    ).toMatchObject({ kind: "invalid" });
  });
});
