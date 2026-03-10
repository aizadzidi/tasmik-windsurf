import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { filterTeachersByTeachingScope } from "@/lib/adminTeacherScope";
import {
  buildPlannerDays,
  buildTeacherOptions,
  currentMonthKey,
  nextMonthKey,
  parseWeekStart,
} from "@/lib/online/recurring";
import {
  fetchRecurringSnapshot,
  filterPackagesForMonth,
  hydratePlannerPackages,
} from "@/lib/online/recurringStore";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import type { OnlineCourse } from "@/types/online";

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;

    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("Tenant context missing");
    return data[0].id;
  });

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const tenantId = await resolveTenantIdOrThrow(request);
    const weekParam = new URL(request.url).searchParams.get("week");
    const teacherIdParam = (new URL(request.url).searchParams.get("teacher_id") ?? "").trim();
    const weekStart = parseWeekStart(weekParam);
    const monthKey = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, "0")}`;

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

      const selectedTeacherId = teachers.some((teacher) => teacher.id === teacherIdParam)
        ? teacherIdParam
        : teachers[0]?.id ?? "";

      const coursesById = new Map(snapshot.courses.map((course) => [course.id, course]));
      const hydratedPackages = hydratePlannerPackages({
        packages: filterPackagesForMonth(snapshot.packages, monthKey),
        packageSlots: snapshot.packageSlots,
        students: snapshot.students,
        courses: snapshot.courses,
      });
      const selectedTeacherPackages = hydratedPackages.filter(
        (pkg) => pkg.teacher_id === selectedTeacherId && (pkg.status === "active" || pkg.status === "pending_payment" || pkg.status === "draft")
      );

      const requestedNextMonthKey =
        currentMonthKey() > monthKey ? currentMonthKey() : nextMonthKey(monthKey);
      const nextMonthRequestSet = new Set(
        snapshot.packageChangeRequests
          .filter(
            (row) =>
              row.status !== "cancelled" &&
              row.status !== "applied" &&
              row.effective_month.startsWith(requestedNextMonthKey)
          )
          .map((row) => row.current_package_id)
      );

      const days = buildPlannerDays({
        selectedTeacherId,
        monthKey,
        weekStart,
        templates: snapshot.templates,
        teacherAvailability: snapshot.teacherAvailability,
        packages: selectedTeacherPackages,
        coursesById: coursesById as Map<string, OnlineCourse>,
      }).map((day) => ({
        ...day,
        occupied_pills: day.occupied_pills.map((pill) => ({
          ...pill,
          next_month_change_pending: nextMonthRequestSet.has(pill.package_id),
        })),
      }));

      const teacherOptions = buildTeacherOptions({
        teachers,
        packages: snapshot.packages,
        teacherAvailability: snapshot.teacherAvailability,
      });

      const allStudents = await client
        .from("students")
        .select("id, name, parent_name, parent_contact_number, record_type")
        .eq("tenant_id", tenantId)
        .neq("record_type", "prospect")
        .order("name", { ascending: true });
      if (allStudents.error) throw allStudents.error;

      return {
        warning: snapshot.warning,
        week_start: weekStart.toISOString().slice(0, 10),
        month: monthKey,
        selected_teacher: teacherOptions.find((teacher) => teacher.id === selectedTeacherId) ?? null,
        teachers: teacherOptions,
        legend: Array.from(
          new Map(
            snapshot.courses.map((course) => [
              course.id,
              {
                course_id: course.id,
                course_name: course.name,
                duration_minutes: course.default_slot_duration_minutes ?? 30,
                color_hex: course.color_hex ?? null,
              },
            ])
          ).values()
        ),
        days,
        availability_overrides: snapshot.teacherAvailability.filter(
          (row) => row.teacher_id === selectedTeacherId && row.is_available === false
        ),
        week_summary: {
          active_packages: selectedTeacherPackages.filter((row) => row.status === "active").length,
          pending_packages: selectedTeacherPackages.filter((row) => row.status === "pending_payment" || row.status === "draft").length,
          total_slots: snapshot.templates.length,
          occupied_slots: days.reduce((sum, day) => sum + day.occupied_pills.length, 0),
        },
        package_candidates: (allStudents.data ?? []).map((row) => ({
          id: String(row.id),
          name: row.name ?? "Student",
          parent_name: row.parent_name ?? null,
          parent_contact_number: row.parent_contact_number ?? null,
        })),
        template_controls: {
          courses: snapshot.courses,
          templates: snapshot.templates,
        },
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online attendance planner error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to load online attendance planner");
    return NextResponse.json({ error: message }, { status });
  }
}
