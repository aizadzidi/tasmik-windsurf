"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { countBusinessDays } from "@/lib/dateUtils";
import { useTeachingModeContext } from "@/contexts/TeachingModeContext";
import type { LeaveApplication, LeaveBalanceSummary, LeaveType } from "@/types/leave";
import { LEAVE_TYPES } from "@/types/leave";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual_leave: "Annual Leave",
  medical_leave: "Medical Leave",
  unpaid_leave: "Unpaid Leave",
  maternity_leave: "Maternity Leave",
  paternity_leave: "Paternity Leave",
  ihsan_leave: "Ihsan Leave",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-200 text-slate-700",
};

export default function TeacherLeavePage() {
  const router = useRouter();
  const { mode, programScope } = useTeachingModeContext();
  const [balances, setBalances] = useState<LeaveBalanceSummary[]>([]);
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [leaveType, setLeaveType] = useState<LeaveType>("annual_leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const liveDayCount =
    startDate && endDate && new Date(startDate) <= new Date(endDate)
      ? countBusinessDays(startDate, endDate)
      : 0;

  const hasCampusLeaveAccess =
    programScope === "campus" ||
    (programScope === "mixed" && mode === "campus");

  useEffect(() => {
    if (programScope === "online" || (programScope === "mixed" && mode === "online")) {
      router.replace("/teacher");
    }
  }, [mode, programScope, router]);

  const fetchBalances = useCallback(async () => {
    try {
      const res = await authFetch("/api/teacher/leave/balance");
      if (!res.ok) throw new Error("Failed to load balances");
      const data = await res.json();
      const summaries: LeaveBalanceSummary[] = (data ?? []).map(
        (b: { leave_type: LeaveType; entitled_days: number; used_days: number }) => ({
          leave_type: b.leave_type,
          label: LEAVE_TYPE_LABELS[b.leave_type] ?? b.leave_type,
          entitled_days: b.entitled_days,
          used_days: b.used_days,
          remaining_days: b.entitled_days === 0 ? Infinity : b.entitled_days - b.used_days,
          is_unlimited: b.entitled_days === 0,
        })
      );
      // Sort by LEAVE_TYPES order
      const typeOrder = LEAVE_TYPES.map((lt) => lt.value);
      summaries.sort((a, b) => typeOrder.indexOf(a.leave_type) - typeOrder.indexOf(b.leave_type));
      setBalances(summaries);
    } catch {
      // Silently handle - balances will show empty
    }
  }, []);

  const fetchApplications = useCallback(async () => {
    try {
      const year = new Date().getFullYear();
      const res = await authFetch(`/api/teacher/leave?year=${year}`);
      if (!res.ok) throw new Error("Failed to load applications");
      const data = await res.json();
      setApplications(data ?? []);
    } catch {
      // Silently handle
    }
  }, []);

  useEffect(() => {
    if (!hasCampusLeaveAccess) return;
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchBalances(), fetchApplications()]);
      setLoading(false);
    };
    load();
  }, [fetchBalances, fetchApplications, hasCampusLeaveAccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await authFetch("/api/teacher/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          reason: reason || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit leave application");
      }

      setSuccess("Leave application submitted successfully!");
      setStartDate("");
      setEndDate("");
      setReason("");
      await Promise.all([fetchBalances(), fetchApplications()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (appId: string, status: string) => {
    const msg = status === "approved"
      ? "Cancel this approved leave? Your balance will be restored."
      : "Withdraw this leave application?";
    if (!confirm(msg)) return;
    setCancellingId(appId);
    setError("");
    setSuccess("");
    try {
      let res;
      if (status === "approved") {
        // Cancel approved leave via PUT (sets status to "cancelled", restores balance)
        res = await authFetch("/api/teacher/leave", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ application_id: appId }),
        });
      } else {
        // Delete pending leave
        res = await authFetch(`/api/teacher/leave?id=${appId}`, {
          method: "DELETE",
        });
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      setSuccess("Leave application cancelled.");
      await Promise.all([fetchBalances(), fetchApplications()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancellingId(null);
    }
  };

  const balanceColors: Record<string, { bg: string; bar: string; icon: string }> = {
    annual_leave: { bg: "from-blue-50 to-blue-100/50", bar: "bg-blue-500", icon: "text-blue-600" },
    medical_leave: { bg: "from-emerald-50 to-emerald-100/50", bar: "bg-emerald-500", icon: "text-emerald-600" },
    unpaid_leave: { bg: "from-slate-50 to-slate-100/50", bar: "bg-slate-500", icon: "text-slate-600" },
    maternity_leave: { bg: "from-pink-50 to-pink-100/50", bar: "bg-pink-500", icon: "text-pink-600" },
    paternity_leave: { bg: "from-indigo-50 to-indigo-100/50", bar: "bg-indigo-500", icon: "text-indigo-600" },
    ihsan_leave: { bg: "from-amber-50 to-amber-100/50", bar: "bg-amber-500", icon: "text-amber-600" },
  };

  if (!hasCampusLeaveAccess) {
    return <main className="min-h-screen bg-[#F2F2F7] p-4 sm:p-6" />;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F2F2F7] p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-white/60 rounded-xl" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-white/60 rounded-2xl" />
              ))}
            </div>
            <div className="h-64 bg-white/60 rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F2F2F7] p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Apply for leave and track your balance
          </p>
        </div>

        {/* Balance Cards — horizontal slider */}
        <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2">
          <div className="flex gap-4" style={{ minWidth: "min-content" }}>
          {balances.map((b) => {
            const colors = balanceColors[b.leave_type] ?? balanceColors.annual_leave;
            const percentage = b.is_unlimited
              ? 0
              : b.entitled_days > 0
              ? Math.min(100, (b.used_days / b.entitled_days) * 100)
              : 0;

            return (
              <div
                key={b.leave_type}
                className={`bg-gradient-to-br ${colors.bg} bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-5 border border-white/60 min-w-[220px] w-[220px] flex-shrink-0`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">{b.label}</h3>
                  <svg className={`w-5 h-5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {b.is_unlimited ? (
                    <span className="text-lg">Unlimited</span>
                  ) : (
                    <>
                      {b.used_days}
                      <span className="text-sm font-normal text-slate-500">
                        {" "}/ {b.entitled_days} days
                      </span>
                    </>
                  )}
                </div>
                {!b.is_unlimited && (
                  <div className="mt-3">
                    <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors.bar} rounded-full transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {b.entitled_days - b.used_days} day(s) remaining
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>

        {/* Apply Form */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-6 border border-white/60">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Apply for Leave</h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Leave Type
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  {LEAVE_TYPES.map((lt) => (
                    <option key={lt.value} value={lt.value}>
                      {lt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                {liveDayCount > 0 && (
                  <div className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium">
                    {liveDayCount} business day{liveDayCount !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  min={startDate || undefined}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                placeholder="Brief reason for leave..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !startDate || !endDate}
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        </div>

        {/* History Table */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-6 border border-white/60">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Leave History</h2>

          {applications.length === 0 ? (
            <p className="text-sm text-slate-500">No leave applications yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Type</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Dates</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Days</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Status</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Remarks</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 px-2 text-slate-800">
                        {LEAVE_TYPE_LABELS[app.leave_type] ?? app.leave_type}
                      </td>
                      <td className="py-3 px-2 text-slate-600">
                        {new Date(app.start_date).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                        })}
                        {" - "}
                        {new Date(app.end_date).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-800 font-medium">
                        {app.total_days}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                            STATUS_STYLES[app.status] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-500 text-xs max-w-[200px] truncate">
                        {app.review_remarks || "-"}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {app.status === "pending" || app.status === "approved" ? (
                          <button
                            onClick={() => handleCancel(app.id, app.status)}
                            disabled={cancellingId === app.id}
                            className="px-2.5 py-1 rounded-lg border border-rose-300 bg-white text-rose-600 text-xs font-semibold shadow-sm hover:bg-rose-50 hover:border-rose-400 hover:shadow transition disabled:opacity-50"
                          >
                            {cancellingId === app.id ? "..." : "Cancel"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
