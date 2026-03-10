import { supabaseService } from "@/lib/supabaseServiceClient";
import {
  buildPlannedSessionsForRange,
  expandDateRange,
  parseDate,
  toDateKey,
} from "@/lib/campusAttendancePlanner";
import type {
  AdminLiveSessionItem,
  AttendanceAnalyticsRow,
  BulkMarkPayload,
  CampusAttendanceMark,
  CampusAttendanceStatus,
  CampusSessionDetail,
  CampusSessionInstance,
  CampusSessionState,
  CampusSessionTemplate,
  CampusSessionStudent,
  LatenessHeatmapRow,
  TeacherRiskStudent,
  TeacherSessionQueueItem,
} from "@/types/campusAttendance";

const DAY_MS = 24 * 60 * 60 * 1000;

const parseTimeToMinutes = (time: string) => {
  const parts = String(time || "").split(":");
  if (parts.length < 2) return 0;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 0;
  return hour * 60 + minute;
};

const getNowDateKey = () => toDateKey(new Date());

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

const relationName = (value: { name?: string | null } | Array<{ name?: string | null }> | null | undefined) =>
  firstRelation(value)?.name ?? null;

const clampDateRange = (from: string, to: string, maxDays = 60) => {
  const start = parseDate(from);
  const end = parseDate(to);
  if (start > end) {
    throw new Error("from date must be before or equal to to date.");
  }

  const diffDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (diffDays > maxDays) {
    throw new Error(`Date range cannot exceed ${maxDays} days.`);
  }

  return { start, end };
};

const getPriority = (
  sessionDate: string,
  startTime: string,
  endTime: string,
  state: CampusSessionState,
): TeacherSessionQueueItem["priority"] => {
  if (state === "holiday") return "holiday";
  if (state === "finalized") return "completed";

  const now = new Date();
  const todayKey = toDateKey(now);

  if (sessionDate < todayKey) {
    return "overdue";
  }

  if (sessionDate > todayKey) {
    return "upcoming";
  }

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);

  if (nowMins > endMins) return "overdue";
  if (nowMins >= startMins && nowMins <= endMins) return "ongoing";
  return "upcoming";
};

const isSessionClosed = (state: CampusSessionState) =>
  state === "finalized" || state === "holiday" || state === "cancelled";

const getTeacherClassIds = async (tenantId: string, teacherId: string) => {
  const { data, error } = await supabaseService
    .from("students")
    .select("class_id")
    .eq("tenant_id", tenantId)
    .neq("record_type", "prospect")
    .eq("assigned_teacher_id", teacherId)
    .not("class_id", "is", null);

  if (error) throw error;

  return Array.from(
    new Set((data ?? []).map((row) => row.class_id).filter((id): id is string => Boolean(id))),
  );
};

const getSessionAggregateMaps = async (tenantId: string, sessionIds: string[]) => {
  if (sessionIds.length === 0) {
    return {
      rosterCountMap: new Map<string, number>(),
      markBySessionMap: new Map<string, CampusAttendanceMark[]>(),
    };
  }

  const [{ data: rosterRows, error: rosterError }, { data: marksRows, error: marksError }] =
    await Promise.all([
      supabaseService
        .from("campus_session_roster_snapshots")
        .select("session_instance_id")
        .eq("tenant_id", tenantId)
        .in("session_instance_id", sessionIds),
      supabaseService
        .from("campus_attendance_marks")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("session_instance_id", sessionIds),
    ]);

  if (rosterError) throw rosterError;
  if (marksError) throw marksError;

  const rosterCountMap = new Map<string, number>();
  (rosterRows ?? []).forEach((row) => {
    const key = String(row.session_instance_id);
    rosterCountMap.set(key, (rosterCountMap.get(key) ?? 0) + 1);
  });

  const markBySessionMap = new Map<string, CampusAttendanceMark[]>();
  (marksRows ?? []).forEach((row) => {
    const key = String(row.session_instance_id);
    const list = markBySessionMap.get(key) ?? [];
    list.push(row as CampusAttendanceMark);
    markBySessionMap.set(key, list);
  });

  return { rosterCountMap, markBySessionMap };
};

const mapQueueItem = (
  instance: CampusSessionInstance,
  rosterCountMap: Map<string, number>,
  markBySessionMap: Map<string, CampusAttendanceMark[]>,
): TeacherSessionQueueItem => {
  const marks = markBySessionMap.get(instance.id) ?? [];
  const absentTotal = marks.filter((mark) => mark.status === "absent").length;
  const lateTotal = marks.filter((mark) => mark.status === "late").length;

  return {
    id: instance.id,
    session_date: instance.session_date,
    start_time: instance.start_time,
    end_time: instance.end_time,
    state: instance.state,
    class_id: instance.class_id,
    class_name: relationName(instance.classes) ?? "Unknown class",
    subject_name: relationName(instance.subjects),
    teacher_id: instance.teacher_id,
    teacher_name: relationName(instance.users),
    student_total: rosterCountMap.get(instance.id) ?? 0,
    marked_total: marks.length,
    absent_total: absentTotal,
    late_total: lateTotal,
    priority: getPriority(instance.session_date, instance.start_time, instance.end_time, instance.state),
  };
};

const sortQueueByPriority = (rows: TeacherSessionQueueItem[]) => {
  const priorityOrder: Record<TeacherSessionQueueItem["priority"], number> = {
    overdue: 0,
    ongoing: 1,
    upcoming: 2,
    completed: 3,
    holiday: 4,
  };

  return rows.sort((left, right) => {
    const leftRank = priorityOrder[left.priority] ?? 99;
    const rightRank = priorityOrder[right.priority] ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftDateTime = `${left.session_date}T${left.start_time}`;
    const rightDateTime = `${right.session_date}T${right.start_time}`;
    return leftDateTime.localeCompare(rightDateTime);
  });
};

export async function listTeacherSessionsByDate(
  tenantId: string,
  teacherId: string,
  date: string,
): Promise<TeacherSessionQueueItem[]> {
  const classIds = await getTeacherClassIds(tenantId, teacherId);
  if (classIds.length === 0) return [];

  const { data: instances, error } = await supabaseService
    .from("campus_session_instances")
    .select("*, classes(name), subjects(name), users(name)")
    .eq("tenant_id", tenantId)
    .eq("session_date", date)
    .in("class_id", classIds)
    .order("start_time", { ascending: true });

  if (error) throw error;

  const rows = (instances ?? []) as CampusSessionInstance[];
  const sessionIds = rows.map((row) => row.id);
  const { rosterCountMap, markBySessionMap } = await getSessionAggregateMaps(tenantId, sessionIds);

  return sortQueueByPriority(rows.map((row) => mapQueueItem(row, rosterCountMap, markBySessionMap)));
}

const ensureTeacherSessionAccess = async (tenantId: string, teacherId: string, sessionId: string) => {
  const { data: instance, error: instanceError } = await supabaseService
    .from("campus_session_instances")
    .select("*, classes(name), subjects(name), users(name)")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();

  if (instanceError) throw instanceError;
  if (!instance?.id) {
    throw new Error("Session not found.");
  }

  const classIds = await getTeacherClassIds(tenantId, teacherId);
  const hasAccess = classIds.includes(String(instance.class_id)) || instance.teacher_id === teacherId;
  if (!hasAccess) {
    throw new Error("Forbidden");
  }

  return instance as CampusSessionInstance;
};

export async function getTeacherSessionDetail(
  tenantId: string,
  teacherId: string,
  sessionId: string,
): Promise<CampusSessionDetail> {
  const instance = await ensureTeacherSessionAccess(tenantId, teacherId, sessionId);

  const [{ data: rosterRows, error: rosterError }, { data: marksRows, error: marksError }] =
    await Promise.all([
      supabaseService
        .from("campus_session_roster_snapshots")
        .select("student_id, class_id, students(name)")
        .eq("tenant_id", tenantId)
        .eq("session_instance_id", sessionId)
        .order("student_id"),
      supabaseService
        .from("campus_attendance_marks")
        .select("id, student_id, status, source, notes, reason_code")
        .eq("tenant_id", tenantId)
        .eq("session_instance_id", sessionId),
    ]);

  if (rosterError) throw rosterError;
  if (marksError) throw marksError;

  const marksMap = new Map<string, { id: string; status: CampusAttendanceStatus; source: string; notes: string | null; reason_code: string | null }>();

  (marksRows ?? []).forEach((row) => {
    marksMap.set(String(row.student_id), {
      id: String(row.id),
      status: row.status as CampusAttendanceStatus,
      source: String(row.source),
      notes: row.notes ?? null,
      reason_code: row.reason_code ?? null,
    });
  });

  const students: CampusSessionStudent[] = (rosterRows ?? [])
    .map((row) => {
      const mark = marksMap.get(String(row.student_id));
      return {
        student_id: String(row.student_id),
        student_name: relationName(row.students) ?? "Unnamed student",
        class_id: String(row.class_id),
        status: mark?.status ?? "present",
        mark_id: mark?.id ?? null,
        source: (mark?.source as CampusSessionStudent["source"]) ?? null,
        notes: mark?.notes ?? null,
        reason_code: mark?.reason_code ?? null,
      };
    })
    .sort((left, right) => left.student_name.localeCompare(right.student_name));

  const queue = mapQueueItem(
    instance,
    new Map([[instance.id, students.length]]),
    new Map([
      [
        instance.id,
        students
          .filter((student) => student.mark_id)
          .map((student) => ({
            id: student.mark_id as string,
            session_instance_id: instance.id,
            student_id: student.student_id,
            status: student.status,
          })) as CampusAttendanceMark[],
      ],
    ]),
  );

  return { session: queue, students };
}

export async function bulkMarkTeacherSession(
  tenantId: string,
  teacherId: string,
  sessionId: string,
  payload: BulkMarkPayload,
) {
  const instance = await ensureTeacherSessionAccess(tenantId, teacherId, sessionId);

  if (isSessionClosed(instance.state)) {
    throw new Error("This session is locked and cannot be edited.");
  }

  if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
    throw new Error("updates is required.");
  }

  const uniqueStudentIds = Array.from(
    new Set(payload.updates.map((entry) => String(entry.student_id)).filter(Boolean)),
  );

  const { data: rosterRows, error: rosterError } = await supabaseService
    .from("campus_session_roster_snapshots")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("session_instance_id", sessionId)
    .in("student_id", uniqueStudentIds);

  if (rosterError) throw rosterError;

  const rosterIdSet = new Set((rosterRows ?? []).map((row) => String(row.student_id)));
  const invalidStudent = uniqueStudentIds.find((studentId) => !rosterIdSet.has(studentId));
  if (invalidStudent) {
    throw new Error(`Student ${invalidStudent} is not in this session roster.`);
  }

  const rows = payload.updates.map((entry) => ({
    tenant_id: tenantId,
    session_instance_id: sessionId,
    student_id: entry.student_id,
    status: entry.status,
    notes: entry.notes?.trim() || null,
    reason_code: entry.reason_code?.trim() || null,
    source: "teacher",
    marked_by: teacherId,
    marked_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabaseService
    .from("campus_attendance_marks")
    .upsert(rows, { onConflict: "tenant_id,session_instance_id,student_id" });

  if (upsertError) throw upsertError;

  const detail = await getTeacherSessionDetail(tenantId, teacherId, sessionId);
  return detail;
}

export async function finalizeTeacherSession(
  tenantId: string,
  teacherId: string,
  sessionId: string,
  note: string | null,
) {
  const instance = await ensureTeacherSessionAccess(tenantId, teacherId, sessionId);

  if (instance.state === "holiday") {
    throw new Error("Holiday sessions cannot be finalized.");
  }

  if (instance.state === "cancelled") {
    throw new Error("Cancelled sessions cannot be finalized.");
  }

  const { error } = await supabaseService
    .from("campus_session_instances")
    .update({
      state: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: teacherId,
      finalize_note: note,
    })
    .eq("tenant_id", tenantId)
    .eq("id", sessionId);

  if (error) throw error;

  await supabaseService.from("campus_attendance_audit_logs").insert({
    tenant_id: tenantId,
    session_instance_id: sessionId,
    action: "finalize",
    actor_id: teacherId,
    reason: note,
  });

  return getTeacherSessionDetail(tenantId, teacherId, sessionId);
}

export async function reopenTeacherSession(
  tenantId: string,
  teacherId: string,
  sessionId: string,
  reason: string,
) {
  const instance = await ensureTeacherSessionAccess(tenantId, teacherId, sessionId);

  if (instance.state !== "finalized") {
    throw new Error("Only finalized sessions can be reopened.");
  }

  const todayKey = getNowDateKey();
  const diffDays = Math.abs(
    (parseDate(todayKey).getTime() - parseDate(instance.session_date).getTime()) / DAY_MS,
  );

  if (diffDays > 2) {
    throw new Error("Session can only be reopened within 48 hours.");
  }

  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error("A reopen reason is required.");
  }

  const { error } = await supabaseService
    .from("campus_session_instances")
    .update({
      state: "in_progress",
      finalized_at: null,
      finalized_by: null,
      finalize_note: null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", sessionId);

  if (error) throw error;

  await supabaseService.from("campus_attendance_audit_logs").insert({
    tenant_id: tenantId,
    session_instance_id: sessionId,
    action: "reopen",
    actor_id: teacherId,
    reason: cleanReason,
  });

  return getTeacherSessionDetail(tenantId, teacherId, sessionId);
}

export async function getTeacherRiskStudents(
  tenantId: string,
  teacherId: string,
  now = new Date(),
): Promise<TeacherRiskStudent[]> {
  const classIds = await getTeacherClassIds(tenantId, teacherId);
  if (classIds.length === 0) return [];

  const from = new Date(now.getTime() - 30 * DAY_MS);
  const fromKey = toDateKey(from);

  const { data: rosterRows, error: rosterError } = await supabaseService
    .from("students")
    .select("id, name, class_id, classes(name)")
    .eq("tenant_id", tenantId)
    .neq("record_type", "prospect")
    .eq("assigned_teacher_id", teacherId)
    .in("class_id", classIds);
  if (rosterError) throw rosterError;

  const students = (rosterRows ?? []).map((row) => ({
    id: String(row.id),
    name: row.name ?? "Unnamed student",
    class_id: row.class_id ? String(row.class_id) : null,
    class_name: relationName(row.classes) ?? "Unknown class",
  }));

  if (students.length === 0) return [];

  const studentIds = students.map((student) => student.id);

  const { data: markRows, error: markError } = await supabaseService
    .from("campus_attendance_marks")
    .select("student_id, status, campus_session_instances!inner(session_date)")
    .eq("tenant_id", tenantId)
    .in("student_id", studentIds)
    .gte("campus_session_instances.session_date", fromKey);

  if (markError) throw markError;

  const statsByStudent = new Map<
    string,
    { total: number; absent: number; late: number; lastAbsentDate: string | null }
  >();

  (markRows ?? []).forEach((row) => {
    const studentId = String(row.student_id);
    const current = statsByStudent.get(studentId) ?? {
      total: 0,
      absent: 0,
      late: 0,
      lastAbsentDate: null,
    };

    current.total += 1;
    if (row.status === "absent") {
      current.absent += 1;
      const normalizedDate = firstRelation(
        row.campus_session_instances as { session_date?: string | null } | Array<{ session_date?: string | null }> | null | undefined,
      )?.session_date ?? null;
      const date = normalizedDate;
      if (date && (!current.lastAbsentDate || date > current.lastAbsentDate)) {
        current.lastAbsentDate = date;
      }
    }
    if (row.status === "late") {
      current.late += 1;
    }

    statsByStudent.set(studentId, current);
  });

  return students
    .map((student) => {
      const stats = statsByStudent.get(student.id) ?? {
        total: 0,
        absent: 0,
        late: 0,
        lastAbsentDate: null,
      };

      const absentRate = stats.total ? stats.absent / stats.total : 0;
      const lateRate = stats.total ? stats.late / stats.total : 0;
      const riskScore = Math.round((absentRate * 100) * 0.75 + (lateRate * 100) * 0.25);

      return {
        student_id: student.id,
        student_name: student.name,
        class_id: student.class_id,
        class_name: student.class_name,
        total_sessions_30d: stats.total,
        absent_30d: stats.absent,
        late_30d: stats.late,
        risk_score: riskScore,
        last_absent_date: stats.lastAbsentDate,
      };
    })
    .sort((left, right) => {
      if (right.risk_score !== left.risk_score) return right.risk_score - left.risk_score;
      return left.student_name.localeCompare(right.student_name);
    });
}

export async function listAdminLiveSessions(
  tenantId: string,
  date: string,
): Promise<AdminLiveSessionItem[]> {
  const { data: instances, error } = await supabaseService
    .from("campus_session_instances")
    .select("*, classes(name), users(name)")
    .eq("tenant_id", tenantId)
    .eq("session_date", date)
    .order("start_time", { ascending: true });

  if (error) throw error;

  const rows = (instances ?? []) as CampusSessionInstance[];
  const ids = rows.map((row) => row.id);
  const { rosterCountMap, markBySessionMap } = await getSessionAggregateMaps(tenantId, ids);

  const now = new Date();
  const today = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return rows.map((row) => {
    const marks = markBySessionMap.get(row.id) ?? [];
    const absentTotal = marks.filter((mark) => mark.status === "absent").length;
    const lateTotal = marks.filter((mark) => mark.status === "late").length;
    const endMinutes = parseTimeToMinutes(row.end_time);
    const isOverdue =
      row.state !== "finalized" &&
      row.state !== "holiday" &&
      ((row.session_date < today) || (row.session_date === today && nowMinutes > endMinutes));

    return {
      id: row.id,
      session_date: row.session_date,
      start_time: row.start_time,
      end_time: row.end_time,
      state: row.state,
      class_id: row.class_id,
      class_name: relationName(row.classes) ?? "Unknown class",
      teacher_id: row.teacher_id,
      teacher_name: relationName(row.users),
      student_total: rosterCountMap.get(row.id) ?? 0,
      marked_total: marks.length,
      absent_total: absentTotal,
      late_total: lateTotal,
      is_overdue: isOverdue,
    };
  });
}

export async function getAdminSessionDetail(tenantId: string, sessionId: string): Promise<CampusSessionDetail> {
  const { data: instance, error: instanceError } = await supabaseService
    .from("campus_session_instances")
    .select("*, classes(name), subjects(name), users(name)")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();

  if (instanceError) throw instanceError;
  if (!instance?.id) {
    throw new Error("Session not found.");
  }

  const [{ data: rosterRows, error: rosterError }, { data: marksRows, error: marksError }] =
    await Promise.all([
      supabaseService
        .from("campus_session_roster_snapshots")
        .select("student_id, class_id, students(name)")
        .eq("tenant_id", tenantId)
        .eq("session_instance_id", sessionId)
        .order("student_id"),
      supabaseService
        .from("campus_attendance_marks")
        .select("id, student_id, status, source, notes, reason_code")
        .eq("tenant_id", tenantId)
        .eq("session_instance_id", sessionId),
    ]);

  if (rosterError) throw rosterError;
  if (marksError) throw marksError;

  const marksMap = new Map<
    string,
    { id: string; status: CampusAttendanceStatus; source: string; notes: string | null; reason_code: string | null }
  >();

  (marksRows ?? []).forEach((row) => {
    marksMap.set(String(row.student_id), {
      id: String(row.id),
      status: row.status as CampusAttendanceStatus,
      source: String(row.source),
      notes: row.notes ?? null,
      reason_code: row.reason_code ?? null,
    });
  });

  const students: CampusSessionStudent[] = (rosterRows ?? [])
    .map((row) => {
      const mark = marksMap.get(String(row.student_id));
      return {
        student_id: String(row.student_id),
        student_name: relationName(row.students) ?? "Unnamed student",
        class_id: String(row.class_id),
        status: mark?.status ?? "present",
        mark_id: mark?.id ?? null,
        source: (mark?.source as CampusSessionStudent["source"]) ?? null,
        notes: mark?.notes ?? null,
        reason_code: mark?.reason_code ?? null,
      };
    })
    .sort((left, right) => left.student_name.localeCompare(right.student_name));

  const queue = mapQueueItem(
    instance as CampusSessionInstance,
    new Map([[String(instance.id), students.length]]),
    new Map([
      [
        String(instance.id),
        students
          .filter((student) => student.mark_id)
          .map((student) => ({
            id: student.mark_id as string,
            session_instance_id: String(instance.id),
            student_id: student.student_id,
            status: student.status,
          })) as CampusAttendanceMark[],
      ],
    ]),
  );

  return { session: queue, students };
}

export async function overrideAttendanceMark(
  tenantId: string,
  adminUserId: string,
  markId: string,
  status: CampusAttendanceStatus,
  reason: string,
  notes: string | null,
) {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error("Override reason is required.");
  }

  const { data: existing, error: existingError } = await supabaseService
    .from("campus_attendance_marks")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", markId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing?.id) {
    throw new Error("Attendance mark not found.");
  }

  const beforeJson = existing;
  const { data: updated, error: updateError } = await supabaseService
    .from("campus_attendance_marks")
    .update({
      status,
      notes: notes?.trim() || null,
      reason_code: cleanReason,
      source: "admin_override",
      marked_by: adminUserId,
      marked_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", markId)
    .select("*")
    .single();

  if (updateError) throw updateError;

  await supabaseService.from("campus_attendance_audit_logs").insert({
    tenant_id: tenantId,
    mark_id: markId,
    session_instance_id: existing.session_instance_id,
    action: "override",
    actor_id: adminUserId,
    reason: cleanReason,
    before_json: beforeJson,
    after_json: updated,
  });

  return updated as CampusAttendanceMark;
}

export async function getAttendanceAnalytics(
  tenantId: string,
  from: string,
  to: string,
  classId: string | null,
  teacherId: string | null,
): Promise<{ rows: AttendanceAnalyticsRow[]; heatmap: LatenessHeatmapRow[] }> {
  clampDateRange(from, to, 120);

  let sessionQuery = supabaseService
    .from("campus_session_instances")
    .select("id, session_date, start_time, class_id, teacher_id, classes(name), users(name)")
    .eq("tenant_id", tenantId)
    .gte("session_date", from)
    .lte("session_date", to);

  if (classId) {
    sessionQuery = sessionQuery.eq("class_id", classId);
  }
  if (teacherId) {
    sessionQuery = sessionQuery.eq("teacher_id", teacherId);
  }

  const { data: sessions, error: sessionsError } = await sessionQuery;
  if (sessionsError) throw sessionsError;

  const safeSessions = sessions ?? [];
  const sessionIds = safeSessions.map((session) => String(session.id));
  if (sessionIds.length === 0) {
    return { rows: [], heatmap: [] };
  }

  const { data: marks, error: marksError } = await supabaseService
    .from("campus_attendance_marks")
    .select("session_instance_id, status")
    .eq("tenant_id", tenantId)
    .in("session_instance_id", sessionIds);

  if (marksError) throw marksError;

  const marksBySession = new Map<string, Array<{ status: CampusAttendanceStatus }>>();
  (marks ?? []).forEach((mark) => {
    const key = String(mark.session_instance_id);
    const list = marksBySession.get(key) ?? [];
    list.push({ status: mark.status as CampusAttendanceStatus });
    marksBySession.set(key, list);
  });

  const bucketMap = new Map<string, AttendanceAnalyticsRow>();
  const heatMap = new Map<string, { lateCount: number; totalCount: number }>();

  safeSessions.forEach((session) => {
    const sessionMarks = marksBySession.get(String(session.id)) ?? [];
    const total = sessionMarks.length;
    const absent = sessionMarks.filter((mark) => mark.status === "absent").length;
    const late = sessionMarks.filter((mark) => mark.status === "late").length;
    const present = sessionMarks.filter((mark) => mark.status === "present").length;

    const bucketKey = [session.session_date, session.class_id, session.teacher_id ?? ""].join("|");
    const row = bucketMap.get(bucketKey) ?? {
      bucket_date: session.session_date,
      class_id: String(session.class_id),
      class_name: relationName(session.classes) ?? "Unknown class",
      teacher_id: session.teacher_id ? String(session.teacher_id) : null,
      teacher_name: relationName(session.users),
      total_marks: 0,
      present_count: 0,
      absent_count: 0,
      late_count: 0,
      present_rate_pct: 0,
      absent_rate_pct: 0,
      late_rate_pct: 0,
    };

    row.total_marks += total;
    row.present_count += present;
    row.absent_count += absent;
    row.late_count += late;

    bucketMap.set(bucketKey, row);

    const dayOfWeek = parseDate(session.session_date).getDay();
    const hour = Number(String(session.start_time).slice(0, 2)) || 0;
    const heatKey = `${dayOfWeek}|${hour}`;
    const heat = heatMap.get(heatKey) ?? { lateCount: 0, totalCount: 0 };
    heat.lateCount += late;
    heat.totalCount += total;
    heatMap.set(heatKey, heat);
  });

  const rows = Array.from(bucketMap.values())
    .map((row) => {
      if (row.total_marks > 0) {
        row.present_rate_pct = Math.round((row.present_count / row.total_marks) * 100);
        row.absent_rate_pct = Math.round((row.absent_count / row.total_marks) * 100);
        row.late_rate_pct = Math.round((row.late_count / row.total_marks) * 100);
      }
      return row;
    })
    .sort((left, right) => {
      const dateCompare = left.bucket_date.localeCompare(right.bucket_date);
      if (dateCompare !== 0) return dateCompare;
      return left.class_name.localeCompare(right.class_name);
    });

  const heatmap: LatenessHeatmapRow[] = Array.from(heatMap.entries())
    .map(([key, value]) => {
      const [day, hour] = key.split("|");
      const total = value.totalCount;
      const lateRate = total ? Math.round((value.lateCount / total) * 100) : 0;
      return {
        day_of_week: Number(day),
        hour_bucket: Number(hour),
        late_count: value.lateCount,
        total_count: total,
        late_rate_pct: lateRate,
      };
    })
    .sort((left, right) => {
      if (left.day_of_week !== right.day_of_week) {
        return left.day_of_week - right.day_of_week;
      }
      return left.hour_bucket - right.hour_bucket;
    });

  return { rows, heatmap };
}

const normalizeTime = (value: string) => {
  const safe = String(value || "").trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(safe)) {
    throw new Error("Time must be HH:MM or HH:MM:SS.");
  }
  return safe.length === 5 ? `${safe}:00` : safe;
};

export async function createSessionTemplate(
  tenantId: string,
  actorId: string,
  payload: {
    class_id: string;
    subject_id?: string | null;
    teacher_id?: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    effective_from: string;
    effective_to?: string | null;
    is_active?: boolean;
    notes?: string | null;
  },
) {
  if (!Number.isInteger(payload.day_of_week) || payload.day_of_week < 0 || payload.day_of_week > 6) {
    throw new Error("day_of_week must be between 0 and 6.");
  }

  const startTime = normalizeTime(payload.start_time);
  const endTime = normalizeTime(payload.end_time);
  if (parseTimeToMinutes(startTime) >= parseTimeToMinutes(endTime)) {
    throw new Error("end_time must be after start_time.");
  }

  const row = {
    tenant_id: tenantId,
    class_id: payload.class_id,
    subject_id: payload.subject_id ?? null,
    teacher_id: payload.teacher_id ?? null,
    day_of_week: payload.day_of_week,
    start_time: startTime,
    end_time: endTime,
    effective_from: payload.effective_from,
    effective_to: payload.effective_to ?? null,
    is_active: payload.is_active ?? true,
    notes: payload.notes?.trim() || null,
    created_by: actorId,
  };

  const { data, error } = await supabaseService
    .from("campus_session_templates")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;

  return data as CampusSessionTemplate;
}

export async function updateSessionTemplate(
  tenantId: string,
  templateId: string,
  payload: {
    class_id?: string;
    subject_id?: string | null;
    teacher_id?: string | null;
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    effective_from?: string;
    effective_to?: string | null;
    is_active?: boolean;
    notes?: string | null;
  },
) {
  const updates: Record<string, unknown> = {};

  if (payload.class_id) updates.class_id = payload.class_id;
  if (payload.subject_id !== undefined) updates.subject_id = payload.subject_id;
  if (payload.teacher_id !== undefined) updates.teacher_id = payload.teacher_id;
  if (payload.day_of_week !== undefined) {
    if (!Number.isInteger(payload.day_of_week) || payload.day_of_week < 0 || payload.day_of_week > 6) {
      throw new Error("day_of_week must be between 0 and 6.");
    }
    updates.day_of_week = payload.day_of_week;
  }

  if (payload.start_time !== undefined) {
    updates.start_time = normalizeTime(payload.start_time);
  }
  if (payload.end_time !== undefined) {
    updates.end_time = normalizeTime(payload.end_time);
  }
  if (payload.effective_from !== undefined) updates.effective_from = payload.effective_from;
  if (payload.effective_to !== undefined) updates.effective_to = payload.effective_to;
  if (payload.is_active !== undefined) updates.is_active = payload.is_active;
  if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;

  const { data, error } = await supabaseService
    .from("campus_session_templates")
    .update(updates)
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) throw error;

  return data as CampusSessionTemplate;
}

export async function regenerateSessionInstances(
  tenantId: string,
  actorId: string,
  from: string,
  to: string,
) {
  const { start, end } = clampDateRange(from, to, 60);
  const fromKey = toDateKey(start);
  const toKey = toDateKey(end);

  const [{ data: templates, error: templateError }, { data: holidayRows, error: holidayError }] =
    await Promise.all([
      supabaseService
        .from("campus_session_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .lte("effective_from", toKey)
        .or(`effective_to.is.null,effective_to.gte.${fromKey}`),
      supabaseService
        .from("school_holidays")
        .select("start_date, end_date")
        .eq("tenant_id", tenantId)
        .gte("end_date", fromKey)
        .lte("start_date", toKey),
    ]);

  if (templateError) throw templateError;
  if (holidayError) throw holidayError;

  const holidaySet = new Set<string>();
  (holidayRows ?? []).forEach((holiday) => {
    const startDate = parseDate(String(holiday.start_date));
    const endDate = parseDate(String(holiday.end_date));
    expandDateRange(startDate, endDate).forEach((day) => {
      holidaySet.add(toDateKey(day));
    });
  });

  const plannedRows = buildPlannedSessionsForRange({
    templates: (templates ?? []) as CampusSessionTemplate[],
    rangeStart: fromKey,
    rangeEnd: toKey,
    holidayDates: holidaySet,
  });

  const sessionRows: Array<Record<string, unknown>> = plannedRows.map((row) => ({
    tenant_id: tenantId,
    template_id: row.template_id,
    class_id: row.class_id,
    subject_id: row.subject_id,
    teacher_id: row.teacher_id,
    session_date: row.session_date,
    start_time: row.start_time,
    end_time: row.end_time,
    state: row.state,
    generation_source: "auto",
    generated_at: new Date().toISOString(),
    created_by: actorId,
  }));

  if (sessionRows.length === 0) {
    return { generated: 0, rosterEntries: 0 };
  }

  const { data: upserted, error: upsertError } = await supabaseService
    .from("campus_session_instances")
    .upsert(sessionRows, {
      onConflict: "tenant_id,template_id,session_date",
      ignoreDuplicates: false,
    })
    .select("id, class_id");

  if (upsertError) throw upsertError;

  const safeInstances = (upserted ?? []) as Array<{ id: string; class_id: string }>;
  if (safeInstances.length === 0) {
    return { generated: 0, rosterEntries: 0 };
  }

  const classIds = Array.from(new Set(safeInstances.map((instance) => instance.class_id)));
  const { data: students, error: studentError } = await supabaseService
    .from("students")
    .select("id, class_id")
    .eq("tenant_id", tenantId)
    .neq("record_type", "prospect")
    .in("class_id", classIds);

  if (studentError) throw studentError;

  const studentMap = new Map<string, string[]>();
  (students ?? []).forEach((row) => {
    const classId = String(row.class_id);
    const list = studentMap.get(classId) ?? [];
    list.push(String(row.id));
    studentMap.set(classId, list);
  });

  const rosterRows: Array<Record<string, unknown>> = [];
  safeInstances.forEach((instance) => {
    const studentIds = studentMap.get(instance.class_id) ?? [];
    studentIds.forEach((studentId) => {
      rosterRows.push({
        tenant_id: tenantId,
        session_instance_id: instance.id,
        class_id: instance.class_id,
        student_id: studentId,
        source: "auto",
        added_by: actorId,
      });
    });
  });

  if (rosterRows.length > 0) {
    const { error: rosterInsertError } = await supabaseService
      .from("campus_session_roster_snapshots")
      .upsert(rosterRows, { onConflict: "tenant_id,session_instance_id,student_id" });
    if (rosterInsertError) throw rosterInsertError;
  }

  return {
    generated: safeInstances.length,
    rosterEntries: rosterRows.length,
  };
}
