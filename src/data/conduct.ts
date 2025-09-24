import { supabase } from '@/lib/supabaseClient';

export type ConductScores = {
  discipline: number | null;
  effort: number | null;
  participation: number | null;
  motivational_level: number | null;
  character_score: number | null;
  leadership: number | null;
};

export type ConductSummary = ConductScores & {
  source: 'override' | 'average';
  subjects_count: number;
  override_id: string | null;
};

const toNum = (x: unknown) => (x == null ? null : Number(x));

export async function rpcGetConductSummary(examId: string, studentId: string): Promise<ConductSummary | null> {
  const { data, error } = await supabase.rpc('get_conduct_summary', { p_exam_id: examId, p_student_id: studentId });
  if (error) throw error;
  if (!data || !data[0]) return null;
  const row = data[0];
  return {
    source: row.source,
    subjects_count: Number(row.subjects_count ?? 0),
    override_id: row.override_id ?? null,
    discipline: toNum(row.discipline),
    effort: toNum(row.effort),
    participation: toNum(row.participation),
    motivational_level: toNum(row.motivational_level),
    character_score: toNum(row.character_score),
    leadership: toNum(row.leadership),
  };
}

export async function rpcUpsertConductOverride(
  examId: string,
  studentId: string,
  scores: Required<ConductScores>
): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_conduct_override', {
    p_exam_id: examId,
    p_student_id: studentId,
    p_discipline: scores.discipline,
    p_effort: scores.effort,
    p_participation: scores.participation,
    p_motivational_level: scores.motivational_level,
    p_character_score: scores.character_score,
    p_leadership: scores.leadership,
  });
  if (error) throw error;
  return data;
}

export async function rpcUpsertConductPerSubject(
  examId: string,
  studentId: string,
  subjectId: string,
  scores: Partial<Record<keyof ConductScores, number | null>>
): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_conduct_per_subject', {
    p_exam_id: examId,
    p_student_id: studentId,
    p_subject_id: subjectId,
    p_discipline: scores.discipline ?? null,
    p_effort: scores.effort ?? null,
    p_participation: scores.participation ?? null,
    p_motivational_level: scores.motivational_level ?? null,
    p_character_score: scores.character_score ?? null,
    p_leadership: scores.leadership ?? null,
  });
  if (error) throw error;
  return data;
}
