import { createHash, randomBytes } from "crypto";

export const ONLINE_STUDENT_CLAIM_TTL_HOURS = 24 * 14;

export type StudentClaimPreviewName = {
  name: string;
  displayName: string;
  nameLocked: boolean;
};

export function buildStudentClaimPreviewName(name: string | null | undefined): StudentClaimPreviewName {
  const trimmedName = (name ?? "").trim();

  return {
    name: trimmedName,
    displayName: trimmedName || "Student",
    nameLocked: trimmedName.length > 0,
  };
}

export function hashStudentClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateStudentClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

export function studentClaimExpiresAt(hours = ONLINE_STUDENT_CLAIM_TTL_HOURS): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export const generateFamilyClaimToken = generateStudentClaimToken;
export const hashFamilyClaimToken = hashStudentClaimToken;
export const familyClaimExpiresAt = studentClaimExpiresAt;
