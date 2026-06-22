import { NextRequest, NextResponse } from "next/server";
import {
  buildPlannerDays,
  buildTeacherOptions,
  currentMonthKey,
  normalizeDateKey,
  parseWeekStart,
} from "@/lib/online/recurring";
import {
  buildOccurrencesForMonth,
  fetchRecurringSnapshot,
  filterPackagesForMonth,
  hydratePlannerPackages,
} from "@/lib/online/recurringStore";
import {
  attendanceOccurrenceKey,
  attendanceWeekStartKey,
  canonicalizeAttendanceRows,
  findStaleUnmarkedOccurrenceIds,
} from "@/lib/online/attendanceRows";
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

type AttendanceViewMode = "daily" | "monthly";

type StaleOccurrenceCandidate = Pick<
  TeacherOccurrenceRow,
  "id" | "package_id" | "package_slot_id" | "session_date" | "start_time" | "attendance_status" | "cancelled_at"
>;

const occurrenceSelectColumns =
  "id, tenant_id, package_id, package_slot_id, student_id, course_id, teacher_id, slot_template_id, session_date, start_time, duration_minutes, attendance_status, attendance_notes, recorded_at, cancelled_at, created_at, updated_at";

const occurrenceSummaryColumns =
  "id, package_id, package_slot_id, session_date, start_time, attendance_status, cancelled_at";

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

const normalizeTime = (value: string) => value.slice(0, 8);

const occurrenceMatchesDraft = (existing: TeacherOccurrenceRow, draft: TeacherOccurrenceRow) =>
  existing.package_id === draft.package_id &&
  existing.student_id === draft.student_id &&
  existing.course_id === draft.course_id &&
  existing.teacher_id === draft.teacher_id &&
  existing.slot_template_id === draft.slot_template_id &&
  normalizeTime(existing.start_time) === normalizeTime(draft.start_time) &&
  existing.duration_minutes === draft.duration_minutes;

const activeOccurrences = (
  rows: TeacherOccurrenceRow[],
  sessionsPerWeekByPackageId: ReadonlyMap<string, number>,
  currentDateKey?: string | null,
) =>
  canonicalizeAttendanceRows(rows, sessionsPerWeekByPackageId, { currentDateKey })
    .sort((left, right) => {
      const byDate = left.session_date.localeCompare(right.session_date);
      if (byDate !== 0) return byDate;
      return left.start_time.localeCompare(right.start_time);
    });

const filterDraftsForCanonicalWrite = (
  drafts: TeacherOccurrenceRow[],
  existingRows: Array<{
    id?: string | null;
    package_id: string;
    package_slot_id: string;
    session_date: string;
    start_time: string;
    attendance_status: "present" | "absent" | null;
    cancelled_at?: string | null;
  }>,
  sessionsPerWeekByPackageId: ReadonlyMap<string, number>,
  currentDateKey?: string | null,
) => {
  if (drafts.length === 0) return drafts;

  const draftKeys = new Set(drafts.map((draft) => attendanceOccurrenceKey(draft)));
  const canonicalDraftKeys = new Set(
    canonicalizeAttendanceRows([...existingRows, ...drafts], sessionsPerWeekByPackageId, {
      currentDateKey,
    })
      .filter((row) => !row.id && draftKeys.has(attendanceOccurrenceKey(row)))
      .map((row) => attendanceOccurrenceKey(row)),
  );

  return drafts.filter((draft) => canonicalDraftKeys.has(attendanceOccurrenceKey(draft)));
};

const stripOccurrenceForUpsert = (draft: TeacherOccurrenceRow) => {
  // Strip attendance fields so upsert only touches scheduling columns.
  // This preserves attendance_status, attendance_notes, and recorded_at on existing rows.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { attendance_status, attendance_notes, recorded_at, cancelled_at, ...scheduling } = draft;
  return scheduling;
};

const findDraftsNeedingWrite = (drafts: TeacherOccurrenceRow[], existingRows: TeacherOccurrenceRow[]) => {
  const existingByKey = new Map(
    existingRows.map((occurrence) => [attendanceOccurrenceKey(occurrence), occurrence]),
  );
  const markedPackageDates = new Set(
    existingRows
      .filter((occurrence) => occurrence.attendance_status && !occurrence.cancelled_at)
      .map((occurrence) => `${occurrence.package_id}:${occurrence.session_date}`),
  );
  const draftsToUpsert = drafts.filter((draft) => {
    if (markedPackageDates.has(`${draft.package_id}:${draft.session_date}`)) return false;
    const existing = existingByKey.get(attendanceOccurrenceKey(draft));
    return !existing || Boolean(existing.cancelled_at) || !occurrenceMatchesDraft(existing, draft);
  });
  const resurrectIds = draftsToUpsert
    .map((draft) => existingByKey.get(attendanceOccurrenceKey(draft)))
    .filter(
      (occurrence): occurrence is TeacherOccurrenceRow & { id: string } =>
        Boolean(occurrence?.id && occurrence.cancelled_at),
    )
    .map((occurrence) => occurrence.id);

  return { draftsToUpsert, resurrectIds };
};

const materializeOccurrenceDrafts = async (
  tenantId: string,
  draftsToUpsert: TeacherOccurrenceRow[],
  resurrectIds: string[],
) => {
  if (draftsToUpsert.length > 0) {
    const upsertRes = await supabaseService
      .from("online_recurring_occurrences")
      .upsert(draftsToUpsert.map(stripOccurrenceForUpsert), {
        onConflict: "tenant_id,package_slot_id,session_date",
      });
    if (upsertRes.error) throw upsertRes.error;
  }

  if (resurrectIds.length > 0) {
    const resurrectRes = await supabaseService
      .from("online_recurring_occurrences")
      .update({ cancelled_at: null, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .in("id", resurrectIds);
    if (resurrectRes.error) throw resurrectRes.error;
  }
};

const markRowsCancelled = <T extends { id?: string | null; cancelled_at?: string | null }>(
  rows: T[],
  staleIds: ReadonlySet<string>,
  cancelledAt: string,
) =>
  rows.map((row) =>
    row.id && staleIds.has(row.id)
      ? {
          ...row,
          cancelled_at: cancelledAt,
        }
      : row,
  );

const cancelStaleUnmarkedOccurrences = async (params: {
  tenantId: string;
  rows: StaleOccurrenceCandidate[];
  forceStaleOccurrenceKeys?: ReadonlySet<string>;
  validOccurrenceKeys: ReadonlySet<string>;
  fromDateKey: string;
}) => {
  const staleIds = findStaleUnmarkedOccurrenceIds(params.rows, params.validOccurrenceKeys, {
    forceStaleOccurrenceKeys: params.forceStaleOccurrenceKeys,
    fromDateKey: params.fromDateKey,
  });
  if (staleIds.length === 0) return null;

  const cancelledAt = new Date().toISOString();
  const cancelRes = await supabaseService
    .from("online_recurring_occurrences")
    .update({ cancelled_at: cancelledAt, updated_at: cancelledAt })
    .eq("tenant_id", params.tenantId)
    .in("id", staleIds)
    .is("attendance_status", null)
    .is("cancelled_at", null)
    .select("id");
  if (cancelRes.error) throw cancelRes.error;

  const cancelledIds = new Set((cancelRes.data ?? []).map((row) => String(row.id)).filter(Boolean));
  if (cancelledIds.size === 0) return null;

  return { staleIds: cancelledIds, cancelledAt };
};

const buildOutsideActiveSlotWindowKeys = (
  rows: StaleOccurrenceCandidate[],
  activeSlotWindows: ReadonlyMap<string, { effective_from?: string | null; effective_to?: string | null }>,
) => {
  const keys = new Set<string>();
  rows.forEach((row) => {
    const slotWindow = activeSlotWindows.get(row.package_slot_id);
    if (!slotWindow) return;

    const effectiveFrom = normalizeDateKey(slotWindow.effective_from);
    const effectiveTo = normalizeDateKey(slotWindow.effective_to);
    if ((effectiveFrom && row.session_date < effectiveFrom) || (effectiveTo && row.session_date > effectiveTo)) {
      keys.add(attendanceOccurrenceKey(row));
    }
  });
  return keys;
};

const slotOverlapsDateWindow = (
  slot: { status?: string | null; effective_from?: string | null; effective_to?: string | null },
  rangeStart: string,
  rangeEndExclusive: string,
) => {
  if (slot.status && slot.status !== "active") return false;
  const effectiveFrom = normalizeDateKey(slot.effective_from);
  const effectiveTo = normalizeDateKey(slot.effective_to);
  if (effectiveFrom && effectiveFrom >= rangeEndExclusive) return false;
  if (effectiveTo && effectiveTo < rangeStart) return false;
  return true;
};

const isDateInMonth = (dateKey: string | null, monthKey: string) =>
  Boolean(dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey.startsWith(`${monthKey}-`));

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
  const searchParams = new URL(request.url).searchParams;
  const requestedMonth = searchParams.get("month") || currentMonthKey();
  const requestedWeek = searchParams.get("week");
  const viewMode: AttendanceViewMode = searchParams.get("view") === "daily" ? "daily" : "monthly";
  const todayKey = new Date().toISOString().slice(0, 10);
  const requestedDate = searchParams.get("date");
  const selectedDate = isDateInMonth(requestedDate, requestedMonth) ? requestedDate! : todayKey;

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
      fetchRecurringSnapshot(supabaseService, auth.tenantId, {
        teacherId: auth.userId,
        includePackageChangeRequests: false,
      }),
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
    const sessionsPerWeekByPackageId = new Map(
      monthPackages.map((pkg) => [pkg.id, Math.max(Number(pkg.sessions_per_week) || 0, 0)]),
    );
    const activeSlotWindows = new Map(
      monthPackages.flatMap((pkg) =>
        pkg.slots.map((slot) => [
          slot.id,
          {
            effective_from: slot.effective_from,
            effective_to: slot.effective_to,
          },
        ] as const),
      ),
    );

    const templateById = new Map(snapshot.templates.map((template) => [template.id, template]));
    const occurrenceDrafts = buildOccurrencesForMonth({
      packages: monthPackages,
      monthKey: requestedMonth,
      templateById,
    });
    const validOccurrenceKeys = new Set(occurrenceDrafts.map((occurrence) => attendanceOccurrenceKey(occurrence)));
    const staleCleanupFromDate = attendanceWeekStartKey(todayKey);

    let monthlyOccurrences: TeacherOccurrenceRow[] = [];
    let selectedDateOccurrences: TeacherOccurrenceRow[] = [];
    let occurrenceSummaryRows: Array<{
      id?: string;
      package_id: string;
      package_slot_id: string;
      session_date: string;
      attendance_status: "present" | "absent" | null;
      cancelled_at: string | null;
      start_time: string;
    }> = [];

    if (viewMode === "daily") {
      const selectedDateDrafts = occurrenceDrafts.filter(
        (occurrence) => occurrence.session_date === selectedDate,
      );

      const [summaryRes, selectedDateRes] = await Promise.all([
        supabaseService
          .from("online_recurring_occurrences")
          .select(occurrenceSummaryColumns)
          .eq("tenant_id", auth.tenantId)
          .eq("teacher_id", auth.userId)
          .gte("session_date", range.start.toISOString().slice(0, 10))
          .lt("session_date", range.end.toISOString().slice(0, 10)),
        supabaseService
          .from("online_recurring_occurrences")
          .select(occurrenceSelectColumns)
          .eq("tenant_id", auth.tenantId)
          .eq("teacher_id", auth.userId)
          .eq("session_date", selectedDate)
          .order("start_time", { ascending: true }),
      ]);

      if (summaryRes.error && !isMissingRelationError(summaryRes.error, "online_recurring_occurrences")) {
        throw summaryRes.error;
      }
      if (selectedDateRes.error && !isMissingRelationError(selectedDateRes.error, "online_recurring_occurrences")) {
        throw selectedDateRes.error;
      }

      let existingSelectedDate = (selectedDateRes.data ?? []) as TeacherOccurrenceRow[];
      let existingSummaryRows = (summaryRes.data ?? []) as typeof occurrenceSummaryRows;
      const staleCancel = await cancelStaleUnmarkedOccurrences({
        tenantId: auth.tenantId,
        rows: existingSummaryRows,
        forceStaleOccurrenceKeys: buildOutsideActiveSlotWindowKeys(existingSummaryRows, activeSlotWindows),
        validOccurrenceKeys,
        fromDateKey: staleCleanupFromDate,
      });
      if (staleCancel) {
        existingSummaryRows = markRowsCancelled(
          existingSummaryRows,
          staleCancel.staleIds,
          staleCancel.cancelledAt,
        );
        existingSelectedDate = markRowsCancelled(
          existingSelectedDate,
          staleCancel.staleIds,
          staleCancel.cancelledAt,
        );
      }
      if (!selectedDateRes.error) {
        const selectedDateDraftsToWrite = filterDraftsForCanonicalWrite(
          selectedDateDrafts,
          existingSummaryRows,
          sessionsPerWeekByPackageId,
          todayKey,
        );
        const { draftsToUpsert, resurrectIds } = findDraftsNeedingWrite(
          selectedDateDraftsToWrite,
          existingSelectedDate,
        );
        if (draftsToUpsert.length > 0 || resurrectIds.length > 0) {
          await materializeOccurrenceDrafts(auth.tenantId, draftsToUpsert, resurrectIds);
          const refreshedSelectedDateRes = await supabaseService
            .from("online_recurring_occurrences")
            .select(occurrenceSelectColumns)
            .eq("tenant_id", auth.tenantId)
            .eq("teacher_id", auth.userId)
            .eq("session_date", selectedDate)
            .order("start_time", { ascending: true });
          if (refreshedSelectedDateRes.error) throw refreshedSelectedDateRes.error;
          selectedDateOccurrences = activeOccurrences(
            (refreshedSelectedDateRes.data ?? selectedDateDrafts) as TeacherOccurrenceRow[],
            sessionsPerWeekByPackageId,
            todayKey,
          );
        } else {
          selectedDateOccurrences = activeOccurrences(
            existingSelectedDate,
            sessionsPerWeekByPackageId,
            todayKey,
          );
        }
      } else {
        selectedDateOccurrences = activeOccurrences(
          selectedDateDrafts,
          sessionsPerWeekByPackageId,
          todayKey,
        );
      }

      occurrenceSummaryRows = canonicalizeAttendanceRows(
        [
          ...existingSummaryRows,
          ...occurrenceDrafts.map((occurrence) => ({
            package_id: occurrence.package_id,
            package_slot_id: occurrence.package_slot_id,
            session_date: occurrence.session_date,
            start_time: occurrence.start_time,
            attendance_status: occurrence.attendance_status,
            cancelled_at: occurrence.cancelled_at,
          })),
        ],
        sessionsPerWeekByPackageId,
        { currentDateKey: todayKey },
      );
      monthlyOccurrences = selectedDateOccurrences;
    } else {
      const existingOccurrencesRes = await supabaseService
        .from("online_recurring_occurrences")
        .select(occurrenceSelectColumns)
        .eq("tenant_id", auth.tenantId)
        .eq("teacher_id", auth.userId)
        .gte("session_date", range.start.toISOString().slice(0, 10))
        .lt("session_date", range.end.toISOString().slice(0, 10))
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (!existingOccurrencesRes.error) {
        let existingOccurrences = (existingOccurrencesRes.data ?? []) as TeacherOccurrenceRow[];
        const staleCancel = await cancelStaleUnmarkedOccurrences({
          tenantId: auth.tenantId,
          rows: existingOccurrences,
          forceStaleOccurrenceKeys: buildOutsideActiveSlotWindowKeys(existingOccurrences, activeSlotWindows),
          validOccurrenceKeys,
          fromDateKey: staleCleanupFromDate,
        });
        if (staleCancel) {
          existingOccurrences = markRowsCancelled(
            existingOccurrences,
            staleCancel.staleIds,
            staleCancel.cancelledAt,
          );
        }
        const occurrenceDraftsToWrite = filterDraftsForCanonicalWrite(
          occurrenceDrafts,
          existingOccurrences,
          sessionsPerWeekByPackageId,
          todayKey,
        );
        const { draftsToUpsert, resurrectIds } = findDraftsNeedingWrite(
          occurrenceDraftsToWrite,
          existingOccurrences,
        );

        if (draftsToUpsert.length > 0 || resurrectIds.length > 0) {
          await materializeOccurrenceDrafts(auth.tenantId, draftsToUpsert, resurrectIds);
          const selectRes = await supabaseService
            .from("online_recurring_occurrences")
            .select(occurrenceSelectColumns)
            .eq("tenant_id", auth.tenantId)
            .eq("teacher_id", auth.userId)
            .is("cancelled_at", null)
            .gte("session_date", range.start.toISOString().slice(0, 10))
            .lt("session_date", range.end.toISOString().slice(0, 10))
            .order("session_date", { ascending: true })
            .order("start_time", { ascending: true });
          if (selectRes.error) throw selectRes.error;
          monthlyOccurrences = activeOccurrences(
            (selectRes.data ?? occurrenceDrafts) as TeacherOccurrenceRow[],
            sessionsPerWeekByPackageId,
            todayKey,
          );
        } else {
          monthlyOccurrences = activeOccurrences(
            existingOccurrences,
            sessionsPerWeekByPackageId,
            todayKey,
          );
        }
      } else if (!isMissingRelationError(existingOccurrencesRes.error, "online_recurring_occurrences")) {
        throw existingOccurrencesRes.error;
      } else if (occurrenceDrafts.length > 0) {
        const upsertRes = await supabaseService
          .from("online_recurring_occurrences")
          .upsert(occurrenceDrafts.map(stripOccurrenceForUpsert), {
            onConflict: "tenant_id,package_slot_id,session_date",
          });

        if (!upsertRes.error) {
          const selectRes = await supabaseService
            .from("online_recurring_occurrences")
            .select(occurrenceSelectColumns)
            .eq("tenant_id", auth.tenantId)
            .eq("teacher_id", auth.userId)
            .is("cancelled_at", null)
            .gte("session_date", range.start.toISOString().slice(0, 10))
            .lt("session_date", range.end.toISOString().slice(0, 10))
            .order("session_date", { ascending: true })
            .order("start_time", { ascending: true });
          if (selectRes.error) throw selectRes.error;
          monthlyOccurrences = activeOccurrences(
            (selectRes.data ?? occurrenceDrafts) as TeacherOccurrenceRow[],
            sessionsPerWeekByPackageId,
            todayKey,
          );
        } else if (!isMissingRelationError(upsertRes.error, "online_recurring_occurrences")) {
          throw upsertRes.error;
        } else {
          monthlyOccurrences = activeOccurrences(occurrenceDrafts, sessionsPerWeekByPackageId, todayKey);
        }
      }

      occurrenceSummaryRows = monthlyOccurrences.map((occurrence) => ({
        id: occurrence.id,
        package_id: occurrence.package_id,
        package_slot_id: occurrence.package_slot_id,
        session_date: occurrence.session_date,
        start_time: occurrence.start_time,
        attendance_status: occurrence.attendance_status,
        cancelled_at: occurrence.cancelled_at,
      }));
    }

    const studentById = new Map(snapshot.students.map((student) => [student.id, student]));
    const courseById = new Map(snapshot.courses.map((course) => [course.id, course]));
    const weekStart = parseWeekStart(requestedWeek);
    const requestedMonthStart = range.start.toISOString().slice(0, 10);
    const requestedMonthEndExclusive = range.end.toISOString().slice(0, 10);

    const weeklySlotActions = buildPlannerDays({
      selectedTeacherId: auth.userId,
      monthKey: requestedMonth,
      weekStart,
      templates: snapshot.templates,
      teacherAvailability: snapshot.teacherAvailability,
      packages: monthPackages,
      coursesById: courseById,
    });
    const currentWeeklyPackages = monthPackages.map((pkg) => ({
      ...pkg,
      slots: pkg.slots.filter((slot) =>
        slotOverlapsDateWindow(slot, requestedMonthStart, requestedMonthEndExclusive),
      ),
    }));

    const enrichedOccurrences = monthlyOccurrences.map((occurrence: TeacherOccurrenceRow) => ({
      ...occurrence,
      student_name: studentById.get(occurrence.student_id)?.name ?? "Student",
      course_name: courseById.get(occurrence.course_id)?.name ?? "Online Course",
    }));

    const selectedDateQueue = enrichedOccurrences.filter(
      (occurrence: TeacherOccurrenceRow) => occurrence.session_date === selectedDate,
    );
    const markedSessions = occurrenceSummaryRows.filter((occurrence) =>
      Boolean(occurrence.attendance_status),
    );
    const presentCount = markedSessions.filter(
      (occurrence) => occurrence.attendance_status === "present",
    ).length;
    const absentCount = markedSessions.filter(
      (occurrence) => occurrence.attendance_status === "absent",
    ).length;
    const attendanceRatePct = markedSessions.length > 0 ? Math.round((presentCount / markedSessions.length) * 100) : 0;

    return NextResponse.json({
      month: requestedMonth,
      occurrence_view: viewMode,
      selected_date: selectedDate,
      summary: {
        total_sessions: occurrenceSummaryRows.length,
        marked_sessions: markedSessions.length,
        present_count: presentCount,
        absent_count: absentCount,
        attendance_rate_pct: attendanceRatePct,
      },
      weekly_packages: currentWeeklyPackages,
      weekly_slot_actions: weeklySlotActions,
      today_queue: selectedDateQueue,
      monthly_occurrences: viewMode === "monthly" ? enrichedOccurrences : [],
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
      .eq("teacher_id", auth.userId)
      .is("cancelled_at", null)
      .select("*")
      .maybeSingle();
    if (updateRes.error) throw updateRes.error;
    if (!updateRes.data?.id) {
      return NextResponse.json({ error: "Occurrence not found for this teacher." }, { status: 404 });
    }

    return NextResponse.json(updateRes.data);
  } catch (error: unknown) {
    console.error("Teacher online attendance mark error:", error);
    const message = error instanceof Error ? error.message : "Failed to mark attendance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
