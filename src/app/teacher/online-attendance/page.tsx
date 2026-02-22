"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import { useProgramScope } from "@/hooks/useProgramScope";

type AttendanceSession = {
  claim_id: string;
  student_id: string;
  student_name: string;
  course_name: string;
  session_date: string;
  attendance_status: "present" | "absent" | null;
  attendance_notes: string | null;
  recorded_at: string | null;
};

type AttendancePayload = {
  month: string;
  summary: {
    total_sessions: number;
    marked_sessions: number;
    present_count: number;
    absent_count: number;
    attendance_rate_pct: number;
  };
  sessions: AttendanceSession[];
};

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function TeacherOnlineAttendancePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const { programScope } = useProgramScope({ role: "teacher", userId: teacherId });
  const [month, setMonth] = useState(currentMonthKey());
  const [payload, setPayload] = useState<AttendancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !data.user) {
        window.location.href = "/login";
        return;
      }
      setTeacherId(data.user.id);
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/teacher/online/attendance?month=${month}`);
      const data = (await response.json()) as AttendancePayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch online attendance");
      }
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load attendance");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!teacherId) return;
    loadAttendance();
  }, [teacherId, loadAttendance]);

  const groupedByDate = useMemo(() => {
    if (!payload?.sessions) return [] as Array<{ date: string; sessions: AttendanceSession[] }>;
    const map = new Map<string, AttendanceSession[]>();
    payload.sessions.forEach((session) => {
      const list = map.get(session.session_date) ?? [];
      list.push(session);
      map.set(session.session_date, list);
    });
    return Array.from(map.entries())
      .map(([date, sessions]) => ({
        date,
        sessions: sessions.sort((left, right) => left.student_name.localeCompare(right.student_name)),
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [payload]);

  const markAttendance = async (session: AttendanceSession, status: "present" | "absent") => {
    setBusyClaimId(session.claim_id);
    setError(null);
    try {
      const response = await authFetch("/api/teacher/online/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: session.claim_id,
          session_date: session.session_date,
          status,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to mark attendance");
      }
      await loadAttendance();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Failed to mark attendance");
    } finally {
      setBusyClaimId(null);
    }
  };

  if (programScope === "campus") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar programScope={programScope} />
        <main className="mx-auto max-w-4xl p-6">
          <Card className="p-6">
            <h1 className="text-xl font-semibold text-slate-900">Online Attendance Unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">
              This teacher account is currently scoped to campus programs only.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#eef2ff] to-[#f1f5f9]">
      <Navbar programScope={programScope} />
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Teacher Online Attendance</h1>
          <p className="mt-1 text-sm text-slate-600">
            Mark session-based attendance for each 30-minute online slot.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            {payload && (
              <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                Attendance {payload.summary.attendance_rate_pct}%
              </div>
            )}
          </div>
        </header>

        {error && (
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</Card>
        )}

        <section className="grid gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs uppercase text-slate-500">Total Sessions</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {payload?.summary.total_sessions ?? 0}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-slate-500">Marked</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {payload?.summary.marked_sessions ?? 0}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-slate-500">Present</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {payload?.summary.present_count ?? 0}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-slate-500">Absent</p>
            <p className="mt-1 text-2xl font-semibold text-rose-700">
              {payload?.summary.absent_count ?? 0}
            </p>
          </Card>
        </section>

        <section className="space-y-4">
          {loading ? (
            <Card className="p-4 text-sm text-slate-500">Loading attendance sessions...</Card>
          ) : groupedByDate.length === 0 ? (
            <Card className="p-4 text-sm text-slate-500">No online sessions for this month.</Card>
          ) : (
            groupedByDate.map((group) => (
              <Card key={group.date} className="p-5">
                <h2 className="text-base font-semibold text-slate-900">{dateLabel(group.date)}</h2>
                <div className="mt-3 space-y-3">
                  {group.sessions.map((session) => {
                    const busy = busyClaimId === session.claim_id;
                    return (
                      <div
                        key={session.claim_id}
                        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{session.student_name}</p>
                          <p className="text-xs text-slate-500">{session.course_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              session.attendance_status === "present"
                                ? "bg-emerald-100 text-emerald-700"
                                : session.attendance_status === "absent"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {session.attendance_status ?? "unmarked"}
                          </span>
                          <Button
                            type="button"
                            className="h-8 rounded-lg bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => markAttendance(session, "present")}
                          >
                            Present
                          </Button>
                          <Button
                            type="button"
                            className="h-8 rounded-lg bg-rose-600 px-3 text-xs text-white hover:bg-rose-700 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => markAttendance(session, "absent")}
                          >
                            Absent
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
