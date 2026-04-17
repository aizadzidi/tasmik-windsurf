import { isMissingColumnError } from "@/lib/online/db";
import type { ProgramType } from "@/types/programs";

export type StaffInviteRole = "teacher" | "general_worker";
export type TeacherInviteScope = "campus" | "online";

export const TEACHER_INVITE_SCOPE_LABELS: Record<TeacherInviteScope, string> = {
  campus: "Campus",
  online: "Online",
};

export const normalizeStaffInviteRole = (value: unknown): StaffInviteRole | null =>
  value === "teacher" || value === "general_worker" ? value : null;

export const normalizeTeacherInviteScope = (
  value: unknown
): TeacherInviteScope | null => (value === "campus" || value === "online" ? value : null);

export const validateTeacherInviteScope = (
  targetRole: StaffInviteRole,
  teacherScope: TeacherInviteScope | null
): string | null => {
  if (targetRole === "teacher" && !teacherScope) {
    return "Teacher invites require a scope.";
  }
  if (targetRole !== "teacher" && teacherScope) {
    return "Only teacher invites can include a scope.";
  }
  return null;
};

export const getProgramTypesForTeacherInviteScope = (
  teacherScope: TeacherInviteScope
): ProgramType[] => [teacherScope];

export const isMissingTeacherInviteScopeSchemaError = (
  error: { message?: string | null; details?: string | null } | null | undefined
) => isMissingColumnError(error, "teacher_scope", "tenant_invites");
