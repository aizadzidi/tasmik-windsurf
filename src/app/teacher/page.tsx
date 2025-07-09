"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SignOutButton from "@/components/SignOutButton";

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
  student_name?: string;
}

const REPORT_TYPES = ["Tasmi", "Old Murajaah", "New Murajaah"];
const SURAHS = [
  "Al-Fatihah", "Al-Baqarah", "Aali Imran", "An-Nisa'", "Al-Ma'idah", "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra'", "Al-Kahf", "Maryam", "Ta-Ha", "Al-Anbiya'", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan", "Ash-Shu'ara'", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum", "Luqman", "As-Sajda", "Al-Ahzab", "Saba'", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadila", "Al-Hashr", "Al-Mumtahanah", "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddathir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba'", "An-Nazi'at", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams", "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin", "Al-Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat", "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas"
];
const GRADES = ["mumtaz", "jayyid jiddan", "jayyid"];

export default function TeacherPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [form, setForm] = useState({
    student_id: "",
    type: REPORT_TYPES[0],
    surah: "",
    juzuk: "",
    ayat_from: "",
    ayat_to: "",
    page_from: "",
    page_to: "",
    grade: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Get current user id
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Fetch students assigned to this teacher
  useEffect(() => {
    if (!userId) return;
    async function fetchStudents() {
      const { data, error } = await supabase
        .from("students")
        .select("id, name")
        .eq("assigned_teacher_id", userId);
      if (!error && data) setStudents(data);
    }
    fetchStudents();
  }, [userId]);

  // Fetch all reports by this teacher (for future use, not shown in table)
  useEffect(() => {
    if (!userId) return;
    async function fetchReports() {
      const { data, error } = await supabase
        .from("reports")
        .select("*, students(name)")
        .eq("teacher_id", userId)
        .order("date", { ascending: false });
      if (!error && data) {
        setReports(data.map((r: any) => ({ ...r, student_name: r.students?.name || "" })));
      }
    }
    fetchReports();
  }, [userId]);

  // Fetch previous reports for selected student
  const [studentReports, setStudentReports] = useState<Report[]>([]);
  useEffect(() => {
    if (!userId || !form.student_id) {
      setStudentReports([]);
      return;
    }
    async function fetchStudentReports() {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("teacher_id", userId)
        .eq("student_id", form.student_id)
        .order("date", { ascending: false });
      if (!error && data) {
        setStudentReports(data);
      }
    }
    fetchStudentReports();
  }, [userId, form.student_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    if (!userId) {
      setError("User not found");
      setLoading(false);
      return;
    }
    if (!form.student_id) {
      setError("Please select a student");
      setLoading(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const { error: insertError } = await supabase.from("reports").insert([
      {
        teacher_id: userId,
        student_id: form.student_id,
        type: form.type,
        surah: form.surah,
        juzuk: form.juzuk ? parseInt(form.juzuk) : null,
        ayat_from: parseInt(form.ayat_from),
        ayat_to: parseInt(form.ayat_to),
        page_from: form.page_from ? parseInt(form.page_from) : null,
        page_to: form.page_to ? parseInt(form.page_to) : null,
        grade: form.grade || null,
        date: today
      }
    ]);
    if (insertError) {
      setError(insertError.message);
    } else {
      setSuccess("Report submitted!");
      setForm({
        student_id: "",
        type: REPORT_TYPES[0],
        surah: "",
        juzuk: "",
        ayat_from: "",
        ayat_to: "",
        page_from: "",
        page_to: "",
        grade: ""
      });
      // Refresh reports
      const { data, error } = await supabase
        .from("reports")
        .select("*, students(name)")
        .eq("teacher_id", userId)
        .order("date", { ascending: false });
      if (!error && data) {
        setReports(data.map((r: any) => ({ ...r, student_name: r.students?.name || "" })));
      }
      // Refresh student-specific reports
      if (form.student_id) {
        const { data: sData, error: sErr } = await supabase
          .from("reports")
          .select("*")
          .eq("teacher_id", userId)
          .eq("student_id", form.student_id)
          .order("date", { ascending: false });
        if (!sErr && sData) {
          setStudentReports(sData);
        }
      }
    }
    setLoading(false);
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <SignOutButton />
      <h1 className="text-2xl font-bold mb-6">Teacher Dashboard</h1>
      <form onSubmit={handleSubmit} className="space-y-4 border p-4 rounded mb-8">
        <div>
          <label className="block mb-1">Student</label>
          <select
            value={form.student_id}
            onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
            required
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select a student</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">Type</label>
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="w-full border rounded px-3 py-2"
          >
            {REPORT_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">Surah</label>
          <select
            value={form.surah}
            onChange={e => setForm(f => ({ ...f, surah: e.target.value }))}
            required
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select a surah</option>
            {SURAHS.map(surah => (
              <option key={surah} value={surah}>{surah}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">Juzuk</label>
          <input
            type="number"
            min="1"
            max="30"
            value={form.juzuk || ""}
            onChange={e => setForm(f => ({ ...f, juzuk: e.target.value }))}
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block mb-1">Ayat From</label>
            <input
              type="number"
              value={form.ayat_from}
              onChange={e => setForm(f => ({ ...f, ayat_from: e.target.value }))}
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block mb-1">Ayat To</label>
            <input
              type="number"
              value={form.ayat_to}
              onChange={e => setForm(f => ({ ...f, ayat_to: e.target.value }))}
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block mb-1">Page From</label>
            <input
              type="number"
              value={form.page_from}
              onChange={e => setForm(f => ({ ...f, page_from: e.target.value }))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block mb-1">Page To</label>
            <input
              type="number"
              value={form.page_to}
              onChange={e => setForm(f => ({ ...f, page_to: e.target.value }))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="block mb-1">Grade</label>
          <select
            value={form.grade || ""}
            onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
            required
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select a grade</option>
            {GRADES.map(g => (
              <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1">Date</label>
          <input
            type="text"
            value={new Date().toISOString().slice(0, 10)}
            readOnly
            className="w-full border rounded px-3 py-2 bg-gray-100"
          />
        </div>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        {success && <div className="text-green-600 text-sm">{success}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          {loading ? "Submitting..." : "Submit Report"}
        </button>
      </form>
      <h2 className="text-xl font-semibold mb-2">Previous Reports for Selected Student</h2>
      <div className="overflow-x-auto">
        {form.student_id ? (
          studentReports.length > 0 ? (
            <table className="min-w-full border">
              <thead>
                <tr>
                  <th className="border px-2 py-1">Type</th>
                  <th className="border px-2 py-1">Surah</th>
                  <th className="border px-2 py-1">Juzuk</th>
                  <th className="border px-2 py-1">Ayat</th>
                  <th className="border px-2 py-1">Page</th>
                  <th className="border px-2 py-1">Grade</th>
                  <th className="border px-2 py-1">Date</th>
                </tr>
              </thead>
              <tbody>
                {studentReports.map(r => (
                  <tr key={r.id}>
                    <td className="border px-2 py-1">{r.type}</td>
                    <td className="border px-2 py-1">{r.surah}</td>
                    <td className="border px-2 py-1">{r.juzuk}</td>
                    <td className="border px-2 py-1">{r.ayat_from} - {r.ayat_to}</td>
                    <td className="border px-2 py-1">{r.page_from ?? ""} - {r.page_to ?? ""}</td>
                    <td className="border px-2 py-1">{r.grade ? r.grade.charAt(0).toUpperCase() + r.grade.slice(1) : ""}</td>
                    <td className="border px-2 py-1">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-2">No previous reports for this student.</div>
          )
        ) : (
          <div className="text-center py-2">Select a student to view previous reports.</div>
        )}
      </div>
    </main>
  );
}

