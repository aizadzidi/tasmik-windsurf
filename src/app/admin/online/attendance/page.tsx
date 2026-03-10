"use client";

import React from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import OnlineAttendancePlanner from "@/components/admin/OnlineAttendancePlanner";
import { Card } from "@/components/ui/Card";
import { authFetch } from "@/lib/authFetch";

type PlannerPayload = React.ComponentProps<typeof OnlineAttendancePlanner>["payload"];

const extractError = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const candidate = (payload as { error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }
  return fallback;
};

const startOfCurrentWeek = () => {
  const now = new Date();
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = current.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + diff);
  return current.toISOString().slice(0, 10);
};

export default function AdminOnlineAttendancePage() {
  const [week, setWeek] = React.useState(startOfCurrentWeek());
  const [selectedTeacherId, setSelectedTeacherId] = React.useState("");
  const [payload, setPayload] = React.useState<PlannerPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const refreshData = React.useCallback(
    async (withLoading = true, nextTeacherId = selectedTeacherId) => {
      if (withLoading) setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ week });
        if (nextTeacherId) query.set("teacher_id", nextTeacherId);
        const response = await authFetch(`/api/admin/online/attendance/planner?${query.toString()}`);
        const nextPayload = (await response.json()) as PlannerPayload & { error?: string };
        if (!response.ok) {
          throw new Error(extractError(nextPayload, "Failed to load online attendance planner"));
        }
        setPayload(nextPayload);
        if (!nextTeacherId && nextPayload.selected_teacher?.id) {
          setSelectedTeacherId(nextPayload.selected_teacher.id);
        }
      } catch (refreshError) {
        setError(
          refreshError instanceof Error ? refreshError.message : "Failed to load online attendance planner"
        );
      } finally {
        if (withLoading) setLoading(false);
      }
    },
    [selectedTeacherId, week],
  );

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(186,230,253,0.45),_transparent_34%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <AdminNavbar />
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={week}
              onChange={(event) => setWeek(event.target.value)}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
            />
            <AdminScopeSwitch />
          </div>
        </header>

        {payload ? (
          <OnlineAttendancePlanner
            payload={payload}
            loading={loading}
            error={error}
            selectedTeacherId={selectedTeacherId || payload.selected_teacher?.id || ""}
            onTeacherChange={(teacherId) => {
              setSelectedTeacherId(teacherId);
              void refreshData(false, teacherId);
            }}
            onRefresh={() => refreshData(false)}
          />
        ) : (
          <Card className="p-6 text-sm text-slate-500">
            {loading ? "Loading online attendance..." : error || "Planner unavailable."}
          </Card>
        )}
      </div>
    </div>
  );
}
