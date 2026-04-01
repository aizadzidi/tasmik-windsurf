import "server-only";

import type { ProgramScope, ProgramType } from "@/types/programs";
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";
import { supabaseService } from "@/lib/supabaseServiceClientSimple";

const DEFAULT_SCOPE: ProgramScope = "campus";

type ProgramRow = { type?: ProgramType | null };
type AssignmentRow = {
  programs?: ProgramRow | ProgramRow[] | null;
};

const resolveProgramScope = (types: ProgramType[]): ProgramScope => {
  const unique = new Set(types);
  if (unique.size === 0) return DEFAULT_SCOPE;
  if (unique.size === 1 && unique.has("online")) return "online";
  if (unique.has("online") && (unique.has("campus") || unique.has("hybrid"))) return "mixed";
  return DEFAULT_SCOPE;
};

const isMissingScopeSchemaError = (error: { message?: string | null; details?: string | null } | null) =>
  Boolean(
    isMissingRelationError(error, "teacher_assignments") ||
      isMissingRelationError(error, "programs") ||
      isMissingColumnError(error, "tenant_id", "teacher_assignments")
  );

const TEACHER_LEAVE_ACCESS_FORBIDDEN = "TEACHER_LEAVE_ACCESS_FORBIDDEN" as const;

type TeacherLeaveAccessForbiddenError = Error & {
  code: typeof TEACHER_LEAVE_ACCESS_FORBIDDEN;
  status: 403;
};

const createTeacherLeaveAccessForbiddenError = (
  message = "Leave management is only available for campus teachers"
): TeacherLeaveAccessForbiddenError =>
  Object.assign(new Error(message), {
    name: "TeacherLeaveAccessForbiddenError",
    code: TEACHER_LEAVE_ACCESS_FORBIDDEN,
    status: 403 as const,
  });

export const isTeacherLeaveAccessForbiddenError = (
  error: unknown
): error is TeacherLeaveAccessForbiddenError =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === TEACHER_LEAVE_ACCESS_FORBIDDEN
  );

async function loadTeacherProgramScope(
  client: NonNullable<typeof supabaseService>,
  teacherId: string,
  tenantId?: string | null,
  options?: { strict?: boolean }
): Promise<ProgramScope> {
  const strict = options?.strict ?? false;

  let query = client
    .from("teacher_assignments")
    .select("programs(type)")
    .eq("teacher_id", teacherId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingScopeSchemaError(error)) {
      if (strict) {
        throw new Error("Unable to resolve teacher program scope for leave authorization");
      }
      return DEFAULT_SCOPE;
    }
    throw error;
  }

  const programTypes = ((data ?? []) as AssignmentRow[]).flatMap((row) => {
    if (Array.isArray(row.programs)) {
      return row.programs
        .map((program) => program?.type)
        .filter((value): value is ProgramType => Boolean(value));
    }

    const programType = row.programs?.type;
    return programType ? [programType] : [];
  });

  return resolveProgramScope(programTypes);
}

export async function getTeacherProgramScope(
  client: NonNullable<typeof supabaseService>,
  teacherId: string,
  tenantId?: string | null
): Promise<ProgramScope> {
  return loadTeacherProgramScope(client, teacherId, tenantId);
}

export async function ensureTeacherHasCampusLeaveAccess(
  client: NonNullable<typeof supabaseService>,
  teacherId: string,
  tenantId?: string | null
) {
  const programScope = await loadTeacherProgramScope(client, teacherId, tenantId, { strict: true });
  if (programScope === "online") {
    throw createTeacherLeaveAccessForbiddenError();
  }
}
