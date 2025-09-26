import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

// Types for exam data
interface ExamStudent {
  id: string;
  name: string;
  class: string;
  classId: string;
  subjects: {
    [subject: string]: {
      score: number;
      trend: number[];
      grade: string;
      exams?: { name: string; score: number }[];
      optedOut?: boolean;
    };
  };
  conduct: {
    discipline: number;
    effort: number;
    participation: number;
    motivationalLevel: number;
    character: number;
    leadership: number;
  };
  conductPercentages?: {
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
    // Fetch excluded student IDs (for this exam/class) upfront to filter rosters later
    const excludedIds: string[] = await (async () => {
      if (!examId) return [];
      try {
        const data = await adminOperationSimple(async (client) => {
          let q = client
            .from('exam_excluded_students')
            .select('student_id')
            .eq('exam_id', examId);
          if (classId) q = q.eq('class_id', classId);
          const { data, error } = await q;
          if (error) throw error;
          return (data || []).map((r: any) => String(r.student_id));
        });
        return data;
      } catch (e) {
        console.error('Admin fetch exam_excluded_students failed:', e);
        return [];
      }
    })();

    const [studentsResult, subjectsResult, examResultsResult, conductResult, classesResult, examClassesWeightsResult, subjectOptOutsResult] = await Promise.all([
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
          // Filter out excluded students if any
          const excludedSet = new Set(excludedIds);
          const filtered = (data || []).filter((s: any) => !excludedSet.has(String(s.id)));
          return { data: filtered, error: null } as const;
        }).catch((err) => {
          console.error('Admin fetch students failed:', err);
          return { data: [], error: err } as const;
        });
        return data as any;
      })(),

      // Subjects: if exam selected, fetch subjects. If class filter provided and per-class mapping exists, honor it.
      (async () => {
        if (examId) {
          // Try per-class mapping first when class filter is present
          if (classId) {
            const ecs = await adminOperationSimple(async (client) => {
              const { data, error } = await client
                .from('exam_class_subjects')
                .select('subjects(id, name)')
                .eq('exam_id', examId)
                .eq('class_id', classId);
              if (error) throw error;
              const names = (data || [])
                .map((row: any) => ({ id: row.subjects?.id, name: row.subjects?.name }))
                .filter((s) => s.name);
              return { data: names, error: null } as const;
            }).catch((err) => {
              // Fallback silently to exam_subjects
              return { data: null, error: err } as const;
            });
            if (ecs.data && (ecs.data as any[]).length > 0) return ecs as any;
          }
          const data = await adminOperationSimple(async (client) => {
            const { data, error } = await client
              .from('exam_subjects')
              .select('subjects(id, name)')
              .eq('exam_id', examId);
            if (error) throw error;
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
            final_score,
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
              final_score,
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

      (async () => {
        const data = await adminOperationSimple(async (client) => {
          let q = client
            .from('subject_opt_outs')
            .select('exam_id, subject_id, student_id');
          if (examId) q = q.eq('exam_id', examId);
          const { data, error } = await q;
          if (error) throw error;
          return { data, error: null } as const;
        }).catch((err) => {
          const message = String(err?.message || '');
          if (message.includes('subject_opt_outs')) {
            console.warn('subject_opt_outs table not found; treating as empty');
            return { data: [], error: null } as const;
          }
          console.error('Admin fetch subject_opt_outs failed:', err);
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
    const { data: subjectOptOuts } = subjectOptOutsResult || { data: [] } as any;
    
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

    const optOutMap = new Map<string, Set<string>>();
    (subjectOptOuts || []).forEach((row: any) => {
      const sid = row?.student_id ? String(row.student_id) : null;
      const subjId = row?.subject_id ? String(row.subject_id) : null;
      if (!sid || !subjId) return;
      if (!optOutMap.has(sid)) optOutMap.set(sid, new Set());
      optOutMap.get(sid)!.add(subjId);
    });
    const subjectsSeen = new Set<string>();

    const subjectMetaById = new Map<string, string>();
    (subjects || []).forEach((subject: any) => {
      const subjId = subject?.id ? String(subject.id) : null;
      const subjectName = subject?.name ? String(subject.name) : null;
      if (!subjId) return;
      if (subjectName) {
        subjectMetaById.set(subjId, subjectName);
      }
    });

    const resultSubjectIds = new Set<string>();
    (examResults || []).forEach((row: any) => {
      const subjId = row?.subject_id ? String(row.subject_id) : null;
      if (subjId) resultSubjectIds.add(subjId);
    });
    const missingSubjectIds = Array.from(resultSubjectIds).filter((id) => !subjectMetaById.has(id));
    if (missingSubjectIds.length > 0) {
      try {
        const extraSubjects = await adminOperationSimple(async (client) => {
          const { data, error } = await client
            .from('subjects')
            .select('id, name')
            .in('id', missingSubjectIds);
          if (error) throw error;
          return data as Array<{ id: string; name: string | null }>;
        }).catch((err) => {
          console.error('Admin fetch extra subjects failed:', err);
          return [] as Array<{ id: string; name: string | null }>;
        });
        extraSubjects.forEach((subject) => {
          const subjId = subject?.id ? String(subject.id) : null;
          if (!subjId) return;
          const subjectName = subject?.name ? String(subject.name) : `Subject ${subjId}`;
          subjectMetaById.set(subjId, subjectName);
        });
      } catch (err) {
        console.error('Failed to backfill subject names for results', err);
      }
    }

    // Preload conduct summaries per student (override/averaged per-subject) to use when there are no conduct_entries
    const conductSummaryByStudent = new Map<string, any>();
    try {
      if (examId && Array.isArray(students) && students.length > 0) {
        const summaries = await Promise.all(
          (students as any[]).map(async (s: any) => {
            try {
              const rpcData = await adminOperationSimple(async (client) => {
                const { data, error } = await client.rpc('get_conduct_summary', { p_exam_id: examId, p_student_id: s.id });
                if (error) throw error;
                return data as any[];
              });
              const row = Array.isArray(rpcData) ? rpcData[0] : null;
              return [String(s.id), row] as const;
            } catch {
              return [String(s.id), null] as const;
            }
          })
        );
        summaries.forEach(([sid, row]) => conductSummaryByStudent.set(sid, row));
      }
    } catch (e) {
      console.warn('Failed to preload conduct summaries; will rely on conduct_entries only');
    }

    const studentExamData: ExamStudent[] = await Promise.all((students || []).map(async (student: any) => {
      // Get student's exam results
      const studentResults = (examResults || []).filter((result: any) => result.student_id === student.id) || [];
      
      // Build subjects object
      const subjectsData: {
        [subject: string]: {
          score: number;
          trend: number[];
          grade: string;
          exams?: { name: string; score: number }[];
          optedOut?: boolean;
        };
      } = {};
      
      const subjectCandidates = new Map<string, { id: string; name: string }>();
      (subjects || []).forEach((subject: any) => {
        const subjId = subject?.id ? String(subject.id) : null;
        const subjectName = subject?.name ? String(subject.name) : null;
        if (!subjId || !subjectName) return;
        subjectCandidates.set(subjId, { id: subjId, name: subjectName });
      });
      (studentResults || []).forEach((result: any) => {
        const subjId = result?.subject_id ? String(result.subject_id) : null;
        if (!subjId) return;
        const subjectNameRaw = result?.subjects?.name ?? subjectMetaById.get(subjId);
        const subjectName = subjectNameRaw ? String(subjectNameRaw) : `Subject ${subjId}`;
        subjectCandidates.set(subjId, { id: subjId, name: subjectName });
      });

      subjectCandidates.forEach(({ id: subjId, name: subjectName }) => {
        const subjectResults = (studentResults || []).filter((r: any) => String(r.subject_id) === subjId);
        if (subjectResults.length === 0) return;

        const studentOptOuts = optOutMap.get(String(student.id));
        const isOptedOut = studentOptOuts?.has(subjId) ?? false;

        let currentResult: any | undefined;
        if (examId) {
          currentResult = subjectResults.find((r: any) => String(r.exam_id) === String(examId));
        }
        if (!currentResult) {
          currentResult = subjectResults
            .slice()
            .sort((a: any, b: any) => {
              const da = new Date(examMetaById.get(String(a.exam_id))?.date || 0).getTime();
              const db = new Date(examMetaById.get(String(b.exam_id))?.date || 0).getTime();
              return da - db;
            })[0];
        }
        if (!currentResult) return;

        const gradeRaw = currentResult?.grade ?? '';
        const grade = typeof gradeRaw === 'string' ? gradeRaw : '';
        const isTH = grade.toUpperCase() === 'TH';

        const markCandidate = currentResult?.final_score ?? currentResult?.mark;
        const numericMark = typeof markCandidate === 'number' ? markCandidate : Number(markCandidate);
        const hasNumericMark = Number.isFinite(numericMark);
        const hasGrade = grade !== '';

        if (!hasNumericMark && !isTH && !hasGrade) {
          return;
        }

        const score = hasNumericMark ? Number(numericMark) : 0;

        const examsHistory = (subjectResults || [])
          .map((r: any) => {
            const markValue = r?.final_score ?? r?.mark;
            const numeric = typeof markValue === 'number' ? markValue : Number(markValue);
            if (!Number.isFinite(numeric)) return null;
            const meta = examMetaById.get(String(r.exam_id));
            return {
              name: meta?.name || 'Exam',
              score: Number(numeric),
              _date: meta?.date || null
            };
          })
          .filter((entry: any) => entry !== null)
          .sort((a: any, b: any) => {
            const da = new Date(a._date || 0).getTime();
            const db = new Date(b._date || 0).getTime();
            return da - db;
          })
          .map((it: any) => ({ name: it.name, score: it.score }));

        const trend = examsHistory.length > 0 ? examsHistory.map((h: any) => h.score) : generateTrend(score);

        subjectsData[subjectName] = {
          score,
          trend,
          grade,
          exams: examsHistory,
          optedOut: isOptedOut || undefined
        };
        subjectsSeen.add(subjectName);
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
      let conductPercent = perTeacherAverages.length > 0
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
        const percent = {
          discipline: safeDiv(sum.discipline || 0, n),
          effort: safeDiv(sum.effort || 0, n),
          participation: safeDiv(sum.participation || 0, n),
          motivationalLevel: safeDiv(sum.motivational_level || 0, n),
          character: safeDiv(sum.character || 0, n),
          leadership: safeDiv(sum.leadership || 0, n),
        };
        const normalized = {
          discipline: percent.discipline / 20,
          effort: percent.effort / 20,
          participation: percent.participation / 20,
          motivationalLevel: percent.motivationalLevel / 20,
          character: percent.character / 20,
          leadership: percent.leadership / 20,
        };
        return { percent, normalized };
      })();

      let conductPercentages = avgByCategory.percent;
      let conduct = avgByCategory.normalized;

      // If no conduct_entries data, fall back to conduct summary (override/average) via RPC
      if (entries.length === 0) {
        const row = conductSummaryByStudent.get(String(student.id));
        if (row) {
          const values = [row.discipline, row.effort, row.participation, row.motivational_level, row.character_score, row.leadership]
            .map((v: any) => (v == null ? null : Number(v)))
            .filter((n: any): n is number => Number.isFinite(n));
          if (values.length > 0) {
            const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
            conductPercent = avg;
            conductPercentages = {
              discipline: Number(row.discipline) || 0,
              effort: Number(row.effort) || 0,
              participation: Number(row.participation) || 0,
              motivationalLevel: Number(row.motivational_level) || 0,
              character: Number(row.character_score) || 0,
              leadership: Number(row.leadership) || 0,
            } as any;
            conduct = {
              discipline: (Number(row.discipline) || 0) / 20,
              effort: (Number(row.effort) || 0) / 20,
              participation: (Number(row.participation) || 0) / 20,
              motivationalLevel: (Number(row.motivational_level) || 0) / 20,
              character: (Number(row.character_score) || 0) / 20,
              leadership: (Number(row.leadership) || 0) / 20,
            } as any;
          }
        }
      }

      // Calculate overall average: academic average blended with conduct by weight
      // Only include subjects with numeric scores in the average calculation
      const scoredSubjects = Object.values(subjectsData).filter((s: any) => {
        // Include in average if it has a numeric score or isn't marked as TH
        return s.score > 0 || (s.grade && s.grade.toUpperCase() !== 'TH');
      });
      const scores = scoredSubjects.map((s: { score: number; grade?: string }) => {
        // For grade-only entries, estimate a score based on grade
        if (s.score === 0 && s.grade) {
          const gradeEstimates: { [key: string]: number } = {
            'A+': 95, 'A': 85, 'A-': 75,
            'B+': 67, 'B': 62, 'B-': 57,
            'C+': 52, 'C': 47, 'C-': 42,
            'D': 37, 'E': 32, 'F': 25, 'G': 20
          };
          return gradeEstimates[s.grade.toUpperCase()] || s.score;
        }
        return s.score;
      });
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
        classId: String(student.class_id || ''),
        subjects: subjectsData,
        conduct,
        conductPercentages,
        overall: {
          average,
          rank: 0, // Will be calculated after sorting
          needsAttention,
          attentionReason
        }
      };
    }));

    // Calculate ranks based on overall average
    studentExamData.sort((a, b) => b.overall.average - a.overall.average);
    studentExamData.forEach((student, index) => {
      student.overall.rank = index + 1;
    });

    return NextResponse.json({
      students: studentExamData,
      subjects: Array.from(subjectsSeen),
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
