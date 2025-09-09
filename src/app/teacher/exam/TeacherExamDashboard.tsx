"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronDown, ChevronUp, AlertTriangle, Info, Users, FileText, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/components/Navbar";

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

type ConductKey = 'discipline' | 'effort' | 'participation' | 'motivational_level' | 'character' | 'leadership';

// Default conduct categories (fallback)
const defaultConductCategories: { key: ConductKey; label: string }[] = [
  { key: 'discipline', label: 'Discipline' },
  { key: 'effort', label: 'Effort' },
  { key: 'participation', label: 'Participation' },
  { key: 'motivational_level', label: 'Motivational Level' },
  { key: 'character', label: 'Character' },
  { key: 'leadership', label: 'Leadership' },
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
};

export default function TeacherExamDashboard() {
  const [userId, setUserId] = React.useState<string>("");
  const [classes, setClasses] = React.useState<ClassItem[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectItem[]>([]);
  const [exams, setExams] = React.useState<ExamItem[]>([]);
  const [conductCriterias, setConductCriterias] = React.useState<ConductCriteria[]>([]);

  const [selectedClassId, setSelectedClassId] = React.useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>("");
  const [assessmentType, setAssessmentType] = React.useState<"Exam" | "Quiz">("Exam");
  const [selectedExamId, setSelectedExamId] = React.useState<string>("");

  const [studentRows, setStudentRows] = React.useState<StudentRow[]>([]);
  const [expandedRows, setExpandedRows] = React.useState<number[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string>("");
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

      const [{ data: classesData }, { data: subjectsData }] = await Promise.all([
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('subjects').select('id, name').order('name'),
      ]);
      setClasses(classesData || []);
      setSubjects(subjectsData || []);

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

      // Fetch exams metadata via local API (uses service role internally)
      try {
        const res = await fetch('/api/admin/exam-metadata');
        const json = await res.json();
        setExams(json.exams || []);
      } catch (e) {
        console.error('Failed to load exam metadata', e);
      }
    })();
  }, []);

  // Defaults when metadata loaded - now prioritize exam selection first
  React.useEffect(() => {
    if (exams.length && !selectedExamId) {
      // Auto-select the first available exam based on assessment type
      const filteredExams = exams.filter(exam => {
        const isQuiz = exam.type && exam.type.toLowerCase() === 'quiz';
        return (assessmentType === 'Quiz') === isQuiz;
      });
      if (filteredExams.length > 0) {
        setSelectedExamId(filteredExams[0].id);
      }
    }
  }, [exams, assessmentType]);
  React.useEffect(() => {
    if (classes.length && !selectedClassId && selectedExamId) setSelectedClassId("all");
  }, [classes, selectedExamId]);
  React.useEffect(() => {
    if (subjects.length && !selectedSubjectId && selectedClassId) setSelectedSubjectId(subjects[0].id);
  }, [subjects, selectedClassId]);

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
      const hasSubject = (ex.exam_subjects || []).some(es => es?.subjects?.id === selectedSubjectId);
      
      if (hasClass && hasSubject) list.push({ id: ex.id, name: ex.name });
    }
    return list;
  }, [assessmentType, exams, selectedClassId, selectedSubjectId]);

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

  // Compute conduct categories from dynamic criteria or use defaults
  const conductCategories = React.useMemo(() => {
    if (conductCriterias.length > 0) {
      // Map dynamic criteria to legacy format for backward compatibility
      return conductCriterias
        .slice(0, 6) // Limit to 6 criteria to match current UI
        .map((criteria, index) => {
          // Map to existing keys for backward compatibility
          const keyMap: ConductKey[] = [
            'discipline', 'effort', 'participation', 
            'motivational_level', 'character', 'leadership'
          ];
          return {
            key: keyMap[index] || 'discipline',
            label: criteria.name,
            maxScore: criteria.max_score
          };
        });
    }
    return defaultConductCategories.map(cat => ({ ...cat, maxScore: 100 }));
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
    if (!selectedClassId || !selectedSubjectId) return;
    
    (async () => {
      // Students in class or all students if "all" is selected
      let studentsQuery = supabase
        .from('students')
        .select('id, name, class_id');
      
      if (selectedClassId !== "all") {
        studentsQuery = studentsQuery.eq('class_id', selectedClassId);
      }
      
      const { data: studentsData } = await studentsQuery;
      const roster = studentsData || [];

      // Existing marks for exam+subject
      const marksByStudent = new Map<string, { mark: number | null; grade: string | null }>();
      if (selectedExamId) {
        const { data: results } = await supabase
          .from('exam_results')
          .select('student_id, mark, grade')
          .eq('exam_id', selectedExamId)
          .eq('subject_id', selectedSubjectId);
        (results || []).forEach((r: any) => {
          marksByStudent.set(String(r.student_id), { mark: r.mark, grade: r.grade });
        });
      }

      // Current teacher's conduct entries for this exam
      const conductByStudent = new Map<string, Record<ConductKey, number>>();
      if (selectedExamId && userId) {
        const { data: conductEntries } = await supabase
          .from('conduct_entries')
          .select('student_id, discipline, effort, participation, motivational_level, character, leadership')
          .eq('exam_id', selectedExamId)
          .eq('teacher_id', userId);
        (conductEntries || []).forEach((e: any) => {
          conductByStudent.set(String(e.student_id), {
            discipline: Number(e.discipline) || 0,
            effort: Number(e.effort) || 0,
            participation: Number(e.participation) || 0,
            motivational_level: Number(e.motivational_level) || 0,
            character: Number(e.character) || 0,
            leadership: Number(e.leadership) || 0,
          });
        });
      }

      // Build rows
      const rows: StudentRow[] = roster.map((s: any) => {
        const m = marksByStudent.get(String(s.id));
        const c = conductByStudent.get(String(s.id));
        const emptyConduct = conductCategories.reduce((acc, cat) => {
          acc[cat.key] = '' as string;
          return acc;
        }, {} as Record<ConductKey, string>);
        return {
          id: String(s.id),
          name: s.name,
          mark: typeof m?.mark === 'number' ? String(m?.mark ?? '') : '',
          grade: m?.grade || '',
          isAbsent: (m?.grade || '').toUpperCase() === 'TH' && (m?.mark === null || m?.mark === undefined),
          conduct: c
            ? (Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])) as Record<ConductKey, string>)
            : emptyConduct,
        };
      });
      // Set baseline to fresh DB rows (not the cached/merged view)
      initialRowsRef.current = rows;
      
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
              conduct: cachedRow.conduct
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

  // Editable cell handlers
  const handleMarkChange = (idx: number, value: string) => {
    setStudentRows((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        mark: value,
        isAbsent: false,
        // Do not compute grade client-side; DB will compute after save
        grade: '',
      };
      return updated;
    });
  };
  const handleAbsentToggle = (idx: number, checked: boolean) => {
    setStudentRows((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        isAbsent: checked,
        // Clear mark when absent; set grade to TH
        mark: checked ? '' : updated[idx].mark,
        grade: checked ? 'TH' : calculateGrade(updated[idx].mark),
      };
      return updated;
    });
    // Save immediately so a quick refresh doesn't lose the change
    setTimeout(() => {
      handleSaveAll();
    }, 100);
  };
  const handleConductChange = (idx: number, key: ConductKey, value: string) => {
    setStudentRows((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        conduct: { ...updated[idx].conduct, [key]: value },
      };
      return updated;
    });
    
    // Auto-save after a short delay to prevent losing conduct changes on refresh
    setTimeout(() => {
      if (!saving && hasUnsavedChanges()) {
        handleSaveAll();
      }
    }, 500);
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
      // Compare conduct fields (string compare, trimmed)
      const conductChanged = (['discipline','effort','participation','motivational_level','character','leadership'] as ConductKey[])
        .some((key) => String(curr.conduct?.[key] ?? '').trim() !== String(init.conduct?.[key] ?? '').trim());
      return conductChanged;
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

  // Save all rows
  const handleSaveAll = async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      if (!selectedExamId || !selectedSubjectId) {
        setStatusMsg('Select class, subject, and exam first');
        setSaving(false);
        return;
      }

      // Determine changed rows compared to baseline
      const initialMap = new Map(initialRowsRef.current.map(r => [r.id, r]));
      const changedRows = studentRows.filter((r) => {
        const init = initialMap.get(r.id);
        if (!init) return true;
        const markChanged = String(r.mark ?? '').trim() !== String(init.mark ?? '').trim();
        const statusChanged = Boolean(r.isAbsent) !== Boolean(init.isAbsent);
        const conductChanged = (['discipline','effort','participation','motivational_level','character','leadership'] as ConductKey[])
          .some((key) => String(r.conduct?.[key] ?? '').trim() !== String(init.conduct?.[key] ?? '').trim());
        return markChanged || statusChanged || conductChanged;
      });

      // Upsert exam_results only for rows with mark/status changes
      const examRows = changedRows
        .map((r) => {
          const init = initialMap.get(r.id);
          const markChanged = String(r.mark ?? '').trim() !== String(init?.mark ?? '').trim();
          const statusChanged = Boolean(r.isAbsent) !== Boolean(init?.isAbsent);
          if (!markChanged && !statusChanged) return null;
          if (r.isAbsent) {
            // Persist TH/Absent: null mark + grade 'TH'
            return {
              exam_id: selectedExamId,
              student_id: r.id,
              subject_id: selectedSubjectId,
              mark: null,
              grade: 'TH',
            } as any;
          }
          const mark = parseFloat(r.mark);
          // If user unticked Absent but hasn't entered a mark yet, clear any TH row
          if (isNaN(mark)) {
            if (statusChanged && init?.isAbsent) {
              return {
                exam_id: selectedExamId,
                student_id: r.id,
                subject_id: selectedSubjectId,
                mark: null,
                grade: '',
              } as any;
            }
            return null; // otherwise keep legacy behavior
          }
          return {
            exam_id: selectedExamId,
            student_id: r.id,
            subject_id: selectedSubjectId,
            mark,
            // grade is computed in DB; omit here
          } as any;
        })
        .filter(Boolean) as any[];

      if (examRows.length > 0) {
        // Ensure we target the correct composite unique key when upserting
        // so we update existing rows instead of violating a unique constraint.
        const { error: er } = await supabase
          .from('exam_results')
          .upsert(examRows, { onConflict: 'exam_id,student_id,subject_id' });
        if (er) {
          // Fallback for older schemas that only have (exam_id, student_id) unique
          // to avoid a hard failure while migrations catch up.
          const msg = String(er.message || '');
          if (msg.includes('there is no unique or exclusion constraint matching the ON CONFLICT specification')) {
            const { error: fallbackErr } = await supabase
              .from('exam_results')
              .upsert(examRows, { onConflict: 'exam_id,student_id' });
            if (fallbackErr) {
              // Final fallback: attempt insert (may create duplicates, but avoids hard failure)
              const { error: insertErr } = await supabase.from('exam_results').insert(examRows);
              if (insertErr) throw insertErr;
            }
          } else {
            throw er;
          }
        }
      }

      // Upsert conduct_entries for current teacher
      if (!userId) throw new Error('No user');
      const conductRows = changedRows
        .map((r) => {
          const parsed: Record<ConductKey, number> = {
            discipline: 0,
            effort: 0,
            participation: 0,
            motivational_level: 0,
            character: 0,
            leadership: 0,
          };
          // Use dynamic max scores from conduct categories
          conductCategories.forEach((cat) => {
            const rawValue = r.conduct[cat.key];
            const value = rawValue === '' || rawValue === undefined || rawValue === null ? 0 : parseFloat(rawValue);
            parsed[cat.key] = Math.min(cat.maxScore, Math.max(0, isNaN(value) ? 0 : value));
          });
          // Only include if conduct actually changed vs baseline
          const init = initialMap.get(r.id);
          const conductChanged = (['discipline','effort','participation','motivational_level','character','leadership'] as ConductKey[])
            .some((key) => String(r.conduct?.[key] ?? '').trim() !== String(init?.conduct?.[key] ?? '').trim());
          // Always submit if conduct changed (even if all values are 0 - this allows clearing conduct marks)
          if (!conductChanged) return null;
          return {
            exam_id: selectedExamId,
            student_id: r.id,
            teacher_id: userId,
            ...parsed,
          };
        })
        .filter(Boolean) as any[];

      if (conductRows.length > 0) {
        // Prefer explicit conflict target for broader schema compatibility
        let { error: cr } = await supabase
          .from('conduct_entries')
          .upsert(conductRows, { onConflict: 'exam_id,student_id,teacher_id' });
        if (cr) {
          const msg = String(cr.message || '');
          if (msg.includes('there is no unique or exclusion constraint matching')) {
            // Fallback for schemas without teacher dimension in unique key
            const res2 = await supabase
              .from('conduct_entries')
              .upsert(conductRows, { onConflict: 'exam_id,student_id' });
            cr = res2.error;
          }
        }
        if (cr) {
          // Final fallback: insert to avoid hard failure; better to save something than nothing
          const { error: insertErr } = await supabase.from('conduct_entries').insert(conductRows);
          if (insertErr) throw insertErr;
        }
      }

      setStatusMsg('Saved');
      showToast('Saved', 'success');
      
      // Update baseline with successfully saved changes
      if (examRows.length > 0 || conductRows.length > 0) {
        const baseMap = new Map(initialRowsRef.current.map(r => [r.id, { ...r }]));
        const markIds = new Set((examRows as any[]).map((r) => String(r.student_id)));
        const conductIds = new Set((conductRows as any[]).map((r) => String(r.student_id)));
        studentRows.forEach((r) => {
          const base = baseMap.get(r.id);
          if (!base) return;
          if (markIds.has(r.id)) {
            base.mark = r.mark;
            base.grade = r.grade;
            base.isAbsent = r.isAbsent;
          }
          if (conductIds.has(r.id)) {
            base.conduct = { ...r.conduct };
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
      const raw = e?.message || e?.hint || (typeof e === 'string' ? e : JSON.stringify(e || {}));
      const isDuplicateExamResults = raw.includes('exam_results_exam_id_student_id_key');
      const isNoConstraint = raw.includes('no unique or exclusion constraint matching');
      if (isDuplicateExamResults) {
        const msg = 'Duplicate exam result detected. DB unique constraint may be outdated.';
        setStatusMsg(msg);
        showToast(msg, 'error');
      } else if (isNoConstraint) {
        const msg = 'Upsert failed: missing UNIQUE constraint on exam_results or conduct_entries.';
        setStatusMsg(msg);
        showToast(msg, 'error');
      } else {
        const msg = (typeof raw === 'string' && raw) ? raw : 'Failed to save';
        setStatusMsg(msg);
        showToast(msg, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // Section 3: Graph Data
  const marksData = studentRows.map((s) => ({ name: s.name, mark: parseFloat(s.mark) || 0 }));
  const avgConduct: Record<string, number> = {};
  conductCategories.forEach((cat) => {
    const vals = studentRows.map((s) => {
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

            {/* No Exams Warning */}
            {exams.filter(exam => {
              const isQuiz = exam.type && exam.type.toLowerCase() === 'quiz';
              return (assessmentType === 'Quiz') === isQuiz;
            }).length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-amber-800">No {assessmentType}s Available</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      No {assessmentType.toLowerCase()}s have been created yet.
                      <br />Contact your admin to create {assessmentType.toLowerCase()}s before you can enter marks.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* No Valid Class-Subject Combination Warning */}
            {selectedExamId && selectedClassId && selectedSubjectId && assessmentList.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-amber-800">Invalid Combination</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      The selected {assessmentType.toLowerCase()} is not available for this class-subject combination.
                      <br />Please select a different class or subject, or contact your admin.
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                  {classes.map(cls => (
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
                  {subjects.map(subj => (
                    <option key={subj.id} value={subj.id}>{subj.name}</option>
                  ))}
                </select>
              </div>

              {/* Right side spacer (button removed) */}
              <div className="w-full md:flex-1" />
            </div>
            {/* Toast */}
            {toast && (
              <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-md text-sm ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                {toast.message}
              </div>
            )}
            {/* No Students Message */}
            {studentRows.length === 0 && selectedExamId && selectedSubjectId && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center mb-4">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">No Students Found</h3>
                <p className="text-gray-500">
                  {selectedClassId === 'all' 
                    ? 'No students are enrolled in any class for this exam.'
                    : `No students are enrolled in ${classes.find(c => c.id === selectedClassId)?.name}.`
                  }
                </p>
              </div>
            )}

            {/* Section 2: Editable Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full border mt-4 bg-white rounded-md">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-3 py-2 text-left">No</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Mark (%)</th>
                    <th className="px-3 py-2 text-left">Grade</th>
                    <th className="px-3 py-2 text-left">Conduct</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((student, idx) => {
                    const expanded = expandedRows.includes(idx);
                    // Calculate weighted average conduct score
                    const totalScore = conductCategories.reduce((sum, cat) => sum + (parseFloat(student.conduct[cat.key]) || 0), 0);
                    const totalMaxScore = conductCategories.reduce((sum, cat) => sum + cat.maxScore, 0);
                    const avgConduct = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
                    return (
                      <React.Fragment key={student.id}>
                        <tr className="border-b">
                          <td className="px-3 py-2">{idx + 1}</td>
                          <td className="px-3 py-2">{student.name}</td>
                          <td className="px-3 py-2">
                            <div className="relative inline-block">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                              <input
                                type="text"
                                className="w-16 border rounded pl-5 pr-2 py-1 text-right"
                                value={student.mark}
                                onChange={(e) => handleMarkChange(idx, e.target.value)}
                                placeholder=""
                                disabled={!!student.isAbsent}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {student.isAbsent ? (
                              <span className="text-gray-700">TH</span>
                            ) : student.grade ? (
                              <span>{student.grade}</span>
                            ) : (Number.isFinite(parseFloat(student.mark)) ? (
                              <span className="text-gray-500" title="Grade will be computed after save or is not defined for this score in the selected grading system.">N/A</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            ))}
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExpand(idx)}
                              aria-label={expanded ? "Hide Conduct" : "Show Conduct"}
                            >
                              {expanded ? <ChevronUp /> : <ChevronDown />}
                            </Button>
                            <span className="ml-2">{avgConduct ? avgConduct.toFixed(1) : "-"}%</span>
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={!!student.isAbsent}
                                onChange={(e) => handleAbsentToggle(idx, e.target.checked)}
                              />
                              <span>Absent</span>
                            </label>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-muted/40">
                            <td colSpan={6} className="px-3 py-2">
                              <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1">
                                  <h4 className="font-semibold mb-2">Conduct Breakdown</h4>
                                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                    {conductCategories.map((cat) => (
                                      <li key={cat.key} className="flex items-center gap-2">
                                        <span className="font-medium w-32">{cat.label}:</span>
                                        <div className="relative">
                                          <input
                                            type="number"
                                            className="w-20 border rounded pl-6 pr-2 py-1 text-right"
                                            value={student.conduct[cat.key]}
                                            onChange={(e) => handleConductChange(idx, cat.key, e.target.value)}
                                            min={0}
                                            max={cat.maxScore}
                                            step={1}
                                          />
                                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                  <RadarChart data={Object.fromEntries(
                                    Object.entries(student.conduct).map(([k, v]) => [k, parseFloat(v as string) || 0])
                                  )} />
                                </div>
                              </div>
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
    </div>
  );
}
