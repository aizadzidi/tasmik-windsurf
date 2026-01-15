"use client";
import React from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabaseClient";
import StudentTable, { type StudentData } from "@/components/admin/exam/StudentTable";
import StudentDetailsPanel from "@/components/exam/StudentDetailsPanelShared";

type Child = { id: string; name: string; class_id: string | null };
type MetaExam = {
  id: string;
  name: string;
  released?: boolean;
  exam_subjects?: { subjects?: { id: string; name: string } }[];
  exam_classes?: { classes?: { id: string; name: string } }[];
};

type ExamMetadataResponse = {
  exams?: MetaExam[];
};

type ExamStudentSummary = {
  id?: string | null;
  name?: string | null;
  class?: string | null;
  classId?: string | null;
  subjects?: Record<string, {
    score?: number;
    trend?: number[];
    grade?: string;
    exams?: { name: string; score: number }[];
    optedOut?: boolean;
  }>;
  conduct?: StudentData['conduct'];
  conductPercentages?: StudentData['conductPercentages'];
  overall?: StudentData['overall'];
};

type ExamSummaryResponse = {
  subjects?: string[];
  students?: ExamStudentSummary[];
};

export default function ParentExamPage() {
  const [children, setChildren] = React.useState<Child[]>([]);
  const [exams, setExams] = React.useState<MetaExam[]>([]);
  const [selectedExam, setSelectedExam] = React.useState("");
  const [studentRows, setStudentRows] = React.useState<StudentData[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentData | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);

  // Throttle refetches so bursts of updates don't spam the API
  const lastRefetchAtRef = React.useRef<number>(0);
  const throttleMs = 800;

  const loadMetadata = React.useCallback(async () => {
    try {
      const metaRes = await fetch("/api/admin/exam-metadata");
      const meta = (await metaRes.json()) as ExamMetadataResponse;
      const released = (meta.exams ?? []).filter((exam) => exam.released === true);
      setExams(released);
      setSelectedExam((prev) => prev || (released[0]?.id ?? ""));
    } catch (error: unknown) {
      console.error("Failed to load exam metadata", error);
      setExams([]);
    }
  }, []);

  const loadResults = React.useCallback(async (examId: string, kids: Child[]) => {
    if (!examId || kids.length === 0) {
      setStudentRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/exams?examId=${examId}`);
      const json = (await res.json()) as ExamSummaryResponse;
      const subjectNames: string[] = Array.isArray(json.subjects) ? json.subjects : [];

      const studentsArray = Array.isArray(json.students) ? json.students : [];
      const byId = new Map<string, ExamStudentSummary>();
      studentsArray.forEach((student) => {
        if (!student) return;
        const sid = student.id;
        if (sid === null || sid === undefined) return;
        byId.set(String(sid), student);
      });

      const filtered = kids.filter((c) => byId.has(String(c.id)));
      const next: StudentData[] = filtered.map((c) => {
        const data = byId.get(String(c.id));
        const subjectsObj: StudentData["subjects"] = {};
        subjectNames.forEach((name) => {
          const subjectDetails = data?.subjects?.[name];
          if (!subjectDetails) return;
          const grade = typeof subjectDetails.grade === "string" ? subjectDetails.grade : "";
          const isTH = grade.toUpperCase() === "TH";
          const hasScore = typeof subjectDetails.score === "number";
          if (!hasScore && !isTH) return;
          subjectsObj[name] = {
            score: hasScore ? (subjectDetails.score as number) : 0,
            trend: Array.isArray(subjectDetails.trend) ? subjectDetails.trend : [],
            grade,
            exams: Array.isArray(subjectDetails.exams) ? subjectDetails.exams : undefined,
            optedOut: subjectDetails.optedOut,
          };
        });
        const conductFallback = {
          discipline: 0,
          effort: 0,
          participation: 0,
          motivationalLevel: 0,
          character: 0,
          leadership: 0,
        };
        const conduct = data?.conduct || conductFallback;
        const conductPercentages =
          data?.conductPercentages ||
          (data?.conduct
            ? {
                discipline: (data.conduct.discipline || 0) * 20,
                effort: (data.conduct.effort || 0) * 20,
                participation: (data.conduct.participation || 0) * 20,
                motivationalLevel: (data.conduct.motivationalLevel || 0) * 20,
                character: (data.conduct.character || 0) * 20,
                leadership: (data.conduct.leadership || 0) * 20,
              }
            : undefined);
        return {
          id: String(c.id),
          name: c.name,
          class: typeof data?.class === "string" ? data.class : "",
          classId: typeof data?.classId === "string" ? data.classId : undefined,
          subjects: subjectsObj,
          conduct,
          conductPercentages,
          overall: data?.overall || { average: 0, rank: 0, needsAttention: false },
        };
      });
      setStudentRows(next);
    } catch (error: unknown) {
      console.error("Failed to load exam summary for parents", error);
      setStudentRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load user, children, and initial metadata
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      if (!uid) return;

      const { data: kids } = await supabase
        .from("students")
        .select("id, name, class_id")
        .neq("record_type", "prospect")
        .eq("parent_id", uid)
        .order("name");
      setChildren(kids || []);

      await loadMetadata();
    })();
  }, [loadMetadata]);

  // Load results when exam selection or children change
  React.useEffect(() => {
    if (!selectedExam) { setStudentRows([]); return; }
    loadResults(selectedExam, children);
  }, [selectedExam, children, loadResults]);

  // Realtime subscriptions
  React.useEffect(() => {
    if (!selectedExam) return;

    const maybeRefetchResults = () => {
      const now = Date.now();
      if (now - lastRefetchAtRef.current < throttleMs) return;
      lastRefetchAtRef.current = now;
      loadResults(selectedExam, children);
    };

    const chExamScoped = supabase
      .channel(`parent-exam:${selectedExam}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results', filter: `exam_id=eq.${selectedExam}` }, () => {
        maybeRefetchResults();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conduct_entries', filter: `exam_id=eq.${selectedExam}` }, () => {
        // Conduct changes affect overall summary; refetch
        maybeRefetchResults();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams', filter: `id=eq.${selectedExam}` }, () => {
        // If the selected exam's metadata changes (e.g., release toggled), refresh both
        loadMetadata();
        maybeRefetchResults();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chExamScoped);
    };
  }, [selectedExam, children, loadResults, loadMetadata]);

  // Global subscription: when any exam gets released, refresh the list
  React.useEffect(() => {
    const chReleased = supabase
      .channel('parent-exam:released')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exams', filter: 'released=eq.true' }, () => {
        loadMetadata();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'exams', filter: 'released=eq.true' }, () => {
        loadMetadata();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chReleased);
    };
  }, [loadMetadata]);

  // Mobile breakpoint check
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <Navbar />
      <div className="p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Released Exam Results</CardTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <select
                  className="border rounded-lg px-3 py-2 text-sm bg-white"
                  value={selectedExam}
                  onChange={(e)=>setSelectedExam(e.target.value)}
                >
                  {exams.length===0 && <option value="">No released exams</option>}
                  {exams.map(ex=> <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <StudentTable
                data={studentRows}
                onRowClick={(s) => setSelectedStudent(s)}
                loading={loading}
              />
              <p className="text-xs text-gray-500 mt-3">Only released exams are shown here. Previous unpublished exams remain hidden until released by admin. Click a student to view details and export.</p>
            </CardContent>
          </Card>
        </div>
      </div>
      <StudentDetailsPanel
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        isMobile={isMobile}
        selectedExamName={exams.find(e=>e.id===selectedExam)?.name || ''}
        examId={selectedExam || ''}
        classId={selectedStudent?.classId || ''}
        reportButtonLabel="View / Export"
        mode="parent"
      />
    </div>
  );
}
