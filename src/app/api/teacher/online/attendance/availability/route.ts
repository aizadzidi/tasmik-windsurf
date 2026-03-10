import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";

type AvailabilityBody = {
  slot_template_id?: string;
  is_available?: boolean;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as AvailabilityBody;
    const slotTemplateId = (body.slot_template_id ?? "").trim();
    if (!slotTemplateId || typeof body.is_available !== "boolean") {
      return NextResponse.json(
        { error: "slot_template_id and is_available are required." },
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

    const response = await supabaseService
      .from("online_teacher_slot_preferences")
      .upsert(
        {
          tenant_id: auth.tenantId,
          teacher_id: auth.userId,
          slot_template_id: slotTemplateId,
          is_available: body.is_available,
          last_assigned_at: body.is_available ? new Date().toISOString() : null,
        },
        { onConflict: "tenant_id,slot_template_id,teacher_id" },
      )
      .select("id, slot_template_id, teacher_id, is_available, last_assigned_at")
      .single();
    if (response.error) throw response.error;

    return NextResponse.json(response.data);
  } catch (error: unknown) {
    console.error("Teacher online availability update error:", error);
    const message = error instanceof Error ? error.message : "Failed to update availability";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
