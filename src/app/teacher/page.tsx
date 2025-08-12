"use client";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import { QuranProgressBar, ChartTabs } from "@/components/ReportCharts";
import Navbar from "@/components/Navbar";

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

// Helper functions for weekly reporting
function getCurrentWeekInfo() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Get Monday of current week
  
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4); // Friday is 4 days after Monday
  
  const weekInMonth = getWeekOfMonth(monday);
  
  return {
    monday,
    friday,
    weekNumber: weekInMonth,
    year: monday.getFullYear(),
    month: monday.getMonth() + 1,
    monthName: monday.toLocaleDateString('en-US', { month: 'long' })
  };
}

function getWeekOfMonth(date: Date) {
  // Get the first day of the month
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  
  // Find the first Monday of the month
  const firstMondayOfMonth = new Date(firstDayOfMonth);
  const daysToFirstMonday = (1 - firstDayOfMonth.getDay() + 7) % 7; // Days until first Monday
  if (daysToFirstMonday === 7) {
    // If the first day is already Monday, don't add 7 days
    firstMondayOfMonth.setDate(1);
  } else {
    firstMondayOfMonth.setDate(1 + daysToFirstMonday);
  }
  
  // If the current date is before the first Monday of the month,
  // it's considered part of week 1 if it's within the first few days
  if (date < firstMondayOfMonth) {
    // If it's within the first 6 days of the month, consider it week 1
    if (date.getDate() <= 6) {
      return 1;
    }
    // Otherwise, it belongs to the previous month's last week
    const lastDayOfPreviousMonth = new Date(date.getFullYear(), date.getMonth(), 0);
    return getWeekOfMonth(lastDayOfPreviousMonth);
  }
  
  // Calculate the week number within the month
  const daysDiff = Math.floor((date.getTime() - firstMondayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(daysDiff / 7) + 1;
}

function formatDateRange(monday: Date, friday: Date) {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };
  return `${formatDate(monday)} - ${formatDate(friday)}`;
}

export default function TeacherPage() {
  // State for editing and deleting reports
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [deletingReport, setDeletingReport] = useState<Report | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Current week info
  const currentWeek = getCurrentWeekInfo();

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
    date: currentWeek.friday.toISOString().slice(0, 10) // End of current week
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Get current user id
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error('Authentication error:', error);
        // Redirect to login if authentication fails
        window.location.href = '/login';
        return;
      }
      setUserId(data.user?.id ?? null);
    }).catch((error) => {
      console.error('Failed to get user:', error);
      // Redirect to login on any auth error
      window.location.href = '/login';
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
    setError("");
    setSuccess("");
    if (!userId) {
      setError("User not found");
      return;
    }
    if (!form.student_id) {
      setError("Please select a student");
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
      const newWeek = getCurrentWeekInfo();
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
        date: newWeek.friday.toISOString().slice(0, 10)
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
    <>
      <Navbar />
      <main className="relative min-h-screen bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move p-4 overflow-hidden">
      <div className="max-w-3xl mx-auto">
        {/* Animated Gradient Blobs */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />
        
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
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-4 sm:p-6 mb-6 max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-900 tracking-tight">Add New Report</h2>
          <form className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6" onSubmit={handleSubmit}>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Student</label>
              <select
                value={form.student_id}
                onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
              >
                <option value="">Select a grade</option>
                {GRADES.map(g => (
                  <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Surah</label>
              <select
                value={form.surah}
                onChange={e => setForm(f => ({ ...f, surah: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
              >
                <option value="">Select a surah</option>
                {SURAHS.map(surah => (
                  <option key={surah} value={surah}>{surah}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium mb-1">Juzuk</label>
              <input
                type="number"
                min="1"
                max="30"
                value={form.juzuk || ""}
                onChange={e => setForm(f => ({ ...f, juzuk: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium mb-1">Ayat Range</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="From"
                  value={form.ayat_from}
                  onChange={e => setForm(f => ({ ...f, ayat_from: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
                />
                <input
                  type="number"
                  placeholder="To"
                  value={form.ayat_to}
                  onChange={e => setForm(f => ({ ...f, ayat_to: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Page Range (Optional)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="From"
                  value={form.page_from}
                  onChange={e => setForm(f => ({ ...f, page_from: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
                />
                <input
                  type="number"
                  placeholder="To"
                  value={form.page_to}
                  onChange={e => setForm(f => ({ ...f, page_to: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Week Period</label>
              <div className="relative">
                <div className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-blue-50 text-gray-700">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span className="font-medium text-sm sm:text-base">
                      Week {currentWeek.weekNumber} of {currentWeek.monthName} {currentWeek.year}
                    </span>
                    <span className="text-xs sm:text-sm text-gray-600">
                      {formatDateRange(currentWeek.monday, currentWeek.friday)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Report covers Monday to Friday of this week
                  </div>
                </div>
                <input
                  type="hidden"
                  value={form.date}
                  name="date"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full group bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                disabled={!form.student_id || !form.type || !form.surah || !form.ayat_from || !form.ayat_to || !form.date}
              >
                Add Report
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </button>
              {error && <div className="text-red-600 mt-2 text-sm">{error}</div>}
              {success && <div className="text-green-600 mt-2 text-sm">{success}</div>}
            </div>
          </form>
        </div>
        {/* Reports Section */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 tracking-tight">Reports</h2>
          {studentReports.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/20 shadow-lg bg-white/10 backdrop-blur-sm">
              <div className="overflow-x-auto">
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
                  {pagedStudentReports.map((r, index) => (
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
                      <td className="px-4 py-3 text-center text-gray-700 border-b border-white/10">
                        <span className="text-sm font-medium">{r.date}</span>
                      </td>
                      <td className="px-4 py-3 text-center border-b border-white/10">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                            onClick={() => handleEditReport(r)}
                            type="button"
                          ><span title="Edit" aria-label="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-blue-600 hover:text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13zm0 0H5v4a2 2 0 002 2h4v-4a2 2 0 00-2-2z" />
                            </svg>
                          </span></button>
                          <button
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                            onClick={() => handleDeleteReport(r)}
                            type="button"
                          ><span title="Delete" aria-label="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 text-red-600 hover:text-red-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h16" />
                            </svg>
                          </span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
        ) : reports.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-white/20 shadow-lg bg-white/10 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full" style={{minWidth: '800px'}}>
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
                {pagedAllReports.map((r, index) => (
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
                    <td className="px-4 py-3 text-center text-gray-700 border-b border-white/10">
                      <span className="text-sm font-medium">{r.date}</span>
                    </td>
                    <td className="px-4 py-3 text-center border-b border-white/10">
  <div className="flex items-center justify-center gap-3">
    {/* Edit Button */}
    <button
      className="group relative inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/60 shadow-md ring-1 ring-blue-300/30 hover:bg-blue-100 hover:scale-105 transition-all duration-150"
      onClick={() => handleEditReport(r)}
      type="button"
      aria-label="Edit"
    >
      <svg className="w-5 h-5 text-blue-600 group-hover:text-blue-800 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 5.487a2.25 2.25 0 113.182 3.182l-8.25 8.25a2 2 0 01-.879.513l-4.25 1.25 1.25-4.25a2 2 0 01.513-.879l8.25-8.25z" />
      </svg>
      <span className="absolute left-1/2 bottom-[-2.2rem] -translate-x-1/2 px-2 py-1 rounded-md text-xs bg-blue-700 text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-lg z-10">Edit</span>
    </button>
    {/* Delete Button */}
    <button
      className="group relative inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/60 shadow-md ring-1 ring-red-300/30 hover:bg-red-100 hover:scale-105 transition-all duration-150"
      onClick={() => handleDeleteReport(r)}
      type="button"
      aria-label="Delete"
    >
      <svg className="w-5 h-5 text-red-500 group-hover:text-red-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zm3-9v6m4-6v6m5-8V5a2 2 0 00-2-2H8a2 2 0 00-2 2v2h14z" />
      </svg>
      <span className="absolute left-1/2 bottom-[-2.2rem] -translate-x-1/2 px-2 py-1 rounded-md text-xs bg-red-600 text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-lg z-10">Delete</span>
    </button>
  </div>
</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
        ) : (
          <div className="text-center py-8 text-gray-600">
            <p>No reports found.</p>
          </div>
        )}
        </div>
      </div>
      
      {/* Tailwind custom animation */}
      {showEditModal && editingReport && (
        <EditReportModal
          report={editingReport}
          onCancel={() => setShowEditModal(false)}
          onSave={editReport}
          surahs={SURAHS}
          grades={GRADES}
          reportTypes={REPORT_TYPES}
        />
      )}

      {showDeleteConfirm && deletingReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <h3 className="text-lg font-bold mb-4">Confirm Deletion</h3>
            <p>Are you sure you want to delete this report?</p>
            <div className="mt-6 flex justify-end gap-4">
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                className="px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteReport(deletingReport.id)} 
                className="px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}
