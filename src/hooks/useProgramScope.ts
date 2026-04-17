"use client";

import { useEffect, useMemo, useState } from "react";
import { isMissingRelationError } from "@/lib/online/db";
import {
  LEGACY_TEACHER_SCOPE_FALLBACK,
  resolveParentProgramScope,
  resolveTeacherProgramScope,
} from "@/lib/programScope";
import { supabase } from "@/lib/supabaseClient";
import type { ProgramScope, ProgramType } from "@/types/programs";

type ProgramScopeParams = {
  role: "parent" | "teacher";
  userId?: string | null;
};

type ProgramScopeState = {
  programScope: ProgramScope;
  loading: boolean;
};

const DEFAULT_SCOPE_BY_ROLE: Record<ProgramScopeParams["role"], ProgramScope> = {
  parent: "campus",
  teacher: "unknown",
};

const extractProgramTypes = (rows: Array<{ programs?: { type?: ProgramType | null } | null }>) =>
  rows
    .map((row) => row.programs?.type)
    .filter((value): value is ProgramType => Boolean(value));

const isMissingScopeSchemaError = (error: { message?: string; details?: string } | null | undefined) =>
  Boolean(
    isMissingRelationError(error, "teacher_assignments") ||
      isMissingRelationError(error, "programs")
  );

const fetchStudentIds = async (role: "parent" | "teacher", userId: string) => {
  const query = supabase
    .from("students")
    .select("id")
    .neq("record_type", "prospect");

  if (role === "parent") {
    query.eq("parent_id", userId);
  } else {
    query.eq("assigned_teacher_id", userId);
  }

  const { data, error } = await query;
  if (error || !data) return [] as string[];
  return data.map((row) => row.id).filter((id): id is string => Boolean(id));
};

const fetchProgramTypesForTeacher = async (
  teacherId: string
): Promise<{ types: ProgramType[]; schemaMissing: boolean }> => {
  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("programs(type)")
    .eq("teacher_id", teacherId);

  if (isMissingScopeSchemaError(error)) {
    return { types: [], schemaMissing: true };
  }
  if (error || !data) return { types: [], schemaMissing: false };
  return {
    types: extractProgramTypes(data as Array<{ programs?: { type?: ProgramType | null } | null }>),
    schemaMissing: false,
  };
};

const fetchProgramTypesForStudents = async (studentIds: string[]) => {
  if (studentIds.length === 0) return [] as ProgramType[];
  const { data, error } = await supabase
    .from("enrollments")
    .select("programs(type)")
    .in("status", ["active", "paused", "pending_payment"])
    .in("student_id", studentIds);

  if (isMissingRelationError(error, "enrollments") || isMissingRelationError(error, "programs")) {
    return [] as ProgramType[];
  }
  if (error || !data) return [] as ProgramType[];
  return extractProgramTypes(data as Array<{ programs?: { type?: ProgramType | null } | null }>);
};

export const useProgramScope = ({ role, userId }: ProgramScopeParams): ProgramScopeState => {
  const [programScope, setProgramScope] = useState<ProgramScope>("unknown");
  const [loading, setLoading] = useState(true);

  const resolvedUserId = useMemo(() => userId ?? null, [userId]);

  useEffect(() => {
    let isMounted = true;

    const resolveScopeForUser = async (id: string) => {
      setLoading(true);
      let programTypes: ProgramType[] = [];
      let programScopeForUser: ProgramScope;
      if (role === "teacher") {
        const teacherScopeResult = await fetchProgramTypesForTeacher(id);
        if (teacherScopeResult.schemaMissing) {
          programScopeForUser = LEGACY_TEACHER_SCOPE_FALLBACK;
        } else {
          programTypes = teacherScopeResult.types;
          programScopeForUser = resolveTeacherProgramScope(programTypes);
        }
      } else {
        const studentIds = await fetchStudentIds(role, id);
        programTypes = await fetchProgramTypesForStudents(studentIds);
        programScopeForUser = resolveParentProgramScope(programTypes);
      }
      if (isMounted) {
        setProgramScope(programScopeForUser);
        setLoading(false);
      }
    };

    const load = async () => {
      if (resolvedUserId) {
        await resolveScopeForUser(resolvedUserId);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        if (isMounted) {
          setProgramScope(DEFAULT_SCOPE_BY_ROLE[role]);
          setLoading(false);
        }
        return;
      }

      await resolveScopeForUser(data.user.id);
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [role, resolvedUserId]);

  return { programScope, loading };
};
