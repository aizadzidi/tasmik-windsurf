// src/lib/averages.ts
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export type AveragesPayload = {
  subjectAvg: Record<string, number>;   // per-subject class average (academic only)
  classAvgWeighted: number | null;      // weighted class average
  finalWeighted: number | null;         // weighted final for the current student
};

type RpcResponse<T> = { data: T | null; error: PostgrestError | null };

type SubjectAverageRow = {
  subject_id: string | null;
  avg_mark: number | string | null;
};

export function toWeightFraction(w: number | null | undefined) {
  // Accepts 0..1 or 0..100; auto-normalize to 0..1
  if (w == null) return 0;
  return w > 1 ? Math.max(0, Math.min(1, w / 100)) : Math.max(0, Math.min(1, w));
}

export async function fetchAllAverages(
  supabase: SupabaseClient,
  params: {
    examId: string;
    classId: string | null | "all";
    studentId: string;
    wConduct: number;                // already normalized 0..1
    allowedSubjectIds?: string[] | null;
  },
  options?: { includeStudentFinal?: boolean }
): Promise<AveragesPayload> {
  const { examId, classId, studentId, wConduct, allowedSubjectIds } = params;
  const { includeStudentFinal = false } = options ?? {};
  const allowed = allowedSubjectIds ?? null;
  const effectiveClassId = classId && classId !== "all" ? classId : null;

  // Helper: try primary named params; if that fails, try secondary
  async function rpcWithFallback<T>(
    fn: string,
    primaryArgs: Record<string, unknown>,
    secondaryArgs: Record<string, unknown>
  ): Promise<RpcResponse<T>> {
    const r1 = await supabase.rpc(fn, primaryArgs) as RpcResponse<T>;
    if (!r1.error) return r1;
    const r2 = await supabase.rpc(fn, secondaryArgs) as RpcResponse<T>;
    return r2;
  }

  const subjectPromise = rpcWithFallback<SubjectAverageRow[]>(
    'get_subject_class_averages',
    { exam_id: examId, class_id: effectiveClassId, allowed_subject_ids: allowed },
    { exam: examId, class: effectiveClassId, allowed_subject_ids: allowed }
  );
  const classPromise = rpcWithFallback<number>(
    'get_class_average_weighted',
    { exam_id: examId, class_id: effectiveClassId, w_conduct: wConduct, allowed_subject_ids: allowed },
    { exam: examId, class: effectiveClassId, w_conduct: wConduct, allowed_subject_ids: allowed }
  );

  let studentFinalPromise: Promise<RpcResponse<number>>;
  if (includeStudentFinal) {
    studentFinalPromise = (async () => {
      const primary = await supabase.rpc('get_student_final_weighted', { exam_id: examId, student_id: studentId, w_conduct: wConduct, allowed_subject_ids: allowed }) as RpcResponse<number>;
      if (!primary.error) return primary;
      const code = (primary.error as { code?: string })?.code;
      const msg = String((primary.error as { message?: string })?.message || '');
      if (code === 'PGRST116' || /function.*get_student_final_weighted/i.test(msg) || /does not exist/i.test(msg) || /404/.test(msg)) {
        console.warn('get_student_final_weighted RPC missing; returning null', primary.error);
        return { data: null, error: null } as RpcResponse<number>;
      }
      const fallback = await supabase.rpc('get_student_final_weighted', { exam: examId, stu: studentId, w_conduct: wConduct, allowed_subject_ids: allowed }) as RpcResponse<number>;
      if (fallback.error) {
        const fCode = (fallback.error as { code?: string })?.code;
        const fMsg = String((fallback.error as { message?: string })?.message || '');
        if (fCode === 'PGRST116' || /function.*get_student_final_weighted/i.test(fMsg) || /does not exist/i.test(fMsg) || /404/.test(fMsg)) {
          console.warn('get_student_final_weighted RPC missing (fallback); returning null', fallback.error);
          return { data: null, error: null } as RpcResponse<number>;
        }
      }
      return fallback;
    })();
  } else {
    studentFinalPromise = Promise.resolve({ data: null, error: null });
  }

  const [subjRes, classRes, stuRes] = (await Promise.all([
    subjectPromise,
    classPromise,
    studentFinalPromise,
  ])) as [RpcResponse<SubjectAverageRow[]>, RpcResponse<number>, RpcResponse<number>];

  const subjectAvg: Record<string, number> = {};
  if (!subjRes.error) {
    for (const row of subjRes.data ?? []) {
      if (row?.subject_id && row?.avg_mark != null) subjectAvg[row.subject_id] = Number(row.avg_mark);
    }
  } else {
    console.error(
      'get_subject_class_averages error',
      typeof subjRes.error === 'object' ? JSON.stringify(subjRes.error, null, 2) : subjRes.error
    );
  }

  const classAvgWeighted = !classRes.error
    ? (classRes.data == null ? null : Number(classRes.data))
    : null;

  if (classRes.error) {
    console.error(
      'get_class_average_weighted error',
      typeof classRes.error === 'object' ? JSON.stringify(classRes.error, null, 2) : classRes.error
    );
  }

  const finalWeighted = !stuRes.error
    ? (stuRes.data == null ? null : Number(stuRes.data))
    : null;

  if (stuRes.error) {
    console.warn(
      'get_student_final_weighted error (non-fatal)',
      typeof stuRes.error === 'object' ? JSON.stringify(stuRes.error, null, 2) : stuRes.error
    );
  }

  return { subjectAvg, classAvgWeighted, finalWeighted };
}
