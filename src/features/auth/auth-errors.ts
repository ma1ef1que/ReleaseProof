import type { AuthError } from "@supabase/supabase-js";

export function getAuthErrorMessage(error: AuthError): string {
  switch (error.code) {
    case "email_not_confirmed":
      return "Confirm your email address before signing in.";
    case "invalid_credentials":
      return "The email or password is incorrect.";
    case "user_already_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "weak_password":
      return "Choose a stronger password with at least 8 characters.";
    case "over_email_send_rate_limit":
      return "Too many email requests. Wait a little while and try again.";
    case "email_address_invalid":
      return "Enter a valid email address.";
    default:
      return "We could not complete that request. Please try again.";
  }
}
