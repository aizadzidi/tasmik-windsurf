"use client";
import React from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabaseClient";
import StudentTable, { type StudentData } from "@/components/admin/exam/StudentTable";
import StudentDetailsPanel from "@/components/admin/exam/StudentDetailsPanel";

type Child = { id: string; name: string; class_id: string | null };
type MetaExam = {
  id: string;
  name: string;
  released?: boolean;
  exam_subjects?: { subjects?: { id: string; name: string } }[];
  exam_classes?: { classes?: { id: string; name: string } }[];
};

export default function ParentExamPage() {
  const [parentId, setParentId] = React.useState<string | null>(null);
  const [children, setChildren] = React.useState<Child[]>([]);
  const [exams, setExams] = React.useState<MetaExam[]>([]);
  const [subjects, setSubjects] = React.useState<string[]>([]);
  const [selectedExam, setSelectedExam] = React.useState("");
  const [studentRows, setStudentRows] = React.useState<StudentData[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentData | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);

  // Load user and base metadata
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      setParentId(uid);
      if (!uid) return;

      const [{ data: kids }, metaRes] = await Promise.all([
        supabase.from("students").select("id, name, class_id").eq("parent_id", uid).order("name"),
        fetch("/api/admin/exam-metadata"),
      ]);
      setChildren(kids || []);

      const meta = await metaRes.json();
      const released = (meta.exams || []).filter((e: any) => e.released === true);
      setExams(released);
      if (released.length > 0) setSelectedExam(released[0].id);
    })();
  }, []);

  // Load results via admin aggregated endpoint to match admin final marks
  React.useEffect(() => {
    (async () => {
      if (!selectedExam || children.length === 0) { setStudentRows([]); setSubjects([]); return; }
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/exams?examId=${selectedExam}`);
        const json = await res.json();
        const subjectNames: string[] = Array.isArray(json.subjects) ? json.subjects : [];
        setSubjects(subjectNames);
        const byId = new Map<string, any>((json.students || []).map((s: any) => [String(s.id), s]));
        // Only include children that appear in this exam (i.e., in exam classes)
        const filtered = children.filter(c => byId.has(String(c.id)));
        const next: StudentData[] = filtered.map(c => {
          const d = byId.get(String(c.id));
          const subjectsObj: StudentData['subjects'] = {};
          subjectNames.forEach((name) => {
            const sd = d?.subjects?.[name];
            if (!sd) return;
            const grade = typeof sd?.grade === 'string' ? sd.grade : '';
            const isTH = grade.toUpperCase() === 'TH';
            const hasScore = typeof sd?.score === 'number';
            if (!hasScore && !isTH) return;
            subjectsObj[name] = {
              score: hasScore ? sd.score : 0,
              trend: Array.isArray(sd?.trend) ? sd.trend : [],
              grade,
            };
          });
          return {
            id: String(c.id),
            name: c.name,
            class: String(d?.class || ''),
            classId: typeof d?.classId === 'string' ? d.classId : undefined,
            subjects: subjectsObj,
            conduct: d?.conduct || { discipline: 0, effort: 0, participation: 0, motivationalLevel: 0, character: 0, leadership: 0 },
            conductPercentages: d?.conductPercentages || (d?.conduct ? {
              discipline: (d.conduct.discipline || 0) * 20,
              effort: (d.conduct.effort || 0) * 20,
              participation: (d.conduct.participation || 0) * 20,
              motivationalLevel: (d.conduct.motivationalLevel || 0) * 20,
              character: (d.conduct.character || 0) * 20,
              leadership: (d.conduct.leadership || 0) * 20,
            } : undefined),
            overall: d?.overall || { average: 0, rank: 0, needsAttention: false }
          } as StudentData;
        });
        setStudentRows(next);
      } catch (e) {
        console.error('Failed to load exam summary for parents', e);
        setStudentRows([]);
      }
      setLoading(false);
    })();
  }, [selectedExam, children]);

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
        classAverages={React.useMemo(() => {
          if (!selectedStudent || studentRows.length === 0 || subjects.length === 0) return {} as { [k:string]: number };
          const targetClass = selectedStudent.class;
          const sameClass = studentRows.filter(s => s.class === targetClass);
          const avg: Record<string, number> = {};
          subjects.forEach(name => {
            let total = 0, count = 0;
            sameClass.forEach(s => {
              const sd = s.subjects?.[name];
              if (sd && typeof sd.score === 'number' && String(sd.grade || '').toUpperCase() !== 'TH') {
                total += sd.score;
                count++;
              }
            });
            avg[name] = count>0 ? Math.round(total / count) : 0;
          });
          return avg;
        }, [selectedStudent, studentRows, subjects])}
        isMobile={isMobile}
        selectedExamName={exams.find(e=>e.id===selectedExam)?.name || ''}
        examId={selectedExam || ''}
        classId={selectedStudent?.classId || ''}
        reportButtonLabel="View / Export"
      />
    </div>
  );
}
