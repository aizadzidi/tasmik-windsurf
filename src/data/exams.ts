import type { SupabaseClient } from '@supabase/supabase-js';

export type StudentSubjectRow = {
  subject_id: string;
  subject_name: string;
  result_id: string | null;
  mark: number | null;
  grade: string | null;
  final_score: number | null;
  updated_at: string | null;
};

export type ClassAvg = {
  subject_id: string;
  class_avg: number | null;
  n: number;
};

export async function rpcGetStudentSubjects(
  supabase: SupabaseClient,
  examId: string,
  classId: string,
  studentId: string
): Promise<StudentSubjectRow[]> {
  const { data, error } = await supabase.rpc('get_exam_student_subjects', {
    p_exam_id: examId,
    p_class_id: classId,
    p_student_id: studentId,
  });

  if (error) throw error;
  return (data ?? []) as StudentSubjectRow[];
}

export async function rpcGetClassSubjectAverages(
  supabase: any,
  examId: string,
  classId: string
): Promise<ClassAvg[]> {
  const { data, error } = await supabase.rpc('get_class_subject_averages', {
    p_exam_id: examId,
    p_class_id: classId,
  });

  if (error) throw error;

  return (data ?? []).map((a: any) => ({
    subject_id: a.subject_id as string,
    class_avg: a.class_avg === null ? null : Number(a.class_avg),
    n: Number(a.n),
  }));
}
