"use client";

import React from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  createScheduleTemplate,
  getAdminAttendanceAnalytics,
  getAdminSessionDetail,
  listAdminLiveSessions,
  listScheduleTemplates,
  overrideAdminAttendanceMark,
  regenerateSchedules,
  updateScheduleTemplate,
} from "@/lib/campusAttendanceApi";
import { authFetch } from "@/lib/authFetch";
import type {
  AdminLiveSessionItem,
  AttendanceAnalyticsRow,
  CampusAttendanceStatus,
  CampusSessionDetail,
  CampusSessionTemplate,
  LatenessHeatmapRow,
  SessionTemplatePayload,
} from "@/types/campusAttendance";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Clock,
  Loader2,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

type TabKey = "live" | "intervention" | "analytics" | "schedules";

type ClassOption = { id: string; name: string };
type TeacherOption = { id: string; name: string };

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const statusStyles: Record<CampusAttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700 border-emerald-100",
  late: "bg-amber-50 text-amber-700 border-amber-100",
  absent: "bg-rose-50 text-rose-700 border-rose-100",
};

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const defaultTemplateForm = (): SessionTemplatePayload => ({
  class_id: "",
  subject_id: null,
  teacher_id: null,
  day_of_week: 1,
  start_time: "08:00",
  end_time: "09:00",
  effective_from: toDateKey(new Date()),
  effective_to: null,
  is_active: true,
  notes: "",
});

const parseJson = async <T,>(response: Response): Promise<T> => {
  return (await response.json()) as T;
};

export default function AdminAttendanceV2() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("live");
  const [date, setDate] = React.useState(() => toDateKey(new Date()));

  const [liveSessions, setLiveSessions] = React.useState<AdminLiveSessionItem[]>([]);
  const [loadingLive, setLoadingLive] = React.useState(true);
  const [liveError, setLiveError] = React.useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null);

  const [sessionDetail, setSessionDetail] = React.useState<CampusSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  const [overrideReason, setOverrideReason] = React.useState<Record<string, string>>({});
  const [overrideBusyId, setOverrideBusyId] = React.useState<string | null>(null);

  const [analyticsFrom, setAnalyticsFrom] = React.useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return toDateKey(start);
  });
  const [analyticsTo, setAnalyticsTo] = React.useState(() => toDateKey(new Date()));
  const [analyticsRows, setAnalyticsRows] = React.useState<AttendanceAnalyticsRow[]>([]);
  const [heatmapRows, setHeatmapRows] = React.useState<LatenessHeatmapRow[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(false);
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null);

  const [templates, setTemplates] = React.useState<CampusSessionTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = React.useState(false);
  const [templateForm, setTemplateForm] = React.useState<SessionTemplatePayload>(defaultTemplateForm());
  const [editingTemplateId, setEditingTemplateId] = React.useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = React.useState(false);
  const [templateError, setTemplateError] = React.useState<string | null>(null);

  const [classOptions, setClassOptions] = React.useState<ClassOption[]>([]);
  const [teacherOptions, setTeacherOptions] = React.useState<TeacherOption[]>([]);

  const loadLive = React.useCallback(async () => {
    setLoadingLive(true);
    setLiveError(null);
    try {
      const sessions = await listAdminLiveSessions(date);
      setLiveSessions(sessions);
      if (!selectedSessionId && sessions[0]?.id) {
        setSelectedSessionId(sessions[0].id);
      }
      if (selectedSessionId && !sessions.some((session) => session.id === selectedSessionId)) {
        setSelectedSessionId(sessions[0]?.id ?? null);
      }
    } catch (error) {
      setLiveSessions([]);
      setSelectedSessionId(null);
      setLiveError(error instanceof Error ? error.message : "Failed to load live sessions");
    } finally {
      setLoadingLive(false);
    }
  }, [date, selectedSessionId]);

  const loadDetail = React.useCallback(async () => {
    if (!selectedSessionId) {
      setSessionDetail(null);
      return;
    }
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const detail = await getAdminSessionDetail(selectedSessionId);
      setSessionDetail(detail);
    } catch (error) {
      setSessionDetail(null);
      setDetailError(error instanceof Error ? error.message : "Failed to load session detail");
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedSessionId]);

  const loadAnalytics = React.useCallback(async () => {
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const payload = await getAdminAttendanceAnalytics({ from: analyticsFrom, to: analyticsTo });
      setAnalyticsRows(payload.rows);
      setHeatmapRows(payload.heatmap);
    } catch (error) {
      setAnalyticsRows([]);
      setHeatmapRows([]);
      setAnalyticsError(error instanceof Error ? error.message : "Failed to load analytics");
    } finally {
      setLoadingAnalytics(false);
    }
  }, [analyticsFrom, analyticsTo]);

  const loadTemplates = React.useCallback(async () => {
    setLoadingTemplates(true);
    setTemplateError(null);
    try {
      const rows = await listScheduleTemplates();
      setTemplates(rows);
    } catch (error) {
      setTemplates([]);
      setTemplateError(error instanceof Error ? error.message : "Failed to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const loadMeta = React.useCallback(async () => {
    try {
      const [classesRes, teachersRes] = await Promise.all([
        authFetch("/api/admin/classes", { cache: "no-store" }),
        authFetch("/api/admin/users?role=teacher&teaching_scope=campus", {
          cache: "no-store",
        }),
      ]);

      const classesBody = await parseJson<Array<{ id: string; name: string | null }>>(classesRes);
      const teachersBody = await parseJson<Array<{ id: string; name: string | null }>>(teachersRes);

      setClassOptions(
        (Array.isArray(classesBody) ? classesBody : [])
          .filter((row) => row?.id)
          .map((row) => ({ id: String(row.id), name: row.name || "Unnamed class" })),
      );

      setTeacherOptions(
        (Array.isArray(teachersBody) ? teachersBody : [])
          .filter((row) => row?.id)
          .map((row) => ({ id: String(row.id), name: row.name || "Unnamed teacher" })),
      );
    } catch {
      setClassOptions([]);
      setTeacherOptions([]);
    }
  }, []);

  React.useEffect(() => {
    loadLive();
  }, [loadLive]);

  React.useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  React.useEffect(() => {
    if (activeTab === "analytics") {
      loadAnalytics();
    }
    if (activeTab === "schedules") {
      loadTemplates();
      loadMeta();
    }
  }, [activeTab, loadAnalytics, loadMeta, loadTemplates]);

  const handleOverride = async (markId: string, status: CampusAttendanceStatus) => {
    const reason = overrideReason[markId]?.trim() || "";
    if (!reason) {
      setDetailError("Override reason is required.");
      return;
    }

    setOverrideBusyId(markId);
    try {
      await overrideAdminAttendanceMark(markId, status, reason);
      await loadDetail();
      await loadLive();
      setOverrideReason((prev) => ({ ...prev, [markId]: "" }));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Failed to override mark");
    } finally {
      setOverrideBusyId(null);
    }
  };

  const handleSubmitTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTemplateBusy(true);
    setTemplateError(null);

    try {
      if (!templateForm.class_id) {
        throw new Error("Class is required.");
      }

      if (editingTemplateId) {
        await updateScheduleTemplate(editingTemplateId, {
          class_id: templateForm.class_id,
          subject_id: templateForm.subject_id,
          teacher_id: templateForm.teacher_id,
          day_of_week: templateForm.day_of_week,
          start_time: templateForm.start_time,
          end_time: templateForm.end_time,
          effective_from: templateForm.effective_from,
          effective_to: templateForm.effective_to,
          is_active: templateForm.is_active,
          notes: templateForm.notes || null,
        });
      } else {
        await createScheduleTemplate({
          ...templateForm,
          notes: templateForm.notes || null,
        });
      }

      setEditingTemplateId(null);
      setTemplateForm(defaultTemplateForm());
      await loadTemplates();
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setTemplateBusy(false);
    }
  };

  const startEditTemplate = (template: CampusSessionTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateForm({
      class_id: template.class_id,
      subject_id: template.subject_id,
      teacher_id: template.teacher_id,
      day_of_week: template.day_of_week,
      start_time: template.start_time.slice(0, 5),
      end_time: template.end_time.slice(0, 5),
      effective_from: template.effective_from,
      effective_to: template.effective_to,
      is_active: template.is_active,
      notes: template.notes || "",
    });
    setActiveTab("schedules");
  };

  const handleRegenerate = async () => {
    setTemplateBusy(true);
    setTemplateError(null);
    try {
      await regenerateSchedules(date, (() => {
        const end = new Date(`${date}T00:00:00`);
        end.setDate(end.getDate() + 30);
        return toDateKey(end);
      })());
      await loadLive();
      await loadTemplates();
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "Failed to regenerate schedules");
    } finally {
      setTemplateBusy(false);
    }
  };

  const summary = React.useMemo(() => {
    const totalSessions = liveSessions.length;
    const overdue = liveSessions.filter((session) => session.is_overdue).length;
    const finalized = liveSessions.filter((session) => session.state === "finalized").length;
    const attendanceMarks = liveSessions.reduce((sum, session) => sum + session.marked_total, 0);
    return { totalSessions, overdue, finalized, attendanceMarks };
  }, [liveSessions]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#d8e7ff,transparent_45%),linear-gradient(180deg,#f7f9fc_0%,#eff4fa_100%)] text-slate-900">
      <AdminNavbar />

      <main className="mx-auto max-w-7xl space-y-5 px-4 pb-10 pt-6 sm:px-6">
        <header className="rounded-3xl border border-slate-200/70 bg-white/90 px-5 py-5 shadow-[0_22px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Attendance V2</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Campus Session Operations</h1>
          <p className="mt-2 text-sm text-slate-500">
            Live monitor, intervention, analytics and schedule automation in one place.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Sessions" value={`${summary.totalSessions}`} icon={Clock} />
          <SummaryCard label="Overdue" value={`${summary.overdue}`} icon={AlertTriangle} tone="warn" />
          <SummaryCard label="Finalized" value={`${summary.finalized}`} icon={ShieldCheck} tone="ok" />
          <SummaryCard label="Marks" value={`${summary.attendanceMarks}`} icon={BarChart3} />
        </div>

        <div className="inline-flex rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm">
          {[
            { key: "live", label: "Live Monitor", icon: Clock },
            { key: "intervention", label: "Intervention", icon: ShieldCheck },
            { key: "analytics", label: "Analytics", icon: BarChart3 },
            { key: "schedules", label: "Schedule Manager", icon: SlidersHorizontal },
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

        {(activeTab === "live" || activeTab === "intervention") && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card className="rounded-3xl border border-slate-200 bg-white/90 p-0">
              <CardHeader className="border-b border-slate-100 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Live Sessions</CardTitle>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <Input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className="h-7 border-0 p-0 text-sm focus-visible:ring-0"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
                {loadingLive && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading live sessions...
                  </div>
                )}
                {liveError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                    {liveError}
                  </div>
                )}
                {!loadingLive && !liveError && liveSessions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                    No sessions for this date.
                  </div>
                )}
                {liveSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      selectedSessionId === session.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{session.class_name}</p>
                      {session.is_overdue && (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                          overdue
                        </span>
                      )}
                    </div>
                    <p className={cn("text-xs", selectedSessionId === session.id ? "text-slate-300" : "text-slate-500")}>
                      {shortDate(session.session_date)} · {session.start_time.slice(0, 5)} - {session.end_time.slice(0, 5)}
                    </p>
                    <p className={cn("mt-1 text-xs", selectedSessionId === session.id ? "text-slate-300" : "text-slate-600")}>
                      {session.marked_total}/{session.student_total} marked · {session.absent_total} absent · {session.late_total} late
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-200 bg-white/92 p-0">
              <CardHeader className="border-b border-slate-100 px-4 py-4">
                <CardTitle className="text-base">
                  {activeTab === "live" ? "Session Snapshot" : "Intervention Panel"}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
                {loadingDetail && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading session detail...
                  </div>
                )}
                {detailError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                    {detailError}
                  </div>
                )}
                {!loadingDetail && !sessionDetail && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                    Select a session to view details.
                  </div>
                )}
                {sessionDetail?.students.map((student) => (
                  <div
                    key={student.student_id}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{student.student_name}</p>
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", statusStyles[student.status])}>
                        {student.status}
                      </span>
                    </div>

                    {activeTab === "intervention" && (
                      <div className="mt-2 space-y-2">
                        <Input
                          placeholder="Override reason (required)"
                          value={overrideReason[student.mark_id ?? ""] ?? ""}
                          onChange={(event) => {
                            const key = student.mark_id ?? "";
                            setOverrideReason((prev) => ({ ...prev, [key]: event.target.value }));
                          }}
                          disabled={!student.mark_id}
                        />
                        <div className="flex flex-wrap gap-2">
                          {(["present", "late", "absent"] as CampusAttendanceStatus[]).map((status) => (
                            <Button
                              key={status}
                              type="button"
                              variant={status === student.status ? "default" : "outline"}
                              className={cn(
                                "rounded-xl capitalize",
                                status === student.status
                                  ? "bg-slate-900 text-white hover:bg-slate-800"
                                  : "",
                              )}
                              disabled={!student.mark_id || overrideBusyId === student.mark_id}
                              onClick={() => {
                                if (!student.mark_id) return;
                                void handleOverride(student.mark_id, status);
                              }}
                            >
                              {overrideBusyId === student.mark_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                status
                              )}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "analytics" && (
          <Card className="rounded-3xl border border-slate-200 bg-white/92">
            <CardHeader className="border-b border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">Attendance Analytics</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" value={analyticsFrom} onChange={(event) => setAnalyticsFrom(event.target.value)} className="w-[152px]" />
                  <Input type="date" value={analyticsTo} onChange={(event) => setAnalyticsTo(event.target.value)} className="w-[152px]" />
                  <Button type="button" onClick={() => void loadAnalytics()} className="rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                    {loadingAnalytics ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {analyticsError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                  {analyticsError}
                </div>
              )}
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left">Date</th>
                      <th className="px-3 py-3 text-left">Class</th>
                      <th className="px-3 py-3 text-center">Total</th>
                      <th className="px-3 py-3 text-center">Present %</th>
                      <th className="px-3 py-3 text-center">Absent %</th>
                      <th className="px-3 py-3 text-center">Late %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsRows.map((row) => (
                      <tr key={`${row.bucket_date}_${row.class_id}_${row.teacher_id ?? "none"}`} className="border-t border-slate-100">
                        <td className="px-3 py-3">{shortDate(row.bucket_date)}</td>
                        <td className="px-3 py-3">{row.class_name}</td>
                        <td className="px-3 py-3 text-center">{row.total_marks}</td>
                        <td className="px-3 py-3 text-center text-emerald-700">{row.present_rate_pct}%</td>
                        <td className="px-3 py-3 text-center text-rose-700">{row.absent_rate_pct}%</td>
                        <td className="px-3 py-3 text-center text-amber-700">{row.late_rate_pct}%</td>
                      </tr>
                    ))}
                    {!loadingAnalytics && analyticsRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                          No analytics rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Lateness Heatmap</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {heatmapRows.map((row) => (
                    <div key={`${row.day_of_week}_${row.hour_bucket}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase text-slate-500">
                        {dayLabels[row.day_of_week]} · {String(row.hour_bucket).padStart(2, "0")}:00
                      </p>
                      <p className="text-sm font-semibold text-slate-900">{row.late_rate_pct}% late</p>
                      <p className="text-xs text-slate-500">
                        {row.late_count}/{row.total_count} marks
                      </p>
                    </div>
                  ))}
                  {!loadingAnalytics && heatmapRows.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-4">
                      No heatmap data.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "schedules" && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Card className="rounded-3xl border border-slate-200 bg-white/92">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">Schedule Templates</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => void handleRegenerate()}
                    disabled={templateBusy}
                  >
                    {templateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Regenerate 30 days
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[72vh] space-y-2 overflow-y-auto p-4">
                {loadingTemplates && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading templates...
                  </div>
                )}
                {templateError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                    {templateError}
                  </div>
                )}
                {!loadingTemplates && templates.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                    No templates. Create one on the form.
                  </div>
                )}
                {templates.map((template) => (
                  <div key={template.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{template.classes?.name || "Class"}</p>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", template.is_active ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600")}>
                        {template.is_active ? "active" : "inactive"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {dayLabels[template.day_of_week]} · {template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)}
                    </p>
                    <p className="text-xs text-slate-500">Teacher: {template.users?.name || "Unassigned"}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2 h-8 rounded-lg"
                      onClick={() => startEditTemplate(template)}
                    >
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-slate-200 bg-white/92">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-lg">{editingTemplateId ? "Edit Template" : "Create Template"}</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <form className="space-y-3" onSubmit={handleSubmitTemplate}>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Class</label>
                    <select
                      value={templateForm.class_id}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, class_id: event.target.value }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      required
                    >
                      <option value="">Select class</option>
                      {classOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Teacher</label>
                    <select
                      value={templateForm.teacher_id || ""}
                      onChange={(event) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          teacher_id: event.target.value ? event.target.value : null,
                        }))
                      }
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {teacherOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700">Day</label>
                      <select
                        value={templateForm.day_of_week}
                        onChange={(event) =>
                          setTemplateForm((prev) => ({ ...prev, day_of_week: Number(event.target.value) }))
                        }
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      >
                        {dayLabels.map((label, index) => (
                          <option key={label} value={index}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700">Start date</label>
                      <Input
                        type="date"
                        value={templateForm.effective_from}
                        onChange={(event) =>
                          setTemplateForm((prev) => ({ ...prev, effective_from: event.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700">Start time</label>
                      <Input
                        type="time"
                        value={templateForm.start_time}
                        onChange={(event) =>
                          setTemplateForm((prev) => ({ ...prev, start_time: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700">End time</label>
                      <Input
                        type="time"
                        value={templateForm.end_time}
                        onChange={(event) =>
                          setTemplateForm((prev) => ({ ...prev, end_time: event.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Notes</label>
                    <textarea
                      className="min-h-[86px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={templateForm.notes || ""}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      type="submit"
                      disabled={templateBusy}
                      className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                    >
                      {templateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {editingTemplateId ? "Update template" : "Create template"}
                    </Button>
                    {editingTemplateId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingTemplateId(null);
                          setTemplateForm(defaultTemplateForm());
                        }}
                        className="rounded-xl"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "default" | "warn" | "ok";
}) {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white/88 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "rounded-xl p-2",
            tone === "warn"
              ? "bg-rose-50 text-rose-700"
              : tone === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-700",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-lg font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}
