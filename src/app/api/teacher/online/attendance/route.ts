import { NextRequest, NextResponse } from "next/server";
import {
  buildPlannerDays,
  buildTeacherOptions,
  currentMonthKey,
  parseWeekStart,
} from "@/lib/online/recurring";
import {
  buildOccurrencesForMonth,
  fetchRecurringSnapshot,
  filterPackagesForMonth,
  hydratePlannerPackages,
} from "@/lib/online/recurringStore";
import { isMissingRelationError } from "@/lib/online/db";
import { buildTeacherSchedulerOptions } from "@/lib/online/scheduling";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";
import type { OnlineRecurringOccurrence } from "@/types/online";

type AttendanceBody = {
  occurrence_id?: string;
  status?: "present" | "absent";
  notes?: string | null;
};

type TeacherOccurrenceRow = Omit<OnlineRecurringOccurrence, "id" | "created_at" | "updated_at"> &
  Partial<Pick<OnlineRecurringOccurrence, "id" | "created_at" | "updated_at">>;

const monthDateRange = (monthKey: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
};

const emptyPayload = (monthKey: string, warning?: string) => ({
  month: monthKey,
  summary: {
    total_sessions: 0,
    marked_sessions: 0,
    present_count: 0,
    absent_count: 0,
    attendance_rate_pct: 0,
  },
  weekly_packages: [],
  weekly_slot_actions: [],
  today_queue: [],
  monthly_occurrences: [],
  scheduler: {
    pending_assignments: [],
    slot_capacity: "single_student" as const,
  },
  ...(warning ? { warning } : {}),
});

export async function GET(request: NextRequest) {
  const requestedMonth = new URL(request.url).searchParams.get("month") || currentMonthKey();
  const requestedWeek = new URL(request.url).searchParams.get("week");

  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const { data: roleRow, error: roleError } = await supabaseService
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle();
    if (roleError) throw roleError;
    if (roleRow?.role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = monthDateRange(requestedMonth);
    if (!range) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }

    const [snapshot, schedulerOptions] = await Promise.all([
      fetchRecurringSnapshot(supabaseService, auth.tenantId),
      buildTeacherSchedulerOptions({
        client: supabaseService,
        tenantId: auth.tenantId,
        teacherId: auth.userId,
      }),
    ]);
    if (snapshot.warning) {
      return NextResponse.json({
        ...emptyPayload(requestedMonth, snapshot.warning),
        scheduler: schedulerOptions,
      });
    }

    const monthPackages = hydratePlannerPackages({
      packages: filterPackagesForMonth(snapshot.packages, requestedMonth).filter(
        (pkg) =>
          pkg.teacher_id === auth.userId &&
          (pkg.status === "active" || pkg.status === "pending_payment" || pkg.status === "draft"),
      ),
      packageSlots: snapshot.packageSlots,
      students: snapshot.students,
      courses: snapshot.courses,
    });

    const templateById = new Map(snapshot.templates.map((template) => [template.id, template]));
    const occurrenceDrafts = buildOccurrencesForMonth({
      packages: monthPackages,
      monthKey: requestedMonth,
      templateById,
    });

    let monthlyOccurrences: TeacherOccurrenceRow[] = occurrenceDrafts;

    // Strip attendance/cancellation fields so upsert only touches scheduling columns.
    // This preserves attendance_status, attendance_notes, recorded_at on existing rows
    // while still allowing cancelled rows to be resurrected with updated scheduling data.
    const upsertSafeDrafts = occurrenceDrafts.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ attendance_status, attendance_notes, recorded_at, cancelled_at, ...scheduling }) => scheduling,
    );
    const upsertRes = await supabaseService
      .from("online_recurring_occurrences")
      .upsert(upsertSafeDrafts, { onConflict: "tenant_id,package_slot_id,session_date" });

    // Resurrect cancelled rows that now match active drafts (e.g. slot moved to
    // same weekday with a different time — the upsert updated scheduling columns
    // but cancelled_at was stripped, so clear it explicitly).
    if (!upsertRes.error && occurrenceDrafts.length > 0) {
      const timestamp = new Date().toISOString();
      const draftDatesBySlotId = new Map<string, Set<string>>();

      occurrenceDrafts.forEach((draft) => {
        const dates = draftDatesBySlotId.get(draft.package_slot_id) ?? new Set<string>();
        dates.add(draft.session_date);
        draftDatesBySlotId.set(draft.package_slot_id, dates);
      });

      for (const [packageSlotId, sessionDates] of draftDatesBySlotId) {
        const resurrectRes = await supabaseService
          .from("online_recurring_occurrences")
          .update({ cancelled_at: null, updated_at: timestamp })
          .eq("tenant_id", auth.tenantId)
          .eq("package_slot_id", packageSlotId)
          .in("session_date", [...sessionDates])
          .not("cancelled_at", "is", null);
        if (resurrectRes.error) throw resurrectRes.error;
      }
    }

    if (!upsertRes.error) {
      const selectRes = await supabaseService
        .from("online_recurring_occurrences")
        .select(
          "id, tenant_id, package_id, package_slot_id, student_id, course_id, teacher_id, slot_template_id, session_date, start_time, duration_minutes, attendance_status, attendance_notes, recorded_at, cancelled_at, created_at, updated_at"
        )
        .eq("tenant_id", auth.tenantId)
        .eq("teacher_id", auth.userId)
        .is("cancelled_at", null)
        .gte("session_date", range.start.toISOString().slice(0, 10))
        .lt("session_date", range.end.toISOString().slice(0, 10))
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (selectRes.error) throw selectRes.error;
      monthlyOccurrences = selectRes.data ?? occurrenceDrafts;
    } else if (!isMissingRelationError(upsertRes.error, "online_recurring_occurrences")) {
      throw upsertRes.error;
    }

    const studentById = new Map(snapshot.students.map((student) => [student.id, student]));
    const courseById = new Map(snapshot.courses.map((course) => [course.id, course]));
    const weekStart = parseWeekStart(requestedWeek);

    const weeklySlotActions = buildPlannerDays({
      selectedTeacherId: auth.userId,
      monthKey: requestedMonth,
      weekStart,
      templates: snapshot.templates,
      teacherAvailability: snapshot.teacherAvailability,
      packages: monthPackages,
      coursesById: courseById,
    });

    const enrichedOccurrences = monthlyOccurrences.map((occurrence: TeacherOccurrenceRow) => ({
      ...occurrence,
      student_name: studentById.get(occurrence.student_id)?.name ?? "Student",
      course_name: courseById.get(occurrence.course_id)?.name ?? "Online Course",
    }));

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayQueue = enrichedOccurrences.filter(
      (occurrence: TeacherOccurrenceRow) => occurrence.session_date === todayKey,
    );
    const markedSessions = enrichedOccurrences.filter((occurrence: TeacherOccurrenceRow) =>
      Boolean(occurrence.attendance_status),
    );
    const presentCount = markedSessions.filter(
      (occurrence: TeacherOccurrenceRow) => occurrence.attendance_status === "present",
    ).length;
    const absentCount = markedSessions.filter(
      (occurrence: TeacherOccurrenceRow) => occurrence.attendance_status === "absent",
    ).length;
    const attendanceRatePct = markedSessions.length > 0 ? Math.round((presentCount / markedSessions.length) * 100) : 0;

    return NextResponse.json({
      month: requestedMonth,
      summary: {
        total_sessions: enrichedOccurrences.length,
        marked_sessions: markedSessions.length,
        present_count: presentCount,
        absent_count: absentCount,
        attendance_rate_pct: attendanceRatePct,
      },
      weekly_packages: monthPackages,
      weekly_slot_actions: weeklySlotActions,
      today_queue: todayQueue,
      monthly_occurrences: enrichedOccurrences,
      scheduler: schedulerOptions,
      teacher: buildTeacherOptions({
        teachers: [{ id: auth.userId, name: "Current Teacher" }],
        packages: snapshot.packages,
        teacherAvailability: snapshot.teacherAvailability,
      })[0] ?? null,
    });
  } catch (error: unknown) {
    console.error("Teacher online attendance fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch online attendance";
    return NextResponse.json(
      {
        ...emptyPayload(requestedMonth),
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as AttendanceBody;
    const occurrenceId = (body.occurrence_id ?? "").trim();
    if (!occurrenceId || (body.status !== "present" && body.status !== "absent")) {
      return NextResponse.json(
        { error: "occurrence_id and status(present|absent) are required" },
        { status: 400 },
      );
    }

    const { data: roleRow, error: roleError } = await supabaseService
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle();
    if (roleError) throw roleError;
    if (roleRow?.role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const occurrenceRes = await supabaseService
      .from("online_recurring_occurrences")
      .select("id, teacher_id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", occurrenceId)
      .is("cancelled_at", null)
      .maybeSingle();
    if (occurrenceRes.error) throw occurrenceRes.error;
    if (!occurrenceRes.data?.id || occurrenceRes.data.teacher_id !== auth.userId) {
      return NextResponse.json({ error: "Occurrence not found for this teacher." }, { status: 404 });
    }

    const updateRes = await supabaseService
      .from("online_recurring_occurrences")
      .update({
        attendance_status: body.status,
        attendance_notes: body.notes?.trim() || null,
        recorded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", auth.tenantId)
      .eq("id", occurrenceId)
      .select("*")
      .single();
    if (updateRes.error) throw updateRes.error;

    return NextResponse.json(updateRes.data);
  } catch (error: unknown) {
    console.error("Teacher online attendance mark error:", error);
    const message = error instanceof Error ? error.message : "Failed to mark attendance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
