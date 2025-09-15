"use client";
import React from "react";
import { supabase } from "@/lib/supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [rows, setRows] = React.useState<{
    childId: string;
    childName: string;
    overall: number | null;
    marksBySubject: Map<string, { mark: number | null; grade: string | null }>;
  }[]>([]);

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
      if (!selectedExam || children.length === 0) { setRows([]); setSubjects([]); return; }
      try {
        const res = await fetch(`/api/admin/exams?examId=${selectedExam}`);
        const json = await res.json();
        const childIds = new Set(children.map(c => String(c.id)));
        const subjectNames: string[] = Array.isArray(json.subjects) ? json.subjects : [];
        setSubjects(subjectNames);
        const byId = new Map<string, any>((json.students || []).map((s: any) => [String(s.id), s]));
        // Only include children that appear in this exam (i.e., in exam classes)
        const filtered = children.filter(c => byId.has(String(c.id)));
        const next = filtered.map(c => {
          const d = byId.get(String(c.id));
          const marks = new Map<string, { mark: number | null; grade: string | null }>();
          subjectNames.forEach((name) => {
            const sd = d?.subjects?.[name];
            marks.set(name, { mark: typeof sd?.score === 'number' ? sd.score : null, grade: sd?.grade ?? null });
          });
          const overall = typeof d?.overall?.average === 'number' ? d.overall.average : null;
          return { childId: c.id, childName: c.name, overall, marksBySubject: marks };
        });
        setRows(next);
      } catch (e) {
        console.error('Failed to load exam summary for parents', e);
        setRows([]);
      }
    })();
  }, [selectedExam, children]);

  const handleDownloadChildPdf = async (row: { childId: string; childName: string; marksBySubject: Map<string, { mark: number | null; grade: string | null }>; overall: number | null }) => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const M = 36;
      let y = 40;
      // Logo (best effort)
      try {
        const res = await fetch('/logo-akademi.png');
        const blob = await res.blob();
        const fr = new FileReader();
        const dataUrl: string = await new Promise((resolve, reject) => { fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(blob); });
        doc.addImage(dataUrl, 'PNG', M, y, 42, 42);
      } catch {}
      doc.setFontSize(14); doc.setTextColor('#0f172a');
      doc.text('Al Khayr Class', M+54, y+16);
      doc.setFontSize(10); doc.setTextColor('#475569');
      doc.text('Student Performance Report', M+54, y+32);
      doc.text(`Generated: ${new Date().toLocaleString()}`, W-M, y+10, { align: 'right' });
      y += 56; doc.setTextColor('#0f172a'); doc.setFontSize(10);
      const chips = [
        `Name: ${row.childName}`,
        ...(children.find(c=>c.id===row.childId)?.class_id ? [] : []),
        `Exam: ${exams.find(e=>e.id===selectedExam)?.name || ''}`,
        `Overall: ${row.overall ?? '-'}${row.overall!==null?'%':''}`,
      ];
      let x=M; const pad=6, gap=6; let cy=y;
      chips.forEach(c=>{ const w=doc.getTextWidth(c)+pad*2; if(x+w>W-M){x=M; cy+=20;} doc.setDrawColor('#e2e8f0'); doc.setFillColor('#f8fafc'); doc.roundedRect(x, cy-12, w, 18,3,3,'FD'); doc.setTextColor('#0f172a'); doc.text(c, x+pad, cy+2); x+=w+gap; });
      y = cy + 26;
      // Subjects table
      const head = [['Subject','Score','Grade']];
      const body = subjects.map(name=>{
        const v = row.marksBySubject.get(name);
        const mark = typeof v?.mark==='number' ? `${v!.mark}%` : '-';
        const grade = v?.grade || '-';
        return [name, mark, grade];
      });
      autoTable(doc, { startY: y, head, body, styles:{fontSize:10}, headStyles:{fillColor:[241,245,249], textColor:15}, margin:{left:M,right:M} });
      const slug = row.childName.replace(/\s+/g,'-').toLowerCase();
      doc.save(`exam-report-${slug}.pdf`);
    } catch(e) {
      console.error(e);
      alert('Failed to generate PDF.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-4">
        <h1 className="text-xl font-bold mb-3">Released Exam Results</h1>
        <div className="flex gap-2 mb-4">
          <select className="border rounded px-2 py-1" value={selectedExam} onChange={e=>setSelectedExam(e.target.value)}>
            {exams.length===0 && <option value="">No released exams</option>}
            {exams.map(ex=> <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Child</th>
                <th className="px-3 py-2 text-left">Overall</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=> (
                <tr key={r.childId} className="border-t">
                  <td className="px-3 py-2">{r.childName}</td>
                  <td className="px-3 py-2">{r.overall!==null? `${r.overall}%`:'-'}</td>
                  <td className="px-3 py-2">
                    <button onClick={()=>handleDownloadChildPdf(r)} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Download Report (PDF)</button>
                  </td>
                </tr>
              ))}
              {rows.length===0 && (
                <tr><td className="px-3 py-6 text-sm text-gray-500" colSpan={3}>No results for this exam yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-3">Only released exams are shown here. Previous unpublished exams remain hidden until released by admin.</p>
      </div>
    </div>
  );
}
