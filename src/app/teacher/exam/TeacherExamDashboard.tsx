"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronDown, ChevronUp, Info, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import Navbar from "@/components/Navbar";
import { getGradingScale, computeGrade, type GradingScale } from "@/lib/gradingUtils";
import ConductEditor from "@/components/teacher/ConductEditor";
import type { ConductSummary } from "@/data/conduct";
import { fetchGradeSummary } from "@/lib/db/exams";
import type { GradeSummaryRow } from "@/lib/db/exams";
import StudentDetailsPanelTeacher from "@/components/teacher/StudentDetailsPanelTeacher";
import type { StudentData } from "@/components/admin/exam/StudentTable";
import { useProgramScope } from "@/hooks/useProgramScope";
import { useRouter } from "next/navigation";
import type { ProgramScope } from "@/types/programs";
import Portal from "@/components/Portal";

// Dynamic conduct criteria from database
interface ConductCriteria {
  id: string;
  name: string;
  description?: string;
  max_score: number;
}

const FIELD_KEYS = ['discipline','effort','participation','motivational_level','character_score','leadership'] as const;
type ConductKey = typeof FIELD_KEYS[number];

const CRITERIA_KEY_BY_NAME: Record<string, ConductKey> = {
  discipline: 'discipline',
  effort: 'effort',
  participation: 'participation',
  'motivational level': 'motivational_level',
  motivational: 'motivational_level',
  motivation: 'motivational_level',
  character: 'character_score',
  'character score': 'character_score',
  leadership: 'leadership',
};

// Default conduct categories (fallback)
const defaultConductCategories: { key: ConductKey; label: string; maxScore: number }[] = [
  { key: 'discipline', label: 'Discipline', maxScore: 100 },
  { key: 'effort', label: 'Effort', maxScore: 100 },
  { key: 'participation', label: 'Participation', maxScore: 100 },
  { key: 'motivational_level', label: 'Motivational Level', maxScore: 100 },
  { key: 'character_score', label: 'Character', maxScore: 100 },
  { key: 'leadership', label: 'Leadership', maxScore: 100 },
];

// Note: grade is computed by the DB trigger using the selected grading system

interface ClassItem { id: string; name: string }
interface SubjectItem { id: string; name: string }
type ExamClassSubject = {
  classes?: { id: string; name?: string };
  subjects?: { id: string; name?: string };
};

interface ExamItem {
  id: string;
  name: string;
  type: string;
  exam_classes?: { conduct_weightage: number; classes: { id: string; name: string } }[];
  exam_subjects?: { subjects: { id: string; name: string } }[];
  exam_class_subjects?: ExamClassSubject[];
}

type StudentRow = {
  id: string;
  name: string;
  mark: string;
  grade: string;
  classId?: string | null;
  conduct: Record<ConductKey, string>;
  isAbsent?: boolean;
  optedOut?: boolean;
};

type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'error';

function TeacherExamDashboardContent({ programScope }: { programScope: ProgramScope }) {
  const [userId, setUserId] = React.useState<string>("");
  const [classes, setClasses] = React.useState<ClassItem[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectItem[]>([]);
  const [exams, setExams] = React.useState<ExamItem[]>([]);
  const [classRosterMap, setClassRosterMap] = React.useState<Map<string, Array<{ id: string; name: string }>>>(new Map());
  const [conductCriterias, setConductCriterias] = React.useState<ConductCriteria[]>([]);
  const [gradingScale, setGradingScale] = React.useState<GradingScale | null>(null);

  const [selectedClassId, setSelectedClassId] = React.useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>("");
  const [assessmentType, setAssessmentType] = React.useState<"Exam" | "Quiz">("Exam");
  const [selectedExamId, setSelectedExamId] = React.useState<string>("");

  const [studentRows, setStudentRows] = React.useState<StudentRow[]>([]);
  const [expandedRows, setExpandedRows] = React.useState<number[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveIndicator, setSaveIndicator] = React.useState<SaveIndicatorState>('idle');
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [rosterSource, setRosterSource] = React.useState<'snapshot' | 'current'>('current');
  // RPC-backed grade summary per student (filtered to allowed subjects)
  const [gradeSummaryMap, setGradeSummaryMap] = React.useState<Map<string, GradeSummaryRow[]>>(new Map());
  const [gradeSubjectsMap, setGradeSubjectsMap] = React.useState<Map<string, Record<string, string[]>>>(new Map());
  const [, setLoadingGradeSummary] = React.useState(false);
  const [, setGradeSummaryError] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<{ key: 'name' | 'mark' | 'grade' | 'missing' | null; dir: 'asc' | 'desc' | null }>({ key: null, dir: null });
  // Aggregate per-student across all subjects for the selected exam (used when no subject selected)
  const [aggregateByStudent, setAggregateByStudent] = React.useState<Map<string, { avg: number | null; gradeCounts: Record<string, number> }>>(new Map());
  // Per-student missing subject list for current exam/class configuration
  const [missingByStudent, setMissingByStudent] = React.useState<Map<string, string[]>>(new Map());
  // Per-subject completion summary for current roster
  const [subjectCompletion, setSubjectCompletion] = React.useState<Map<string, { completed: number; total: number; th: number }>>(new Map());
  // Per-subject opt-out tracking (subject -> student set)
  const [subjectOptOutMap, setSubjectOptOutMap] = React.useState<Map<string, Set<string>>>(new Map());
  // Toggle to filter only students with missing subjects (when no subject is selected)
  const [showOnlyMissing, setShowOnlyMissing] = React.useState(false);
  // Metadata readiness to avoid UI flicker while initial selections are being computed
  // Toast state for quick popup notifications
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = React.useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2200);
  }, []);
  const isValidClassId = React.useCallback(
    (id?: string | null) => Boolean(id && id !== "all"),
    []
  );

  const fetchFullStudentRoster = React.useCallback(async () => {
    const pageSize = 1000;
    let from = 0;
    const allStudents: StudentRosterItem[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, class_id')
        .neq('record_type', 'prospect')
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        throw error;
      }
      if (data && data.length > 0) {
        allStudents.push(...data);
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return allStudents;
  }, []);
  
  // Cache for unsaved data when switching subjects
  const [unsavedDataCache, setUnsavedDataCache] = React.useState<Map<string, StudentRow[]>>(new Map());
  const previousSelectionRef = React.useRef<{classId: string, subjectId: string, examId: string}>({classId: "", subjectId: "", examId: ""});
  // Baseline (initial) rows for accurate dirty detection
  const initialRowsRef = React.useRef<StudentRow[]>([]);
  const saveIndicatorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch auth and base metadata
  React.useEffect(() => {
    (async () => {
      const { data: userData, error } = await supabase.auth.getUser();
      if (!error && userData.user) setUserId(userData.user.id);

      const [{ data: classesData }, { data: subjectsData }, examsResp] = await Promise.all([
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('subjects').select('id, name').order('name'),
        authFetch('/api/admin/exam-metadata').then((r) => r.json()).catch((e) => { console.error('Failed to load exam metadata', e); return { exams: [] } })
      ]);
      setClasses(classesData || []);
      setSubjects(subjectsData || []);
      const allExams = examsResp?.exams || [];
      setExams(allExams);
      try {
        const studentsData = await fetchFullStudentRoster();
        if (studentsData) {
          const rosterMap = new Map<string, Array<{ id: string; name: string }>>();
          studentsData.forEach((student) => {
            if (!student?.class_id) return;
            const classId = String(student.class_id);
            if (!rosterMap.has(classId)) rosterMap.set(classId, []);
            rosterMap.get(classId)!.push({
              id: String(student.id),
              name: student.name || "Unnamed student",
            });
          });
          setClassRosterMap(rosterMap);
        } else {
          setClassRosterMap(new Map());
        }
      } catch (err) {
        console.error('Failed to load class rosters', err);
        setClassRosterMap(new Map());
      }

      // Fetch conduct criteria
      try {
        const criteriaRes = await fetch('/api/teacher/conduct-criterias');
        const criteriaJson = await criteriaRes.json();
        if (criteriaJson.success) {
          setConductCriterias(criteriaJson.criterias || []);
        }
      } catch (e) {
        console.error('Failed to load conduct criteria', e);
      }

      // Do not auto-select exam/class/subject on first load; leave filters empty by default
    })();
  }, [fetchFullStudentRoster]);

  // No defaults: keep filters empty to avoid UI thrash on first load


  // Compute assessment list from metadata
  const assessmentList = React.useMemo(() => {
    if (!selectedClassId || !selectedSubjectId) return [] as { id: string; name: string }[];
    const isQuiz = assessmentType === 'Quiz';
    const list: { id: string; name: string }[] = [];
    for (const ex of exams) {
      const typeIsQuiz = typeof ex?.type === 'string' && ex.type.toLowerCase() === 'quiz';
      if (isQuiz !== typeIsQuiz) continue;
      
      // Handle "all" selections
      const hasClass = selectedClassId === "all" || (ex.exam_classes || []).some(ec => ec?.classes?.id === selectedClassId);
      // If per-class mapping exists, require matching pair; otherwise check exam_subjects only
      const ecs = ex.exam_class_subjects;
      let hasSubject = false;
      if (Array.isArray(ecs) && ecs.length > 0) {
        if (selectedClassId === 'all') {
          hasSubject = ecs.some(row => row?.subjects?.id === selectedSubjectId);
        } else {
          hasSubject = ecs.some(row => row?.classes?.id === selectedClassId && row?.subjects?.id === selectedSubjectId);
        }
      } else {
        hasSubject = (ex.exam_subjects || []).some(es => es?.subjects?.id === selectedSubjectId);
      }
      
      if (hasClass && hasSubject) list.push({ id: ex.id, name: ex.name });
    }
    return list;
  }, [assessmentType, exams, selectedClassId, selectedSubjectId]);

  // Limit dropdowns to classes/subjects configured for the selected exam (fallback to all)
  const subjectsForUI = React.useMemo(() => {
    if (!selectedExamId) return subjects;
    const ex = exams.find(e => String(e.id) === String(selectedExamId));
    const ecs = Array.isArray(ex?.exam_class_subjects) ? ex?.exam_class_subjects : undefined;
    if (Array.isArray(ecs) && ecs.length > 0) {
      if (selectedClassId && selectedClassId !== 'all') {
        const arr = ecs
          .filter(row => row?.classes?.id === selectedClassId)
          .map(row => row?.subjects)
          .filter((s): s is { id: string; name: string } => Boolean(s?.id) && Boolean(s?.name))
          .map(s => ({ id: String(s.id), name: s.name }));
        if (arr.length) return arr;
      } else {
        const arr = Array.from(new Set((ecs || []).map(row => row?.subjects?.id))).map((sid) => {
          const found = (ecs || []).find(r => String(r?.subjects?.id) === String(sid));
          return found?.subjects ? { id: String(found.subjects.id), name: String(found.subjects.name) } : null;
        }).filter((x): x is { id: string; name: string } => !!x);
        if (arr.length) return arr;
      }
    }
    const arr = (ex?.exam_subjects || [])
      .map(es => es?.subjects)
      .filter((s): s is { id: string; name: string } => Boolean(s?.id) && Boolean(s?.name))
      .map(s => ({ id: String(s.id), name: s.name }));
    return arr.length ? arr : subjects;
  }, [selectedExamId, selectedClassId, exams, subjects]);

  const classesForUI = React.useMemo(() => {
    if (!selectedExamId) return classes;
    const ex = exams.find(e => String(e.id) === String(selectedExamId));
    const arr = (ex?.exam_classes || [])
      .map(ec => ec?.classes)
      .filter((c): c is { id: string; name: string } => Boolean(c?.id) && Boolean(c?.name))
      .map(c => ({ id: String(c.id), name: c.name }));
    return arr.length ? arr : classes;
  }, [selectedExamId, exams, classes]);

  const totalRosterCount = React.useMemo(() => {
    let count = 0;
    classRosterMap.forEach((students) => {
      count += students.length;
    });
    return count;
  }, [classRosterMap]);

  const selectedClassRoster = React.useMemo(() => {
    if (!selectedClassId || selectedClassId === 'all') return [];
    if (selectedExamId && studentRows.length > 0) {
      const rowsForRoster = selectedSubjectId
        ? studentRows.filter((student) => !student.optedOut)
        : studentRows;
      return rowsForRoster.map((student) => ({ id: student.id, name: student.name }));
    }
    return classRosterMap.get(selectedClassId) ?? [];
  }, [classRosterMap, selectedClassId, selectedExamId, selectedSubjectId, studentRows]);

  const selectedClassName = React.useMemo(() => {
    if (!selectedClassId || selectedClassId === 'all') return null;
    return classes.find((cls) => cls.id === selectedClassId)?.name ?? null;
  }, [classes, selectedClassId]);

  // Keep selected subject valid for the chosen exam+class; reset to blank if invalid
  React.useEffect(() => {
    const valid = subjectsForUI.map(s => s.id);
    if (selectedSubjectId && !valid.includes(selectedSubjectId)) {
      setSelectedSubjectId('');
    }
  }, [subjectsForUI, selectedSubjectId]);

  // Keep selected exam consistent - but only reset if current selection is invalid
  React.useEffect(() => {
    if (selectedExamId && assessmentList.length > 0) {
      // Check if current selection is still valid
      const isValidSelection = assessmentList.some(assessment => assessment.id === selectedExamId);
      if (!isValidSelection) {
        setSelectedExamId(assessmentList[0]?.id || "");
      }
    }
  }, [assessmentList, selectedExamId]);

  // Load grading scale when exam changes
  React.useEffect(() => {
    if (selectedExamId) {
      getGradingScale(selectedExamId)
        .then(scale => {
          setGradingScale(scale);
        })
        .catch(error => {
          console.error('Failed to load grading scale:', error);
          setGradingScale(null); // Fall back to default
        });
    } else {
      setGradingScale(null);
    }
  }, [selectedExamId]);

  // Compute per-student aggregates, missing subjects, and per-subject completion
  React.useEffect(() => {
    (async () => {
      if (!selectedExamId) {
        setAggregateByStudent(new Map());
        setMissingByStudent(new Map());
        setSubjectCompletion(new Map());
        return;
      }
      try {
        const rosterIds = studentRows.map(r => r.id);
        const rosterSet = new Set(rosterIds);
        const studentRowMap = new Map(studentRows.map((row) => [row.id, row]));
        const allSubjectIds = subjectsForUI.map(s => s.id);
        if (rosterIds.length === 0 || allSubjectIds.length === 0) {
          setAggregateByStudent(new Map());
          setMissingByStudent(new Map());
          setSubjectCompletion(new Map());
          return;
        }
        const { data } = await supabase
          .from('exam_results')
          .select('student_id, subject_id, mark, grade, final_score')
          .eq('exam_id', selectedExamId)
          .in('student_id', rosterIds);
        const perStudentAgg = new Map<string, { sum: number; count: number; gradeCounts: Record<string, number> }>();
        const perStudentFilled = new Map<string, Set<string>>();
        const perSubjectCompleted = new Map<string, number>();
        const perSubjectTH = new Map<string, number>();
        const perStudentTotalSubjects = new Map<string, number>();
        type ExamResultRow = { student_id: string | number; subject_id: string | number; mark: number | null; grade: string | null; final_score: number | null };
        (data as ExamResultRow[] | null | undefined)?.forEach((r) => {
          const sid = String(r.student_id);
          const subId = String(r.subject_id);
          const fs = typeof r.final_score === 'number' ? r.final_score : null;
          const markVal = typeof fs === 'number' ? fs : (typeof r.mark === 'number' ? r.mark : null);
          const g = (r.grade || '').toUpperCase();
          const isTH = g === 'TH';
          const hasNumeric = typeof markVal === 'number';

          if (!perStudentAgg.has(sid)) perStudentAgg.set(sid, { sum: 0, count: 0, gradeCounts: {} });
          const agg = perStudentAgg.get(sid)!;
          if (hasNumeric) {
            agg.sum += markVal as number;
            agg.count += 1;
          } else if (isTH) {
            agg.count += 1;
          }
          if (g) { agg.gradeCounts[g] = (agg.gradeCounts[g] || 0) + 1; }

          if (isTH || hasNumeric) {
            if (!perStudentFilled.has(sid)) perStudentFilled.set(sid, new Set());
            const filledSet = perStudentFilled.get(sid)!;
            const sizeBefore = filledSet.size;
            filledSet.add(subId);
            if (filledSet.size !== sizeBefore) {
              perSubjectCompleted.set(subId, (perSubjectCompleted.get(subId) || 0) + 1);
            }
            if (isTH) perSubjectTH.set(subId, (perSubjectTH.get(subId) || 0) + 1);
          }
          perStudentTotalSubjects.set(sid, (perStudentTotalSubjects.get(sid) || 0) + 1);
        });

        subjectOptOutMap.forEach((studentSet, subId) => {
          studentSet.forEach((sid) => {
            if (!rosterSet.has(sid)) return;
            if (!perStudentFilled.has(sid)) perStudentFilled.set(sid, new Set());
            const filledSet = perStudentFilled.get(sid)!;
            if (!filledSet.has(subId)) {
              filledSet.add(subId);
              perSubjectCompleted.set(subId, (perSubjectCompleted.get(subId) || 0) + 1);
            }
          });
        });

        if (selectedSubjectId) {
          const subId = selectedSubjectId;
          const completedSet = new Set<string>();
          studentRows.forEach((row) => {
            const sid = row.id;
            if (!rosterSet.has(sid)) return;
            if (!perStudentFilled.has(sid)) perStudentFilled.set(sid, new Set());
            const filledSet = perStudentFilled.get(sid)!;
            filledSet.delete(subId);

            if (row.optedOut) {
              filledSet.add(subId);
              completedSet.add(sid);
              return;
            }

            const numeric = parseFloat(String(row.mark));
            const hasNumeric = Number.isFinite(numeric);
            const isTH = Boolean(row.isAbsent);
            if (hasNumeric || isTH) {
              filledSet.add(subId);
              completedSet.add(sid);
              if (isTH) perSubjectTH.set(subId, (perSubjectTH.get(subId) || 0) + 1);
            }
          });

          perSubjectCompleted.set(subId, completedSet.size);
        }
        // Build outputs
        const outAgg = new Map<string, { avg: number | null; gradeCounts: Record<string, number> }>();
        rosterIds.forEach((id) => {
          const a = perStudentAgg.get(id);
          outAgg.set(id, a ? { avg: a.count > 0 ? a.sum / a.count : null, gradeCounts: a.gradeCounts } : { avg: null, gradeCounts: {} });
        });
        setAggregateByStudent(outAgg);
        const outMissing = new Map<string, string[]>();
        rosterIds.forEach((id) => {
          const filled = perStudentFilled.get(id) || new Set<string>();
          const missing = allSubjectIds.filter(sid => !filled.has(sid));
          outMissing.set(id, missing);
        });
        if (selectedSubjectId) {
          rosterIds.forEach((id) => {
            const row = studentRowMap.get(id);
            if (!row) return;
            const filled = outMissing.get(id) || [];
            const shouldFill = Boolean(row.optedOut) || Boolean(row.isAbsent) || Number.isFinite(parseFloat(String(row.mark)));
            const hasSubject = filled.includes(selectedSubjectId);
            if (shouldFill && hasSubject) {
              outMissing.set(id, filled.filter(sid => sid !== selectedSubjectId));
            } else if (!shouldFill && !hasSubject) {
              outMissing.set(id, [...filled, selectedSubjectId]);
            }
          });
        }
        setMissingByStudent(outMissing);
        const total = rosterIds.length;
        const outSubject = new Map<string, { completed: number; total: number; th: number }>();
        allSubjectIds.forEach((sid) => {
          outSubject.set(sid, { completed: perSubjectCompleted.get(sid) || 0, total, th: perSubjectTH.get(sid) || 0 });
        });
        setSubjectCompletion(outSubject);
        // Track total subjects per student to align completion pill logic with admin view
        perStudentTotalSubjects.forEach((total, sid) => {
          const row = studentRowMap.get(sid);
          if (row) {
            (row as unknown as { _totalSubjects?: number })._totalSubjects = total;
          }
        });

        // Build grade -> subjects map for tooltips using allowed subjects and current exam results
        const allowedSet = new Set(allSubjectIds.map(String));
        const idToName = new Map(subjectsForUI.map(s => [String(s.id), s.name]));
        const gradeSubjectsByStudent = new Map<string, Record<string, string[]>>();
        (data as ExamResultRow[] | null | undefined)?.forEach((r) => {
          const sid = String(r.student_id);
          const subId = String(r.subject_id);
          const grade = (r.grade || '').toUpperCase();
          if (!grade || !allowedSet.has(subId)) return;
          if (!gradeSubjectsByStudent.has(sid)) gradeSubjectsByStudent.set(sid, {});
          const m = gradeSubjectsByStudent.get(sid)!;
          const arr = m[grade] || [];
          const name = idToName.get(subId) || subId;
          if (!arr.includes(name)) arr.push(name);
          m[grade] = arr;
        });
        setGradeSubjectsMap(gradeSubjectsByStudent);
      } catch (e) {
        console.error('Aggregate compute failed', e);
        setAggregateByStudent(new Map());
        setMissingByStudent(new Map());
        setSubjectCompletion(new Map());
      }
    })();
  }, [selectedExamId, selectedSubjectId, studentRows, subjectsForUI, subjectOptOutMap]);

  // Load RPC grade summaries for each student (filtered to allowed subjects)
  React.useEffect(() => {
    const load = async () => {
      if (!selectedExamId || !selectedClassId || studentRows.length === 0) {
        setGradeSummaryMap(new Map());
        return;
      }
      setLoadingGradeSummary(true);
      setGradeSummaryError(null);
      const classIdForRpc = selectedClassId ? String(selectedClassId) : null;
      try {
        const entries: [string, GradeSummaryRow[]][] = await Promise.all(
          studentRows.map(async (row): Promise<[string, GradeSummaryRow[]]> => {
            try {
              const rows = await fetchGradeSummary(String(selectedExamId), classIdForRpc, String(row.id));
              return [String(row.id), rows];
            } catch (err: unknown) {
              console.warn('grade summary RPC failed for student', row.id, (err as Error)?.message || err);
              return [String(row.id), []];
            }
          })
        );
        setGradeSummaryMap(new Map(entries));
      } catch (err: unknown) {
        setGradeSummaryError((err as Error)?.message || 'Failed to load grade summaries');
        setGradeSummaryMap(new Map());
      } finally {
        setLoadingGradeSummary(false);
      }
    };
    load();
  }, [selectedExamId, selectedClassId, selectedSubjectId, studentRows]);

  // Compute conduct categories from dynamic criteria or use defaults
  const conductCategories = React.useMemo(() => {
    if (conductCriterias.length > 0) {
      const mapped = conductCriterias
        .map((criteria) => {
          const name = (criteria.name || '').toLowerCase().trim();
          const key = CRITERIA_KEY_BY_NAME[name];
          if (!key) return null;
          return {
            key,
            label: criteria.name || defaultConductCategories.find((c) => c.key === key)?.label || 'Conduct',
            maxScore: Number(criteria.max_score) > 0 ? Number(criteria.max_score) : 100,
          };
        })
        .filter((item): item is { key: ConductKey; label: string; maxScore: number } => Boolean(item));

      if (mapped.length === defaultConductCategories.length) {
        return mapped;
      }

      if (mapped.length > 0) {
        const byKey = new Map(mapped.map((item) => [item.key, item]));
        return defaultConductCategories.map((cat) => byKey.get(cat.key) ?? cat);
      }
    }
    return defaultConductCategories;
  }, [conductCriterias]);

  // Cache data when selections change
  React.useEffect(() => {
    const prev = previousSelectionRef.current;
    const hasValidPrevious = prev.classId && prev.subjectId && prev.examId;
    const hasChanges = prev.classId !== selectedClassId || prev.subjectId !== selectedSubjectId || prev.examId !== selectedExamId;
    
    if (hasValidPrevious && hasChanges && studentRows.length > 0) {
      const cacheKey = `${prev.classId}-${prev.subjectId}-${prev.examId}`;
      setUnsavedDataCache(prevCache => {
        const newCache = new Map(prevCache);
        newCache.set(cacheKey, [...studentRows]);
        return newCache;
      });
    }
    
    // Update the previous selection
    previousSelectionRef.current = {
      classId: selectedClassId,
      subjectId: selectedSubjectId,
      examId: selectedExamId
    };
  }, [selectedClassId, selectedSubjectId, selectedExamId, studentRows]);

  // Load students, marks and current teacher conduct for selections
  React.useEffect(() => {
    // Only fetch roster once exam and class are explicitly selected by user
    if (!selectedClassId || !selectedExamId) {
      setRosterSource('current');
      return;
    }
    
    (async () => {
      let roster: StudentRosterItem[] = [];
      let useSnapshot = false;
      let rosterRows: Array<{ student_id: string | null; class_id: string | null }> = [];

      if (selectedExamId) {
        const { data: rosterData, error: rosterErr } = await supabase
          .from('exam_roster')
          .select('student_id, class_id')
          .eq('exam_id', selectedExamId);
        if (!rosterErr && Array.isArray(rosterData) && rosterData.length > 0) {
          useSnapshot = true;
          rosterRows = rosterData as Array<{ student_id: string | null; class_id: string | null }>;
        }
      }

      if (useSnapshot) {
        let filteredRows = rosterRows;
        if (selectedClassId !== "all") {
          filteredRows = rosterRows.filter((row) => String(row?.class_id || '') === String(selectedClassId));
        }
        const rosterIds = filteredRows
          .map((row) => row?.student_id)
          .filter((id): id is string => typeof id === 'string');
        const classByStudent = new Map<string, string | null>(
          filteredRows
            .filter((row): row is { student_id: string; class_id: string | null } => typeof row.student_id === 'string')
            .map((row) => [String(row.student_id), row.class_id ? String(row.class_id) : null])
        );
        if (rosterIds.length > 0) {
          const { data: studentsData } = await supabase
            .from('students')
            .select('id, name, class_id')
            .neq('record_type', 'prospect')
            .in('id', rosterIds);
          roster = (studentsData || []).map((s) => ({
            id: s.id,
            name: s.name,
            class_id: classByStudent.get(String(s.id)) ?? s.class_id
          }));
        }
      } else {
        // Students in class or all students if "all" is selected
        let studentsQuery = supabase
          .from('students')
          .select('id, name, class_id')
          .neq('record_type', 'prospect');
      
        if (selectedClassId !== "all") {
          studentsQuery = studentsQuery.eq('class_id', selectedClassId);
        }
      
        const { data: studentsData } = await studentsQuery;
        roster = studentsData || [];
      }
      setRosterSource(useSnapshot ? 'snapshot' : 'current');

      // Prepare containers to fill inside try
      let marksByStudent = new Map<string, { mark: number | null; grade: string | null }>();
      let conductByStudent = new Map<string, Record<ConductKey, number>>();
      let optOutIdsForRows = new Set<string>();

      // Apply exam exclusions, fetch marks and conduct in parallel to reduce latency
      try {
        setSubjectOptOutMap(new Map());
        const params = new URLSearchParams({ examId: selectedExamId });
        if (selectedClassId && selectedClassId !== 'all') params.append('classId', selectedClassId);
        const optOutQuery = new URLSearchParams({ examId: selectedExamId });
        const [exclRes, resultsRes, conductRes, optOutJson] = await Promise.all([
          fetch(`/api/teacher/exam-exclusions?${params.toString()}`),
          selectedSubjectId
            ? supabase.from('exam_results')
                .select('student_id, mark, final_score, grade')
                .eq('exam_id', selectedExamId)
                .eq('subject_id', selectedSubjectId)
            : Promise.resolve<{ data: Array<{ student_id: string; mark: number | null; final_score: number | null; grade: string | null }> }>({
                data: [],
              }),
          userId
            ? supabase
                .from('conduct_entries')
                .select('student_id, discipline, effort, participation, motivational_level, character, leadership')
                .eq('exam_id', selectedExamId)
                .eq('teacher_id', userId)
            : Promise.resolve<{ data: Array<{ student_id: string; discipline?: number; effort?: number; participation?: number; motivational_level?: number; character?: number; leadership?: number }> }>({
                data: [],
              }),
          fetch(`/api/teacher/subject-opt-outs?${optOutQuery.toString()}`)
            .then((r) => r.json())
            .catch(() => ({
              entries: [] as Array<{
                studentId?: string;
                subjectId?: string;
                student_id?: string;
                subject_id?: string;
              }>
            }))
        ]);
        // Exclusions
        try {
          const json = await exclRes.json();
          const excluded: string[] = Array.isArray(json.excludedStudentIds) ? json.excludedStudentIds : [];
          const excludedSet = new Set(excluded);
          roster = roster.filter((s) => !excludedSet.has(String(s.id)));
        } catch {}
        // Marks
        marksByStudent = new Map<string, { mark: number | null; grade: string | null }>();
        const results = (resultsRes as { data?: Array<{ student_id: string; mark: number | null; final_score: number | null; grade: string | null }> })?.data || [];
        (results || []).forEach((r) => {
          const markValue = typeof r.final_score === 'number' ? r.final_score : r.mark;
          marksByStudent.set(String(r.student_id), { mark: markValue, grade: r.grade });
        });
        // Conduct
        conductByStudent = new Map<string, Record<ConductKey, number>>();
        const conductEntries = (conductRes as { data?: Array<{ student_id: string; discipline?: number; effort?: number; participation?: number; motivational_level?: number; character?: number; leadership?: number }> })?.data || [];
        (conductEntries || []).forEach((e) => {
          conductByStudent.set(String(e.student_id), {
            discipline: Number(e.discipline) || 0,
            effort: Number(e.effort) || 0,
            participation: Number(e.participation) || 0,
            motivational_level: Number(e.motivational_level) || 0,
            character_score: Number(e.character) || 0,
            leadership: Number(e.leadership) || 0,
          } as Record<ConductKey, number>);
        });

        type OptOutEntry = {
          studentId?: string | number | null;
          subjectId?: string | number | null;
          student_id?: string | number | null;
          subject_id?: string | number | null;
        };
        const optOutEntriesRaw = Array.isArray(optOutJson?.entries)
          ? (optOutJson.entries as OptOutEntry[])
          : [];
        const optOutMap = new Map<string, Set<string>>();
        (optOutEntriesRaw || []).forEach((entry) => {
          if (!entry) return;
          const studentIdRaw = entry.student_id ?? entry.studentId;
          const subjectIdRaw = entry.subject_id ?? entry.subjectId;
          const sid = studentIdRaw ? String(studentIdRaw) : null;
          const subId = subjectIdRaw ? String(subjectIdRaw) : null;
          if (!sid || !subId) return;
          if (!optOutMap.has(subId)) optOutMap.set(subId, new Set());
          optOutMap.get(subId)!.add(sid);
        });
        setSubjectOptOutMap(optOutMap);
        const currentOptOutSet = selectedSubjectId ? (optOutMap.get(String(selectedSubjectId)) || new Set<string>()) : new Set<string>();
        optOutIdsForRows = new Set(currentOptOutSet);
      } catch (err) {
        console.error('Failed loading exclusions/results/conduct', err);
      }

      // Prefer server-side conduct summary (uses conduct_entries + conduct_scores) for display
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          const summaryParams = new URLSearchParams({ examId: selectedExamId });
          if (selectedClassId && selectedClassId !== 'all') {
            summaryParams.append('classId', selectedClassId);
          }
          const res = await fetch(`/api/teacher/exams?${summaryParams.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json();
          const list = Array.isArray(json?.students) ? (json.students as StudentData[]) : [];
          list.forEach((s) => {
            const pct = s.conductPercentages || null;
            if (!pct) return;
            const hasValue = Object.values(pct).some((value) => Number(value) > 0);
            if (!hasValue) return;
            conductByStudent.set(String(s.id), {
              discipline: Number(pct.discipline) || 0,
              effort: Number(pct.effort) || 0,
              participation: Number(pct.participation) || 0,
              motivational_level: Number(pct.motivationalLevel) || 0,
              character_score: Number(pct.character) || 0,
              leadership: Number(pct.leadership) || 0,
            } as Record<ConductKey, number>);
          });
        }
      } catch (err) {
        console.warn('Failed loading conduct summary from teacher exams API', err);
      }

      // Build rows
      const rows: StudentRow[] = roster.map((s) => {
        const m = marksByStudent.get(String(s.id));
        const markValue = typeof m?.mark === 'number' ? m.mark : null;
        const gradeRaw = (m?.grade || '').trim();
        const isTH = gradeRaw.toUpperCase() === 'TH' && markValue === null;
        const displayGrade = isTH ? 'TH' : (markValue !== null ? gradeRaw : '');
        const c = conductByStudent.get(String(s.id));
        const emptyConduct = conductCategories.reduce((acc, cat) => {
          acc[cat.key] = '' as string;
          return acc;
        }, {} as Record<ConductKey, string>);
        const isOptedOut = selectedSubjectId ? optOutIdsForRows.has(String(s.id)) : false;
        return {
          id: String(s.id),
          name: s.name,
          mark: isOptedOut ? '' : (markValue !== null ? String(markValue) : ''),
          grade: isOptedOut ? 'N/A' : displayGrade,
          isAbsent: isOptedOut ? false : isTH,
          optedOut: isOptedOut,
          classId: s.class_id ? String(s.class_id) : null,
          conduct: c
            ? (Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])) as Record<ConductKey, string>)
            : emptyConduct,
        };
      });
      // Set baseline to fresh DB rows (not the cached/merged view)
      initialRowsRef.current = rows.map((r) => ({
        ...r,
        conduct: { ...r.conduct },
        optedOut: Boolean(r.optedOut),
      }));
      
      // Check if we have cached unsaved data for this selection
      const newCacheKey = `${selectedClassId}-${selectedSubjectId}-${selectedExamId}`;
      const cachedData = unsavedDataCache.get(newCacheKey);
      
      if (cachedData) {
        // Merge cached unsaved data with fresh data from database
        const mergedRows = rows.map(freshRow => {
          const cachedRow = cachedData.find(cached => cached.id === freshRow.id);
          if (cachedRow) {
            // Preserve intentional empty values (e.g. absent clears mark to '').
            return {
              ...freshRow,
              mark: cachedRow.mark !== undefined ? cachedRow.mark : freshRow.mark,
              grade: cachedRow.grade !== undefined ? cachedRow.grade : freshRow.grade,
              conduct: cachedRow.conduct ?? freshRow.conduct,
              isAbsent: cachedRow.isAbsent ?? freshRow.isAbsent,
              optedOut: cachedRow.optedOut ?? freshRow.optedOut
            };
          }
          return freshRow;
        });
        setStudentRows(mergedRows);
      } else {
        setStudentRows(rows);
      }
      
      setExpandedRows([]);
    })();
  }, [conductCategories, selectedClassId, selectedSubjectId, selectedExamId, userId, unsavedDataCache]);

  // Dynamic grade computation using exam's actual grading scale
  const computeGradeClientSide = (mark: number): string => {
    if (!gradingScale) {
      // Fallback to SPM 2023 if grading scale not loaded yet
      if (mark >= 90) return 'A+';
      if (mark >= 80) return 'A';
      if (mark >= 70) return 'A-';
      if (mark >= 65) return 'B+';
      if (mark >= 60) return 'B';
      if (mark >= 55) return 'C+';
      if (mark >= 50) return 'C';
      if (mark >= 45) return 'D';
      if (mark >= 40) return 'E';
      return 'G';
    }
    
    return computeGrade(mark, gradingScale);
  };

  // Editable cell handlers
  const handleMarkChange = (idx: number, value: string) => {
    if (studentRows[idx]?.optedOut) return;
    setStudentRows((prev) => {
      const updated = [...prev];
      const numericMark = parseFloat(value);
      updated[idx] = {
        ...updated[idx],
        mark: value,
        isAbsent: false,
        // INSTANT FEEDBACK: Compute grade client-side for immediate response
        grade: !isNaN(numericMark) && numericMark >= 0 && numericMark <= 100 
          ? computeGradeClientSide(numericMark) 
          : '',
      };
      return updated;
    });
  };

  // Paste a column of marks from Google Sheets into the table starting at the given visible row index
  const handleMarkPaste = (startDisplayIdx: number, text: string) => {
    // Split by newlines; ignore a possible trailing empty line from Sheets
    const lines = text
      .replace(/\r/g, '')
      .split(/\n/)
      .filter((l, i, arr) => !(i === arr.length - 1 && l.trim() === ''));

    if (lines.length === 0) return;

    // Build order of indices in the current visible ordering
    const orderIdxs = visibleRows.map((v) => v._idx);
    const startPos = Math.max(0, Math.min(startDisplayIdx, orderIdxs.length - 1));

    setStudentRows((prev) => {
      const updated = [...prev];
      for (let i = 0; i < lines.length && startPos + i < orderIdxs.length; i++) {
        const targetIdx = orderIdxs[startPos + i];
        const raw = String(lines[i] ?? '').trim();
        if (updated[targetIdx]?.optedOut) continue;

        // Interpret TH/Absent markers
        if (/^(th|absent)$/i.test(raw)) {
          updated[targetIdx] = {
            ...updated[targetIdx],
            isAbsent: true,
            mark: '',
            grade: 'TH',
          };
          continue;
        }

        // Extract numeric (allow percent or other symbols copied from sheets)
        const cleaned = raw.replace(/[^0-9.\-]/g, '');
        if (cleaned === '' || cleaned === '-' || cleaned === '--') {
          updated[targetIdx] = {
            ...updated[targetIdx],
            isAbsent: false,
            mark: '',
            grade: '',
          };
          continue;
        }

        const num = parseFloat(cleaned);
        if (isNaN(num)) {
          // Skip invalid value
          continue;
        }

        const bounded = Math.max(0, Math.min(100, num));
        updated[targetIdx] = {
          ...updated[targetIdx],
          isAbsent: false,
          mark: String(bounded),
          grade: computeGradeClientSide(bounded),
        };
      }
      return updated;
    });

    // Debounced autosave effect will persist pasted values.
  };

  const handleMarkPasteFromInput = (e: React.ClipboardEvent<HTMLInputElement>, startDisplayIdx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text') || '';
    handleMarkPaste(startDisplayIdx, text);
  };
  const handleAbsentToggle = (idx: number, checked: boolean) => {
    if (studentRows[idx]?.optedOut) return;
    setStudentRows((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        isAbsent: checked,
        // Clear mark when absent; set grade to TH
        mark: checked ? '' : updated[idx].mark,
        grade: checked ? 'TH' : '',
      };
      return updated;
    });
  };

  const handleExpand = (idx: number) => {
    setExpandedRows((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const handleConductSummaryUpdate = React.useCallback((studentId: string, summary: ConductSummary | null) => {
    const nextConduct = FIELD_KEYS.reduce((acc, key) => {
      const value = summary?.[key] as number | null | undefined;
      acc[key] = value == null || Number.isNaN(value) ? '' : String(value);
      return acc;
    }, {} as Record<ConductKey, string>);

    setStudentRows((prev) =>
      prev.map((row) => (row.id === studentId ? { ...row, conduct: nextConduct } : row))
    );

    initialRowsRef.current = initialRowsRef.current.map((row) =>
      row.id === studentId ? { ...row, conduct: { ...nextConduct } } : row
    );
  }, []);

  // Toggle sort for a given column
  const toggleSort = (key: 'name' | 'mark' | 'grade' | 'missing') => {
    setSortBy((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: null };
    });
  };

  // Check for unsaved changes
  const hasUnsavedChanges = React.useCallback(() => {
    if (!initialRowsRef.current || initialRowsRef.current.length === 0) return false;
    const initialMap = new Map(initialRowsRef.current.map(r => [r.id, r]));
    return studentRows.some((curr) => {
      const init = initialMap.get(curr.id);
      if (!init) return true;
      const markChanged = String(curr.mark ?? '').trim() !== String(init.mark ?? '').trim();
      if (markChanged) return true;
      const statusChanged = Boolean(curr.isAbsent) !== Boolean(init.isAbsent);
      if (statusChanged) return true;
      return false;
    });
  }, [studentRows]);

  // Save all rows using new single-endpoint API
  const handleSaveAll = React.useCallback(async () => {
    setSaving(true);
    if (saveIndicatorTimerRef.current) {
      clearTimeout(saveIndicatorTimerRef.current);
      saveIndicatorTimerRef.current = null;
    }
    setSaveIndicator('saving');
    try {
      if (!selectedExamId || !selectedSubjectId) {
        setSaving(false);
        setSaveIndicator('idle');
        return;
      }

      // Determine changed rows compared to baseline
      const initialMap = new Map(initialRowsRef.current.map(r => [r.id, r]));
      const changedRows = studentRows.filter((r) => {
        if (r.optedOut) return false;
        const init = initialMap.get(r.id);
        if (!init) return true;
        const markChanged = String(r.mark ?? '').trim() !== String(init.mark ?? '').trim();
        const statusChanged = Boolean(r.isAbsent) !== Boolean(init.isAbsent);
        return markChanged || statusChanged;
      });

      // Prepare exam results for the new single-endpoint API
      const examResults = changedRows
        .map((r) => {
          const init = initialMap.get(r.id);
          const markChanged = String(r.mark ?? '').trim() !== String(init?.mark ?? '').trim();
          const statusChanged = Boolean(r.isAbsent) !== Boolean(init?.isAbsent);
          if (!markChanged && !statusChanged) return null;
          
          if (r.isAbsent) {
            return {
              studentId: r.id,
              mark: null,
              finalScore: null,
              isAbsent: true
            };
          }
          
          const trimmedMark = String(r.mark ?? '').trim();
          if (trimmedMark === '') {
            return {
              studentId: r.id,
              mark: null,
              finalScore: null,
              isAbsent: false
            };
          }
          const mark = parseFloat(trimmedMark);
          if (isNaN(mark)) return null;

          const finalScore = mark;
          
          return {
            studentId: r.id,
            mark: mark,
            finalScore,
            isAbsent: false
          };
        })
        .filter(Boolean) as Array<{
          studentId: string;
          mark: number | null;
          finalScore: number | null;
          isAbsent: boolean;
        }>;

      // Submit exam results
      if (examResults.length > 0) {
        const response = await fetch('/api/teacher/exam-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examId: selectedExamId,
            subjectId: selectedSubjectId,
            classId: selectedClassId === 'all' ? null : selectedClassId,
            results: examResults
          })
        });
        const payload = await response.json().catch(() => null) as
          | { error?: string; message?: string; details?: { message?: string } }
          | null;
        if (!response.ok) {
          const message =
            payload?.error ||
            payload?.message ||
            payload?.details?.message ||
            'Failed to save exam results';
          throw new Error(message);
        }
      }

      // Update conduct if we have changes for this subject
      const conductChanges = changedRows
        .map((r) => ({
          studentId: r.id,
          conduct: r.conduct
        }));

      if (conductChanges.length > 0) {
        await fetch('/api/teacher/conduct-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examId: selectedExamId,
            classId: selectedClassId === 'all' ? null : selectedClassId,
            entries: conductChanges
          })
        });
      }

      // After saving, update initial rows baseline
      initialRowsRef.current = studentRows.map((r) => ({ ...r, conduct: { ...r.conduct } }));
      setUnsavedDataCache((prev) => {
        const next = new Map(prev);
        const cacheKey = `${selectedClassId}-${selectedSubjectId}-${selectedExamId}`;
        next.set(cacheKey, studentRows.map((r) => ({ ...r, conduct: { ...r.conduct } })));
        return next;
      });

      showToast('Saved', 'success');
      setSaveIndicator('saved');
      saveIndicatorTimerRef.current = setTimeout(() => setSaveIndicator('idle'), 1800);
    } catch (error) {
      console.error('Error saving exam data:', error);
      showToast('Failed to save', 'error');
      setSaveIndicator('error');
      saveIndicatorTimerRef.current = setTimeout(() => setSaveIndicator('idle'), 2400);
    } finally {
      setSaving(false);
    }
  }, [selectedExamId, selectedSubjectId, selectedClassId, studentRows, showToast]);

  React.useEffect(() => {
    return () => {
      if (saveIndicatorTimerRef.current) clearTimeout(saveIndicatorTimerRef.current);
    };
  }, []);

  // Handle selection changes with unsaved changes warning
  const handleClassChange = async (newClassId: string) => {
    if (hasUnsavedChanges()) {
      await handleSaveAll();
    }
    setSelectedClassId(newClassId);
  };

  const handleSubjectChange = async (newSubjectId: string) => {
    if (hasUnsavedChanges()) {
      await handleSaveAll();
    }
    setSelectedSubjectId(newSubjectId);
  };

  const handleExamChange = async (newExamId: string) => {
    if (hasUnsavedChanges()) {
      await handleSaveAll();
    }
    setSelectedExamId(newExamId);
    // Do not auto-select a subject; keep it empty to avoid transient invalid states
    setSelectedSubjectId('');
    // Proactively set class to 'all' so teacher sees students immediately after choosing exam
    if (!selectedClassId) setSelectedClassId('all');
  };

  // Autosave with debounce when there are changes and selections are valid
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!selectedExamId || !selectedSubjectId || !selectedClassId) return;
    if (saving) return;
    if (!hasUnsavedChanges()) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveAll();
    }, 1200);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [studentRows, selectedExamId, selectedSubjectId, selectedClassId, saving, handleSaveAll, hasUnsavedChanges]);

  // Section 3: Graph Data
  // Drawer panel state
  const [panelStudent, setPanelStudent] = React.useState<StudentData | null>(null);
  const [panelClassOverallAvg, setPanelClassOverallAvg] = React.useState<number | null>(null);

  // Visible rows based on search (map indexes back to original array)
  const visibleRows: StudentRowWithIndex[] = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let base: StudentRowWithIndex[] = studentRows.map((r, idx) => ({ ...r, _idx: idx }));
    if (selectedSubjectId) {
      base = base.filter((row) => !row.optedOut);
    }
    if (q) {
      base = base.filter(r => (r.name || '').toLowerCase().includes(q));
    }
    if (sortBy.key && sortBy.dir) {
      const dirMul = sortBy.dir === 'asc' ? 1 : -1;
      const gradeOrder = ['A+','A','A-','B+','B','B-','C+','C','C-','D','E','F','G','TH'];
      base = [...base].sort((a, b) => {
        if (sortBy.key === 'name') {
          const comp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
          return dirMul * comp;
        }
        if (sortBy.key === 'missing') {
          const getMissing = (s: StudentRow) => (missingByStudent.get(s.id)?.length || 0);
          const comp = getMissing(a) - getMissing(b);
          return dirMul * comp;
        }
        if (sortBy.key === 'mark') {
          const getVal = (s: StudentRow) => {
            if (selectedSubjectId) {
              const v = parseFloat(String(s.mark));
              return Number.isFinite(v) ? v : NaN;
            }
            const agg = aggregateByStudent.get(s.id)?.avg;
            return typeof agg === 'number' ? agg : NaN;
          };
          const aVal = getVal(a);
          const bVal = getVal(b);
          const aValid = Number.isFinite(aVal);
          const bValid = Number.isFinite(bVal);
          if (!aValid && !bValid) return 0;
          if (!aValid || !bValid) {
            if (sortBy.dir === 'asc') return !aValid ? -1 : 1;
            return !aValid ? 1 : -1;
          }
          const comp = aVal - bVal;
          return dirMul * comp;
        }
        if (sortBy.key === 'grade') {
          if (!selectedSubjectId) {
            // For aggregated (no subject selected), sort by RPC-backed grade summary
            const scoreSummary = (s: StudentRow) => {
              const rows = gradeSummaryMap.get(s.id) || [];
              const order = ['A+','A','A-','B+','B','C+','C','D','E','G'] as const;
              const counts = new Map<string, number>();
              rows.forEach(r => counts.set(r.grade, r.cnt));
              let score = 0;
              for (let i = 0; i < order.length; i++) {
                const g = order[i] as string;
                const c = counts.get(g) || 0;
                score += (order.length - i) * c;
              }
              return score;
            };
            const aVal = scoreSummary(a);
            const bVal = scoreSummary(b);
            const comp = aVal - bVal;
            return dirMul * comp;
          }
          const idx = (g: string) => {
            const up = (g || '').toUpperCase();
            const i = gradeOrder.indexOf(up);
            return i === -1 ? gradeOrder.length + 1 : i;
          };
          const comp = idx(a.grade) - idx(b.grade);
          return dirMul * comp;
        }
        return 0;
      });
    }
    if (!selectedSubjectId && showOnlyMissing) {
      base = base.filter(r => (missingByStudent.get(r.id)?.length || 0) > 0);
    }
    return base;
  }, [studentRows, searchQuery, sortBy, aggregateByStudent, selectedSubjectId, showOnlyMissing, missingByStudent, gradeSummaryMap]);

  const avgConduct: Record<string, number> = {};
  conductCategories.forEach((cat) => {
    const vals = visibleRows.map((s) => {
      const score = parseFloat(s.conduct[cat.key]) || 0;
      // Normalize to percentage based on max score
      return cat.maxScore > 0 ? (score / cat.maxScore) * 100 : 0;
    });
    avgConduct[cat.label] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar programScope={programScope} />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Exams</p>
            <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">Teacher exam dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Manage student exam results and conduct assessments.</p>
          </header>

          <div className="flex flex-col gap-6">
        {/* Section 1: Pickers */}
        <Card className="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <CardContent className="flex flex-col gap-4 px-6 py-6">
            {/* Step Progress Indicator */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <span>
                    Step {!selectedExamId ? '1' : (!selectedClassId || selectedClassId === '') ? '2' : !selectedSubjectId ? '3' : '4'} of 4:
                    {!selectedExamId && ` Select an ${assessmentType.toLowerCase()}`}
                    {selectedExamId && (!selectedClassId || selectedClassId === '') && ' Choose a class'}
                    {selectedExamId && selectedClassId && selectedClassId !== '' && !selectedSubjectId && ' Pick a subject'}
                    {selectedExamId && selectedClassId && selectedSubjectId && ' Ready to enter marks!'}
                  </span>
                </div>
                {selectedExamId && (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    Roster: {rosterSource === 'snapshot' ? 'Historical' : 'Current'}
                  </span>
                )}
              </div>
            </div>

            {/* Removed: No Exams Warning to prevent flash on initial load */}

            {/* Deprecated: Invalid combination banner removed by request */}

            {/* Redesigned Picker Section */}
            <div className="mb-4 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50/60 px-6 py-5 md:flex-row md:flex-wrap md:items-end md:gap-6">
              {/* Assessment Type Toggle */}
              <div className="flex min-w-[120px] flex-col">
                <label className="mb-1 text-xs font-medium text-slate-500">Assessment Type</label>
                <div className="inline-flex items-center rounded-full bg-slate-100 p-1">
                  <button
                    type="button"
                    className={`rounded-full px-4 py-1 text-xs font-medium transition-all duration-150 ${assessmentType === 'Quiz' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    onClick={() => setAssessmentType('Quiz')}
                    aria-pressed={assessmentType === 'Quiz'}
                  >
                    Quiz
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-4 py-1 text-xs font-medium transition-all duration-150 ${assessmentType === 'Exam' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    onClick={() => setAssessmentType('Exam')}
                    aria-pressed={assessmentType === 'Exam'}
                  >
                    Exam
                  </button>
                </div>
              </div>
              {/* Assessment Dropdown - FIRST */}
              <div className="flex min-w-[180px] flex-col">
                <label className="mb-1 text-xs font-medium text-slate-500" htmlFor="assessment-picker">{assessmentType}</label>
                <div className="flex items-center gap-2">
                  <select
                    id="assessment-picker"
                    value={selectedExamId}
                    onChange={e => handleExamChange(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                  <option value="">Select {assessmentType}</option>
                    {exams.filter(exam => {
                      const isQuiz = exam.type && exam.type.toLowerCase() === 'quiz';
                      return (assessmentType === 'Quiz') === isQuiz;
                    }).map(assess => (
                      <option key={assess.id} value={assess.id}>{assess.name}</option>
                    ))}
                  </select>
                  {assessmentType === 'Quiz' && (
                    <button
                      type="button"
                      className="ml-1 rounded-full border border-slate-900/20 px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      onClick={() => alert('Create Quiz - not implemented')}
                    >
                      + Create Quiz
                    </button>
                  )}
                </div>
              </div>
              {/* Class Picker - SECOND */}
              <div className="flex flex-col min-w-[120px]">
                <label className="mb-1 text-xs font-medium text-slate-500" htmlFor="class-picker">Class</label>
                <select
                  id="class-picker"
                  value={selectedClassId}
                  onChange={e => handleClassChange(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  disabled={!selectedExamId}
                >
                  <option value="">Select Class</option>
                  <option value="all">{totalRosterCount ? `All Classes (${totalRosterCount})` : 'All Classes'}</option>
                  {classesForUI.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {(() => {
                        const count = classRosterMap.get(cls.id)?.length;
                        return count ? `${cls.name} (${count})` : cls.name;
                      })()}
                    </option>
                  ))}
                </select>
              </div>
              {/* Subject Picker - THIRD */}
              <div className="flex flex-col min-w-[140px]">
                <label className="mb-1 text-xs font-medium text-slate-500" htmlFor="subject-picker">Subject</label>
                <select
                  id="subject-picker"
                  value={selectedSubjectId}
                  onChange={e => handleSubjectChange(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  disabled={!selectedClassId}
                >
                  <option value="">Select Subject</option>
                  {subjectsForUI.map(subj => {
                    const c = subjectCompletion.get(subj.id);
                    const label = c ? `${subj.name} (${c.completed}/${c.total})` : subj.name;
                    return (
                      <option key={subj.id} value={subj.id}>{label}</option>
                    );
                  })}
                </select>
              </div>

              {/* Right side spacer (button removed) */}
              <div className="w-full md:flex-1" />
            </div>
            {/* Subject Completion Pills (when exam selected) */}
            {selectedExamId && subjectsForUI.length > 0 && (
              <div className="flex gap-2 flex-wrap items-center mb-2">
                {subjectsForUI.map((s) => {
                  const c = subjectCompletion.get(s.id) || { completed: 0, total: studentRows.length, th: 0 };
                  const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
                  const color = pct === 100 ? 'bg-green-100 text-green-800 border-green-200' : pct === 0 ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200';
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedSubjectId(s.id); if (c.completed < c.total) setShowOnlyMissing(true); }}
                      className={`px-2 py-1 text-xs rounded-full border ${color}`}
                      title={`${s.name}: ${c.completed}/${c.total} completed${c.th ? ` • TH: ${c.th}` : ''}`}
                    >
                      {s.name} {c.completed}/{c.total}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedClassId && selectedClassId !== 'all' && (
              <div className="mb-4 rounded-2xl border border-slate-100 bg-white/80 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Class roster</p>
                  {selectedClassRoster.length > 0 && (
                    <span className="text-[11px] font-medium text-slate-500">
                      {selectedClassRoster.length} {selectedClassRoster.length === 1 ? 'student' : 'students'}
                    </span>
                  )}
                </div>
                {selectedClassRoster.length > 0 ? (
                  <div className="mt-3 max-h-56 overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {selectedClassRoster.map((student) => (
                        <span
                          key={student.id}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                        >
                          {student.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    No roster data available for {selectedClassName || 'this class'}.
                  </p>
                )}
              </div>
            )}

            {/* Search and Missing toggle */}
            <div className="w-full flex flex-col md:flex-row md:items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students..."
                className="flex-1 border rounded px-3 py-2 text-sm"
                disabled={!selectedExamId}
                aria-label="Search students"
              />
              {!selectedSubjectId && selectedExamId && (
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="h-4 w-4" checked={showOnlyMissing} onChange={(e) => setShowOnlyMissing(e.target.checked)} />
                  <span>Show only students with missing subjects</span>
                </label>
              )}
            </div>

            <Portal>
              {toast && (
                <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4">
                  <div className={`rounded-full px-4 py-2 shadow-md text-sm ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.message}
                  </div>
                </div>
              )}
            </Portal>
            <Portal>
              {saveIndicator !== 'idle' && (
                <div className="pointer-events-none fixed bottom-4 right-4 z-[110]">
                  <div className={`rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${
                    saveIndicator === 'saving'
                      ? 'border-slate-300 bg-white text-slate-700'
                      : saveIndicator === 'saved'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                    {saveIndicator === 'saving' ? 'Saving…' : saveIndicator === 'saved' ? 'Saved' : 'Save failed'}
                  </div>
                </div>
              )}
            </Portal>
            {/* No Students Message */}
            {visibleRows.length === 0 && selectedExamId && selectedSubjectId && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center mb-4">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">No Students Found</h3>
                <p className="text-gray-500">
                  {searchQuery.trim() ? 'No students match your search.' : (
                    selectedClassId === 'all' 
                      ? 'No students are enrolled in any class for this exam.'
                      : `No students are enrolled in ${classes.find(c => c.id === selectedClassId)?.name}.`
                  )}
                </p>
              </div>
            )}

            {/* Section 2: Editable Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full border mt-4 bg-white rounded-md">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-3 py-2 text-left">No</th>
                    <th className="px-3 py-2 text-left select-none">
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                        onClick={() => toggleSort('name')}
                        role="button"
                        aria-label="Sort by student name"
                        title="Sort by student name"
                      >
                        <span>Name</span>
                        <span className="ml-1 flex flex-col">
                          <ChevronUp
                            className={`w-3 h-3 ${sortBy.key === 'name' && sortBy.dir === 'asc' ? 'text-blue-600' : 'text-gray-300'}`}
                          />
                          <ChevronDown
                            className={`w-3 h-3 -mt-1 ${sortBy.key === 'name' && sortBy.dir === 'desc' ? 'text-blue-600' : 'text-gray-300'}`}
                          />
                        </span>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left select-none">
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                        onClick={() => toggleSort(selectedSubjectId ? 'mark' : 'missing')}
                        role="button"
                        aria-label={selectedSubjectId ? 'Sort by mark' : 'Sort by missing count'}
                        title={selectedSubjectId ? 'Sort by mark' : 'Sort by missing count'}
                      >
                        <span>{selectedSubjectId ? 'Mark (%)' : 'Completion'}</span>
                        <span className="ml-1 flex flex-col">
                          <ChevronUp
                            className={`w-3 h-3 ${(selectedSubjectId ? sortBy.key === 'mark' : sortBy.key === 'missing') && sortBy.dir === 'asc' ? 'text-blue-600' : 'text-gray-300'}`}
                          />
                          <ChevronDown
                            className={`w-3 h-3 -mt-1 ${(selectedSubjectId ? sortBy.key === 'mark' : sortBy.key === 'missing') && sortBy.dir === 'desc' ? 'text-blue-600' : 'text-gray-300'}`}
                          />
                        </span>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left select-none">
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                        onClick={() => toggleSort('grade')}
                        role="button"
                        aria-label="Sort by grade"
                        title="Sort by grade"
                      >
                        <span>{selectedSubjectId ? 'Grade' : 'Grade Summary'}</span>
                        <span className="ml-1 flex flex-col">
                          <ChevronUp
                            className={`w-3 h-3 ${sortBy.key === 'grade' && sortBy.dir === 'asc' ? 'text-blue-600' : 'text-gray-300'}`}
                          />
                          <ChevronDown
                            className={`w-3 h-3 -mt-1 ${sortBy.key === 'grade' && sortBy.dir === 'desc' ? 'text-blue-600' : 'text-gray-300'}`}
                          />
                        </span>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left">Conduct</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((student, displayIdx) => {
                    const idx = student._idx; // original index in studentRows
                    const expanded = expandedRows.includes(idx);
                    // Calculate weighted average conduct score
                    const totalScore = conductCategories.reduce((sum, cat) => sum + (parseFloat(student.conduct[cat.key]) || 0), 0);
                    const totalMaxScore = conductCategories.reduce((sum, cat) => sum + cat.maxScore, 0);
                    const avgConduct = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
                    return (
                      <React.Fragment key={student.id}>
                        <tr className="border-b" onClick={async () => {
                          const classIdForStudent = student.classId && student.classId !== 'all'
                            ? String(student.classId)
                            : selectedClassId;
                          const clsName = classes.find(c => c.id === classIdForStudent)?.name || '';
                          const conductValues = {
                            discipline: parseFloat(student.conduct.discipline) || 0,
                            effort: parseFloat(student.conduct.effort) || 0,
                            participation: parseFloat(student.conduct.participation) || 0,
                            motivationalLevel: parseFloat(student.conduct.motivational_level) || 0,
                            character: parseFloat(student.conduct.character_score) || 0,
                            leadership: parseFloat(student.conduct.leadership) || 0,
                          };
                          const hasPercentScale = Object.values(conductValues).some((value) => value > 5);
                          const normalizedConduct = hasPercentScale
                            ? {
                                discipline: conductValues.discipline / 20,
                                effort: conductValues.effort / 20,
                                participation: conductValues.participation / 20,
                                motivationalLevel: conductValues.motivationalLevel / 20,
                                character: conductValues.character / 20,
                                leadership: conductValues.leadership / 20,
                              }
                            : conductValues;
                          // Set basic info immediately
                          setPanelStudent({
                            id: student.id,
                            name: student.name,
                            class: clsName,
                            classId: classIdForStudent || undefined,
                            subjects: {},
                            conduct: normalizedConduct,
                            conductPercentages: hasPercentScale ? conductValues : undefined,
                            overall: { average: Number.NaN, rank: 0, needsAttention: false },
                          });
                          try {
                            if (selectedExamId) {
                              const params = new URLSearchParams({ examId: selectedExamId });
                              if (isValidClassId(classIdForStudent)) {
                                params.append('classId', classIdForStudent);
                              } else if (isValidClassId(selectedClassId)) {
                                params.append('classId', selectedClassId);
                              }
                              const session = await supabase.auth.getSession();
                              const token = session.data.session?.access_token;
                              const res = await fetch(`/api/teacher/exams?${params.toString()}`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                              });
                              const json = await res.json();
                              const list: StudentData[] = Array.isArray(json.students)
                                ? (json.students as StudentData[])
                                : [];
                              const me = list.find((s) => String(s.id) === String(student.id));
                              const classAvg = list.length > 0 ? (list.reduce((a: number, s) => a + (Number(s?.overall?.average) || 0), 0) / list.length) : null;
                              if (me) {
                                setPanelStudent((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        class: typeof me.class === "string" ? me.class : prev.class,
                                        classId: typeof me.classId === "string" ? me.classId : prev.classId,
                                        subjects: me.subjects ?? prev.subjects,
                                        conduct: me.conduct ?? prev.conduct,
                                        conductPercentages: me.conductPercentages ?? prev.conductPercentages,
                                        overall: {
                                          average: typeof me.overall?.average === "number" ? me.overall.average : prev.overall?.average ?? 0,
                                          rank: typeof me.overall?.rank === "number" ? me.overall.rank : prev.overall?.rank ?? 0,
                                          needsAttention:
                                            typeof me.overall?.needsAttention === "boolean"
                                              ? me.overall.needsAttention
                                              : prev.overall?.needsAttention ?? false,
                                        },
                                      }
                                    : prev
                                );
                              }
                              setPanelClassOverallAvg(classAvg);
                            }
                          } catch (e) {
                            console.warn('Failed to load overall/class avg for panel', e);
                            setPanelClassOverallAvg(null);
                          }
                        }}>
                          <td className="px-3 py-2">{displayIdx + 1}</td>
                          <td className="px-3 py-2">{student.name}</td>
                          <td className="px-3 py-2">
                            {selectedSubjectId ? (
                              <div className="relative inline-block">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                              <input
                                type="text"
                                className="w-16 border rounded pl-5 pr-2 py-1 text-right"
                                value={student.mark}
                                onChange={(e) => handleMarkChange(idx, e.target.value)}
                                onPaste={(e) => handleMarkPasteFromInput(e, displayIdx)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder=""
                                disabled={!!student.isAbsent || student.optedOut}
                              />
                            </div>
                            ) : (
                              <div className="text-sm">
                                {subjectsForUI.length > 0 ? (
                                  (() => {
                                    const total = subjectsForUI.length;
                                    const missing = missingByStudent.get(student.id) || [];
                                    // Align with admin: completed is total subjects minus missing (including TH/N/A)
                                    const completed = total - missing.length;
                                    const totalSubjects = (student as unknown as { _totalSubjects?: number })._totalSubjects ?? total;
                                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                                    const barColor = pct === 100 ? 'bg-green-500' : pct === 0 ? 'bg-red-500' : 'bg-amber-500';
                                    return (
                                      <div>
                                        <div className="h-2 w-28 bg-gray-200 rounded overflow-hidden mx-auto">
                                          <div className={`h-2 ${barColor}`} style={{ width: `${pct}%` }}></div>
                                        </div>
                                        <div className="text-center mt-1 text-xs text-gray-700">{completed}/{totalSubjects}</div>
                                        {missing.length > 0 && (
                                          <div className="mt-1 flex flex-wrap gap-1 justify-center">
                                            {missing.slice(0,3).map((sid) => {
                                              const name = subjectsForUI.find(s => s.id === sid)?.name || sid;
                                              return <span key={sid} className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-800 border border-red-200">{name}</span>;
                                            })}
                                            {missing.length > 3 && (
                                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-700 border border-gray-200">+{missing.length-3} more</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div className="text-center text-gray-400">—</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {selectedSubjectId ? (
                              student.optedOut ? (
                                <span className="text-gray-700">N/A</span>
                              ) : student.isAbsent ? (
                                <span className="text-gray-700">TH</span>
                              ) : student.grade ? (
                                <span>{student.grade}</span>
                              ) : (Number.isFinite(parseFloat(student.mark)) ? (
                                <span className="text-gray-500" title="Grade will be computed after save or is not defined for this score in the selected grading system.">N/A</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              ))
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {(() => {
                                  const rows = gradeSummaryMap.get(student.id) || [];
                                  // Sort by preferred grade order when present; unknown grades after
                                  const orderIndex = (g: string) => {
                                    const order = ['A+','A','A-','B+','B','C+','C','D','E','G'] as const;
                                    const idx = (order as readonly string[]).indexOf(g);
                                    return idx === -1 ? 999 : idx;
                                  };
                                  const sorted = [...rows].sort((a, b) => orderIndex(a.grade) - orderIndex(b.grade));
                                  const total = sorted.reduce((s, r) => s + (r.cnt || 0), 0);
                                  const tooltipFor = (grade: string) => {
                                    const names = gradeSubjectsMap.get(student.id)?.[grade] || [];
                                    return names.length ? names.join(", ") : "";
                                  };
                                  return (
                                    <>
                                      {sorted.length ? (
                                        sorted.map(({ grade, cnt }) => (
                                          <span
                                            key={grade}
                                            className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800 border border-gray-200"
                                            title={tooltipFor(grade)}
                                          >
                                            {grade}: {cnt}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                                        Total: {total}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); handleExpand(idx); }}
                              aria-label={expanded ? "Hide Conduct" : "Show Conduct"}
                            >
                              {expanded ? <ChevronUp /> : <ChevronDown />}
                            </Button>
                            <span className="ml-2">{avgConduct ? avgConduct.toFixed(1) : "-"}%</span>
                          </td>
                          <td className="px-3 py-2">
                            {selectedSubjectId ? (
                              <div className="flex items-center gap-3 text-sm">
                                <label className="inline-flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={!!student.isAbsent}
                                    onChange={(e) => handleAbsentToggle(idx, e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={student.optedOut}
                                  />
                                  <span>Absent</span>
                                </label>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-muted/40">
                            <td colSpan={6} className="px-3 py-2">
                              <ConductEditor
                                examId={selectedExamId}
                                studentId={student.id}
                                subjectId={selectedSubjectId || null}
                                mode={selectedSubjectId ? 'perSubject' : 'override'}
                                onSummaryChange={(summary) => handleConductSummaryUpdate(student.id, summary)}
                                showToast={showToast}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Section 3: Graphs */}
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card className="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                <CardContent className="p-6">
                  <h4 className="mb-2 text-base font-semibold text-slate-900">Marks Overview</h4>
                  <p className="text-sm text-slate-500">
                    Charts are temporarily disabled for the teacher dashboard.
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                <CardContent className="p-6">
                  <h4 className="mb-2 text-base font-semibold text-slate-900">Class Conduct Radar</h4>
                  <p className="text-sm text-slate-500">
                    Charts are temporarily disabled for the teacher dashboard.
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
          </div>
        </div>
      </main>
      {/* Drawer */}
      <StudentDetailsPanelTeacher
        student={panelStudent}
        onClose={() => setPanelStudent(null)}
        examId={selectedExamId}
        classId={panelStudent?.classId || selectedClassId}
        selectedExamName={exams.find(e => String(e.id) === String(selectedExamId))?.name}
        classOverallAvg={panelClassOverallAvg ?? undefined}
      />
    </div>
  );
}

export default function TeacherExamDashboard() {
  const router = useRouter();
  const { programScope, loading: programScopeLoading } = useProgramScope({ role: "teacher" });

  React.useEffect(() => {
    if (!programScopeLoading && programScope === "online") {
      router.replace("/teacher");
    }
  }, [programScope, programScopeLoading, router]);

  if (programScopeLoading || programScope === "online") {
    return null;
  }

  return <TeacherExamDashboardContent programScope={programScope} />;
}
type StudentRosterItem = { id: string; name: string; class_id: string | null };
type StudentRowWithIndex = StudentRow & { _idx: number };
