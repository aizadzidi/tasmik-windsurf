import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";
import {
  enforceTenantPlanLimit,
  TenantPlanLimitExceededError,
} from "@/lib/planLimits";

type CreateOnlineStudentBody = {
  name?: string;
  parent_id?: string | null;
  assigned_teacher_id?: string | null;
  parent_name?: string | null;
  parent_contact_number?: string | null;
};

type EnrollmentRow = {
  student_id: string | null;
  programs?: Array<{ type?: string | null; name?: string | null }> | null;
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

const toNullable = (value?: string | null) => {
  if (value === undefined) return undefined;
  const trimmed = value === null ? "" : value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const tenantId = await resolveTenantIdOrThrow(request);
    const payload = await adminOperationSimple(async (client) => {
      const { data: enrollmentRows, error: enrollmentError } = await client
        .from("enrollments")
        .select("student_id, status, programs(type, name)")
        .eq("tenant_id", tenantId)
        .in("status", ["pending_payment", "active", "paused"]);
      if (enrollmentError) throw enrollmentError;

      const onlineStudentIds = Array.from(
        new Set(
          ((enrollmentRows ?? []) as EnrollmentRow[])
            .filter((row) => {
              const type = row.programs?.[0]?.type ?? null;
              return type === "online" || type === "hybrid";
            })
            .map((row) => row.student_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (onlineStudentIds.length === 0) return [];

      const { data: students, error: studentError } = await client
        .from("students")
        .select(
          "id, name, record_type, assigned_teacher_id, parent_name, parent_contact_number, crm_stage, crm_status_reason"
        )
        .eq("tenant_id", tenantId)
        .in("id", onlineStudentIds)
        .order("name", { ascending: true });
      if (studentError) throw studentError;

      return students ?? [];
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online students fetch error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to fetch online students");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as CreateOnlineStudentBody;
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);

    const payload = await adminOperationSimple(async (client) => {
      await enforceTenantPlanLimit({
        client,
        tenantId,
        addStudents: 1,
      });

      const { data: studentRow, error: studentError } = await client
        .from("students")
        .insert({
          tenant_id: tenantId,
          name,
          record_type: "student",
          crm_stage: "interested",
          parent_id: toNullable(body.parent_id),
          assigned_teacher_id: toNullable(body.assigned_teacher_id),
          parent_name: toNullable(body.parent_name),
          parent_contact_number: toNullable(body.parent_contact_number),
        })
        .select("*")
        .single();
      if (studentError) throw studentError;

      const { data: programRows, error: programError } = await client
        .from("programs")
        .select("id, type")
        .eq("tenant_id", tenantId)
        .in("type", ["online", "hybrid"])
        .order("created_at", { ascending: true });
      if (programError) throw programError;

      const programId =
        (programRows ?? []).find((row) => row.type === "online")?.id ?? (programRows ?? [])[0]?.id;

      if (programId) {
        const { error: enrollmentError } = await client
          .from("enrollments")
          .upsert(
            {
              tenant_id: tenantId,
              student_id: studentRow.id,
              program_id: programId,
              status: "pending_payment",
              start_date: new Date().toISOString().slice(0, 10),
              metadata: {
                status_reason: "Online student created by admin",
              },
            },
            { onConflict: "student_id,program_id,tenant_id" }
          );
        if (enrollmentError) throw enrollmentError;
      }

      return studentRow;
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TenantPlanLimitExceededError) {
      return NextResponse.json(error.payload, { status: error.status });
    }
    console.error("Admin online student creation error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to create online student");
    return NextResponse.json({ error: message }, { status });
  }
}
