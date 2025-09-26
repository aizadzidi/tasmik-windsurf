import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcGetConductSummary } from '@/data/conduct';

export function computeFinalMark(
  academicAvg: number | null,
  conductAvg: number | null,
  wConduct: number
): { final: number | null; academicAvg: number | null; conductAvg: number | null; wConduct: number } {
  // Normalize weight to 0..1
  const w = Math.max(0, Math.min(1, Number.isFinite(wConduct) ? wConduct : 0));
  const aWeight = 1 - w;

  // Null-safety rules (no defaulting to 100)
  if ((academicAvg == null || Number.isNaN(academicAvg)) && aWeight > 0) {
    return { final: null, academicAvg: academicAvg ?? null, conductAvg: conductAvg ?? null, wConduct: w };
  }
  if ((conductAvg == null || Number.isNaN(conductAvg)) && w > 0) {
    return { final: null, academicAvg: academicAvg ?? null, conductAvg: conductAvg ?? null, wConduct: w };
  }

  const a = typeof academicAvg === 'number' ? academicAvg : 0;
  const c = typeof conductAvg === 'number' ? conductAvg : 0;
  const raw = a * aWeight + c * w;
  const clamped = Math.max(0, Math.min(100, raw));
  return { final: clamped, academicAvg: academicAvg ?? null, conductAvg: conductAvg ?? null, wConduct: w };
}

// Helper to compute mean of finite numbers; returns null on empty
function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Attempt to derive the class weightage from admin metadata for the provided allowedSubjectIds.
// Fallback to 0 if ambiguous.
async function fetchConductWeightageFromMeta(examId: string, allowedSubjectIds: string[]): Promise<number> {
  try {
    const res = await fetch('/api/admin/exam-metadata');
    const meta = await res.json();
    const exam = (meta?.exams || []).find((e: any) => String(e?.id) === String(examId));
    if (!exam) return 0;

    const examClasses: Array<{ conduct_weightage?: number; classes?: { id: string } }> = Array.isArray(exam?.exam_classes)
      ? exam.exam_classes
      : [];

    // If only a single class has a weight, use it directly
    if (examClasses.length === 1) {
      const w = Number(examClasses[0]?.conduct_weightage ?? 0);
      return Number.isFinite(w) ? w : 0;
    }

    // Try to infer class from exam_class_subjects mapping
    const pairs: Array<{ classes?: { id: string }, subjects?: { id: string } }> = Array.isArray(exam?.exam_class_subjects)
      ? exam.exam_class_subjects
      : [];

    if (pairs.length > 0 && Array.isArray(allowedSubjectIds) && allowedSubjectIds.length > 0) {
      // Build class -> set(subjectIds)
      const byClass = new Map<string, Set<string>>();
      for (const row of pairs) {
        const cid = row?.classes?.id ? String(row.classes.id) : null;
        const sid = row?.subjects?.id ? String(row.subjects.id) : null;
        if (!cid || !sid) continue;
        if (!byClass.has(cid)) byClass.set(cid, new Set());
        byClass.get(cid)!.add(sid);
      }

      // Find classes that contain all allowedSubjectIds
      const matches: string[] = [];
      for (const [cid, set] of byClass.entries()) {
        const allContained = allowedSubjectIds.every((sid) => set.has(String(sid)));
        if (allContained) matches.push(cid);
      }

      // If exactly one class matches, use its weight
      if (matches.length === 1) {
        const found = examClasses.find((ec: any) => String(ec?.classes?.id) === String(matches[0]));
        if (found) {
          const w = Number(found?.conduct_weightage ?? 0);
          return Number.isFinite(w) ? w : 0;
        }
      }
    }

    // Fallback: use 0 if we cannot uniquely determine
    return 0;
  } catch (e) {
    console.warn('Failed to fetch conduct weightage from metadata', e);
    return 0;
  }
}

export async function fetchSummaryForFinal({
  supabase,
  examId,
  studentId,
  allowedSubjectIds,
}: {
  supabase: SupabaseClient;
  examId: string;
  studentId: string;
  allowedSubjectIds: string[];
}): Promise<{ academicAvg: number | null; conductAvg: number | null; wConduct: number }> {
  // 1) Academic average via RPCs used elsewhere; fallback to per-subject averaging consistent with Admin
  let academicAvg: number | null = null;
  try {
    // Try RPC that may expose an academic average (if available in your schema)
    // Note: Parameters can vary; we intentionally keep a conservative call.
    const r = await supabase.rpc('get_grade_summary', { p_exam_id: examId, p_student_id: studentId });
    if (!r.error && Array.isArray(r.data) && r.data.length > 0) {
      // Look for a numeric average field if present
      const row0 = r.data[0] as any;
      const fromKnownFields = [row0.average, row0.academic_avg, row0.avg_mark, row0.avg]
        .map((x: unknown) => (typeof x === 'number' ? x : Number(x)))
        .find((x: number) => Number.isFinite(x));
      if (Number.isFinite(fromKnownFields)) {
        academicAvg = Number(fromKnownFields);
      }
    }
  } catch (e) {
    // Non-fatal; fallback below
  }

  if (academicAvg == null) {
    // Fallback: derive from exam_results filtered to allowedSubjectIds, excluding TH
    try {
      const { data, error } = await supabase
        .from('exam_results')
        .select('subject_id, mark, final_score, grade')
        .eq('exam_id', examId)
        .eq('student_id', studentId);
      if (!error && Array.isArray(data)) {
        const allowed = new Set((allowedSubjectIds || []).map(String));
        const nums: number[] = [];
        for (const r of data) {
          const sid = r?.subject_id ? String(r.subject_id) : null;
          if (!sid || (allowed.size > 0 && !allowed.has(sid))) continue;
          const grade = String(r?.grade || '').toUpperCase();
          if (grade === 'TH') continue; // Absent
          const candidate = typeof r?.final_score === 'number' ? r.final_score : (typeof r?.mark === 'number' ? r.mark : Number(r?.final_score ?? r?.mark));
          if (Number.isFinite(candidate)) nums.push(Number(candidate));
        }
        academicAvg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      }
    } catch (e) {
      // leave as null
    }
  }

  // 2) Conduct average via get_conduct_summary (respect override vs average)
  let conductAvg: number | null = null;
  try {
    const summary = await rpcGetConductSummary(examId, studentId);
    if (summary) {
      // Average across available categories (0..100 scale)
      conductAvg = mean([
        summary.discipline,
        summary.effort,
        summary.participation,
        summary.motivational_level,
        summary.character_score,
        summary.leadership,
      ]);
    }
  } catch (e) {
    // leave as null
  }

  // 3) Weightage (conduct weight) from exam metadata or configuration (normalize to 0..1)
  const wPct = await fetchConductWeightageFromMeta(examId, allowedSubjectIds);
  const wConduct = Math.max(0, Math.min(1, (Number.isFinite(wPct) ? Number(wPct) : 0) / 100));

  return { academicAvg, conductAvg, wConduct };
}