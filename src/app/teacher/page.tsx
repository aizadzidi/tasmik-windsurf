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
    grade: "",
    date: new Date().toISOString().slice(0, 10)
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
        date: form.date || today
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
        grade: "",
        date: new Date().toISOString().slice(0, 10)
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
    <main className="min-h-screen bg-gradient-to-tr from-blue-100 via-blue-200 to-blue-100 py-8 px-2">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Teacher Dashboard</h1>
          <SignOutButton />
        </div>
        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-10">
          <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Student</label>
              <select
                value={form.student_id}
                onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select a student</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
              >
                {REPORT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Grade</label>
              <select
                value={form.grade || ""}
                onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select a grade</option>
                {GRADES.map(g => (
                  <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Surah</label>
              <select
                value={form.surah}
                onChange={e => setForm(f => ({ ...f, surah: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select a surah</option>
                {SURAHS.map(surah => (
                  <option key={surah} value={surah}>{surah}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Juzuk</label>
              <input
                type="number"
                min="1"
                max="30"
                value={form.juzuk || ""}
                onChange={e => setForm(f => ({ ...f, juzuk: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">Ayat From</label>
                <input
                  type="number"
                  value={form.ayat_from}
                  onChange={e => setForm(f => ({ ...f, ayat_from: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ayat To</label>
                <input
                  type="number"
                  value={form.ayat_to}
                  onChange={e => setForm(f => ({ ...f, ayat_to: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">Page From</label>
                <input
                  type="number"
                  value={form.page_from}
                  onChange={e => setForm(f => ({ ...f, page_from: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Page To</label>
                <input
                  type="number"
                  value={form.page_to}
                  onChange={e => setForm(f => ({ ...f, page_to: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={form.date || new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="col-span-2">
              <button
                type="submit"
                className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg shadow hover:bg-blue-700 transition"
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit Report"}
              </button>
              {error && <div className="text-red-600 mt-2">{error}</div>}
              {success && <div className="text-green-600 mt-2">{success}</div>}
            </div>
          </form>
        </div>
        {/* Reports Table Card */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Previous Reports</h2>
          <div className="overflow-x-auto">
            {form.student_id ? (
              studentReports.length > 0 ? (
                <table className="min-w-full text-sm">
                  <thead className="bg-blue-50 sticky top-0">
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
                    {studentReports.map((r, idx) => (
                      <tr key={r.id} className={idx % 2 === 0 ? 'bg-blue-50' : ''}>
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
              reports.length > 0 ? (
                <table className="min-w-full text-sm">
                  <thead className="bg-blue-50 sticky top-0">
                    <tr>
                      <th className="border px-2 py-1">Student</th>
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
                    {reports.map((r, idx) => (
                      <tr key={r.id} className={idx % 2 === 0 ? 'bg-blue-50' : ''}>
                        <td className="border px-2 py-1">{r.student_name || r.student_id}</td>
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
                <div className="text-center py-2">No previous reports for your class.</div>
              )
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
