import { supabase } from '@/lib/supabaseClient';

export type GradeSummaryRow = { grade: string; cnt: number };

// Fetch grade summary filtered to class-allowed subjects via RPC.
// Returns the raw grade/count rows from the RPC (no client-side defaults).
export async function fetchGradeSummary(
  examId: string,
  classId: string | null,
  studentId: string,
): Promise<GradeSummaryRow[]> {
  const params = {
    exam_id: examId,
    student_id: studentId,
  } as { exam_id: string; student_id: string; class_id?: string | null };

  if (classId && classId !== 'all') {
    params.class_id = classId;
  } else if (classId === 'all') {
    params.class_id = null;
  }

  const { data, error } = await supabase.rpc('get_grade_summary', params);
  if (error) {
    const code = (error as { code?: string }).code;
    const msg = String((error as { message?: string }).message || '');
    if (code === 'PGRST116' || /function.*get_grade_summary/i.test(msg)) {
      console.warn('get_grade_summary RPC missing; trying legacy parameters', error);
      const legacyParams = {
        p_exam_id: examId,
        p_student_id: studentId,
      } as { p_exam_id: string; p_student_id: string; p_class_id?: string | null };
      if (classId && classId !== 'all') {
        legacyParams.p_class_id = classId;
      } else if (classId === 'all') {
        legacyParams.p_class_id = null;
      }
      const { data: legacyData, error: legacyError } = await supabase.rpc('get_grade_summary', legacyParams);
      if (legacyError) {
        console.warn('Legacy get_grade_summary RPC call also failed; returning empty summary', legacyError);
        return [];
      }
      return (legacyData ?? []) as GradeSummaryRow[];
    }
    throw error;
  }
  return (data ?? []) as GradeSummaryRow[];
}
