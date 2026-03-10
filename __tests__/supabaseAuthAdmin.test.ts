import { describe, expect, it } from "vitest";
import {
  formatSupabaseAuthDeleteError,
  isSupabaseAuthUserNotFoundError,
} from "@/lib/supabaseAuthAdmin";

describe("isSupabaseAuthUserNotFoundError", () => {
  it("returns true for status 404 auth delete errors", () => {
    expect(
      isSupabaseAuthUserNotFoundError({
        status: 404,
        message: "User not found",
      })
    ).toBe(true);
  });

  it("returns true for user_not_found code", () => {
    expect(
      isSupabaseAuthUserNotFoundError({
        code: "user_not_found",
        message: "No auth user",
      })
    ).toBe(true);
  });

  it("returns false for non-not-found auth errors", () => {
    expect(
      isSupabaseAuthUserNotFoundError({
        status: 500,
        code: "unexpected_failure",
        message: "Internal error",
      })
    ).toBe(false);
  });
});

describe("formatSupabaseAuthDeleteError", () => {
  it("uses Error.message when available", () => {
    expect(formatSupabaseAuthDeleteError(new Error("Permission denied"))).toBe(
      "Permission denied"
    );
  });

  it("builds a readable fallback from structured error payload", () => {
    expect(
      formatSupabaseAuthDeleteError({
        message: "Delete failed",
        code: "forbidden",
        status: 403,
      })
    ).toContain("Delete failed");
  });
});
