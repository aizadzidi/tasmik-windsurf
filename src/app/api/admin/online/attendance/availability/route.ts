import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

type AvailabilityBody = {
  teacher_id?: string;
  slot_template_id?: string;
  is_available?: boolean;
  reason?: string | null;
};

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;
    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("Tenant context missing");
    return data[0].id;
  });

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as AvailabilityBody;
    const teacherId = (body.teacher_id ?? "").trim();
    const slotTemplateId = (body.slot_template_id ?? "").trim();
    if (!teacherId || !slotTemplateId || typeof body.is_available !== "boolean") {
      return NextResponse.json(
        { error: "teacher_id, slot_template_id, and is_available are required." },
        { status: 400 },
      );
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const payload = await adminOperationSimple(async (client) => {
      const response = await client
        .from("online_teacher_slot_preferences")
        .upsert(
          {
            tenant_id: tenantId,
            teacher_id: teacherId,
            slot_template_id: slotTemplateId,
            is_available: body.is_available,
            last_assigned_at: body.is_available ? new Date().toISOString() : null,
          },
          { onConflict: "tenant_id,slot_template_id,teacher_id" },
        )
        .select("id, slot_template_id, teacher_id, is_available, last_assigned_at")
        .single();
      if (response.error) throw response.error;
      return response.data;
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online availability update error:", error);
    const message = error instanceof Error ? error.message : "Failed to update teacher availability";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
