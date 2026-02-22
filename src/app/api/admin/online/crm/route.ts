import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";

type EnrollmentRow = {
  student_id: string | null;
};

type ProgramRow = {
  id: string;
};

type StudentRow = {
  id: string;
  name: string;
  record_type: string | null;
  crm_stage: string | null;
  crm_status_reason: string | null;
  assigned_teacher_id: string | null;
  parent_name: string | null;
  parent_contact_number: string | null;
};

type ClaimRow = {
  student_id: string;
  status: string | null;
  session_date: string;
  seat_hold_expires_at: string | null;
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
    const guard = await requireAdminPermission(request, ["admin:online", "admin:crm", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const tenantId = await resolveTenantIdOrThrow(request);
    const { searchParams } = new URL(request.url);
    const filterType = searchParams.get("record_type");
    const filterStage = searchParams.get("stage");
    const search = (searchParams.get("q") ?? "").trim().toLowerCase();

    const payload = await adminOperationSimple(async (client) => {
      const { data: programRows, error: programError } = await client
        .from("programs")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("type", ["online", "hybrid"]);
      if (programError) throw programError;

      const onlineProgramIds = (programRows ?? []).map((row) => (row as ProgramRow).id);

      let onlineStudentIds = new Set<string>();
      if (onlineProgramIds.length > 0) {
        const { data: enrollmentRows, error: enrollmentError } = await client
          .from("enrollments")
          .select("student_id")
          .eq("tenant_id", tenantId)
          .in("program_id", onlineProgramIds)
          .in("status", ["pending_payment", "active", "paused"]);
        if (enrollmentError) throw enrollmentError;

        onlineStudentIds = new Set(
          ((enrollmentRows ?? []) as EnrollmentRow[])
            .map((row) => row.student_id)
            .filter((id): id is string => Boolean(id))
        );
      }

      const { data: studentRows, error: studentError } = await client
        .from("students")
        .select(
          "id, name, record_type, crm_stage, crm_status_reason, assigned_teacher_id, parent_name, parent_contact_number"
        )
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (studentError) throw studentError;

      const scopedStudents = ((studentRows ?? []) as StudentRow[]).filter((student) => {
        if (student.record_type === "prospect") return true;
        return onlineStudentIds.has(student.id);
      });

      const teacherIds = Array.from(
        new Set(
          scopedStudents
            .map((student) => student.assigned_teacher_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      const { data: teacherRows, error: teacherError } = teacherIds.length
        ? await client.from("users").select("id, name").in("id", teacherIds)
        : { data: [], error: null };
      if (teacherError) throw teacherError;
      const teacherById = new Map(
        (teacherRows ?? []).map((row) => [row.id as string, (row.name as string | null) ?? "Unassigned"])
      );

      const { data: claimRowsWithSeatHold, error: claimError } = await client
        .from("online_slot_claims")
        .select("student_id, status, session_date, seat_hold_expires_at")
        .eq("tenant_id", tenantId)
        .in("status", ["pending_payment", "active"])
        .order("session_date", { ascending: true });

      let claimRows: ClaimRow[] = [];
      if (!claimError) {
        claimRows = (claimRowsWithSeatHold ?? []) as ClaimRow[];
      } else if (isMissingRelationError(claimError, "online_slot_claims")) {
        claimRows = [];
      } else if (isMissingColumnError(claimError, "seat_hold_expires_at", "online_slot_claims")) {
        const { data: claimRowsWithoutSeatHold, error: claimFallbackError } = await client
          .from("online_slot_claims")
          .select("student_id, status, session_date")
          .eq("tenant_id", tenantId)
          .in("status", ["pending_payment", "active"])
          .order("session_date", { ascending: true });
        if (claimFallbackError) throw claimFallbackError;
        claimRows = ((claimRowsWithoutSeatHold ?? []) as Array<{
          student_id: string;
          status: string | null;
          session_date: string;
        }>).map((row) => ({
          ...row,
          seat_hold_expires_at: null,
        }));
      } else {
        throw claimError;
      }

      const claimByStudent = new Map<string, ClaimRow>();
      claimRows.forEach((claim) => {
        if (!claimByStudent.has(claim.student_id)) {
          claimByStudent.set(claim.student_id, claim);
        }
      });

      const stageCounts = new Map<string, number>();
      scopedStudents.forEach((student) => {
        const stage = student.crm_stage || (student.record_type === "prospect" ? "interested" : "active");
        stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
      });

      const rows = scopedStudents
        .filter((student) => {
          if (filterType && student.record_type !== filterType) return false;
          if (filterStage && (student.crm_stage || "") !== filterStage) return false;
          if (!search) return true;
          const teacherName = student.assigned_teacher_id
            ? teacherById.get(student.assigned_teacher_id) ?? ""
            : "";
          return (
            student.name.toLowerCase().includes(search) ||
            teacherName.toLowerCase().includes(search) ||
            (student.parent_name ?? "").toLowerCase().includes(search) ||
            (student.parent_contact_number ?? "").toLowerCase().includes(search)
          );
        })
        .map((student) => {
          const claim = claimByStudent.get(student.id);
          return {
            id: student.id,
            name: student.name,
            record_type: student.record_type ?? "student",
            crm_stage: student.crm_stage ?? (student.record_type === "prospect" ? "interested" : "active"),
            crm_status_reason: student.crm_status_reason,
            teacher_name: student.assigned_teacher_id
              ? teacherById.get(student.assigned_teacher_id) ?? "Unassigned"
              : "Unassigned",
            parent_name: student.parent_name,
            parent_contact_number: student.parent_contact_number,
            latest_claim_status: claim?.status ?? null,
            latest_claim_date: claim?.session_date ?? null,
            seat_hold_expires_at: claim?.seat_hold_expires_at ?? null,
          };
        });

      return {
        stages: Array.from(stageCounts.entries())
          .map(([stage, count]) => ({ stage, count }))
          .sort((left, right) => right.count - left.count),
        rows,
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online CRM fetch error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to fetch online CRM");
    return NextResponse.json({ error: message }, { status });
  }
}
