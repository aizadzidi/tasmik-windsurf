"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronDown, ChevronUp, Info, Users } from "lucide-react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/components/Navbar";
import { getGradingScale, computeGrade, type GradingScale } from "@/lib/gradingUtils";
import ConductEditor from "@/components/teacher/ConductEditor";
import type { ConductSummary } from "@/data/conduct";
import { fetchGradeSummary } from "@/lib/db/exams";
import type { GradeSummaryRow } from "@/lib/db/exams";
import StudentDetailsPanelTeacher from "@/components/teacher/StudentDetailsPanelTeacher";

// Dynamically import charts to avoid SSR issues
const LineChart = dynamic(() => import("@/components/teacher/ExamLineChart"), { ssr: false });
const RadarChart = dynamic(() => import("@/components/teacher/ExamRadarChart"), { ssr: false });

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
interface ExamItem {
  id: string;
  name: string;
  type: string;
  exam_classes?: { conduct_weightage: number; classes: { id: string; name: string } }[];
  exam_subjects?: { subjects: { id: string; name: string } }[];
}

type StudentRow = {
  id: string;
  name: string;
  mark: string;
  grade: string;
  conduct: Record<ConductKey, string>;
  isAbsent?: boolean;
  optedOut?: boolean;
};

export default function TeacherExamDashboard() {
  const [userId, setUserId] = React.useState<string>("");
  const [classes, setClasses] = React.useState<ClassItem[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectItem[]>([]);
  const [exams, setExams] = React.useState<ExamItem[]>([]);
  const [conductCriterias, setConductCriterias] = React.useState<ConductCriteria[]>([]);
  const [gradingScale, setGradingScale] = React.useState<GradingScale | null>(null);

  const [selectedClassId, setSelectedClassId] = React.useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>("");
  const [assessmentType, setAssessmentType] = React.useState<"Exam" | "Quiz">("Exam");
  const [selectedExamId, setSelectedExamId] = React.useState<string>("");

  const [studentRows, setStudentRows] = React.useState<StudentRow[]>([]);
  const [expandedRows, setExpandedRows] = React.useState<number[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  // RPC-backed grade summary per student (filtered to allowed subjects)
  const [gradeSummaryMap, setGradeSummaryMap] = React.useState<Map<string, Array<{ grade: string; cnt: number }>>>(new Map());
  const [gradeSubjectsMap, setGradeSubjectsMap] = React.useState<Map<string, Record<string, string[]>>>(new Map());
  const [loadingGradeSummary, setLoadingGradeSummary] = React.useState(false);
  const [gradeSummaryError, setGradeSummaryError] = React.useState<string | null>(null);
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
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2200);
  };
  
  // Cache for unsaved data when switching subjects
  const [unsavedDataCache, setUnsavedDataCache] = React.useState<Map<string, StudentRow[]>>(new Map());
  const previousSelectionRef = React.useRef<{classId: string, subjectId: string, examId: string}>({classId: "", subjectId: "", examId: ""});
  // Baseline (initial) rows for accurate dirty detection
  const initialRowsRef = React.useRef<StudentRow[]>([]);

  // Fetch auth and base metadata
  React.useEffect(() => {
    (async () => {
      const { data: userData, error } = await supabase.auth.getUser();
      if (!error && userData.user) setUserId(userData.user.id);

      const [{ data: classesData }, { data: subjectsData }, examsResp] = await Promise.all([
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('subjects').select('id, name').order('name'),
        fetch('/api/admin/exam-metadata').then((r) => r.json()).catch((e) => { console.error('Failed to load exam metadata', e); return { exams: [] } })
      ]);
      setClasses(classesData || []);
      setSubjects(subjectsData || []);
      const allExams = examsResp?.exams || [];
      setExams(allExams);

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
  }, []);

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
      const ecs = (ex as any)?.exam_class_subjects as Array<{ classes?: { id: string }, subjects?: { id: string } }> | undefined;
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
    const ecs = (ex as any)?.exam_class_subjects as Array<{ classes?: { id: string }, subjects?: { id: string, name: string } }> | undefined;
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

  // Subject validity for current exam/class options
  const subjectIsInUI = React.useMemo(() => {
    if (!selectedSubjectId) return false;
    return subjectsForUI.some(s => s.id === selectedSubjectId);
  }, [subjectsForUI, selectedSubjectId]);

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
        (data || []).forEach((r: any) => {
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

        // Build grade -> subjects map for tooltips using allowed subjects and current exam results
        const allowedSet = new Set(allSubjectIds.map(String));
        const idToName = new Map(subjectsForUI.map(s => [String(s.id), s.name]));
        const gradeSubjectsByStudent = new Map<string, Record<string, string[]>>();
        (data || []).forEach((r: any) => {
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
  }, [selectedExamId, studentRows, subjectsForUI, subjectOptOutMap]);

  // Load RPC grade summaries for each student (filtered to allowed subjects)
  React.useEffect(() => {
    const load = async () => {
      if (!selectedExamId || !selectedClassId || studentRows.length === 0) {
        setGradeSummaryMap(new Map());
        return;
      }
      setLoadingGradeSummary(true);
      setGradeSummaryError(null);
      try {
        const entries: [string, GradeSummaryRow[]][] = await Promise.all(
          studentRows.map(async (row): Promise<[string, GradeSummaryRow[]]> => {
            try {
              const rows = await fetchGradeSummary(String(selectedExamId), String(selectedClassId), String(row.id));
              return [String(row.id), rows as GradeSummaryRow[]];
            } catch (err: any) {
              console.warn('grade summary RPC failed for student', row.id, err?.message || err);
              return [String(row.id), [] as GradeSummaryRow[]];
            }
          })
        );
        setGradeSummaryMap(new Map(entries));
      } catch (err: any) {
        setGradeSummaryError(err?.message || 'Failed to load grade summaries');
        setGradeSummaryMap(new Map());
      } finally {
        setLoadingGradeSummary(false);
      }
    };
    load();
  }, [selectedExamId, selectedClassId, studentRows]);

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
    if (!selectedClassId || !selectedExamId) return;
    
    (async () => {
      // Students in class or all students if "all" is selected
      let studentsQuery = supabase
        .from('students')
        .select('id, name, class_id');
    
      if (selectedClassId !== "all") {
        studentsQuery = studentsQuery.eq('class_id', selectedClassId);
      }
    
      const { data: studentsData } = await studentsQuery;
      let roster = studentsData || [];

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
                .select('student_id, mark, grade')
                .eq('exam_id', selectedExamId)
                .eq('subject_id', selectedSubjectId)
            : Promise.resolve({ data: [] as any[] }),
          userId
            ? supabase
                .from('conduct_entries')
                .select('student_id, discipline, effort, participation, motivational_level, character, leadership')
                .eq('exam_id', selectedExamId)
                .eq('teacher_id', userId)
            : Promise.resolve({ data: [] as any[] }),
          fetch(`/api/teacher/subject-opt-outs?${optOutQuery.toString()}`)
            .then((r) => r.json())
            .catch(() => ({ entries: [] as any[] }))
        ]);
        // Exclusions
        try {
          const json = await exclRes.json();
          const excluded: string[] = Array.isArray(json.excludedStudentIds) ? json.excludedStudentIds : [];
          const excludedSet = new Set(excluded);
          roster = roster.filter((s: any) => !excludedSet.has(String(s.id)));
        } catch {}
        // Marks
        marksByStudent = new Map<string, { mark: number | null; grade: string | null }>();
        const results = (resultsRes as any)?.data || [];
        (results || []).forEach((r: any) => {
          marksByStudent.set(String(r.student_id), { mark: r.mark, grade: r.grade });
        });
        // Conduct
        conductByStudent = new Map<string, Record<ConductKey, number>>();
        const conductEntries = (conductRes as any)?.data || [];
        (conductEntries || []).forEach((e: any) => {
          conductByStudent.set(String(e.student_id), {
            discipline: Number(e.discipline) || 0,
            effort: Number(e.effort) || 0,
            participation: Number(e.participation) || 0,
            motivational_level: Number(e.motivational_level) || 0,
            character_score: Number(e.character) || 0,
            leadership: Number(e.leadership) || 0,
          } as Record<ConductKey, number>);
        });

        const optOutEntriesRaw = Array.isArray(optOutJson?.entries) ? optOutJson.entries : [];
        const optOutMap = new Map<string, Set<string>>();
        (optOutEntriesRaw || []).forEach((entry: any) => {
          if (!entry) return;
          const sid = entry?.student_id ? String(entry.student_id) : null;
          const subId = entry?.subject_id ? String(entry.subject_id) : null;
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

      // Build rows
      const rows: StudentRow[] = roster.map((s: any) => {
        const m = marksByStudent.get(String(s.id));
        const c = conductByStudent.get(String(s.id));
        const emptyConduct = conductCategories.reduce((acc, cat) => {
          acc[cat.key] = '' as string;
          return acc;
        }, {} as Record<ConductKey, string>);
        const isOptedOut = selectedSubjectId ? optOutIdsForRows.has(String(s.id)) : false;
        return {
          id: String(s.id),
          name: s.name,
          mark: isOptedOut ? '' : (typeof m?.mark === 'number' ? String(m?.mark ?? '') : ''),
          grade: isOptedOut ? 'N/A' : (m?.grade || ''),
          isAbsent: isOptedOut ? false : (m?.grade || '').toUpperCase() === 'TH' && (m?.mark === null || m?.mark === undefined),
          optedOut: isOptedOut,
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
            // Keep cached marks and conduct if they exist
            return {
              ...freshRow,
              mark: cachedRow.mark || freshRow.mark,
              grade: cachedRow.grade || freshRow.grade,
              conduct: cachedRow.conduct,
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
  }, [selectedClassId, selectedSubjectId, selectedExamId, userId]);

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
    const orderIdxs = visibleRows.map((v) => (v as any)._idx as number);
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

    // Save shortly after paste so data isn't lost
    setTimeout(() => {
      if (!saving) {
        handleSaveAll();
      }
    }, 150);
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
    // Save immediately so a quick refresh doesn't lose the change
    setTimeout(() => {
      handleSaveAll();
    }, 100);
  };

  const handleOptOutToggle = async (idx: number, checked: boolean) => {
    if (!selectedExamId || !selectedSubjectId) return;
    const student = studentRows[idx];
    if (!student) return;
    const studentId = student.id;
    setStudentRows((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        optedOut: checked,
        isAbsent: checked ? false : updated[idx].isAbsent,
        mark: checked ? '' : '',
        grade: checked ? 'N/A' : '',
      };
      return updated;
    });

    try {
      if (checked) {
        await fetch('/api/teacher/subject-opt-outs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examId: selectedExamId, subjectId: selectedSubjectId, studentId })
        });
        await fetch('/api/teacher/exam-results', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examId: selectedExamId, subjectId: selectedSubjectId, studentIds: [studentId] })
        });
      } else {
        const params = new URLSearchParams({ examId: selectedExamId, subjectId: selectedSubjectId, studentId });
        await fetch(`/api/teacher/subject-opt-outs?${params.toString()}`, { method: 'DELETE' });
      }

      setSubjectOptOutMap((prev) => {
        const next = new Map(prev);
        const set = next.get(selectedSubjectId) ?? new Set();
        if (checked) set.add(studentId); else set.delete(studentId);
        next.set(selectedSubjectId, set);
        return next;
      });
      initialRowsRef.current = initialRowsRef.current.map((row) => (
        row.id === studentId
          ? { ...row, optedOut: checked, isAbsent: false, mark: '', grade: checked ? 'N/A' : '' }
          : row
      ));
    } catch (err) {
      console.error('Subject opt-out toggle failed', err);
      setStudentRows((prev) => {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          optedOut: !checked,
        };
        return updated;
      });
      showToast('Failed to update N/A status', 'error');
    }
  };
  const handleExpand = (idx: number) => {
    setExpandedRows((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  // Handle selection changes with unsaved changes warning
  const handleClassChange = async (newClassId: string) => {
    if (hasUnsavedChanges()) {
      await handleSaveAll();
    }
    setSelectedClassId(newClassId);
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

  // Toggle sort for a given column
  const toggleSort = (key: 'name' | 'mark' | 'grade' | 'missing') => {
    setSortBy((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: null };
    });
  };

  // Check for unsaved changes
  const hasUnsavedChanges = () => {
    if (!initialRowsRef.current || initialRowsRef.current.length === 0) return false;
    const initialMap = new Map(initialRowsRef.current.map(r => [r.id, r]));
    return studentRows.some((curr) => {
      const init = initialMap.get(curr.id);
      if (!init) return true;
      const markChanged = String(curr.mark ?? '').trim() !== String(init.mark ?? '').trim();
      if (markChanged) return true;
      const statusChanged = Boolean(curr.isAbsent) !== Boolean(init.isAbsent);
      if (statusChanged) return true;
      const optOutChanged = Boolean(curr.optedOut) !== Boolean(init.optedOut);
      if (optOutChanged) return true;
      return false;
    });
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
  }, [studentRows, selectedExamId, selectedSubjectId, selectedClassId, saving]);

  // Save all rows using new single-endpoint API
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      if (!selectedExamId || !selectedSubjectId) {
        setSaving(false);
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
          
          const mark = parseFloat(r.mark);
          if (isNaN(mark)) {
            if (statusChanged && init?.isAbsent) {
              return {
                studentId: r.id,
                mark: null,
                finalScore: null,
                isAbsent: false
              };
            }
            return null;
          }
          // Clamp to valid range to satisfy DB constraints
          const bounded = Math.max(0, Math.min(100, mark));
          
          return {
            studentId: r.id,
            mark: bounded,
            finalScore: bounded,
            isAbsent: false
          };
        })
        .filter(Boolean);

      if (examResults.length > 0) {
        // Use new single-endpoint API for atomic upsert-and-return
        const response = await fetch('/api/teacher/exam-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examId: selectedExamId,
            subjectId: selectedSubjectId,
            results: examResults
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          // Improved error reporting
          const errorMessage = data.details?.message || data.error || 'Failed to save exam results';
          const errorDetails = data.details ? 
            `Code: ${data.details.code || 'Unknown'}\nHint: ${data.details.hint || 'No additional info'}` :
            'No additional details available';
          
          showToast(`Save failed: ${errorMessage}`, 'error');
          console.error('Save error details:', data.details);
          throw new Error(`${errorMessage}\n${errorDetails}`);
        }

        // SUCCESS: Use returned data immediately (no delay needed!)
        const savedResults = data.results || [];
        if (savedResults.length > 0) {
          const byId = new Map<string, { mark: number | null; grade: string | null }>(
            savedResults.map((r: any) => [String(r.student_id), { mark: r.mark, grade: r.grade }])
          );
          
          // Atomic update with DB truth
          const updatedRows = studentRows.map(row => {
            const v = byId.get(row.id);
            if (!v) return row;
            return {
              ...row,
              mark: String(v.mark ?? ''),
              grade: String(v.grade ?? ''),
            };
          });
          
          const updatedBaseline = initialRowsRef.current.map(base => {
            const v = byId.get(base.id);
            if (!v) return base;
            return { 
              ...base, 
              mark: String(v.mark ?? ''),
              grade: String(v.grade ?? '') 
            };
          });
          
          setStudentRows(updatedRows);
          initialRowsRef.current = updatedBaseline;
        }
      }

      showToast('Saved', 'success');
      
      // Update baseline with successfully saved changes
      if (examResults.length > 0) {
        const baseMap = new Map(initialRowsRef.current.map(r => [r.id, { ...r }]));
        const markIds = new Set((examResults as any[]).map((r) => String(r.studentId)));
        studentRows.forEach((r) => {
          const base = baseMap.get(r.id);
          if (!base) return;
          if (markIds.has(r.id)) {
            base.mark = r.mark;
            base.grade = r.grade;
            base.isAbsent = r.isAbsent;
          }
        });
        initialRowsRef.current = Array.from(baseMap.values());
      }

      // Clear cache for current selection after successful save
      const currentCacheKey = `${selectedClassId}-${selectedSubjectId}-${selectedExamId}`;
      setUnsavedDataCache(prevCache => {
        const newCache = new Map(prevCache);
        newCache.delete(currentCacheKey);
        return newCache;
      });
    } catch (e: any) {
      console.error('Save error:', e);
      
      // Improved error reporting
      const errorMessage = e?.message || 'Failed to save';
      let displayMessage = errorMessage;
      
      // Handle specific error types with user-friendly messages
      if (errorMessage.includes('duplicate key')) {
        displayMessage = 'Duplicate record detected. Please refresh and try again.';
      } else if (errorMessage.includes('constraint')) {
        displayMessage = 'Database constraint violation. Please check your data.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        displayMessage = 'Network error. Please check your connection and try again.';
      } else if (errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
        displayMessage = 'You do not have permission to perform this action.';
      }
      
      showToast(`Save failed: ${displayMessage}`, 'error');
      
      // Log detailed error for debugging
      console.error('Detailed error info:', {
        message: e?.message,
        stack: e?.stack,
        name: e?.name,
        code: e?.code
      });
    } finally {
      setSaving(false);
    }
  };

  // Section 3: Graph Data
  // Drawer panel state
  const [panelStudent, setPanelStudent] = React.useState<any>(null);
  const [panelClassOverallAvg, setPanelClassOverallAvg] = React.useState<number | null>(null);

  // Visible rows based on search (map indexes back to original array)
  const visibleRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let base = studentRows.map((r, idx) => ({ ...r, _idx: idx } as StudentRow & { _idx: number }));
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
  }, [studentRows, searchQuery, sortBy, aggregateByStudent, selectedSubjectId, showOnlyMissing, missingByStudent]);

  const marksData = visibleRows.map((s) => ({ name: s.name, mark: parseFloat(s.mark) || 0 }));
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
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <Navbar />
      <div className="relative p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Exam Dashboard</h1>
              <p className="text-gray-600">Manage student exam results and conduct assessments</p>
            </div>
          </header>
          
          <div className="flex flex-col gap-6">
        {/* Section 1: Pickers */}
        <Card>
          <CardContent className="py-6 flex flex-col gap-4">
            {/* Step Progress Indicator */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-sm text-blue-700">
                  Step {!selectedExamId ? '1' : (!selectedClassId || selectedClassId === '') ? '2' : !selectedSubjectId ? '3' : '4'} of 4: 
                  {!selectedExamId && ` Select an ${assessmentType.toLowerCase()}`}
                  {selectedExamId && (!selectedClassId || selectedClassId === '') && ' Choose a class'}
                  {selectedExamId && selectedClassId && selectedClassId !== '' && !selectedSubjectId && ' Pick a subject'} 
                  {selectedExamId && selectedClassId && selectedSubjectId && ' Ready to enter marks!'}
                </span>
              </div>
            </div>

            {/* Removed: No Exams Warning to prevent flash on initial load */}

            {/* Deprecated: Invalid combination banner removed by request */}

            {/* Redesigned Picker Section */}
            <div className="bg-white rounded-lg shadow-sm px-6 py-4 flex flex-col md:flex-row md:items-end gap-4 md:gap-6 md:flex-wrap border mb-4">
              {/* Assessment Type Toggle */}
              <div className="flex flex-col min-w-[120px]">
                <label className="text-xs font-medium mb-1">Assessment Type</label>
                <div className="flex items-center bg-gray-100 rounded-full p-1 w-fit">
                  <button
                    type="button"
                    className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors duration-150 ${assessmentType === 'Quiz' ? 'bg-primary text-white' : 'text-gray-600'}`}
                    onClick={() => setAssessmentType('Quiz')}
                    aria-pressed={assessmentType === 'Quiz'}
                  >
                    Quiz
                  </button>
                  <button
                    type="button"
                    className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors duration-150 ${assessmentType === 'Exam' ? 'bg-primary text-white' : 'text-gray-600'}`}
                    onClick={() => setAssessmentType('Exam')}
                    aria-pressed={assessmentType === 'Exam'}
                  >
                    Exam
                  </button>
                </div>
              </div>
              {/* Assessment Dropdown - FIRST */}
              <div className="flex flex-col min-w-[180px]">
                <label className="text-xs font-medium mb-1" htmlFor="assessment-picker">{assessmentType}</label>
                <div className="flex gap-2 items-center">
                  <select
                    id="assessment-picker"
                    value={selectedExamId}
                    onChange={e => handleExamChange(e.target.value)}
                    className="border rounded px-3 py-2 text-sm focus:outline-primary"
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
                      className="ml-1 px-2 py-1 border rounded text-xs text-primary border-primary hover:bg-primary/10 transition"
                      onClick={() => alert('Create Quiz - not implemented')}
                    >
                      + Create Quiz
                    </button>
                  )}
                </div>
              </div>
              {/* Class Picker - SECOND */}
              <div className="flex flex-col min-w-[120px]">
                <label className="text-xs font-medium mb-1" htmlFor="class-picker">Class</label>
                <select
                  id="class-picker"
                  value={selectedClassId}
                  onChange={e => handleClassChange(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-primary"
                  disabled={!selectedExamId}
                >
                  <option value="">Select Class</option>
                  <option value="all">All Classes</option>
                  {classesForUI.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              {/* Subject Picker - THIRD */}
              <div className="flex flex-col min-w-[140px]">
                <label className="text-xs font-medium mb-1" htmlFor="subject-picker">Subject</label>
                <select
                  id="subject-picker"
                  value={selectedSubjectId}
                  onChange={e => handleSubjectChange(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-primary"
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

            {/* Toast */}
            {toast && (
              <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-md text-sm ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                {toast.message}
              </div>
            )}
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
                    const idx = (student as any)._idx as number; // original index in studentRows
                    const expanded = expandedRows.includes(idx);
                    // Calculate weighted average conduct score
                    const totalScore = conductCategories.reduce((sum, cat) => sum + (parseFloat(student.conduct[cat.key]) || 0), 0);
                    const totalMaxScore = conductCategories.reduce((sum, cat) => sum + cat.maxScore, 0);
                    const avgConduct = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
                    const agg = aggregateByStudent.get(student.id);
                    const getScoreColor = (score: number) => {
                      if (score >= 90) return 'text-green-700';
                      if (score >= 80) return 'text-blue-700';
                      if (score >= 70) return 'text-yellow-600';
                      return 'text-red-600';
                    };
                    return (
                      <React.Fragment key={student.id}>
                        <tr className="border-b" onClick={async () => {
                          const clsName = classes.find(c => c.id === selectedClassId)?.name || '';
                          // Set basic info immediately
                          setPanelStudent({
                            id: student.id,
                            name: student.name,
                            class: clsName,
                            subjects: {},
                            conduct: { discipline: 0, effort: 0, participation: 0, motivationalLevel: 0, character: 0, leadership: 0 },
                            overall: { average: 0, rank: 0, needsAttention: false },
                          });
                          try {
                            if (selectedExamId) {
                              const params = new URLSearchParams({ examId: selectedExamId });
                              if (selectedClassId) params.append('classId', selectedClassId);
                              const res = await fetch(`/api/admin/exams?${params.toString()}`);
                              const json = await res.json();
                              const list = Array.isArray(json.students) ? json.students : [];
                              const me = list.find((s: any) => String(s.id) === String(student.id));
                              const classAvg = list.length > 0 ? (list.reduce((a: number, s: any) => a + (Number(s?.overall?.average) || 0), 0) / list.length) : null;
                              if (me) {
                                setPanelStudent((prev: any) => ({
                                  ...(prev || {}),
                                  overall: me.overall || { average: 0, rank: 0, needsAttention: false },
                                }));
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
                                    const completed = total - missing.length;
                                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                                    const barColor = pct === 100 ? 'bg-green-500' : pct === 0 ? 'bg-red-500' : 'bg-amber-500';
                                    return (
                                      <div>
                                        <div className="h-2 w-28 bg-gray-200 rounded overflow-hidden mx-auto">
                                          <div className={`h-2 ${barColor}`} style={{ width: `${pct}%` }}></div>
                                        </div>
                                        <div className="text-center mt-1 text-xs text-gray-700">{completed}/{total}</div>
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
                            <div className="flex items-center gap-3 text-sm">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={!!student.isAbsent}
                                  onChange={(e) => handleAbsentToggle(idx, e.target.checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={!selectedSubjectId || student.optedOut}
                                />
                                <span>Absent</span>
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={!!student.optedOut}
                                  onChange={(e) => handleOptOutToggle(idx, e.target.checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={!selectedSubjectId}
                                />
                                <span>N/A</span>
                              </label>
                            </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Marks Overview</h4>
                  <LineChart students={marksData} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Class Conduct Radar</h4>
                  <RadarChart data={avgConduct} />
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
          </div>
        </div>
      </div>
      {/* Drawer */}
      <StudentDetailsPanelTeacher
        student={panelStudent}
        onClose={() => setPanelStudent(null)}
        examId={selectedExamId}
        classId={selectedClassId}
        selectedExamName={exams.find(e => String(e.id) === String(selectedExamId))?.name}
        classOverallAvg={panelClassOverallAvg ?? undefined}
      />
    </div>
  );
}
