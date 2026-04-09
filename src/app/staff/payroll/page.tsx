"use client";
import React, { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";
import { downloadPayslipPdf } from "@/lib/payslipPdf";
import type { MonthlyPayroll } from "@/types/payroll";
import { formatRM } from "@/types/payroll";
import Navbar from "@/components/Navbar";

export default function StaffPayrollPage() {
  const [records, setRecords] = useState<MonthlyPayroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchPayslips = useCallback(async () => {
    try {
      const res = await authFetch("/api/staff/payroll");
      if (!res.ok) throw new Error("Failed to load payslips");
      const data = await res.json();
      setRecords(data ?? []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

  const handleDownload = async (record: MonthlyPayroll) => {
    setDownloading(record.id);
    try {
      await downloadPayslipPdf(record);
    } finally {
      setDownloading(null);
    }
  };

  const formatMonth = (dateStr: string) => {
    const [y, m] = dateStr.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-24 pb-12">
        <h1 className="text-2xl font-bold text-white mb-6">My Payslips</h1>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={`skeleton-${i}`} className="animate-pulse bg-white/20 rounded-2xl h-24" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white/20 backdrop-blur-xl rounded-2xl shadow-lg p-8 text-center border border-white/30">
            <svg className="w-12 h-12 mx-auto text-white/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-white/60 text-sm">No finalized payslips available yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                className="bg-white/20 backdrop-blur-xl rounded-2xl shadow-lg p-5 border border-white/30 flex items-center justify-between hover:bg-white/25 transition-colors"
              >
                <div>
                  <p className="font-semibold text-white">{formatMonth(record.payroll_month)}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xl font-bold text-white">{formatRM(record.net_salary)}</span>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Basic: {formatRM(record.basic_salary)} &middot; Deductions: {formatRM(record.total_deductions)}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(record)}
                  disabled={downloading === record.id}
                  className="px-5 py-2.5 rounded-xl bg-white/20 backdrop-blur-sm text-white text-sm font-semibold border border-white/30 hover:bg-white/30 disabled:opacity-50 transition-colors"
                >
                  {downloading === record.id ? "..." : "Download PDF"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
