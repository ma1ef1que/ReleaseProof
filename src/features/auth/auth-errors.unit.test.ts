import { describe, expect, it } from "vitest";
import type { AuthError } from "@supabase/supabase-js";
import { getAuthErrorMessage } from "./auth-errors";

function authError(code: string): AuthError {
  return { code } as AuthError;
}

describe("authentication error messages", () => {
  it("uses safe, actionable messages for known auth errors", () => {
    expect(getAuthErrorMessage(authError("email_not_confirmed"))).toMatch(
      /confirm your email/i,
    );
    expect(getAuthErrorMessage(authError("invalid_credentials"))).toMatch(
      /email or password is incorrect/i,
    );
    expect(getAuthErrorMessage(authError("weak_password"))).toMatch(
      /at least 8 characters/i,
    );
  });

  it("does not display raw service errors", () => {
    const error = {
      code: "unexpected_error",
      message: "private server stack details",
    } as AuthError;

    expect(getAuthErrorMessage(error)).toBe(
      "We could not complete that request. Please try again.",
    );
  });
});
