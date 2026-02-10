import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

type EnrollmentRow = {
  student_id: string | null;
  programs?: { type?: string | null } | null;
};

type StudentRow = {
  id: string;
  name: string;
  assigned_teacher_id: string | null;
  record_type?: string | null;
};

type TeacherRow = {
  id: string;
  name: string | null;
};

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
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

    const payload = await adminOperationSimple(async (client) => {
      const { data: enrollmentRows, error: enrollmentError } = await client
        .from("enrollments")
        .select("student_id, programs(type)")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "paused", "pending_payment"]);

      if (enrollmentError) throw enrollmentError;

      const onlineStudentIds = Array.from(
        new Set(
          ((enrollmentRows ?? []) as EnrollmentRow[])
            .filter((row) => {
              const type = row.programs?.type;
              return type === "online" || type === "hybrid";
            })
            .map((row) => row.student_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (onlineStudentIds.length === 0) {
        return { students: [], teachers: [] };
      }

      const { data: studentRows, error: studentError } = await client
        .from("students")
        .select("id, name, assigned_teacher_id, record_type")
        .eq("tenant_id", tenantId)
        .in("id", onlineStudentIds)
        .order("name", { ascending: true });

      if (studentError) throw studentError;

      const students = ((studentRows ?? []) as StudentRow[]).filter(
        (student) => student.record_type !== "prospect"
      );

      const teacherIds = Array.from(
        new Set(
          students
            .map((student) => student.assigned_teacher_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let teachers: TeacherRow[] = [];
      if (teacherIds.length > 0) {
        const { data: teacherRows, error: teacherError } = await client
          .from("users")
          .select("id, name")
          .eq("role", "teacher")
          .in("id", teacherIds)
          .order("name", { ascending: true });

        if (teacherError) throw teacherError;
        teachers = (teacherRows ?? []) as TeacherRow[];
      }

      return {
        students: students.map((student) => ({
          id: student.id,
          name: student.name,
          assigned_teacher_id: student.assigned_teacher_id,
          record_type: student.record_type ?? null,
        })),
        teachers: teachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.name ?? "Unnamed Teacher",
        })),
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online registry fetch error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to fetch online registry");
    return NextResponse.json({ error: message }, { status });
  }
}
