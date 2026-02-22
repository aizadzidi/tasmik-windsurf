import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";
import {
  isMissingColumnError,
  isMissingRelationError,
  monthStartUtc,
  toDateKey,
} from "@/lib/online/db";

type EnrollmentRow = {
  student_id: string | null;
  status: string | null;
  program_id: string | null;
};

type ClaimRow = {
  id: string;
  assigned_teacher_id: string | null;
  status: string | null;
  claimed_at: string | null;
};

type AttendanceRow = {
  status: "present" | "absent" | null;
  session_date: string;
};

type MonthlyRollupRow = {
  month_start: string;
  present_count: number | null;
  absent_count: number | null;
  total_sessions: number | null;
};

type StageRow = {
  id: string;
  name: string | null;
  record_type: string | null;
  crm_stage: string | null;
};

type TeacherRow = {
  id: string;
  name: string | null;
};

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message || fallback)
        : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;

    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) {
      throw new Error("Tenant context missing");
    }

    return data[0].id;
  });

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const tenantId = await resolveTenantIdOrThrow(request);
    const now = new Date();
    const monthStart = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth());
    const monthEnd = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth() + 1);
    const prevMonthStart = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth() - 1);

    const payload = await adminOperationSimple(async (client) => {
      const { data: programsData, error: programsError } = await client
        .from("programs")
        .select("id, type")
        .eq("tenant_id", tenantId)
        .in("type", ["online", "hybrid"]);

      if (programsError) throw programsError;

      const onlineProgramIds = (programsData ?? []).map((row) => row.id as string);
      let enrollmentRows: EnrollmentRow[] = [];
      if (onlineProgramIds.length > 0) {
        const { data, error } = await client
          .from("enrollments")
          .select("student_id, status, program_id")
          .eq("tenant_id", tenantId)
          .in("program_id", onlineProgramIds)
          .in("status", ["pending_payment", "active", "paused"]);
        if (error) throw error;
        enrollmentRows = (data ?? []) as EnrollmentRow[];
      }

      const onlineStudentIds = Array.from(
        new Set(enrollmentRows.map((row) => row.student_id).filter((id): id is string => Boolean(id)))
      );

      let claims: ClaimRow[] = [];
      const { data: claimDataWithTimestamp, error: claimError } = await client
        .from("online_slot_claims")
        .select("id, assigned_teacher_id, status, claimed_at")
        .eq("tenant_id", tenantId);

      if (!claimError) {
        claims = (claimDataWithTimestamp ?? []) as ClaimRow[];
      } else if (isMissingColumnError(claimError, "claimed_at", "online_slot_claims")) {
        const { data: claimDataWithoutTimestamp, error: claimFallbackError } = await client
          .from("online_slot_claims")
          .select("id, assigned_teacher_id, status")
          .eq("tenant_id", tenantId);
        if (
          claimFallbackError &&
          !isMissingRelationError(claimFallbackError, "online_slot_claims") &&
          !isMissingColumnError(claimFallbackError, "tenant_id", "online_slot_claims") &&
          !isMissingColumnError(claimFallbackError, "assigned_teacher_id", "online_slot_claims") &&
          !isMissingColumnError(claimFallbackError, "status", "online_slot_claims")
        ) {
          throw claimFallbackError;
        }
        if (claimFallbackError) {
          claims = [];
        } else {
          claims = ((claimDataWithoutTimestamp ?? []) as Array<{
            id: string;
            assigned_teacher_id: string | null;
            status: string | null;
          }>).map((row) => ({
            ...row,
            claimed_at: null,
          }));
        }
      } else if (
        isMissingRelationError(claimError, "online_slot_claims") ||
        isMissingColumnError(claimError, "tenant_id", "online_slot_claims") ||
        isMissingColumnError(claimError, "assigned_teacher_id", "online_slot_claims") ||
        isMissingColumnError(claimError, "status", "online_slot_claims")
      ) {
        claims = [];
      } else {
        throw claimError;
      }

      const pendingPaymentClaims = claims.filter((claim) => claim.status === "pending_payment").length;
      const activeClaims = claims.filter((claim) => claim.status === "active").length;

      const teacherIds = Array.from(
        new Set(
          claims
            .map((claim) => claim.assigned_teacher_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let teacherRows: TeacherRow[] = [];
      if (teacherIds.length > 0) {
        const { data, error } = await client
          .from("users")
          .select("id, name")
          .in("id", teacherIds)
          .order("name", { ascending: true });
        if (error) throw error;
        teacherRows = (data ?? []) as TeacherRow[];
      }

      const teacherNameById = new Map(teacherRows.map((row) => [row.id, row.name ?? "Unnamed Teacher"]));
      const teacherLoadMap = new Map<string, number>();
      claims
        .filter((claim) => claim.status === "pending_payment" || claim.status === "active")
        .forEach((claim) => {
          if (!claim.assigned_teacher_id) return;
          teacherLoadMap.set(
            claim.assigned_teacher_id,
            (teacherLoadMap.get(claim.assigned_teacher_id) ?? 0) + 1
          );
        });

      const teacherLoads = Array.from(teacherLoadMap.entries())
        .map(([teacherId, activeLoad]) => ({
          teacher_id: teacherId,
          teacher_name: teacherNameById.get(teacherId) ?? "Unnamed Teacher",
          active_load: activeLoad,
        }))
        .sort((left, right) => {
          if (left.active_load !== right.active_load) return left.active_load - right.active_load;
          return left.teacher_name.localeCompare(right.teacher_name);
        });

      const { data: courseData, error: courseError } = await client
        .from("online_courses")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (
        courseError &&
        !isMissingRelationError(courseError, "online_courses") &&
        !isMissingColumnError(courseError, "tenant_id", "online_courses") &&
        !isMissingColumnError(courseError, "is_active", "online_courses")
      ) {
        throw courseError;
      }
      const activeCourses = (courseData ?? []).length;

      const { data: onDutyRows, error: onDutyError } = await client
        .from("online_teacher_slot_preferences")
        .select("teacher_id")
        .eq("tenant_id", tenantId)
        .eq("is_available", true);
      if (
        onDutyError &&
        !isMissingRelationError(onDutyError, "online_teacher_slot_preferences") &&
        !isMissingColumnError(onDutyError, "tenant_id", "online_teacher_slot_preferences") &&
        !isMissingColumnError(onDutyError, "is_available", "online_teacher_slot_preferences")
      ) {
        throw onDutyError;
      }
      const teachersOnDuty = new Set(
        (onDutyRows ?? [])
          .map((row) => row.teacher_id as string | null)
          .filter((id): id is string => Boolean(id))
      ).size;

      const { data: attendanceData, error: attendanceError } = await client
        .from("online_attendance_sessions")
        .select("status, session_date")
        .eq("tenant_id", tenantId)
        .gte("session_date", toDateKey(monthStart))
        .lt("session_date", toDateKey(monthEnd));
      if (
        attendanceError &&
        !isMissingRelationError(attendanceError, "online_attendance_sessions") &&
        !isMissingColumnError(attendanceError, "tenant_id", "online_attendance_sessions") &&
        !isMissingColumnError(attendanceError, "session_date", "online_attendance_sessions") &&
        !isMissingColumnError(attendanceError, "status", "online_attendance_sessions")
      ) {
        throw attendanceError;
      }
      const attendanceRows = (attendanceData ?? []) as AttendanceRow[];
      const presentCount = attendanceRows.filter((row) => row.status === "present").length;
      const attendanceTotal = attendanceRows.length;
      const attendanceRate = attendanceTotal > 0 ? Math.round((presentCount / attendanceTotal) * 100) : 0;

      const { data: rollupData, error: rollupError } = await client
        .from("online_attendance_monthly_rollup")
        .select("month_start, present_count, absent_count, total_sessions")
        .eq("tenant_id", tenantId)
        .gte("month_start", toDateKey(monthStartUtc(now.getUTCFullYear(), now.getUTCMonth() - 5)))
        .order("month_start", { ascending: true });
      if (
        rollupError &&
        !isMissingRelationError(rollupError, "online_attendance_monthly_rollup") &&
        !isMissingColumnError(rollupError, "tenant_id", "online_attendance_monthly_rollup") &&
        !isMissingColumnError(rollupError, "month_start", "online_attendance_monthly_rollup")
      ) {
        throw rollupError;
      }

      const monthlyAttendance = ((rollupData ?? []) as MonthlyRollupRow[]).map((row) => ({
        month_start: row.month_start,
        present_count: Number(row.present_count ?? 0),
        absent_count: Number(row.absent_count ?? 0),
        total_sessions: Number(row.total_sessions ?? 0),
      }));

      const claimsThisMonth = claims.filter((claim) => {
        if (!claim.claimed_at) return false;
        const at = new Date(claim.claimed_at);
        return at >= monthStart && at < monthEnd;
      }).length;
      const claimsPrevMonth = claims.filter((claim) => {
        if (!claim.claimed_at) return false;
        const at = new Date(claim.claimed_at);
        return at >= prevMonthStart && at < monthStart;
      }).length;
      const growthDelta = claimsThisMonth - claimsPrevMonth;
      const growthRatePct = claimsPrevMonth > 0
        ? Math.round((growthDelta / claimsPrevMonth) * 100)
        : claimsThisMonth > 0
          ? 100
          : 0;

      let stageRows: StageRow[] = [];
      const { data: studentsData, error: studentsError } = await client
        .from("students")
        .select("id, name, record_type, crm_stage")
        .eq("tenant_id", tenantId)
        .in("record_type", ["prospect", "student"]);
      if (!studentsError) {
        stageRows = (studentsData ?? []) as StageRow[];
      } else if (
        isMissingColumnError(studentsError, "record_type", "students") ||
        isMissingColumnError(studentsError, "crm_stage", "students")
      ) {
        if (onlineStudentIds.length > 0) {
          const { data: fallbackStudentRows, error: fallbackStudentError } = await client
            .from("students")
            .select("id, name")
            .eq("tenant_id", tenantId)
            .in("id", onlineStudentIds);
          if (fallbackStudentError) throw fallbackStudentError;
          stageRows = ((fallbackStudentRows ?? []) as Array<{ id: string; name: string | null }>).map(
            (row) => ({
              id: row.id,
              name: row.name,
              record_type: "student",
              crm_stage: null,
            })
          );
        }
      } else {
        throw studentsError;
      }

      const stageCounts = new Map<string, number>();
      stageRows.forEach((row) => {
        if (row.record_type === "student" && !onlineStudentIds.includes(row.id)) return;
        const key = row.crm_stage || (row.record_type === "prospect" ? "interested" : "active");
        stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
      });

      const crmPipeline = Array.from(stageCounts.entries())
        .map(([stage, count]) => ({ stage, count }))
        .sort((left, right) => right.count - left.count);

      return {
        summary: {
          total_online_students: onlineStudentIds.length,
          active_courses: activeCourses,
          teachers_on_duty: teachersOnDuty,
          attendance_rate_month_pct: attendanceRate,
          pending_payment_claims: pendingPaymentClaims,
          active_claims: activeClaims,
          claims_this_month: claimsThisMonth,
          claims_prev_month: claimsPrevMonth,
          growth_delta: growthDelta,
          growth_rate_pct: growthRatePct,
        },
        crm_pipeline: crmPipeline,
        teacher_loads: teacherLoads,
        monthly_attendance: monthlyAttendance,
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online overview fetch error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to fetch online overview");
    return NextResponse.json({ error: message }, { status });
  }
}
