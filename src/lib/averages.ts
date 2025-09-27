// src/lib/averages.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type AveragesPayload = {
  subjectAvg: Record<string, number>;   // per-subject class average (academic only)
  classAvgWeighted: number | null;      // weighted class average
  finalWeighted: number | null;         // weighted final for the current student
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
    classId: string;
    studentId: string;
    wConduct: number;                // already normalized 0..1
    allowedSubjectIds?: string[] | null;
  }
): Promise<AveragesPayload> {
  const { examId, classId, studentId, wConduct, allowedSubjectIds } = params;
  const allowed = allowedSubjectIds ?? null;

  // Helper: try primary named params; if that fails, try secondary
  async function rpcWithFallback<T>(
    fn: string,
    primaryArgs: Record<string, any>,
    secondaryArgs: Record<string, any>
  ): Promise<{ data: T | null; error: any | null }> {
    const r1 = await supabase.rpc<T>(fn as any, primaryArgs as any);
    if (!r1.error) return r1 as any;
    const r2 = await supabase.rpc<T>(fn as any, secondaryArgs as any);
    return r2 as any;
  }

  const [subjRes, classRes, stuRes] = await Promise.all([
    rpcWithFallback<any[]>(
      'get_subject_class_averages',
      { exam_id: examId, class_id: classId, allowed_subject_ids: allowed },
      { exam: examId, class: classId, allowed_subject_ids: allowed }
    ),
    rpcWithFallback<number>(
      'get_class_average_weighted',
      { exam_id: examId, class_id: classId, w_conduct: wConduct, allowed_subject_ids: allowed },
      { exam: examId, class: classId, w_conduct: wConduct, allowed_subject_ids: allowed }
    ),
    rpcWithFallback<number>(
      'get_student_final_weighted',
      { exam_id: examId, student_id: studentId, w_conduct: wConduct, allowed_subject_ids: allowed },
      { exam: examId, stu: studentId, w_conduct: wConduct, allowed_subject_ids: allowed }
    ),
  ]);

  const subjectAvg: Record<string, number> = {};
  if (!subjRes.error) {
    for (const row of (subjRes.data as any[]) ?? []) {
      if (row?.subject_id && row?.avg_mark != null) subjectAvg[row.subject_id] = Number(row.avg_mark);
    }
  } else {
    console.error(
      'get_subject_class_averages error',
      typeof subjRes.error === 'object' ? JSON.stringify(subjRes.error, null, 2) : subjRes.error
    );
  }

  const classAvgWeighted = !classRes.error
    ? (classRes.data == null ? null : Number(classRes.data as any))
    : null;

  if (classRes.error) {
    console.error(
      'get_class_average_weighted error',
      typeof classRes.error === 'object' ? JSON.stringify(classRes.error, null, 2) : classRes.error
    );
  }

  const finalWeighted = !stuRes.error
    ? (stuRes.data == null ? null : Number(stuRes.data as any))
    : null;

  if (stuRes.error) {
    console.error(
      'get_student_final_weighted error',
      typeof stuRes.error === 'object' ? JSON.stringify(stuRes.error, null, 2) : stuRes.error
    );
  }

  return { subjectAvg, classAvgWeighted, finalWeighted };
}
