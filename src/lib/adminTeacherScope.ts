import type { ProgramType } from "@/types/programs";
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";

export type TeachingScope = "campus" | "online";

type TeacherRow = {
  id: string;
};

type AssignmentRow = {
  teacher_id?: string | null;
  programs?: { type?: ProgramType | null } | null;
};

type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (
    column: string,
    values: readonly unknown[]
  ) => Promise<{
    data: AssignmentRow[] | null;
    error: { message?: string | null; details?: string | null } | null;
  }>;
};

type QueryClient = {
  from: (table: string) => {
    select: (columns: string) => unknown;
  };
};

const FALLBACK_ON_MISSING_SCHEMA = true;

const scopeMatchesProgramType = (scope: TeachingScope, type: ProgramType) => {
  if (type === "hybrid") return true;
  return type === scope;
};

export const filterTeachersByTeachingScope = async <T extends TeacherRow>(
  client: QueryClient,
  teachers: T[],
  scope: TeachingScope,
  tenantId?: string | null
) => {
  if (teachers.length === 0) return teachers;

  const teacherIds = Array.from(
    new Set(teachers.map((teacher) => teacher.id).filter((id): id is string => Boolean(id)))
  );
  if (teacherIds.length === 0) return teachers;

  let query = client
    .from("teacher_assignments")
    .select("teacher_id, programs(type)") as QueryBuilder;

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.in("teacher_id", teacherIds);

  if (error) {
    if (
      FALLBACK_ON_MISSING_SCHEMA &&
      (isMissingRelationError(error, "teacher_assignments") ||
        isMissingRelationError(error, "programs") ||
        isMissingColumnError(error, "tenant_id", "teacher_assignments"))
    ) {
      return teachers;
    }
    throw error;
  }

  const assignmentRows = Array.isArray(data) ? data : [];
  if (assignmentRows.length === 0) {
    return teachers;
  }

  const programTypesByTeacher = new Map<string, Set<ProgramType>>();
  assignmentRows.forEach((row) => {
    const teacherId = row.teacher_id ?? null;
    const programType = row.programs?.type ?? null;
    if (!teacherId || !programType) return;
    const programTypes = programTypesByTeacher.get(teacherId) ?? new Set<ProgramType>();
    programTypes.add(programType);
    programTypesByTeacher.set(teacherId, programTypes);
  });

  return teachers.filter((teacher) => {
    const programTypes = programTypesByTeacher.get(teacher.id);
    if (!programTypes || programTypes.size === 0) return false;
    return Array.from(programTypes).some((type) => scopeMatchesProgramType(scope, type));
  });
};
