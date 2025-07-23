import React, { useState } from "react";
import type { Report } from "./page";

interface EditReportModalProps {
  report: Report;
  onSave: (updated: Report) => void;
  onCancel: () => void;
  reportTypes: string[];
  grades: string[];
  surahs: string[];
}

export default function EditReportModal({ report, onSave, onCancel, reportTypes, grades, surahs, loading = false, error = "" }: EditReportModalProps & { loading?: boolean; error?: string }) {
  const [form, setForm] = useState<Report>({ ...report });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((f: Report) => ({ ...f, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Basic validation
    if (!form.type || !form.surah || !form.grade || !form.ayat_from || !form.ayat_to) {
      // Set error via parent
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("edit-modal-error", { detail: "Please fill in all required fields." }));
      return;
    }
    onSave({
      ...form,
      juzuk: form.juzuk ? Number(form.juzuk) : null,
      ayat_from: Number(form.ayat_from),
      ayat_to: Number(form.ayat_to),
      page_from: form.page_from ? Number(form.page_from) : null,
      page_to: form.page_to ? Number(form.page_to) : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-2">
      <form className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl w-full max-w-sm sm:max-w-md flex flex-col gap-2" onSubmit={handleSubmit}>

        <h3 className="text-lg font-extrabold mb-4 text-blue-900 text-center">Edit Report</h3>
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">Type*</label>
          <select name="type" value={form.type} onChange={handleChange} className="w-full border rounded px-2 py-1">
            {reportTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">Surah*</label>
          <select name="surah" value={form.surah} onChange={handleChange} className="w-full border rounded px-2 py-1">
            {surahs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">Juzuk</label>
          <input name="juzuk" type="number" min="1" value={form.juzuk ?? ""} onChange={handleChange} className="w-full border rounded px-2 py-1" />
        </div>
        <div className="mb-2 flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Ayat From*</label>
            <input name="ayat_from" type="number" required value={form.ayat_from} onChange={handleChange} className="w-full border rounded px-2 py-1" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Ayat To*</label>
            <input name="ayat_to" type="number" required value={form.ayat_to} onChange={handleChange} className="w-full border rounded px-2 py-1" />
          </div>
        </div>
        <div className="mb-2 flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Page From</label>
            <input name="page_from" type="number" value={form.page_from ?? ""} onChange={handleChange} className="w-full border rounded px-2 py-1" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Page To</label>
            <input name="page_to" type="number" value={form.page_to ?? ""} onChange={handleChange} className="w-full border rounded px-2 py-1" />
          </div>
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">Grade*</label>
          <select name="grade" value={form.grade ?? ""} onChange={handleChange} className="w-full border rounded px-2 py-1">
            <option value="">Select a grade</option>
            {grades.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">Date</label>
          <input name="date" type="date" value={form.date} onChange={handleChange} className="w-full border rounded px-2 py-1" />
        </div>
        {error && <div className="text-red-600 mb-2 text-center">{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300" onClick={onCancel} disabled={loading}>Cancel</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center min-w-[90px]" disabled={loading}>
            {loading ? <span className="loader mr-2"></span> : null}
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
        <style jsx>{`
          .loader {
            border: 2px solid #e0e7ff;
            border-top: 2px solid #3b82f6;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            animation: spin 0.7s linear infinite;
            display: inline-block;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </form>
    </div>
  );
}
