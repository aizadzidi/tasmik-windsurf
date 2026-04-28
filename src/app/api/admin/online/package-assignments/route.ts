import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { isMissingColumnError } from "@/lib/online/db";
import {
  fetchOnlineStudentPackageAssignments,
  MANAGEABLE_ASSIGNMENT_STATUSES,
} from "@/lib/online/packageAssignments";
import { currentMonthKey, normalizeDateKey } from "@/lib/online/recurring";
import type { OnlineStudentPackageAssignmentStatus } from "@/types/online";

type CreateAssignmentBody = {
  student_id?: string;
  course_id?: string;
  teacher_id?: string;
  status?: OnlineStudentPackageAssignmentStatus;
  effective_from?: string;
  effective_to?: string | null;
  notes?: string | null;
};

type CourseSnapshot = {
  id: string;
  name: string;
  sessions_per_week: number;
  monthly_fee_cents: number;
  default_slot_duration_minutes: number;
};

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

const normalizeEffectiveDate = (value?: string | null) => {
  const normalized = normalizeDateKey(value ?? null);
  return normalized ? normalized.slice(0, 10) : null;
};

const isAllowedCreateStatus = (value: string): value is OnlineStudentPackageAssignmentStatus =>
  value === "draft" || value === "pending_payment" || value === "active" || value === "paused";

const loadCourseSnapshot = async (
  client: Pick<SupabaseClient, "from">,
  tenantId: string,
  courseId: string,
): Promise<CourseSnapshot> => {
  const courseRes = await client
    .from("online_courses")
    .select("id, name, sessions_per_week, monthly_fee_cents, default_slot_duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("id", courseId)
    .maybeSingle();

  if (!courseRes.error && courseRes.data?.id) {
    return {
      id: String(courseRes.data.id),
      name: courseRes.data.name ?? "Online Course",
      sessions_per_week: Math.max(Number(courseRes.data.sessions_per_week) || 1, 1),
      monthly_fee_cents: Number(courseRes.data.monthly_fee_cents) || 0,
      default_slot_duration_minutes:
        Number(courseRes.data.default_slot_duration_minutes) > 0
          ? Number(courseRes.data.default_slot_duration_minutes)
          : 30,
    };
  }

  if (courseRes.error && !isMissingColumnError(courseRes.error, "default_slot_duration_minutes", "online_courses")) {
    throw courseRes.error;
  }

  const fallbackRes = await client
    .from("online_courses")
    .select("id, name, sessions_per_week, monthly_fee_cents")
    .eq("tenant_id", tenantId)
    .eq("id", courseId)
    .maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;
  if (!fallbackRes.data?.id) throw new Error("Course not found.");

  return {
    id: String(fallbackRes.data.id),
    name: fallbackRes.data.name ?? "Online Course",
    sessions_per_week: Math.max(Number(fallbackRes.data.sessions_per_week) || 1, 1),
    monthly_fee_cents: Number(fallbackRes.data.monthly_fee_cents) || 0,
    default_slot_duration_minutes: 30,
  };
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const tenantId = guard.tenantId;
    const studentId = (new URL(request.url).searchParams.get("student_id") ?? "").trim();
    const payload = await adminOperationSimple(async (client) => {
      const result = await fetchOnlineStudentPackageAssignments({
        client,
        tenantId,
        studentIds: studentId ? [studentId] : undefined,
      });
      return {
        assignments: result.rows,
        ...(result.warning ? { warning: result.warning } : {}),
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online package assignments fetch error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to fetch online package assignments");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as CreateAssignmentBody;
    const studentId = (body.student_id ?? "").trim();
    const courseId = (body.course_id ?? "").trim();
    const teacherId = (body.teacher_id ?? "").trim();
    const status = (body.status ?? "active").trim();
    const effectiveFrom = normalizeEffectiveDate(body.effective_from) ?? `${currentMonthKey()}-01`;
    const effectiveTo = normalizeEffectiveDate(body.effective_to);

    if (!studentId || !courseId || !teacherId) {
      return NextResponse.json(
        { error: "student_id, course_id, and teacher_id are required" },
        { status: 400 },
      );
    }
    if (!isAllowedCreateStatus(status)) {
      return NextResponse.json(
        { error: "status must be draft, pending_payment, active, or paused" },
        { status: 400 },
      );
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return NextResponse.json(
        { error: "effective_to must be on or after effective_from" },
        { status: 400 },
      );
    }

    const tenantId = guard.tenantId;

    const payload = await adminOperationSimple(async (client) => {
      const [studentRes, teacherRes, course] = await Promise.all([
        client
          .from("students")
          .select("id, name, parent_name, parent_contact_number, record_type")
          .eq("tenant_id", tenantId)
          .eq("id", studentId)
          .maybeSingle(),
        client
          .from("users")
          .select("id, name, role")
          .eq("id", teacherId)
          .maybeSingle(),
        loadCourseSnapshot(client, tenantId, courseId),
      ]);

      if (studentRes.error) throw studentRes.error;
      if (!studentRes.data?.id || studentRes.data.record_type === "prospect") {
        throw new Error("Student not found.");
      }
      if (teacherRes.error) throw teacherRes.error;
      if (!teacherRes.data?.id || teacherRes.data.role !== "teacher") {
        throw new Error("Teacher not found.");
      }

      if (MANAGEABLE_ASSIGNMENT_STATUSES.includes(status)) {
        const existingRes = await client
          .from("online_student_package_assignments")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId)
          .eq("course_id", courseId)
          .in("status", MANAGEABLE_ASSIGNMENT_STATUSES)
          .limit(1);
        if (existingRes.error) throw existingRes.error;
        if ((existingRes.data ?? []).length > 0) {
          throw new Error("This student already has an active package assignment for this course.");
        }
      }

      const insertRes = await client
        .from("online_student_package_assignments")
        .insert({
          tenant_id: tenantId,
          student_id: studentId,
          course_id: course.id,
          teacher_id: teacherId,
          status,
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          sessions_per_week_snapshot: course.sessions_per_week,
          duration_minutes_snapshot: course.default_slot_duration_minutes,
          monthly_fee_cents_snapshot: course.monthly_fee_cents,
          notes: body.notes?.trim() || null,
          created_by: guard.userId,
          updated_by: guard.userId,
        })
        .select(
          "id, tenant_id, student_id, course_id, teacher_id, status, effective_from, effective_to, sessions_per_week_snapshot, duration_minutes_snapshot, monthly_fee_cents_snapshot, notes, created_by, updated_by, created_at, updated_at"
        )
        .single();
      if (insertRes.error) throw insertRes.error;

      const assignment = insertRes.data;
      return {
        assignment: {
          ...assignment,
          student_name: studentRes.data.name ?? "Student",
          parent_name: studentRes.data.parent_name ?? null,
          parent_contact_number: studentRes.data.parent_contact_number ?? null,
          course_name: course.name,
          teacher_name: teacherRes.data.name ?? "Unnamed Teacher",
          schedule_state: "waiting_for_slot",
          scheduled_slot_count: 0,
          linked_recurring_package_id: null,
          linked_recurring_package_status: null,
        },
      };
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    console.error("Admin online package assignment create error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to create online package assignment");
    return NextResponse.json({ error: message }, { status });
  }
}
