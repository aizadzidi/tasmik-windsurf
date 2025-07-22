"use client";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import SignOutButton from "@/components/SignOutButton";
import { QuranProgressBar, ChartTabs } from "@/components/ReportCharts";

interface Student {
  id: string;
  name: string;
}

export interface Report {
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

import EditReportModal from "./EditReportModal";

export default function TeacherPage() {
  // State for editing and deleting reports
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [deletingReport, setDeletingReport] = useState<Report | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleEditReport(report: Report) {
    setEditingReport(report);
    setShowEditModal(true);
  }
  function handleDeleteReport(report: Report) {
    setDeletingReport(report);
    setShowDeleteConfirm(true);
  }
  // Placeholder for actual update logic
  async function editReport(updated: Report) {
    if (!updated.id) return;
    // Update the report in Supabase
    await supabase.from("reports").update({
      type: updated.type,
      surah: updated.surah,
      juzuk: updated.juzuk,
      ayat_from: updated.ayat_from,
      ayat_to: updated.ayat_to,
      page_from: updated.page_from,
      page_to: updated.page_to,
      grade: updated.grade,
      date: updated.date,
    }).eq("id", updated.id);
    setShowEditModal(false);
    setEditingReport(null);
    // Refresh reports
    if (userId) {
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
  }
  // Placeholder for actual delete logic
  async function deleteReport(reportId: string) {
    if (!reportId) return;
    await supabase.from("reports").delete().eq("id", reportId);
    setShowDeleteConfirm(false);
    setDeletingReport(null);
    // Refresh reports
    if (userId) {
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
  }

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

  // Pagination state
  const [studentReportPage, setStudentReportPage] = useState(1);
  const [allReportPage, setAllReportPage] = useState(1);
  const recordsPerPage = 10;

  // Pagination for studentReports
  const studentTotalPages = Math.ceil(studentReports.length / recordsPerPage);
  const pagedStudentReports = studentReports.slice(
    (studentReportPage - 1) * recordsPerPage,
    studentReportPage * recordsPerPage
  );
  // Pagination for all reports
  const allTotalPages = Math.ceil(reports.length / recordsPerPage);
  const pagedAllReports = reports.slice(
    (allReportPage - 1) * recordsPerPage,
    allReportPage * recordsPerPage
  );

  // Hafazan gap calculation
  const today = new Date();
  const studentLastRecords = students.map(s => {
    const studentRecs = reports.filter(r => r.student_id === s.id);
    if (studentRecs.length === 0) {
      return { ...s, lastDaysAgo: null, lastDate: null };
    }
    const lastDateStr = studentRecs[0].date; // reports sorted descending
    const lastDate = new Date(lastDateStr);
    const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    return { ...s, lastDaysAgo: diffDays, lastDate: lastDateStr };
  });
  const sortedLastRecords = [...studentLastRecords].sort((a, b) => {
    if (a.lastDaysAgo === null) return -1;
    if (b.lastDaysAgo === null) return 1;
    return b.lastDaysAgo - a.lastDaysAgo;
  });

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move p-4 overflow-hidden">
      <div className="max-w-3xl mx-auto">
        {/* Animated Gradient Blobs */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />
        
        {/* Header */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Teacher Dashboard</h1>
            <SignOutButton />
          </div>
        </div>
        
        {/* Hafazan Last Record Gap Section */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 tracking-tight">Student Last Submission Gaps</h2>
          <table className="min-w-full text-sm">
            <thead className="bg-blue-50">
              <tr>
                <th className="border px-2 py-1">Student</th>
                <th className="border px-2 py-1">Last Record (days ago)</th>
                <th className="border px-2 py-1">Last Submission Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedLastRecords.map(s => (
                <tr key={s.id} className={
                  s.lastDaysAgo === null || s.lastDaysAgo >= 7 ? 'bg-red-100' : ''
                }>
                  <td className="border px-2 py-1 font-medium">{s.name}</td>
                  <td className="border px-2 py-1">
                    {s.lastDaysAgo === null ? <span className="italic text-gray-400">Never</span> : s.lastDaysAgo}
                  </td>
                  <td className="border px-2 py-1">
                    {s.lastDate ? s.lastDate : <span className="italic text-gray-400">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-gray-500">Students highlighted in red have not submitted for 7 or more days.</div>
        </div>
        {/* Animated Gradient Blobs */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />
        
        {/* Visual Graph Section */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 tracking-tight">Class/Student Progress</h2>
          {form.student_id && <QuranProgressBar reports={studentReports} />}
          <ChartTabs reports={form.student_id ? studentReports : reports} />
        </div>
        {/* Add Report Form */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 tracking-tight">Add New Report</h2>
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
                className="group bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={!form.student_id || !form.type || !form.surah || !form.ayat_from || !form.ayat_to || !form.date}
              >
                Add Report
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </button>
              {error && <div className="text-red-600 mt-2">{error}</div>}
              {success && <div className="text-green-600 mt-2">{success}</div>}
            </div>
          </form>
        </div>
        {/* Reports Section */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 tracking-tight">Reports</h2>
          {studentReports.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/20 shadow-lg bg-white/10 backdrop-blur-sm">
              <table className="min-w-full">
                <thead className="bg-gradient-to-r from-blue-50/80 to-purple-50/80 backdrop-blur-sm">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b border-white/30 text-sm">Student</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b border-white/30 text-sm">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 border-b border-white/30 text-sm">Surah</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30 text-sm">Juzuk</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30 text-sm">Ayat</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30 text-sm">Page</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30 text-sm">Grade</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30 text-sm">Date</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-800 border-b border-white/30 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white/5">
                  {studentReports.map((r, index) => (
                    <tr key={r.id} className={`transition-colors hover:bg-white/20 ${index % 2 === 0 ? 'bg-white/5' : 'bg-white/10'}`}>
                      <td className="px-4 py-3 text-gray-800 font-medium border-b border-white/10">{r.student_name}</td>
                      <td className="px-4 py-3 text-gray-700 border-b border-white/10">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium border-b border-white/10">{r.surah}</td>
                      <td className="px-4 py-3 text-center text-gray-700 border-b border-white/10">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-800 text-sm font-semibold">
                          {r.juzuk}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 border-b border-white/10">
                        <span className="text-sm font-mono">{r.ayat_from} - {r.ayat_to}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 border-b border-white/10">
                        <span className="text-sm font-mono">{r.page_from ?? ""} - {r.page_to ?? ""}</span>
                      </td>
                      <td className="px-4 py-3 text-center border-b border-white/10">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          r.grade === 'mumtaz' ? 'bg-green-100 text-green-800' :
                          r.grade === 'jayyid jiddan' ? 'bg-yellow-100 text-yellow-800' :
                          r.grade === 'jayyid' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {r.grade ? r.grade.charAt(0).toUpperCase() + r.grade.slice(1) : ""}
                        </span>
                      </td>
                    <td className="border px-2 py-1">{r.date}</td>
                    <td className="border px-2 py-1">
                      <button
                        className="text-blue-600 hover:underline mr-2"
                        onClick={() => handleEditReport(r)}
                        type="button"
                      ><span title="Edit" aria-label="Edit">
  <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-blue-600 hover:text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13zm0 0H5v4a2 2 0 002 2h4v-4a2 2 0 00-2-2z" />
  </svg>
</span></button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => handleDeleteReport(r)}
                        type="button"
                      ><span title="Delete" aria-label="Delete">
  <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-red-600 hover:text-red-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h16" />
  </svg>
</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-center mt-4">
              <button
                className="px-2 py-1 border rounded disabled:opacity-50"
                onClick={() => setStudentReportPage(Math.max(1, studentReportPage - 1))}
                disabled={studentReportPage === 1}
              >Prev</button>
              {Array.from({ length: studentTotalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`px-2 py-1 border rounded ${p === studentReportPage ? 'bg-blue-500 text-white' : ''}`}
                  onClick={() => setStudentReportPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="px-2 py-1 border rounded disabled:opacity-50"
                onClick={() => setStudentReportPage(Math.min(studentTotalPages, studentReportPage + 1))}
                disabled={studentReportPage === studentTotalPages}
              >Next</button>
            </div>
          </div>
        ) : (
          <div>
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="border px-2 py-1">Student</th>
                  <th className="border px-2 py-1">Type</th>
                  <th className="border px-2 py-1">Surah</th>
                  <th className="border px-2 py-1">Juzuk</th>
                  <th className="border px-2 py-1">Ayat</th>
                  <th className="border px-2 py-1">Page</th>
                  <th className="border px-2 py-1">Grade</th>
                  <th className="border px-2 py-1">Date</th>
                  <th className="border px-2 py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td className="border px-2 py-1">{r.student_name}</td>
                    <td className="border px-2 py-1">{r.type}</td>
                    <td className="border px-2 py-1">{r.surah}</td>
                    <td className="border px-2 py-1">{r.juzuk}</td>
                    <td className="border px-2 py-1">{r.ayat_from} - {r.ayat_to}</td>
                    <td className="border px-2 py-1">{r.page_from ?? ""} - {r.page_to ?? ""}</td>
                    <td className="border px-2 py-1">{r.grade ? r.grade.charAt(0).toUpperCase() + r.grade.slice(1) : ""}</td>
                    <td className="border px-2 py-1">{r.date}</td>
                    <td className="border px-2 py-1">
                      <button
                        className="text-blue-600 hover:underline mr-2"
                        onClick={() => handleEditReport(r)}
                        type="button"
                      ><span title="Edit" aria-label="Edit">
  <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-blue-600 hover:text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13zm0 0H5v4a2 2 0 002 2h4v-4a2 2 0 00-2-2z" />
  </svg>
</span></button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => handleDeleteReport(r)}
                        type="button"
                      ><span title="Delete" aria-label="Delete">
  <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-red-600 hover:text-red-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h16" />
  </svg>
</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-center mt-4">
              <button
                className="px-2 py-1 border rounded disabled:opacity-50"
                onClick={() => setAllReportPage(Math.max(1, allReportPage - 1))}
                disabled={allReportPage === 1}
              >Prev</button>
              {Array.from({ length: allTotalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`px-2 py-1 border rounded ${p === allReportPage ? 'bg-blue-500 text-white' : ''}`}
                  onClick={() => setAllReportPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="px-2 py-1 border rounded disabled:opacity-50"
                onClick={() => setAllReportPage(Math.min(allTotalPages, allReportPage + 1))}
                disabled={allReportPage === allTotalPages}
              >Next</button>
            </div>
          </div>
        )}
        </div>
      </div>
      
      {/* Tailwind custom animation */}
      <style jsx global>{`
        @keyframes gradient-move {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-move {
          background-size: 200% 200%;
          animation: gradient-move 10s ease-in-out infinite;
        }
        .animate-pulse-slow {
          animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </main>
  );
}
