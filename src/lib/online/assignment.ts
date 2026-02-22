import type { TeacherLoadCandidate } from "@/types/online";

const toEpoch = (value: string | null) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
};

export const compareTeacherCandidates = (
  left: TeacherLoadCandidate,
  right: TeacherLoadCandidate
) => {
  if (left.activeLoad !== right.activeLoad) {
    return left.activeLoad - right.activeLoad;
  }

  const leftAssigned = toEpoch(left.lastAssignedAt);
  const rightAssigned = toEpoch(right.lastAssignedAt);
  if (leftAssigned !== rightAssigned) {
    return leftAssigned - rightAssigned;
  }

  return left.teacherId.localeCompare(right.teacherId);
};

export const pickTeacherByLeastLoadRoundRobin = (
  candidates: TeacherLoadCandidate[]
) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const sorted = [...candidates].sort(compareTeacherCandidates);
  return sorted[0] ?? null;
};
