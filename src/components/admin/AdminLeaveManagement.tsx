"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/authFetch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { LeaveApplication, LeaveEntitlement, StaffPosition, LeaveType } from "@/types/leave";
import { STAFF_POSITIONS, LEAVE_TYPES } from "@/types/leave";

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

interface StaffBalance {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  balances: { leave_type: string; entitled_days: number; used_days: number }[];
}

export default function AdminLeaveManagement() {
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [staffBalances, setStaffBalances] = useState<StaffBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [savingEntitlements, setSavingEntitlements] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Search states
  const [appSearch, setAppSearch] = useState("");
  const [balanceSearch, setBalanceSearch] = useState("");

  // Review modal state
  const [reviewingApp, setReviewingApp] = useState<LeaveApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | "cancel">("approve");
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Balance detail modal
  const [selectedStaff, setSelectedStaff] = useState<StaffBalance | null>(null);

  // Entitlement edit state
  const [entitlementEdits, setEntitlementEdits] = useState<
    Record<string, number>
  >({});

  const fetchApplications = useCallback(async () => {
    try {
      const url =
        statusFilter === "all"
          ? "/api/admin/leave"
          : `/api/admin/leave?status=${statusFilter}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error("Failed to load applications");
      const data = await res.json();
      setApplications(data ?? []);
    } catch {
      // Silently handle
    }
  }, [statusFilter]);

  const fetchEntitlements = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/leave/entitlements");
      if (!res.ok) throw new Error("Failed to load entitlements");
      const data = await res.json();

      const edits: Record<string, number> = {};
      (data ?? []).forEach((ent: LeaveEntitlement) => {
        edits[`${ent.position}__${ent.leave_type}`] = ent.days_per_year;
      });
      setEntitlementEdits(edits);
    } catch {
      // Silently handle
    }
  }, []);

  const fetchBalances = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/leave/balances");
      if (!res.ok) throw new Error("Failed to load balances");
      const data = await res.json();
      setStaffBalances(data ?? []);
    } catch {
      // Silently handle
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchApplications(), fetchEntitlements(), fetchBalances()]);
      setLoading(false);
    };
    load();
  }, [fetchApplications, fetchEntitlements, fetchBalances]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Filtered applications by search
  const filteredApplications = useMemo(() => {
    if (!appSearch.trim()) return applications;
    const q = appSearch.toLowerCase();
    return applications.filter(
      (app) => (app.user_name ?? "").toLowerCase().includes(q)
    );
  }, [applications, appSearch]);

  // Filtered balances by search
  const filteredBalances = useMemo(() => {
    if (!balanceSearch.trim()) return staffBalances;
    const q = balanceSearch.toLowerCase();
    return staffBalances.filter(
      (s) => s.user_name.toLowerCase().includes(q)
    );
  }, [staffBalances, balanceSearch]);

  // Get staff leave history for detail modal
  const staffHistory = useMemo(() => {
    if (!selectedStaff) return [];
    return applications.filter((app) => app.user_id === selectedStaff.user_id);
  }, [applications, selectedStaff]);

  const handleReview = async () => {
    if (!reviewingApp) return;
    setReviewSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const res = await authFetch("/api/admin/leave", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: reviewingApp.id,
          action: reviewAction,
          remarks: reviewRemarks || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to review application");
      }

      setSuccess(
        `Leave application ${reviewAction === "approve" ? "approved" : reviewAction === "reject" ? "rejected" : "cancelled"} successfully.`
      );
      setReviewingApp(null);
      setReviewRemarks("");
      await Promise.all([fetchApplications(), fetchBalances()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleSaveEntitlements = async () => {
    setSavingEntitlements(true);
    setError("");
    setSuccess("");

    try {
      const promises = Object.entries(entitlementEdits).map(([key, value]) => {
        const [position, leave_type] = key.split("__");
        return authFetch("/api/admin/leave/entitlements", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position, leave_type, days_per_year: value }),
        });
      });

      const results = await Promise.all(promises);
      const failed = results.find((r) => !r.ok);
      if (failed) throw new Error("Some entitlements failed to save");

      setSuccess("Entitlements saved successfully.");
      await Promise.all([fetchEntitlements(), fetchBalances()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEntitlements(false);
    }
  };

  const getEntitlementValue = (position: StaffPosition, leaveType: LeaveType): number => {
    return entitlementEdits[`${position}__${leaveType}`] ?? 0;
  };

  const setEntitlementValue = (position: StaffPosition, leaveType: LeaveType, value: number) => {
    setEntitlementEdits((prev) => ({
      ...prev,
      [`${position}__${leaveType}`]: value,
    }));
  };

  const getBalanceForType = (staff: StaffBalance, leaveType: string) => {
    return staff.balances.find((b) => b.leave_type === leaveType);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-white/60 rounded-xl" />
          <div className="h-64 bg-white/60 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leave Management</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review applications and configure entitlements
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          {success}
        </div>
      )}

      <Tabs defaultValue="applications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Applications Tab */}
        <TabsContent value="applications">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-6 border border-white/60">
            {/* Search + Status filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                placeholder="Search by staff name..."
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 w-full sm:w-64"
              />
              <div className="flex flex-wrap gap-2">
                {["all", "pending", "approved", "rejected", "cancelled"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition capitalize ${
                      statusFilter === s
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {filteredApplications.length === 0 ? (
              <p className="text-sm text-slate-500">No leave applications found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Staff</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Type</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Dates</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Days</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Reason</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Applied</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Status</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApplications.map((app) => (
                      <tr key={app.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 px-2">
                          <button
                            onClick={() => {
                              const staff = staffBalances.find((s) => s.user_id === app.user_id);
                              if (staff) setSelectedStaff(staff);
                            }}
                            className="text-left"
                          >
                            <div className="font-medium text-slate-800 hover:text-blue-600 cursor-pointer transition-colors">
                              {app.user_name ?? "Unknown"}
                            </div>
                          </button>
                          {app.user_role && (
                            <div className="text-xs text-slate-400 capitalize">{app.user_role}</div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-slate-700">
                          {LEAVE_TYPE_LABELS[app.leave_type] ?? app.leave_type}
                        </td>
                        <td className="py-3 px-2 text-slate-600 text-xs">
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
                        <td className="py-3 px-2 text-center font-medium text-slate-800">
                          {app.total_days}
                        </td>
                        <td className="py-3 px-2 text-slate-500 text-xs max-w-[200px] truncate">
                          {app.reason || "-"}
                        </td>
                        <td className="py-3 px-2 text-slate-500 text-xs whitespace-nowrap">
                          {new Date(app.created_at).toLocaleDateString("en-MY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
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
                        <td className="py-3 px-2 text-center">
                          {app.status === "pending" ? (
                            <div className="flex justify-center gap-1">
                              <button
                                onClick={() => {
                                  setReviewingApp(app);
                                  setReviewAction("approve");
                                  setReviewRemarks("");
                                }}
                                className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-white text-emerald-700 text-xs font-semibold shadow-sm hover:bg-emerald-50 hover:border-emerald-400 hover:shadow transition"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  setReviewingApp(app);
                                  setReviewAction("reject");
                                  setReviewRemarks("");
                                }}
                                className="px-2.5 py-1 rounded-lg border border-rose-300 bg-white text-rose-600 text-xs font-semibold shadow-sm hover:bg-rose-50 hover:border-rose-400 hover:shadow transition"
                              >
                                Reject
                              </button>
                            </div>
                          ) : app.status === "approved" ? (
                            <button
                              onClick={() => {
                                setReviewingApp(app);
                                setReviewAction("cancel");
                                setReviewRemarks("");
                              }}
                              className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-700 text-xs font-semibold shadow-sm hover:bg-amber-50 hover:border-amber-400 hover:shadow transition"
                            >
                              Cancel
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
        </TabsContent>

        {/* Balances Tab */}
        <TabsContent value="balances">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-6 border border-white/60">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by staff name..."
                value={balanceSearch}
                onChange={(e) => setBalanceSearch(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 w-full sm:w-64"
              />
            </div>

            {filteredBalances.length === 0 ? (
              <p className="text-sm text-slate-500">No staff balances found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Staff</th>
                      {LEAVE_TYPES.map((lt) => (
                        <th key={lt.value} className="text-center py-3 px-2 font-semibold text-slate-600">{lt.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBalances.map((staff) => (
                      <tr key={staff.user_id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 px-2">
                          <div className="font-medium text-slate-800">
                            {staff.user_name}
                          </div>
                          {staff.user_role && (
                            <div className="text-xs text-slate-400 capitalize">{staff.user_role}</div>
                          )}
                        </td>
                        {LEAVE_TYPES.map(({ value: lt }) => {
                          const bal = getBalanceForType(staff, lt);
                          return (
                            <td key={lt} className="py-3 px-2 text-center">
                              {bal ? (
                                <span className="text-sm font-medium text-slate-700">
                                  {bal.used_days} / {bal.entitled_days === 0 ? "\u221E" : bal.entitled_days}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          {/* Leave Entitlements */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-6 border border-white/60">
            <h3 className="text-base font-semibold text-slate-900 mb-4">
              Leave Entitlements (days per year)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Set 0 for unlimited (e.g., unpaid leave). Changes apply to new balance
              initializations.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Position</th>
                    {LEAVE_TYPES.map((lt) => (
                      <th
                        key={lt.value}
                        className="text-center py-3 px-2 font-semibold text-slate-600"
                      >
                        {lt.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STAFF_POSITIONS.map((pos) => (
                    <tr key={pos.value} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 px-2 font-medium text-slate-800">{pos.label}</td>
                      {LEAVE_TYPES.map((lt) => (
                        <td key={lt.value} className="py-3 px-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={getEntitlementValue(pos.value, lt.value)}
                            onChange={(e) =>
                              setEntitlementValue(
                                pos.value,
                                lt.value,
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-16 px-2 py-1 rounded-lg border border-slate-200 bg-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <button
                onClick={handleSaveEntitlements}
                disabled={savingEntitlements}
                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {savingEntitlements ? "Saving..." : "Save Entitlements"}
              </button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Review Modal */}
      {reviewingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setReviewingApp(null)}
          />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {reviewAction === "approve" ? "Approve" : reviewAction === "reject" ? "Reject" : "Cancel"} Leave
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {reviewingApp.user_name} &middot;{" "}
              {LEAVE_TYPE_LABELS[reviewingApp.leave_type] ?? reviewingApp.leave_type} &middot;{" "}
              {reviewingApp.total_days} day(s)
            </p>

            {reviewingApp.reason && (
              <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
                <span className="font-medium">Reason:</span> {reviewingApp.reason}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Remarks (optional)
              </label>
              <textarea
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                placeholder="Add remarks..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReviewingApp(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition"
              >
                Close
              </button>
              <button
                onClick={handleReview}
                disabled={reviewSubmitting}
                className={`px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-md transition disabled:opacity-50 ${
                  reviewAction === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : reviewAction === "reject"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {reviewSubmitting
                  ? "Processing..."
                  : reviewAction === "approve"
                  ? "Approve"
                  : reviewAction === "reject"
                  ? "Reject"
                  : "Cancel Leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Balance Detail Modal */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setSelectedStaff(null)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {selectedStaff.user_name}
                </h3>
                <span className="text-xs text-slate-400 capitalize">{selectedStaff.user_role}</span>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {LEAVE_TYPES.map(({ value: lt }) => {
                const bal = getBalanceForType(selectedStaff, lt);
                const used = bal?.used_days ?? 0;
                const entitled = bal?.entitled_days ?? 0;
                const isUnlimited = entitled === 0;
                const pct = isUnlimited ? 0 : Math.min(100, (used / entitled) * 100);

                return (
                  <div key={lt} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-medium text-slate-500 mb-1">
                      {LEAVE_TYPE_LABELS[lt]}
                    </div>
                    <div className="text-lg font-bold text-slate-800">
                      {used} <span className="text-sm font-normal text-slate-400">/ {isUnlimited ? "\u221E" : entitled}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {!isUnlimited && (
                      <div className="text-xs text-slate-400 mt-1">
                        {entitled - used} remaining
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Recent Leave History */}
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Recent Leave History</h4>
            {staffHistory.length === 0 ? (
              <p className="text-xs text-slate-400">No leave history found.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {staffHistory.slice(0, 10).map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <div>
                      <div className="text-xs font-medium text-slate-700">
                        {LEAVE_TYPE_LABELS[app.leave_type] ?? app.leave_type}
                      </div>
                      <div className="text-xs text-slate-400">
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
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">{app.total_days}d</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          STATUS_STYLES[app.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
