import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStudentClaimPreviewName,
  generateStudentClaimToken,
  hashStudentClaimToken,
  studentClaimExpiresAt,
} from "@/lib/studentClaims";

describe("student claim helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hashes claim tokens deterministically without exposing the original token", () => {
    const hash = hashStudentClaimToken("claim-token");

    expect(hash).toBe(hashStudentClaimToken("claim-token"));
    expect(hash).not.toContain("claim-token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates URL-safe claim tokens", () => {
    const token = generateStudentClaimToken();

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("calculates claim expiry from the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z"));

    expect(studentClaimExpiresAt(2)).toBe("2026-04-24T02:00:00.000Z");
  });

  it("locks preview names only when the student record has a real name", () => {
    expect(buildStudentClaimPreviewName("  KHADIJAH  ")).toEqual({
      name: "KHADIJAH",
      displayName: "KHADIJAH",
      nameLocked: true,
    });
    expect(buildStudentClaimPreviewName(null)).toEqual({
      name: "",
      displayName: "Student",
      nameLocked: false,
    });
  });
});
