"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  bulkMarkTeacherSession,
  finalizeTeacherSession,
  getTeacherSessionDetail,
  listTeacherRiskStudents,
  listTeacherSessions,
  reopenTeacherSession,
} from "@/lib/campusAttendanceApi";
import type {
  CampusAttendanceStatus,
  TeacherRiskStudent,
  TeacherSessionDetail,
  TeacherSessionQueueItem,
} from "@/types/campusAttendance";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  ShieldAlert,
  Users,
} from "lucide-react";

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const timeLabel = (value: string) => value.slice(0, 5);

const statusStyles: Record<CampusAttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700 border-emerald-100",
  late: "bg-amber-50 text-amber-700 border-amber-100",
  absent: "bg-rose-50 text-rose-700 border-rose-100",
};

const priorityStyles: Record<TeacherSessionQueueItem["priority"], string> = {
  overdue: "bg-rose-50 text-rose-700 border-rose-100",
  ongoing: "bg-amber-50 text-amber-700 border-amber-100",
  upcoming: "bg-blue-50 text-blue-700 border-blue-100",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  holiday: "bg-slate-100 text-slate-700 border-slate-200",
};

const statusOrder: CampusAttendanceStatus[] = ["present", "late", "absent"];

type TabKey = "queue" | "history" | "risk";

type UndoState = {
  sessionId: string;
  previousStatuses: Record<string, CampusAttendanceStatus>;
  timerId: number;
};

export default function TeacherAttendanceV2() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("queue");
  const [date, setDate] = React.useState(() => toDateKey(new Date()));
  const [sessions, setSessions] = React.useState<TeacherSessionQueueItem[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null);

  const [detail, setDetail] = React.useState<TeacherSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [finalizeBusy, setFinalizeBusy] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [statusDraft, setStatusDraft] = React.useState<Record<string, CampusAttendanceStatus>>({});
  const [undoState, setUndoState] = React.useState<UndoState | null>(null);

  const [riskStudents, setRiskStudents] = React.useState<TeacherRiskStudent[]>([]);
  const [loadingRisk, setLoadingRisk] = React.useState(false);

  const [reopenReason, setReopenReason] = React.useState("");

  const syncDraftFromDetail = React.useCallback((nextDetail: TeacherSessionDetail | null) => {
    if (!nextDetail) {
      setStatusDraft({});
      return;
    }
    const next: Record<string, CampusAttendanceStatus> = {};
    nextDetail.students.forEach((student) => {
      next[student.student_id] = student.status;
    });
    setStatusDraft(next);
  }, []);

  const loadSessions = React.useCallback(async () => {
    setLoadingSessions(true);
    setSessionError(null);
    try {
      const rows = await listTeacherSessions(date);
      setSessions(rows);
      if (!selectedSessionId && rows.length > 0) {
        setSelectedSessionId(rows[0].id);
      }
      if (selectedSessionId && !rows.some((row) => row.id === selectedSessionId)) {
        setSelectedSessionId(rows[0]?.id ?? null);
      }
    } catch (error) {
      setSessions([]);
      setSessionError(error instanceof Error ? error.message : "Failed to load sessions");
      setSelectedSessionId(null);
    } finally {
      setLoadingSessions(false);
    }
  }, [date, selectedSessionId]);

  const loadDetail = React.useCallback(async () => {
    if (!selectedSessionId) {
      setDetail(null);
      syncDraftFromDetail(null);
      return;
    }

    setLoadingDetail(true);
    setDetailError(null);
    try {
      const nextDetail = await getTeacherSessionDetail(selectedSessionId);
      setDetail(nextDetail);
      syncDraftFromDetail(nextDetail);
      setSelectedIds(new Set());
    } catch (error) {
      setDetail(null);
      syncDraftFromDetail(null);
      setDetailError(error instanceof Error ? error.message : "Failed to load session details");
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedSessionId, syncDraftFromDetail]);

  const loadRisk = React.useCallback(async () => {
    setLoadingRisk(true);
    try {
      const rows = await listTeacherRiskStudents();
      setRiskStudents(rows);
    } catch {
      setRiskStudents([]);
    } finally {
      setLoadingRisk(false);
    }
  }, []);

  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  React.useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  React.useEffect(() => {
    if (activeTab === "risk") {
      loadRisk();
    }
  }, [activeTab, loadRisk]);

  React.useEffect(() => {
    return () => {
      if (undoState?.timerId) {
        window.clearTimeout(undoState.timerId);
      }
    };
  }, [undoState]);

  const pushUndo = React.useCallback(
    (sessionId: string, previousStatuses: Record<string, CampusAttendanceStatus>) => {
      if (undoState?.timerId) {
        window.clearTimeout(undoState.timerId);
      }

      const timerId = window.setTimeout(() => {
        setUndoState(null);
      }, 5000);

      setUndoState({ sessionId, previousStatuses, timerId });
    },
    [undoState],
  );

  const saveUpdates = React.useCallback(
    async (updates: Array<{ student_id: string; status: CampusAttendanceStatus }>) => {
      if (!detail || updates.length === 0) return;
      setSaveBusy(true);
      try {
        const next = await bulkMarkTeacherSession(detail.session.id, { updates });
        setDetail(next);
        syncDraftFromDetail(next);
        await loadSessions();
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "Failed to save attendance");
      } finally {
        setSaveBusy(false);
      }
    },
    [detail, loadSessions, syncDraftFromDetail],
  );

  const handleToggleSelect = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const applyStatusToSelection = React.useCallback(
    (status: CampusAttendanceStatus) => {
      if (!detail) return;
      const targetIds =
        selectedIds.size > 0 ? Array.from(selectedIds) : detail.students.map((student) => student.student_id);

      const previousStatuses: Record<string, CampusAttendanceStatus> = {};
      targetIds.forEach((id) => {
        previousStatuses[id] = statusDraft[id] ?? "present";
      });

      const nextDraft = { ...statusDraft };
      targetIds.forEach((id) => {
        nextDraft[id] = status;
      });
      setStatusDraft(nextDraft);

      pushUndo(detail.session.id, previousStatuses);
      void saveUpdates(targetIds.map((student_id) => ({ student_id, status })));
    },
    [detail, pushUndo, saveUpdates, selectedIds, statusDraft],
  );

  const undoBulk = async () => {
    if (!undoState || !detail || undoState.sessionId !== detail.session.id) {
      setUndoState(null);
      return;
    }

    if (undoState.timerId) {
      window.clearTimeout(undoState.timerId);
    }

    const updates = Object.entries(undoState.previousStatuses).map(([student_id, status]) => ({
      student_id,
      status,
    }));

    const nextDraft = { ...statusDraft };
    updates.forEach((update) => {
      nextDraft[update.student_id] = update.status;
    });
    setStatusDraft(nextDraft);

    setUndoState(null);
    await saveUpdates(updates);
  };

  const setStudentStatus = async (studentId: string, status: CampusAttendanceStatus) => {
    if (!detail) return;

    setStatusDraft((prev) => ({ ...prev, [studentId]: status }));
    await saveUpdates([{ student_id: studentId, status }]);
  };

  const cycleStudentStatus = async (studentId: string) => {
    const current = statusDraft[studentId] ?? "present";
    const currentIdx = statusOrder.indexOf(current);
    const next = statusOrder[(currentIdx + 1) % statusOrder.length] ?? "present";
    await setStudentStatus(studentId, next);
  };

  const handleFinalize = React.useCallback(async () => {
    if (!detail) return;
    setFinalizeBusy(true);
    try {
      const updated = await finalizeTeacherSession(detail.session.id);
      setDetail(updated);
      syncDraftFromDetail(updated);
      await loadSessions();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Failed to finalize session");
    } finally {
      setFinalizeBusy(false);
    }
  }, [detail, loadSessions, syncDraftFromDetail]);

  const handleReopen = async () => {
    if (!detail || !reopenReason.trim()) return;
    setFinalizeBusy(true);
    try {
      const updated = await reopenTeacherSession(detail.session.id, reopenReason.trim());
      setDetail(updated);
      syncDraftFromDetail(updated);
      setReopenReason("");
      await loadSessions();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Failed to reopen session");
    } finally {
      setFinalizeBusy(false);
    }
  };

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!detail) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (["p", "a", "l"].includes(key)) {
        event.preventDefault();
        const mapped: CampusAttendanceStatus = key === "p" ? "present" : key === "a" ? "absent" : "late";
        applyStatusToSelection(mapped);
      }

      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        if (detail.session.state !== "finalized") {
          void handleFinalize();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [applyStatusToSelection, detail, handleFinalize]);

  const selectedCount = selectedIds.size;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0ecff,transparent_45%),linear-gradient(180deg,#f8fbff_0%,#f2f5f9_100%)]">
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur-md sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Attendance V2</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Session-based Roll Call</h1>
            <p className="mt-2 text-sm text-slate-500">Mobile-first queue for fast attendance marking.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-7 border-0 p-0 text-sm font-medium focus-visible:ring-0"
            />
          </div>
        </header>

        <div className="mb-5 inline-flex rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm">
          {[
            { key: "queue", label: "Today Queue", icon: Clock3 },
            { key: "history", label: "History", icon: History },
            { key: "risk", label: "Student Risk", icon: ShieldAlert },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition",
                activeTab === tab.key
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== "risk" && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Card className="rounded-3xl border border-slate-200 bg-white/90 p-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="border-b border-slate-100 px-4 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  {activeTab === "queue" ? "Session Queue" : "Session History"}
                </CardTitle>
                <p className="text-xs text-slate-500">{dateLabel(date)}</p>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
                {loadingSessions && (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading sessions...
                  </div>
                )}
                {sessionError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                    {sessionError}
                  </div>
                )}
                {!loadingSessions && !sessionError && sessions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                    No sessions for this date. Set schedule templates from admin page.
                  </div>
                )}
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      selectedSessionId === session.id
                        ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{session.class_name}</p>
                        <p className={cn("text-xs", selectedSessionId === session.id ? "text-slate-300" : "text-slate-500")}>{session.subject_name || "General"}</p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase",
                          selectedSessionId === session.id
                            ? "border-white/30 bg-white/10 text-white"
                            : priorityStyles[session.priority],
                        )}
                      >
                        {session.priority}
                      </span>
                    </div>
                    <p className={cn("mt-2 text-xs", selectedSessionId === session.id ? "text-slate-300" : "text-slate-500")}>
                      {timeLabel(session.start_time)} - {timeLabel(session.end_time)}
                    </p>
                    <div className={cn("mt-2 flex items-center gap-2 text-xs", selectedSessionId === session.id ? "text-slate-300" : "text-slate-600")}>
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {session.marked_total}/{session.student_total} marked
                      </span>
                      <span>·</span>
                      <span>{session.absent_total} absent</span>
                      <span>·</span>
                      <span>{session.late_total} late</span>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-200 bg-white/92 p-0 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              {loadingDetail ? (
                <CardContent className="flex min-h-[420px] items-center justify-center text-sm text-slate-600">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading session detail...
                </CardContent>
              ) : !detail ? (
                <CardContent className="min-h-[420px] p-6">
                  {detailError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {detailError}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
                      Pick a session to start marking attendance.
                    </div>
                  )}
                </CardContent>
              ) : (
                <>
                  <CardHeader className="sticky top-0 z-10 rounded-t-3xl border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg text-slate-900">{detail.session.class_name}</CardTitle>
                        <p className="text-xs text-slate-500">
                          {dateLabel(detail.session.session_date)} · {timeLabel(detail.session.start_time)} - {timeLabel(detail.session.end_time)}
                        </p>
                      </div>
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", priorityStyles[detail.session.priority])}>
                        {detail.session.state}
                      </span>
                    </div>

                    {detailError && (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {detailError}
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => applyStatusToSelection("present")}
                        className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
                      >
                        Mark present
                      </button>
                      <button
                        type="button"
                        onClick={() => applyStatusToSelection("late")}
                        className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
                      >
                        Set late
                      </button>
                      <button
                        type="button"
                        onClick={() => applyStatusToSelection("absent")}
                        className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                      >
                        Set absent
                      </button>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                        Selected {selectedCount || detail.students.length}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="max-h-[65vh] space-y-2 overflow-y-auto px-3 py-3">
                    {detail.students.map((student) => (
                      <StudentRow
                        key={student.student_id}
                        studentId={student.student_id}
                        name={student.student_name}
                        checked={selectedIds.has(student.student_id)}
                        status={statusDraft[student.student_id] ?? "present"}
                        onToggleSelect={handleToggleSelect}
                        onSetStatus={setStudentStatus}
                        onCycleStatus={cycleStudentStatus}
                      />
                    ))}
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        )}

        {activeTab === "risk" && (
          <Card className="rounded-3xl border border-slate-200 bg-white/92">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg text-slate-900">Student Risk (Last 30 Days)</CardTitle>
              <p className="text-sm text-slate-500">Ranking based on absent + late pattern.</p>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {loadingRisk && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading risk list...
                </div>
              )}
              {!loadingRisk && riskStudents.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No risk data yet.
                </div>
              )}
              {riskStudents.map((student) => (
                <div
                  key={student.student_id}
                  className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{student.student_name}</p>
                    <p className="text-xs text-slate-500">{student.class_name}</p>
                  </div>
                  <RiskPill label="Risk" value={`${student.risk_score}`} tone={student.risk_score >= 60 ? "high" : student.risk_score >= 30 ? "med" : "low"} />
                  <RiskPill label="Absent" value={`${student.absent_30d}`} tone="high" />
                  <RiskPill label="Late" value={`${student.late_30d}`} tone="med" />
                  <RiskPill label="Total" value={`${student.total_sessions_30d}`} tone="low" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>

      {undoState && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[min(94vw,420px)] -translate-x-1/2 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">Bulk status applied.</div>
            <button
              type="button"
              onClick={() => void undoBulk()}
              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-slate-900"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.07)] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="text-xs text-slate-500 sm:text-sm">
              {saveBusy ? (
                <span>
                  <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                  Saving draft...
                </span>
              ) : (
                <span>
                  <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" />
                  Draft saved
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {detail.session.state === "finalized" ? (
                <>
                  <Input
                    placeholder="Reason to reopen"
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    className="h-9 w-40"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleReopen()}
                    disabled={finalizeBusy || !reopenReason.trim()}
                    className="rounded-xl"
                  >
                    {finalizeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                    Reopen
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleFinalize()}
                  disabled={finalizeBusy}
                  className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  {finalizeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Finalize Session
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentRow({
  studentId,
  name,
  checked,
  status,
  onToggleSelect,
  onSetStatus,
  onCycleStatus,
}: {
  studentId: string;
  name: string;
  checked: boolean;
  status: CampusAttendanceStatus;
  onToggleSelect: (studentId: string) => void;
  onSetStatus: (studentId: string, status: CampusAttendanceStatus) => Promise<void>;
  onCycleStatus: (studentId: string) => Promise<void>;
}) {
  const touchStartRef = React.useRef<number | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartRef.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartRef.current === null) return;
    const end = event.changedTouches[0]?.clientX ?? touchStartRef.current;
    const delta = end - touchStartRef.current;
    touchStartRef.current = null;
    if (Math.abs(delta) < 42) return;

    if (delta < 0) {
      void onSetStatus(studentId, "absent");
    } else {
      void onSetStatus(studentId, "late");
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-[56px] items-center gap-3 rounded-2xl border px-3 py-2 transition",
        checked ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white",
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        aria-label={`Select ${name}`}
        onClick={() => onToggleSelect(studentId)}
        className={cn(
          "h-5 w-5 rounded-md border",
          checked ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white",
        )}
      />
      <button
        type="button"
        onClick={() => void onCycleStatus(studentId)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
        <p className="text-xs text-slate-500">Tap name to cycle status</p>
      </button>
      <div className="flex items-center gap-1">
        {statusOrder.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => void onSetStatus(studentId, option)}
            className={cn(
              "rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize",
              option === status
                ? statusStyles[option]
                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function RiskPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "high" | "med" | "low";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-1 text-center text-xs font-semibold",
        tone === "high"
          ? "border-rose-100 bg-rose-50 text-rose-700"
          : tone === "med"
            ? "border-amber-100 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      <span className="mr-1 text-[10px] uppercase tracking-wide">{label}</span>
      {value}
    </div>
  );
}
