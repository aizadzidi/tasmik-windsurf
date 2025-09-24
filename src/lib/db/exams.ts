import { supabase } from '@/lib/supabaseClient';

export type GradeSummaryRow = { grade: string; cnt: number };

// Fetch grade summary filtered to class-allowed subjects via RPC.
// Returns the raw grade/count rows from the RPC (no client-side defaults).
export async function fetchGradeSummary(examId: string, classId: string, studentId: string): Promise<GradeSummaryRow[]> {
  const { data, error } = await supabase.rpc('get_grade_summary', {
    p_exam_id: examId,
    p_class_id: classId,
    p_student_id: studentId,
  });
  if (error) throw error;
  return (data ?? []) as GradeSummaryRow[];
}
