"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Student {
  id: string;
  name: string;
}

interface Report {
  id: string;
  student_id: string;
  type: string;
  surah: string;
  juzuk: number | null;
  ayat_from: number;
  ayat_to: number;
  page_from: number | null;
  page_to: number | null;
  grade: string | null;
  date: string;
}

export default function ParentReportTable({ parentId }: { parentId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Fetch children (students) for this parent
      const { data: studentData } = await supabase
        .from("students")
        .select("id, name")
        .eq("parent_id", parentId);
      setStudents(studentData || []);
      // Fetch all reports for these students
      if (studentData && studentData.length > 0) {
        const studentIds = studentData.map((s: Student) => s.id);
        const { data: reportData } = await supabase
          .from("reports")
          .select("*")
          .in("student_id", studentIds);
        setReports(reportData || []);
      } else {
        setReports([]);
      }
      setLoading(false);
    }
    if (parentId) fetchData();
  }, [parentId]);

  if (loading) return <div>Loading reports...</div>;
  if (students.length === 0) return <div>You have no registered children in the system.</div>;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-2">Your Children's Reports</h2>
      {students.map(student => (
        <div key={student.id} className="mb-6">
          <h3 className="font-bold mb-1">{student.name}</h3>
          <table className="min-w-full border text-sm">
            <thead>
              <tr>
                <th className="border px-2 py-1">Date</th>
                <th className="border px-2 py-1">Type</th>
                <th className="border px-2 py-1">Surah</th>
                <th className="border px-2 py-1">Juzuk</th>
                <th className="border px-2 py-1">Ayat</th>
                <th className="border px-2 py-1">Page</th>
                <th className="border px-2 py-1">Grade</th>
              </tr>
            </thead>
            <tbody>
              {reports.filter(r => r.student_id === student.id).length === 0 ? (
                <tr><td colSpan={7} className="text-center py-2">No reports found.</td></tr>
              ) : (
                reports.filter(r => r.student_id === student.id).map(r => (
                  <tr key={r.id}>
                    <td className="border px-2 py-1">{r.date}</td>
                    <td className="border px-2 py-1">{r.type}</td>
                    <td className="border px-2 py-1">{r.surah}</td>
                    <td className="border px-2 py-1">{r.juzuk ?? '-'}</td>
                    <td className="border px-2 py-1">{r.ayat_from} - {r.ayat_to}</td>
                    <td className="border px-2 py-1">{r.page_from ?? '-'} - {r.page_to ?? '-'}</td>
                    <td className="border px-2 py-1">{r.grade ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
