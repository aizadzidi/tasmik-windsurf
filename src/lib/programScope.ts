import type { ProgramScope, ProgramType } from "@/types/programs";

export const LEGACY_TEACHER_SCOPE_FALLBACK: ProgramScope = "campus";
export const EMPTY_TEACHER_SCOPE: ProgramScope = "unknown";

const resolveProgramScope = (
  types: ProgramType[],
  emptyScope: ProgramScope
): ProgramScope => {
  const unique = new Set(types);
  if (unique.size === 0) return emptyScope;
  if (unique.size === 1 && unique.has("online")) return "online";
  if (unique.has("online") && (unique.has("campus") || unique.has("hybrid"))) return "mixed";
  return "campus";
};

export const resolveTeacherProgramScope = (types: ProgramType[]): ProgramScope =>
  resolveProgramScope(types, EMPTY_TEACHER_SCOPE);

export const resolveParentProgramScope = (types: ProgramType[]): ProgramScope =>
  resolveProgramScope(types, "campus");
