import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

type EnrollmentRow = {
  student_id: string | null;
};

type StudentRow = {
  id: string;
  name: string;
  assigned_teacher_id: string | null;
  parent_name?: string | null;
  parent_contact_number?: string | null;
  crm_stage?: string | null;
  crm_status_reason?: string | null;
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
      const { data: programsData, error: programsError } = await client
        .from("programs")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("type", ["online", "hybrid"]);
      if (programsError) throw programsError;

      const onlineProgramIds = (programsData ?? [])
        .map((row) => row.id as string | null)
        .filter((id): id is string => Boolean(id));

      if (onlineProgramIds.length === 0) {
        let teachers: TeacherRow[] = [];
        const { data: teacherRows, error: teacherError } = await client
          .from("users")
          .select("id, name")
          .eq("role", "teacher")
          .eq("tenant_id", tenantId)
          .order("name", { ascending: true });

        if (teacherError) {
          const { data: fallbackTeacherRows, error: fallbackTeacherError } = await client
            .from("users")
            .select("id, name")
            .eq("role", "teacher")
            .order("name", { ascending: true });
          if (fallbackTeacherError) throw fallbackTeacherError;
          teachers = (fallbackTeacherRows ?? []) as TeacherRow[];
        } else {
          teachers = (teacherRows ?? []) as TeacherRow[];
        }

        return {
          students: [],
          teachers: teachers.map((teacher) => ({
            id: teacher.id,
            name: teacher.name ?? "Unnamed Teacher",
          })),
        };
      }

      const { data: enrollmentRows, error: enrollmentError } = await client
        .from("enrollments")
        .select("student_id")
        .eq("tenant_id", tenantId)
        .in("program_id", onlineProgramIds)
        .in("status", ["active", "paused", "pending_payment"]);

      if (enrollmentError) throw enrollmentError;

      const onlineStudentIds = Array.from(
        new Set(
          ((enrollmentRows ?? []) as EnrollmentRow[])
            .map((row) => row.student_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let students: StudentRow[] = [];
      if (onlineStudentIds.length > 0) {
        const { data: studentRows, error: studentError } = await client
          .from("students")
          .select(
            "id, name, assigned_teacher_id, parent_name, parent_contact_number, crm_stage, crm_status_reason, record_type"
          )
          .eq("tenant_id", tenantId)
          .in("id", onlineStudentIds)
          .order("name", { ascending: true });

        if (studentError) throw studentError;

        students = ((studentRows ?? []) as StudentRow[]).filter(
          (student) => student.record_type !== "prospect"
        );
      }

      let teachers: TeacherRow[] = [];
      const { data: teacherRows, error: teacherError } = await client
        .from("users")
        .select("id, name")
        .eq("role", "teacher")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (teacherError) {
        const { data: fallbackTeacherRows, error: fallbackTeacherError } = await client
          .from("users")
          .select("id, name")
          .eq("role", "teacher")
          .order("name", { ascending: true });

        if (fallbackTeacherError) throw fallbackTeacherError;
        teachers = (fallbackTeacherRows ?? []) as TeacherRow[];
      } else {
        teachers = (teacherRows ?? []) as TeacherRow[];
      }

      return {
        students: students.map((student) => ({
          id: student.id,
          name: student.name,
          assigned_teacher_id: student.assigned_teacher_id,
          parent_name: student.parent_name ?? null,
          parent_contact_number: student.parent_contact_number ?? null,
          crm_stage: student.crm_stage ?? null,
          crm_status_reason: student.crm_status_reason ?? null,
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
