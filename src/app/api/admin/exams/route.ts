import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

// Types for exam data
interface ExamStudent {
  id: string;
  name: string;
  class: string;
  subjects: { [subject: string]: { score: number; trend: number[]; grade: string; exams?: { name: string; score: number }[] } };
  conduct: {
    discipline: number;
    effort: number;
    participation: number;
    motivationalLevel: number;
    character: number;
    leadership: number;
  };
  overall: {
    average: number;
    rank: number;
    needsAttention: boolean;
    attentionReason?: string;
  };
}

// GET - Fetch exam dashboard data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');
    const classId = searchParams.get('classId');

    // Radical fix: use admin service client and avoid fragile joins
    // so we always get students for the exam's classes even under RLS.
    let allowedClassIds: string[] | null = null;
    if (examId) {
      const examClasses = await adminOperationSimple(async (client) => {
        const { data, error } = await client
          .from('exam_classes')
          .select('class_id')
          .eq('exam_id', examId);
        if (error) throw error;
        return data as Array<{ class_id: string | null }>;
      }).catch((err) => {
        console.error('Admin fetch exam_classes failed:', err);
        return [] as Array<{ class_id: string | null }>;
      });
      allowedClassIds = (examClasses || [])
        .map((ec) => ec.class_id)
        .filter((id): id is string => typeof id === 'string');
    }

    // If a class filter is provided but it's not in this exam, return empty set
    if (examId && classId && Array.isArray(allowedClassIds) && allowedClassIds.length > 0 && !allowedClassIds.includes(classId)) {
      return NextResponse.json({ students: [], subjects: [], success: true });
    }

    // Optimized grouped queries using admin client for critical tables
    const [studentsResult, subjectsResult, examResultsResult, conductResult, classesResult, examClassesWeightsResult] = await Promise.all([
      // Students (admin client to avoid RLS issues)
      (async () => {
        const data = await adminOperationSimple(async (client) => {
          let q = client
            .from('students')
            .select('id, name, class_id');
          if (classId) {
            q = q.eq('class_id', classId);
          } else if (examId && Array.isArray(allowedClassIds)) {
            if (allowedClassIds.length > 0) {
              q = q.in('class_id', allowedClassIds);
            }
          }
          const { data, error } = await q;
          if (error) throw error;
          return { data, error: null } as const;
        }).catch((err) => {
          console.error('Admin fetch students failed:', err);
          return { data: [], error: err } as const;
        });
        return data as any;
      })(),

      // Subjects: if exam selected, fetch only that exam's subjects; else all subjects
      (async () => {
        if (examId) {
          const data = await adminOperationSimple(async (client) => {
            const { data, error } = await client
              .from('exam_subjects')
              .select('subjects(id, name)')
              .eq('exam_id', examId);
            if (error) throw error;
            // Normalize into { id, name }
            const names = (data || [])
              .map((row: any) => ({ id: row.subjects?.id, name: row.subjects?.name }))
              .filter((s) => s.name);
            return { data: names, error: null } as const;
          }).catch((err) => {
            console.error('Admin fetch exam subjects failed:', err);
            return { data: [], error: err } as const;
          });
          return data as any;
        }
        return supabase
          .from('subjects')
          .select('id, name')
          .order('name');
      })(),

      // Exam results (read via anon is fine if RLS allows; otherwise admin)
      (async () => {
        const _res = await supabase
          .from('exam_results')
          .select(`
            student_id,
            subject_id,
            mark,
            grade,
            subjects!inner(name),
            exam_id
          `)
          .maybeSingle();
        // The above maybeSingle is not appropriate for multi; fall back to admin in all cases
        const data = await adminOperationSimple(async (client) => {
          let q = client
            .from('exam_results')
            .select(`
              student_id,
              subject_id,
              mark,
              grade,
              subjects(name),
              exam_id
            `);
          if (examId) q = q.eq('exam_id', examId);
          const { data, error } = await q;
          if (error) throw error;
          // Normalize to mimic previous shape with subjects(name)
          const normalized = (data || []).map((r: any) => ({
            ...r,
            subjects: { name: r.subjects?.name }
          }));
          return { data: normalized, error: null } as const;
        }).catch((err) => {
          console.error('Admin fetch exam_results failed:', err);
          return { data: [], error: err } as const;
        });
        return data as any;
      })(),

      // Conduct entries (per teacher) aggregated later
      (async () => {
        const data = await adminOperationSimple(async (client) => {
          let q = client
            .from('conduct_entries')
            .select(`
              exam_id,
              student_id,
              teacher_id,
              discipline,
              effort,
              participation,
              motivational_level,
              character,
              leadership
            `);
          if (examId) q = q.eq('exam_id', examId);
          const { data, error } = await q;
          if (error) throw error;
          return { data, error: null } as const;
        }).catch((err) => {
          console.error('Admin fetch conduct_entries failed:', err);
          return { data: [], error: err } as const;
        });
        return data as any;
      })(),

      // Classes for mapping class_id -> name
      (async () => {
        if (examId && Array.isArray(allowedClassIds)) {
          const data = await adminOperationSimple(async (client) => {
            let q = client.from('classes').select('id, name');
            if (allowedClassIds.length > 0) q = q.in('id', allowedClassIds);
            const { data, error } = await q;
            if (error) throw error;
            return { data, error: null } as const;
          }).catch((err) => {
            console.error('Admin fetch classes failed:', err);
            return { data: [], error: err } as const;
          });
          return data as any;
        }
        return supabase.from('classes').select('id, name');
      })(),

      // Exam-class conduct weights (for weighting final marks)
      (async () => {
        if (!examId) return { data: [], error: null } as const;
        const data = await adminOperationSimple(async (client) => {
          const { data, error } = await client
            .from('exam_classes')
            .select('class_id, conduct_weightage')
            .eq('exam_id', examId);
          if (error) throw error;
          return { data, error: null } as const;
        }).catch((err) => {
          console.error('Admin fetch exam_classes weights failed:', err);
          return { data: [], error: err } as const;
        });
        return data as any;
      })(),
    ]);

    const { data: students, error: studentsError } = studentsResult;
    const { data: subjects, error: subjectsError } = subjectsResult;
    const { data: examResults, error: examResultsError } = examResultsResult;
    const { data: conductEntries, error: conductError } = conductResult;
    const { data: classesData } = classesResult || { data: [] } as any;
    const { data: examClassesWeights } = examClassesWeightsResult || { data: [] } as any;
    
    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
    }
    
    if (subjectsError) {
      console.error('Error fetching subjects:', subjectsError);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
    
    if (examResultsError) {
      console.error('Error fetching exam results:', examResultsError);
      return NextResponse.json({ error: 'Failed to fetch exam results' }, { status: 500 });
    }
    
    if (conductError) {
      console.error('Error fetching conduct entries:', conductError);
      // Don't fail the request, just continue without conduct data
    }

    // Build examId -> metadata map for labeling charts
    let examMetaById = new Map<string, { name: string; date?: string }>();
    try {
      const examIds = Array.from(new Set((examResults || []).map((r: any) => String(r.exam_id)).filter(Boolean)));
      if (examIds.length > 0) {
        const meta = await adminOperationSimple(async (client) => {
          const { data, error } = await client
            .from('exams')
            .select('id, name, exam_start_date, created_at')
            .in('id', examIds);
          if (error) throw error;
          return data as Array<any>;
        }).catch((err) => {
          console.error('Admin fetch exams meta failed:', err);
          return [] as Array<any>;
        });
        examMetaById = new Map(meta.map((e: any) => [String(e.id), { name: e.name, date: e.exam_start_date || e.created_at }]));
      }
    } catch (e) {
      // Non-fatal; continue without labels
      console.warn('Exam meta mapping failed, continuing without labels');
    }

    // Transform data into the format expected by the frontend
    // Build a mapping of class_id -> name for quick lookup
    const classNameById = new Map<string, string>();
    (classesData || []).forEach((c: any) => {
      if (c && c.id) classNameById.set(c.id, c.name);
    });

    // Build a mapping of class_id -> conduct weightage for this exam
    const conductWeightByClassId = new Map<string, number>();
    (examClassesWeights || []).forEach((row: any) => {
      if (row && row.class_id) conductWeightByClassId.set(String(row.class_id), Number(row.conduct_weightage) || 0);
    });

    const studentExamData: ExamStudent[] = (students || []).map((student: any) => {
      // Get student's exam results
      const studentResults = (examResults || []).filter((result: any) => result.student_id === student.id) || [];
      
      // Build subjects object
      const subjectsData: { [subject: string]: { score: number; trend: number[]; grade: string; exams?: { name: string; score: number }[] } } = {};
      
      (subjects || []).forEach((subject: any) => {
        const subjId = subject?.id ? String(subject.id) : null;
        const subjectResults = (studentResults || []).filter((r: any) => {
          // Prefer matching by subject_id; fallback to joined name if available
          if (subjId) return String(r.subject_id) === subjId;
          return (r as any).subjects?.name === subject.name;
        });

        // Determine the score to show for the currently selected exam (or latest)
        let currentResult: any | undefined;
        if (examId) {
          currentResult = subjectResults.find((r: any) => String(r.exam_id) === String(examId));
        }
        if (!currentResult) {
          // latest by exam date if available from metadata map
          currentResult = subjectResults
            .slice()
            .sort((a: any, b: any) => {
              const da = new Date(examMetaById.get(String(a.exam_id))?.date || 0).getTime();
              const db = new Date(examMetaById.get(String(b.exam_id))?.date || 0).getTime();
              return db - da;
            })[0];
        }

        const score = currentResult?.mark ?? 0;
        // Rely on DB-calculated grade only; no JS fallback
        const grade = currentResult?.grade ?? '';

        // Build exam-based history for charts
        const examsHistory = subjectResults
          .filter((r: any) => typeof r?.mark === 'number')
          .map((r: any) => {
            const meta = examMetaById.get(String(r.exam_id));
            return {
              name: meta?.name || 'Exam',
              score: r.mark as number,
              _date: meta?.date || null
            };
          })
          .sort((a: any, b: any) => {
            const da = new Date(a._date || 0).getTime();
            const db = new Date(b._date || 0).getTime();
            return da - db;
          })
          .map((it: any) => ({ name: it.name, score: it.score }));

        const trend = examsHistory.length > 0 ? examsHistory.map((h: any) => h.score) : generateTrend(score);

        subjectsData[subject.name] = {
          score,
          trend,
          grade,
          exams: examsHistory
        };
      });

      // Aggregate conduct from conduct_entries for this student/exam
      const entries = (conductEntries || []).filter((ce: any) =>
        ce && String(ce.student_id) === String(student.id) && (!examId || String(ce.exam_id) === String(examId))
      );

      // Average across teachers: per-teacher average of categories, then mean of those
      const perTeacherAverages = entries.map((e: any) => {
        const vals = [
          Number(e.discipline) || 0,
          Number(e.effort) || 0,
          Number(e.participation) || 0,
          Number(e.motivational_level) || 0,
          Number(e.character) || 0,
          Number(e.leadership) || 0,
        ];
        const count = vals.filter((v) => !isNaN(v)).length;
        return count > 0 ? vals.reduce((a, b) => a + b, 0) / count : 0;
      });
      const conductPercent = perTeacherAverages.length > 0
        ? perTeacherAverages.reduce((a: number, b: number) => a + b, 0) / perTeacherAverages.length
        : 0;

      // Expose per-category averaged conduct (for UI) in 0–5 scale
      const avgByCategory = (() => {
        const safeDiv = (num: number, den: number) => (den > 0 ? num / den : 0);
        const n = entries.length;
        const sum = entries.reduce((acc: any, e: any) => ({
          discipline: (acc.discipline || 0) + (Number(e.discipline) || 0),
          effort: (acc.effort || 0) + (Number(e.effort) || 0),
          participation: (acc.participation || 0) + (Number(e.participation) || 0),
          motivational_level: (acc.motivational_level || 0) + (Number(e.motivational_level) || 0),
          character: (acc.character || 0) + (Number(e.character) || 0),
          leadership: (acc.leadership || 0) + (Number(e.leadership) || 0),
        }), {} as any);
        return {
          discipline: safeDiv(sum.discipline || 0, n) / 20,
          effort: safeDiv(sum.effort || 0, n) / 20,
          participation: safeDiv(sum.participation || 0, n) / 20,
          motivationalLevel: safeDiv(sum.motivational_level || 0, n) / 20,
          character: safeDiv(sum.character || 0, n) / 20,
          leadership: safeDiv(sum.leadership || 0, n) / 20,
        };
      })();

      const conduct = avgByCategory;

      // Calculate overall average: academic average blended with conduct by weight
      const scores = Object.values(subjectsData).map((s: { score: number }) => s.score);
      const academicAvg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const cw = (examId ? (conductWeightByClassId.get(String(student.class_id)) || 0) : 0);
      const aw = Math.max(0, 100 - cw);
      const average = Math.round((academicAvg * aw + conductPercent * cw) / 100);
      
      const needsAttention = average < 60 || conduct.participation < 3;
      const attentionReason = average < 60 ? 'Academic performance below average' : 
                            conduct.participation < 3 ? 'Low participation score needs attention' : undefined;

      return {
        id: student.id,
        name: student.name,
        class: classNameById.get(student.class_id) || 'Unknown',
        subjects: subjectsData,
        conduct,
        overall: {
          average,
          rank: 0, // Will be calculated after sorting
          needsAttention,
          attentionReason
        }
      };
    });

    // Calculate ranks based on overall average
    studentExamData.sort((a, b) => b.overall.average - a.overall.average);
    studentExamData.forEach((student, index) => {
      student.overall.rank = index + 1;
    });

    return NextResponse.json({
      students: studentExamData,
      subjects: (subjects || []).map((s: any) => s.name),
      success: true
    });

  } catch (error: unknown) {
    console.error('Error in exams API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Note: grade calculation is performed by DB trigger based on the selected grading system

// Helper function to generate trend data (mock for now)
function generateTrend(currentScore: number): number[] {
  const trend = [];
  for (let i = 0; i < 6; i++) {
    const variation = (Math.random() - 0.5) * 10;
    const score = Math.max(0, Math.min(100, currentScore + variation + (i * 2)));
    trend.push(Math.round(score));
  }
  return trend;
}

// POST - Create or update exam results
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { examId, studentId, subjectId, mark, conductScores } = body;

    if (!examId || !studentId || !subjectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update or insert exam result
    const { data: examResult, error: examError } = await supabase
      .from('exam_results')
      .upsert({
        exam_id: examId,
        student_id: studentId,
        subject_id: subjectId,
        mark: mark,
        final_score: mark // Use mark as final_score for compatibility
      }, {
        onConflict: 'exam_id,student_id,subject_id'
      })
      .select();

    if (examError) {
      console.error('Error saving exam result:', examError);
      return NextResponse.json({ error: 'Failed to save exam result' }, { status: 500 });
    }

    // If conduct scores provided, save them
    const resultRecord = examResult && examResult.length > 0 ? examResult[0] : null;
    if (conductScores && resultRecord) {
      const { error: conductError } = await supabase
        .from('conduct_scores')
        .upsert({
          exam_result_id: resultRecord.id,
          discipline: conductScores.discipline * 20, // Convert from 0-5 to 0-100 scale
          effort: conductScores.effort * 20,
          participation: conductScores.participation * 20,
          motivational_level: conductScores.motivationalLevel * 20,
          character: conductScores.character * 20,
          leadership: conductScores.leadership * 20
        });

      if (conductError) {
        console.error('Error saving conduct scores:', conductError);
        return NextResponse.json({ error: 'Failed to save conduct scores' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, data: resultRecord });

  } catch (error: unknown) {
    console.error('Error in POST exams API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
