"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronDown, ChevronUp } from "lucide-react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";

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

function calculateGrade(mark: number | string): string {
  if (mark === "TH" || mark === "th" || mark === "Absent" || mark === "absent") return "TH";
  const m = typeof mark === "string" ? parseFloat(mark) : mark;
  if (isNaN(m)) return "";
  if (m >= 90) return "A+";
  if (m >= 80) return "A";
  if (m >= 70) return "A-";
  if (m >= 65) return "B+";
  if (m >= 60) return "B";
  if (m >= 55) return "C+";
  if (m >= 50) return "C";
  if (m >= 45) return "D";
  if (m >= 40) return "E";
  if (m < 40) return "G";
  return "";
}

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

  // Defaults when metadata loaded
  React.useEffect(() => {
    if (classes.length && !selectedClassId) setSelectedClassId(classes[0].id);
  }, [classes]);
  React.useEffect(() => {
    if (subjects.length && !selectedSubjectId) setSelectedSubjectId(subjects[0].id);
  }, [subjects]);

  // Compute assessment list from metadata
  const assessmentList = React.useMemo(() => {
    if (!selectedClassId || !selectedSubjectId) return [] as { id: string; name: string }[];
    const isQuiz = assessmentType === 'Quiz';
    const list: { id: string; name: string }[] = [];
    for (const ex of exams) {
      const typeIsQuiz = typeof ex?.type === 'string' && ex.type.toLowerCase() === 'quiz';
      if (isQuiz !== typeIsQuiz) continue;
      const hasClass = (ex.exam_classes || []).some(ec => ec?.classes?.id === selectedClassId);
      const hasSubject = (ex.exam_subjects || []).some(es => es?.subjects?.id === selectedSubjectId);
      if (hasClass && hasSubject) list.push({ id: ex.id, name: ex.name });
    }
    return list;
  }, [assessmentType, exams, selectedClassId, selectedSubjectId]);

  // Keep selected exam consistent
  React.useEffect(() => {
    setSelectedExamId(assessmentList[0]?.id || "");
  }, [assessmentList]);

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

  // Load students, marks and current teacher conduct for selections
  React.useEffect(() => {
    if (!selectedClassId || !selectedSubjectId) return;
    (async () => {
      // Students in class
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, name')
        .eq('class_id', selectedClassId);
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
          conduct: c
            ? (Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as Record<ConductKey, string>)
            : emptyConduct,
        };
      });
      setStudentRows(rows);
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
        grade: calculateGrade(value),
      };
      return updated;
    });
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
  };
  const handleExpand = (idx: number) => {
    setExpandedRows((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

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

      // Upsert exam_results
      const examRows = studentRows
        .map((r) => {
          const mark = parseFloat(r.mark);
          if (isNaN(mark)) return null;
          return {
            exam_id: selectedExamId,
            student_id: r.id,
            subject_id: selectedSubjectId,
            mark,
            grade: calculateGrade(mark) || null,
          };
        })
        .filter(Boolean) as any[];

      if (examRows.length > 0) {
        const { error: er } = await supabase.from('exam_results').upsert(examRows);
        if (er) throw er;
      }

      // Upsert conduct_entries for current teacher
      if (!userId) throw new Error('No user');
      const conductRows = studentRows
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
            const value = parseFloat(r.conduct[cat.key]) || 0;
            parsed[cat.key] = Math.min(cat.maxScore, Math.max(0, value));
          });
          // Only submit if at least one field was provided
          const anyProvided = Object.values(parsed).some((v) => v > 0);
          if (!anyProvided) return null;
          return {
            exam_id: selectedExamId,
            student_id: r.id,
            teacher_id: userId,
            ...parsed,
          };
        })
        .filter(Boolean) as any[];

      if (conductRows.length > 0) {
        const { error: cr } = await supabase
          .from('conduct_entries')
          .upsert(conductRows);
        if (cr) throw cr;
      }

      setStatusMsg('Saved');
    } catch (e: any) {
      console.error(e);
      setStatusMsg(e?.message || 'Failed to save');
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
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Navbar */}
      <nav className="bg-white shadow flex items-center px-4 py-2 gap-4">
        <span className="font-bold text-lg">Teacher Dashboard</span>
        <div className="ml-4 flex gap-2">
          <a 
            href="/teacher" 
            className="px-3 py-1 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            Hafazan
          </a>
          <a 
            href="/teacher/exam" 
            className="px-3 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-700"
          >
            Exam
          </a>
        </div>
      </nav>
      {/* Main Content */}
      <main className="flex-1 p-4 flex flex-col gap-6 max-w-5xl mx-auto w-full">
        {/* Section 1: Pickers */}
        <Card>
          <CardContent className="py-6 flex flex-col gap-4">
            {/* Redesigned Picker Section */}
            <div className="bg-white rounded-lg shadow-sm px-6 py-4 flex flex-col md:flex-row md:items-end gap-4 md:gap-6 border mb-4">
              {/* Class Picker */}
              <div className="flex flex-col min-w-[120px]">
                <label className="text-xs font-medium mb-1" htmlFor="class-picker">Class</label>
                <select
                  id="class-picker"
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-primary"
                >
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              {/* Subject Picker */}
              <div className="flex flex-col min-w-[140px]">
                <label className="text-xs font-medium mb-1" htmlFor="subject-picker">Subject</label>
                <select
                  id="subject-picker"
                  value={selectedSubjectId}
                  onChange={e => setSelectedSubjectId(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-primary"
                  disabled={!selectedClassId}
                >
                  {subjects.map(subj => (
                    <option key={subj.id} value={subj.id}>{subj.name}</option>
                  ))}
                </select>
              </div>
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
              {/* Assessment Dropdown */}
              <div className="flex flex-col min-w-[180px]">
                <label className="text-xs font-medium mb-1" htmlFor="assessment-picker">{assessmentType}</label>
                <div className="flex gap-2 items-center">
                  <select
                    id="assessment-picker"
                    value={selectedExamId}
                    onChange={e => setSelectedExamId(e.target.value)}
                    className="border rounded px-3 py-2 text-sm focus:outline-primary"
                    disabled={!selectedSubjectId}
                  >
                    {assessmentList.map(assess => (
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

              {/* Save Button */}
              <div className="flex-1 flex justify-end items-end">
                <Button onClick={handleSaveAll} disabled={saving || !selectedExamId || !selectedSubjectId}>
                  {saving ? 'Saving...' : 'Save All'}
                </Button>
              </div>
            </div>
            {statusMsg && (
              <div className="text-sm text-gray-600">{statusMsg}</div>
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
                    <th className="px-3 py-2"></th>
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
                            <input
                              type="text"
                              className="w-16 border rounded px-2 py-1 text-right"
                              value={student.mark}
                              onChange={(e) => handleMarkChange(idx, e.target.value)}
                              placeholder="%"
                            />
                          </td>
                          <td className="px-3 py-2">{student.grade}</td>
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
                          <td></td>
                        </tr>
                        {expanded && (
                          <tr className="bg-muted/40">
                            <td colSpan={6} className="px-3 py-2">
                              <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1">
                                  <h4 className="font-semibold mb-2">Conduct Breakdown</h4>
                                  <ul className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                    {conductCategories.map((cat) => (
                                      <li key={cat.key} className="flex items-center gap-2">
                                        <span className="font-medium w-32">{cat.label}:</span>
                                        <input
                                          type="text"
                                          className="w-16 border rounded px-2 py-1 text-right"
                                          value={student.conduct[cat.key]}
                                          onChange={(e) => handleConductChange(idx, cat.key, e.target.value)}
                                          placeholder={`/${cat.maxScore}`}
                                          max={cat.maxScore}
                                        />
                                        <span className="text-xs text-gray-500">/{cat.maxScore}</span>
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
      </main>
    </div>
  );
}
