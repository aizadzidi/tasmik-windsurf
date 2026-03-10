import { authFetch } from "@/lib/authFetch";
import type {
  AdminLiveSessionItem,
  AttendanceAnalyticsRow,
  BulkMarkPayload,
  CampusAttendanceMark,
  CampusAttendanceStatus,
  CampusSessionDetail,
  CampusSessionTemplate,
  LatenessHeatmapRow,
  SessionTemplatePayload,
  TeacherRiskStudent,
  TeacherSessionQueueItem,
} from "@/types/campusAttendance";

const parseJson = async <T>(response: Response): Promise<T & { error?: string }> => {
  try {
    return (await response.json()) as T & { error?: string };
  } catch {
    return { error: response.statusText } as T & { error?: string };
  }
};

const ensureOk = (response: Response, body: { error?: string }, fallback: string) => {
  if (!response.ok) {
    throw new Error(body.error || fallback);
  }
};

export async function listTeacherSessions(date: string): Promise<TeacherSessionQueueItem[]> {
  const response = await authFetch(`/api/teacher/attendance/sessions?date=${encodeURIComponent(date)}`, {
    cache: "no-store",
  });
  const body = await parseJson<{ sessions: TeacherSessionQueueItem[] }>(response);
  ensureOk(response, body, "Failed to load sessions");
  return body.sessions ?? [];
}

export async function getTeacherSessionDetail(sessionId: string): Promise<CampusSessionDetail> {
  const response = await authFetch(`/api/teacher/attendance/sessions/${encodeURIComponent(sessionId)}`, {
    cache: "no-store",
  });
  const body = await parseJson<CampusSessionDetail>(response);
  ensureOk(response, body, "Failed to load session");
  return body;
}

export async function bulkMarkTeacherSession(
  sessionId: string,
  payload: BulkMarkPayload,
): Promise<CampusSessionDetail> {
  const response = await authFetch(
    `/api/teacher/attendance/sessions/${encodeURIComponent(sessionId)}/marks/bulk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const body = await parseJson<CampusSessionDetail>(response);
  ensureOk(response, body, "Failed to save attendance");
  return body;
}

export async function finalizeTeacherSession(
  sessionId: string,
  note?: string,
): Promise<CampusSessionDetail> {
  const response = await authFetch(
    `/api/teacher/attendance/sessions/${encodeURIComponent(sessionId)}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note ?? null }),
    },
  );
  const body = await parseJson<CampusSessionDetail>(response);
  ensureOk(response, body, "Failed to finalize session");
  return body;
}

export async function reopenTeacherSession(
  sessionId: string,
  reason: string,
): Promise<CampusSessionDetail> {
  const response = await authFetch(
    `/api/teacher/attendance/sessions/${encodeURIComponent(sessionId)}/reopen`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
  const body = await parseJson<CampusSessionDetail>(response);
  ensureOk(response, body, "Failed to reopen session");
  return body;
}

export async function listTeacherRiskStudents(): Promise<TeacherRiskStudent[]> {
  const response = await authFetch("/api/teacher/attendance/risk", { cache: "no-store" });
  const body = await parseJson<{ students: TeacherRiskStudent[] }>(response);
  ensureOk(response, body, "Failed to load risk students");
  return body.students ?? [];
}

export async function listAdminLiveSessions(date: string): Promise<AdminLiveSessionItem[]> {
  const response = await authFetch(`/api/admin/attendance/live?date=${encodeURIComponent(date)}`, {
    cache: "no-store",
  });
  const body = await parseJson<{ sessions: AdminLiveSessionItem[] }>(response);
  ensureOk(response, body, "Failed to load live sessions");
  return body.sessions ?? [];
}

export async function getAdminSessionDetail(sessionId: string): Promise<CampusSessionDetail> {
  const response = await authFetch(`/api/admin/attendance/sessions/${encodeURIComponent(sessionId)}`, {
    cache: "no-store",
  });
  const body = await parseJson<CampusSessionDetail>(response);
  ensureOk(response, body, "Failed to load session detail");
  return body;
}

export async function overrideAdminAttendanceMark(
  markId: string,
  status: CampusAttendanceStatus,
  reason: string,
  notes?: string,
): Promise<CampusAttendanceMark> {
  const response = await authFetch(
    `/api/admin/attendance/marks/${encodeURIComponent(markId)}/override`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason, notes: notes ?? null }),
    },
  );
  const body = await parseJson<{ mark: CampusAttendanceMark }>(response);
  ensureOk(response, body, "Failed to override attendance");
  return body.mark;
}

export async function getAdminAttendanceAnalytics(params: {
  from: string;
  to: string;
  classId?: string;
  teacherId?: string;
}): Promise<{ rows: AttendanceAnalyticsRow[]; heatmap: LatenessHeatmapRow[] }> {
  const url = new URL("/api/admin/attendance/analytics", window.location.origin);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);
  if (params.classId) url.searchParams.set("classId", params.classId);
  if (params.teacherId) url.searchParams.set("teacherId", params.teacherId);

  const response = await authFetch(`${url.pathname}${url.search}`, { cache: "no-store" });
  const body = await parseJson<{ rows: AttendanceAnalyticsRow[]; heatmap: LatenessHeatmapRow[] }>(
    response,
  );
  ensureOk(response, body, "Failed to load analytics");
  return { rows: body.rows ?? [], heatmap: body.heatmap ?? [] };
}

export async function listScheduleTemplates(): Promise<CampusSessionTemplate[]> {
  const response = await authFetch("/api/admin/attendance/schedules/templates", { cache: "no-store" });
  const body = await parseJson<{ templates: CampusSessionTemplate[] }>(response);
  ensureOk(response, body, "Failed to load templates");
  return body.templates ?? [];
}

export async function createScheduleTemplate(
  payload: SessionTemplatePayload,
): Promise<CampusSessionTemplate> {
  const response = await authFetch("/api/admin/attendance/schedules/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ template: CampusSessionTemplate }>(response);
  ensureOk(response, body, "Failed to create template");
  return body.template;
}

export async function updateScheduleTemplate(
  id: string,
  payload: Partial<{
    class_id: string;
    subject_id: string | null;
    teacher_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    effective_from: string;
    effective_to: string | null;
    is_active: boolean;
    notes: string | null;
  }>,
): Promise<CampusSessionTemplate> {
  const response = await authFetch(`/api/admin/attendance/schedules/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ template: CampusSessionTemplate }>(response);
  ensureOk(response, body, "Failed to update template");
  return body.template;
}

export async function regenerateSchedules(from: string, to: string): Promise<{ generated: number; rosterEntries: number }> {
  const response = await authFetch("/api/admin/attendance/schedules/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  const body = await parseJson<{ generated: number; rosterEntries: number }>(response);
  ensureOk(response, body, "Failed to regenerate schedules");
  return {
    generated: body.generated ?? 0,
    rosterEntries: body.rosterEntries ?? 0,
  };
}
