import React, { useState, useEffect, useMemo } from "react";
import type { Report } from "@/types/teacher";
import { getJuzFromPageRange, getPageRangeFromJuz, getPageWithinJuz } from "@/lib/quranMapping";

interface EditReportModalProps {
  report: Report;
  onSave: (updated: Report) => void;
  onCancel: () => void;
  reportTypes: string[];
  grades: string[];
  surahs: string[];
}

export default function EditReportModal(
  { report, onSave, onCancel, reportTypes, grades, surahs, loading = false, error = "" }:
  EditReportModalProps & { loading?: boolean; error?: string }
) {
  const [form, setForm] = useState<Report>({ ...report });
  const isNewMurajaah = form.type === "New Murajaah";
  const isOldMurajaah = form.type === "Old Murajaah" || form.type === "Murajaah";
  const suggestedJuz = form.juzuk
    ?? (form.page_from
      ? getJuzFromPageRange(form.page_from, form.page_to || undefined)
      : null);
  const suggestedPageFrom = form.page_from ? getPageWithinJuz(form.page_from) : null;
  const suggestedPageTo = form.page_to ? getPageWithinJuz(form.page_to) : null;
  const [juzWithin, setJuzWithin] = useState(suggestedJuz ? String(suggestedJuz) : "");
  const [pageWithinFrom, setPageWithinFrom] = useState(suggestedPageFrom ? String(suggestedPageFrom) : "");
  const [pageWithinTo, setPageWithinTo] = useState(suggestedPageTo ? String(suggestedPageTo) : "");
  const [isWithinRange, setIsWithinRange] = useState(
    Boolean(suggestedPageFrom && suggestedPageTo && suggestedPageFrom !== suggestedPageTo)
  );
  const [reviewAnchorPage, setReviewAnchorPage] = useState(
    form.page_to ? String(form.page_to) : form.page_from ? String(form.page_from) : ""
  );
  const [reviewCount, setReviewCount] = useState(() => {
    if (!form.page_from || !form.page_to) return "3";
    const size = Math.abs(form.page_to - form.page_from) + 1;
    return [3, 4, 5, 10, 20].includes(size) ? String(size) : "3";
  });
  const anchorLocked = Boolean(form.page_to || form.page_from);
  const withinPagePreview = useMemo(() => {
    const juzValue = parseInt(juzWithin, 10);
    const fromValue = parseInt(pageWithinFrom, 10);
    const toValue = parseInt(pageWithinTo, 10);
    if (!juzValue || !fromValue) return null;
    const juzRange = getPageRangeFromJuz(juzValue);
    if (!juzRange) return null;
    const endValue = isWithinRange ? (pageWithinTo ? toValue : null) : fromValue;
    if (!endValue || endValue < 1 || endValue > 20 || fromValue < 1 || fromValue > 20) {
      return null;
    }
    const absoluteFrom = juzRange.startPage + Math.min(fromValue, endValue) - 1;
    const absoluteTo = juzRange.startPage + Math.max(fromValue, endValue) - 1;
    return { from: absoluteFrom, to: absoluteTo };
  }, [isWithinRange, juzWithin, pageWithinFrom, pageWithinTo]);
  const reviewRangePreview = useMemo(() => {
    const anchorValue = parseInt(reviewAnchorPage, 10);
    const countValue = parseInt(reviewCount, 10);
    if (!anchorValue || !countValue) return null;
    const from = Math.max(1, anchorValue - countValue + 1);
    return { from, to: anchorValue, count: countValue };
  }, [reviewAnchorPage, reviewCount]);

  useEffect(() => {
    if (!isOldMurajaah) return;
    if (juzWithin || pageWithinFrom || pageWithinTo) return;
    if (suggestedJuz) setJuzWithin(String(suggestedJuz));
    if (suggestedPageFrom) setPageWithinFrom(String(suggestedPageFrom));
    if (suggestedPageTo) setPageWithinTo(String(suggestedPageTo));
  }, [
    isOldMurajaah,
    juzWithin,
    pageWithinFrom,
    pageWithinTo,
    suggestedJuz,
    suggestedPageFrom,
    suggestedPageTo
  ]);

  // Auto-fill Juz based on page input
  useEffect(() => {
    if (isNewMurajaah || isOldMurajaah) return;
    const pageFrom = form.page_from;
    const pageTo = form.page_to;
    
    if (pageFrom && pageFrom >= 1 && pageFrom <= 604) {
      const juz = getJuzFromPageRange(pageFrom, pageTo || undefined);
      if (juz && juz !== form.juzuk) {
        setForm(f => ({ ...f, juzuk: juz }));
      }
    }
  }, [form.page_from, form.page_to, form.juzuk, isNewMurajaah, isOldMurajaah]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((f: Report) => ({ ...f, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Basic validation
    if (!form.type || !form.surah || !form.grade || !form.ayat_from || !form.ayat_to) {
      // Set error via parent
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("edit-modal-error", {
          detail: "Please fill in all required fields."
        }));
      }
      return;
    }
    let resolvedPageFrom = form.page_from ? Number(form.page_from) : null;
    let resolvedPageTo = form.page_to ? Number(form.page_to) : null;
    let resolvedJuz = form.juzuk ? Number(form.juzuk) : null;
    if (isOldMurajaah) {
      const juzValue = parseInt(juzWithin, 10);
      const fromValue = parseInt(pageWithinFrom, 10);
      const toValue = parseInt(pageWithinTo, 10);
      const endValue = isWithinRange ? toValue : fromValue;
      if (!juzValue || !fromValue || !endValue) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("edit-modal-error", {
            detail: "Please fill in all required fields."
          }));
        }
        return;
      }
      const juzRange = getPageRangeFromJuz(juzValue);
      if (!juzRange) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("edit-modal-error", {
            detail: "Invalid Juz selection."
          }));
        }
        return;
      }
      if (fromValue < 1 || fromValue > 20 || endValue < 1 || endValue > 20) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("edit-modal-error", {
            detail: "Page within Juz must be between 1 and 20."
          }));
        }
        return;
      }
      resolvedPageFrom = juzRange.startPage + Math.min(fromValue, endValue) - 1;
      resolvedPageTo = juzRange.startPage + Math.max(fromValue, endValue) - 1;
      resolvedJuz = juzValue;
    } else if (isNewMurajaah) {
      const anchorValue = parseInt(reviewAnchorPage, 10);
      const countValue = parseInt(reviewCount, 10);
      if (!anchorValue || !countValue) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("edit-modal-error", {
            detail: "Please fill in all required fields."
          }));
        }
        return;
      }
      const fromValue = Math.max(1, anchorValue - countValue + 1);
      resolvedPageFrom = fromValue;
      resolvedPageTo = anchorValue;
      resolvedJuz = getJuzFromPageRange(anchorValue, anchorValue);
    }
    onSave({
      ...form,
      juzuk: resolvedJuz,
      ayat_from: Number(form.ayat_from),
      ayat_to: Number(form.ayat_to),
      page_from: resolvedPageFrom,
      page_to: resolvedPageTo,
    });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Edit Report</h3>
          <button 
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1 text-gray-700">Type *</label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            >
              {reportTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1 text-gray-700">Surah *</label>
            <select
              name="surah"
              value={form.surah}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            >
              {surahs.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {isOldMurajaah && (
            <div className="sm:col-span-2 rounded-xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-amber-700">Old Murajaah (Juz-based)</div>
                  <div className="text-xs text-amber-600">Use Juz + page within Juz (1-20)</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Old</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-amber-700 mb-1">Juz *</label>
                  <select
                    value={juzWithin}
                    onChange={(e) => setJuzWithin(e.target.value)}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 text-sm bg-white"
                  >
                    <option value="">Select</option>
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                      <option key={juz} value={juz}>{juz}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-amber-700 mb-1">Page in Juz *</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="1"
                    value={pageWithinFrom}
                    onChange={(e) => setPageWithinFrom(e.target.value)}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 text-sm"
                  />
                </div>
                {isWithinRange && (
                  <div>
                    <label className="block text-xs text-amber-700 mb-1">Page to *</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      placeholder="20"
                      value={pageWithinTo}
                      onChange={(e) => setPageWithinTo(e.target.value)}
                      className="w-full border border-amber-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 text-sm"
                    />
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isWithinRange}
                    onChange={(e) => {
                      setIsWithinRange(e.target.checked);
                      if (!e.target.checked) {
                        setPageWithinTo("");
                      }
                    }}
                    className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-amber-200 rounded"
                  />
                  Range within Juz
                </label>
                <span className="rounded-full bg-white px-3 py-1 border border-amber-200">
                  {withinPagePreview ? `Absolute pages: ${withinPagePreview.from}-${withinPagePreview.to}` : "Select Juz + page"}
                </span>
              </div>
            </div>
          )}

          {isNewMurajaah && (
            <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-700">New Murajaah (Recent pages)</div>
                  <div className="text-xs text-emerald-600">Review latest pages from current Juz</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">New</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-emerald-700 mb-1">Anchor Page</label>
                  <input
                    type="number"
                    min="1"
                    max="604"
                    placeholder="Page"
                    value={reviewAnchorPage}
                    onChange={(e) => setReviewAnchorPage(e.target.value)}
                    readOnly={anchorLocked}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${
                      anchorLocked
                        ? "bg-emerald-50/60 text-emerald-700 border-emerald-200 cursor-not-allowed"
                        : "border-emerald-200 focus:ring-2 focus:ring-emerald-400"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-emerald-700 mb-1">Review Size *</label>
                  <select
                    value={reviewCount}
                    onChange={(e) => setReviewCount(e.target.value)}
                    className="w-full border border-emerald-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 text-sm bg-white"
                  >
                    {[3, 4, 5, 10, 20].map((count) => (
                      <option key={count} value={count}>
                        Last {count} pages
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-700">
                <span className="rounded-full bg-white px-3 py-1 border border-emerald-200">
                  {reviewRangePreview
                    ? `Pages ${reviewRangePreview.from}-${reviewRangePreview.to}`
                    : "Select recent pages"}
                </span>
                <span className="text-emerald-600">
                  {reviewRangePreview
                    ? `Juz ${getJuzFromPageRange(reviewRangePreview.to, reviewRangePreview.to) ?? "-"}`
                    : "Juz auto"}
                </span>
              </div>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1 text-gray-700">Ayat Range *</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                name="ayat_from"
                type="number"
                required
                value={form.ayat_from}
                onChange={handleChange}
                placeholder="From"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
              />
              <input
                name="ayat_to"
                type="number"
                required
                value={form.ayat_to}
                onChange={handleChange}
                placeholder="To"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
              />
            </div>
          </div>

          {!isNewMurajaah && !isOldMurajaah && (
            <>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1 text-gray-700">Page</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="page_from"
                    type="number"
                    value={form.page_from ?? ""}
                    onChange={handleChange}
                    placeholder="From"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                  <input
                    name="page_to"
                    type="number"
                    value={form.page_to ?? ""}
                    onChange={handleChange}
                    placeholder="To"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Juzuk <span className="text-xs text-gray-500 font-normal">(Auto-filled)</span>
                </label>
                <input
                  name="juzuk"
                  type="number"
                  min="1"
                  value={form.juzuk ?? ""}
                  readOnly
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-blue-50/50 text-gray-700 text-sm cursor-not-allowed"
                  placeholder="Auto-filled from pages"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Grade *</label>
            <select
              name="grade"
              value={form.grade ?? ""}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            >
              <option value="">Select a grade</option>
              {grades.map((g) => (
                <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Date</label>
            <input
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 text-sm"
            />
          </div>

          {error && (
            <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="sm:col-span-2 flex gap-3 pt-4">
            <button
              type="button"
              className="flex-1 px-4 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
