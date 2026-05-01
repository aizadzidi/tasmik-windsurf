import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { filterTeachersByTeachingScope } from "@/lib/adminTeacherScope";
import { buildTeacherOptions, currentMonthKey } from "@/lib/online/recurring";
import {
  buildOccurrencesForMonth,
  fetchRecurringSnapshot,
  filterPackagesForMonth,
  hydratePlannerPackages,
} from "@/lib/online/recurringStore";
import { isMissingRelationError } from "@/lib/online/db";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import type { OnlineRecurringOccurrence } from "@/types/online";

type AdminOccurrenceRow = Omit<OnlineRecurringOccurrence, "id" | "created_at" | "updated_at"> &
  Partial<Pick<OnlineRecurringOccurrence, "id" | "created_at" | "updated_at">>;

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;

    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("Tenant context missing");
    return data[0].id;
  });

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

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const requestedMonth = url.searchParams.get("month") || currentMonthKey();
  const teacherIdParam = (url.searchParams.get("teacher_id") ?? "").trim();

  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const range = monthDateRange(requestedMonth);
    if (!range) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const payload = await adminOperationSimple(async (client) => {
      const snapshot = await fetchRecurringSnapshot(client, tenantId);

      let teacherRows: Array<{ id: string; name: string | null }> = [];
      const { data: tenantTeachers, error: tenantTeacherError } = await client
        .from("users")
        .select("id, name")
        .eq("role", "teacher")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (tenantTeacherError) {
        const { data: fallbackTeachers, error: fallbackError } = await client
          .from("users")
          .select("id, name")
          .eq("role", "teacher")
          .order("name", { ascending: true });
        if (fallbackError) throw fallbackError;
        teacherRows = (fallbackTeachers ?? []) as typeof teacherRows;
      } else {
        teacherRows = (tenantTeachers ?? []) as typeof teacherRows;
      }

      teacherRows = await filterTeachersByTeachingScope(client, teacherRows, "online", tenantId);

      const teachers = teacherRows.map((row) => ({
        id: row.id,
        name: row.name ?? "Unnamed Teacher",
      }));
      const teacherOptions = buildTeacherOptions({
        teachers,
        packages: snapshot.packages,
        teacherAvailability: snapshot.teacherAvailability,
      });
      const selectedTeacherId = teacherOptions.some((teacher) => teacher.id === teacherIdParam)
        ? teacherIdParam
        : teacherOptions[0]?.id ?? "";
      const selectedTeacher = teacherOptions.find((teacher) => teacher.id === selectedTeacherId) ?? null;

      const emptyPayload = {
        warning: snapshot.warning,
        month: requestedMonth,
        selected_teacher: selectedTeacher,
        teachers: teacherOptions,
        summary: {
          total_attendance: 0,
          total_sessions: 0,
          marked_sessions: 0,
          present_count: 0,
          absent_count: 0,
          attendance_rate_pct: 0,
        },
        monthly_occurrences: [],
      };

      if (snapshot.warning || !selectedTeacherId) {
        return emptyPayload;
      }

      const monthPackages = hydratePlannerPackages({
        packages: filterPackagesForMonth(snapshot.packages, requestedMonth).filter(
          (pkg) => pkg.teacher_id === selectedTeacherId,
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
      const currentMonthPackageSlotIds = Array.from(
        new Set(occurrenceDrafts.map((draft) => draft.package_slot_id)),
      );

      let monthlyOccurrences: AdminOccurrenceRow[] = occurrenceDrafts;

      if (occurrenceDrafts.length > 0) {
        const upsertSafeDrafts = occurrenceDrafts.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ attendance_status, attendance_notes, recorded_at, cancelled_at, ...scheduling }) => scheduling,
        );
        const upsertRes = await client
          .from("online_recurring_occurrences")
          .upsert(upsertSafeDrafts, { onConflict: "tenant_id,package_slot_id,session_date" });
        if (upsertRes.error && !isMissingRelationError(upsertRes.error, "online_recurring_occurrences")) {
          throw upsertRes.error;
        }

        if (upsertRes.error) {
          monthlyOccurrences = occurrenceDrafts;
        } else {
          const timestamp = new Date().toISOString();
          const draftDatesBySlotId = new Map<string, Set<string>>();

          occurrenceDrafts.forEach((draft) => {
            const dates = draftDatesBySlotId.get(draft.package_slot_id) ?? new Set<string>();
            dates.add(draft.session_date);
            draftDatesBySlotId.set(draft.package_slot_id, dates);
          });

          for (const [packageSlotId, sessionDates] of draftDatesBySlotId) {
            const resurrectRes = await client
              .from("online_recurring_occurrences")
              .update({ cancelled_at: null, updated_at: timestamp })
              .eq("tenant_id", tenantId)
              .eq("package_slot_id", packageSlotId)
              .in("session_date", [...sessionDates])
              .not("cancelled_at", "is", null);
            if (resurrectRes.error) throw resurrectRes.error;
          }

          const selectRes = await client
            .from("online_recurring_occurrences")
            .select(
              "id, tenant_id, package_id, package_slot_id, student_id, course_id, teacher_id, slot_template_id, session_date, start_time, duration_minutes, attendance_status, attendance_notes, recorded_at, cancelled_at, created_at, updated_at",
            )
            .eq("tenant_id", tenantId)
            .eq("teacher_id", selectedTeacherId)
            .in("package_slot_id", currentMonthPackageSlotIds)
            .is("cancelled_at", null)
            .gte("session_date", range.start.toISOString().slice(0, 10))
            .lt("session_date", range.end.toISOString().slice(0, 10))
            .order("session_date", { ascending: true })
            .order("start_time", { ascending: true });
          if (selectRes.error) throw selectRes.error;
          monthlyOccurrences = selectRes.data ?? occurrenceDrafts;
        }
      }

      const studentById = new Map(snapshot.students.map((student) => [student.id, student]));
      const courseById = new Map(snapshot.courses.map((course) => [course.id, course]));
      const enrichedOccurrences = monthlyOccurrences.map((occurrence) => ({
        ...occurrence,
        student_name: studentById.get(occurrence.student_id)?.name ?? "Student",
        course_name: courseById.get(occurrence.course_id)?.name ?? "Online Course",
      }));
      const markedSessions = enrichedOccurrences.filter((occurrence) => Boolean(occurrence.attendance_status));
      const presentCount = markedSessions.filter((occurrence) => occurrence.attendance_status === "present").length;
      const absentCount = markedSessions.filter((occurrence) => occurrence.attendance_status === "absent").length;
      const attendanceRatePct =
        markedSessions.length > 0 ? Math.round((presentCount / markedSessions.length) * 100) : 0;

      return {
        month: requestedMonth,
        selected_teacher: selectedTeacher,
        teachers: teacherOptions,
        summary: {
          total_attendance: presentCount,
          total_sessions: enrichedOccurrences.length,
          marked_sessions: markedSessions.length,
          present_count: presentCount,
          absent_count: absentCount,
          attendance_rate_pct: attendanceRatePct,
        },
        monthly_occurrences: enrichedOccurrences,
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online monthly attendance error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to load monthly online attendance");
    return NextResponse.json({ error: message }, { status });
  }
}
