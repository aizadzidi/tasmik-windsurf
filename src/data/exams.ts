import type { SupabaseClient } from '@supabase/supabase-js';
import type { GradeCode } from '@/core/grades';

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

export type GradeSummaryRow = {
  student_id: string;
  grade: GradeCode;
  cnt: number;
  absent_cnt: number;
  total_present: number;
  grade_rank: number;
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

type ClassAvgRow = {
  subject_id: string;
  class_avg: number | string | null;
  n: number | string;
};

export async function rpcGetClassSubjectAverages(
  supabase: SupabaseClient,
  examId: string,
  classId: string
): Promise<ClassAvg[]> {
  const { data, error } = await supabase.rpc('get_class_subject_averages', {
    p_exam_id: examId,
    p_class_id: classId,
  });

  if (error) throw error;

  return ((data ?? []) as ClassAvgRow[]).map((a) => ({
    subject_id: a.subject_id,
    class_avg: a.class_avg === null ? null : Number(a.class_avg),
    n: Number(a.n),
  }));
}

export async function rpcGetGradeSummaryPerClass(
  supabase: SupabaseClient,
  examId: string,
  classId: string
): Promise<GradeSummaryRow[]> {
  const { data, error } = await supabase.rpc('get_grade_summary_per_class', {
    p_exam_id: examId,
    p_class_id: classId,
  });

  if (error) throw error;
  return (data ?? []) as GradeSummaryRow[];
}

export type { GradeCode } from '@/core/grades';
