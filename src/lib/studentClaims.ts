import { createHash, randomBytes } from "crypto";

export const ONLINE_STUDENT_CLAIM_TTL_HOURS = 24 * 14;

export function hashStudentClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateStudentClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

export function studentClaimExpiresAt(hours = ONLINE_STUDENT_CLAIM_TTL_HOURS): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
