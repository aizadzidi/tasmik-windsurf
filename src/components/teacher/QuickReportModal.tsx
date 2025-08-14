"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getJuzFromPageRange } from "@/lib/quranMapping";

interface QuickReportModalProps {
  student: {
    id: string;
    name: string;
  };
  reportType: "Tasmi" | "Murajaah";
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  suggestions?: {
    surah: string;
    juzuk: number;
    ayatFrom: number;
    ayatTo: number;
    pageFrom?: number | null;
    pageTo?: number | null;
  };
}

const GRADES = ["mumtaz", "jayyid jiddan", "jayyid"];
const SURAHS = [
  "Al-Fatihah", "Al-Baqarah", "Aali Imran", "An-Nisa'", "Al-Ma'idah", "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl", "Al-Isra'", "Al-Kahf", "Maryam", "Ta-Ha", "Al-Anbiya'", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan", "Ash-Shu'ara'", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum", "Luqman", "As-Sajda", "Al-Ahzab", "Saba'", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadila", "Al-Hashr", "Al-Mumtahanah", "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddathir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba'", "An-Nazi'at", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams", "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin", "Al-Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat", "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad", "Al-Ikhlas", "Al-Falaq", "An-Nas"
];

// Get current week boundaries and display
function getCurrentWeekInfo() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Find Monday of this week
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  
  // Find Friday of this week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  // Format for display: "Dec 9-13, 2024"
  const monthName = monday.toLocaleDateString('en-US', { month: 'short' });
  const startDay = monday.getDate();
  const endDay = friday.getDate();
  const year = monday.getFullYear();
  
  const weekRange = `${monthName} ${startDay}-${endDay}, ${year}`;
  const fridayDate = friday.toISOString().slice(0, 10);
  
  return { weekRange, fridayDate };
}

export default function QuickReportModal({ 
  student, 
  reportType, 
  onClose, 
  onSuccess, 
  userId,
  suggestions 
}: QuickReportModalProps) {
  const currentWeek = getCurrentWeekInfo();
  const [form, setForm] = useState({
    surah: suggestions?.surah || "",
    juzuk: suggestions?.juzuk?.toString() || "",
    ayat_from: suggestions?.ayatFrom?.toString() || "",
    ayat_to: suggestions?.ayatTo?.toString() || "",
    page_from: suggestions?.pageFrom?.toString() || "",
    page_to: suggestions?.pageTo?.toString() || "",
    grade: "",
    date: new Date().toISOString().slice(0, 10) // Default to today's date
  });
  const [weekRange] = useState(currentWeek.weekRange);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isPageRange, setIsPageRange] = useState(false);

  // Auto-fill Juz based on page input
  useEffect(() => {
    const pageFrom = parseInt(form.page_from);
    const pageTo = form.page_to ? parseInt(form.page_to) : undefined;
    
    if (pageFrom && pageFrom >= 1 && pageFrom <= 604) {
      const juz = getJuzFromPageRange(pageFrom, pageTo);
      if (juz && juz.toString() !== form.juzuk) {
        setForm(f => ({ ...f, juzuk: juz.toString() }));
      }
    }
  }, [form.page_from, form.page_to, form.juzuk]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For single page, ensure page_to equals page_from
    if (!isPageRange && form.page_from && !form.page_to) {
      setForm(f => ({ ...f, page_to: f.page_from }));
    }
    
    const requiredPageValidation = isPageRange 
      ? (!form.page_from || !form.page_to)
      : !form.page_from;
      
    if (!form.surah || !form.ayat_from || !form.ayat_to || requiredPageValidation || !form.grade) {
      setError("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Store the actual submission date (not the week end date)
      const submissionDate = form.date;
      
      const newAyatFrom = parseInt(form.ayat_from);
      const newAyatTo = parseInt(form.ayat_to);
      const newPageFrom = form.page_from ? parseInt(form.page_from) : null;
      const newPageTo = form.page_to ? parseInt(form.page_to) : null;
      
      // For single page, ensure page_to equals page_from
      const finalPageTo = isPageRange ? newPageTo : newPageFrom;

      // Create new report with actual submission date
      // Each submission is now stored as a separate record
      const { error: insertError } = await supabase.from("reports").insert([{
        teacher_id: userId,
        student_id: student.id,
        type: reportType,
        surah: form.surah,
        juzuk: form.juzuk ? parseInt(form.juzuk) : null,
        ayat_from: newAyatFrom,
        ayat_to: newAyatTo,
        page_from: newPageFrom,
        page_to: finalPageTo,
        grade: form.grade,
        date: submissionDate // Store actual submission date
      }]);

      if (insertError) {
        setError(insertError.message);
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError("Failed to create report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            Add {reportType} Report
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Student Info */}
          <div className="sm:col-span-2 p-3 bg-blue-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700">Student: {student.name}</div>
            <div className="text-sm text-gray-600">Type: {reportType}</div>
            <div className="text-xs text-gray-500 mt-1">Week: {weekRange}</div>
          </div>

          {/* Surah */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1 text-gray-700">Surah *</label>
            <select
              value={form.surah}
              onChange={e => setForm(f => ({ ...f, surah: e.target.value }))}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            >
              <option value="">Select a surah</option>
              {SURAHS.map(surah => (
                <option key={surah} value={surah}>{surah}</option>
              ))}
            </select>
          </div>

          {/* Ayat Range */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1 text-gray-700">Ayat Range *</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="From"
                value={form.ayat_from}
                onChange={e => setForm(f => ({ ...f, ayat_from: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
              />
              <input
                type="number"
                placeholder="To"
                value={form.ayat_to}
                onChange={e => setForm(f => ({ ...f, ayat_to: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
              />
            </div>
          </div>

          {/* Page */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1 text-gray-700">Page *</label>
            
            {!isPageRange ? (
              /* Single Page Input */
              <input
                type="number"
                placeholder="Page number"
                value={form.page_from}
                onChange={e => {
                  const value = e.target.value;
                  setForm(f => ({ 
                    ...f, 
                    page_from: value,
                    page_to: value // Keep both in sync for single page
                  }));
                }}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
              />
            ) : (
              /* Page Range Inputs */
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="From"
                  value={form.page_from}
                  onChange={e => setForm(f => ({ ...f, page_from: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                />
                <input
                  type="number"
                  placeholder="To"
                  value={form.page_to}
                  onChange={e => setForm(f => ({ ...f, page_to: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                />
              </div>
            )}
            
            {/* Page Range Toggle */}
            <div className="flex items-center mt-2">
              <input
                type="checkbox"
                id="pageRange"
                checked={isPageRange}
                onChange={e => {
                  setIsPageRange(e.target.checked);
                  // Clear page_to when switching to single page
                  if (!e.target.checked) {
                    setForm(f => ({ ...f, page_to: f.page_from }));
                  }
                }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="pageRange" className="ml-2 text-sm text-gray-600">
                Multiple pages (page range)
              </label>
            </div>
          </div>

          {/* Juzuk - Auto-calculated section */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Juzuk <span className="text-xs text-gray-500 font-normal">(Auto-filled)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={form.juzuk || ""}
                readOnly
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-blue-50/50 text-gray-700 text-sm cursor-not-allowed focus:ring-0 focus:border-gray-300"
                placeholder="Auto-filled from pages"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Grade */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Grade *</label>
            <select
              value={form.grade}
              onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            >
              <option value="">Select a grade</option>
              {GRADES.map(g => (
                <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            />
          </div>

          {error && (
            <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="sm:col-span-2 flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}