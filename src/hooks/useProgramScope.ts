"use client";

import { useEffect, useMemo, useState } from "react";
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

const DEFAULT_SCOPE: ProgramScope = "campus";

const resolveScope = (types: ProgramType[]): ProgramScope => {
  const unique = new Set(types);
  if (unique.size === 0) return DEFAULT_SCOPE;
  if (unique.size === 1 && unique.has("online")) return "online";
  if (unique.has("online") && (unique.has("campus") || unique.has("hybrid"))) return "mixed";
  return DEFAULT_SCOPE;
};

const extractProgramTypes = (rows: Array<{ programs?: { type?: ProgramType | null } | null }>) =>
  rows
    .map((row) => row.programs?.type)
    .filter((value): value is ProgramType => Boolean(value));

const isMissingTableError = (error: { message?: string } | null | undefined, table: string) =>
  Boolean(error?.message?.includes(`relation \"public.${table}\" does not exist`));

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

const fetchProgramTypesForTeacher = async (teacherId: string) => {
  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("programs(type)")
    .eq("teacher_id", teacherId);

  if (isMissingTableError(error, "teacher_assignments") || isMissingTableError(error, "programs")) {
    return [] as ProgramType[];
  }
  if (error || !data) return [] as ProgramType[];
  return extractProgramTypes(data as Array<{ programs?: { type?: ProgramType | null } | null }>);
};

const fetchProgramTypesForStudents = async (studentIds: string[]) => {
  if (studentIds.length === 0) return [] as ProgramType[];
  const { data, error } = await supabase
    .from("enrollments")
    .select("programs(type)")
    .in("student_id", studentIds);

  if (isMissingTableError(error, "enrollments") || isMissingTableError(error, "programs")) {
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
      if (role === "teacher") {
        programTypes = await fetchProgramTypesForTeacher(id);
      } else {
        const studentIds = await fetchStudentIds(role, id);
        programTypes = await fetchProgramTypesForStudents(studentIds);
      }
      const scope = resolveScope(programTypes);
      if (isMounted) {
        setProgramScope(scope);
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
          setProgramScope(DEFAULT_SCOPE);
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
