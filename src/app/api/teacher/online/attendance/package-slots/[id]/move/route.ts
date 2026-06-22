import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { moveRecurringPackageSlotFromNextOccurrence } from "@/lib/online/scheduling";

type MoveBody = {
  target_slot_template_id?: string;
  effective_mode?: "next_occurrence";
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as MoveBody;
    const { id } = await context.params;
    const targetSlotTemplateId = (body.target_slot_template_id ?? "").trim();
    if (!id || !targetSlotTemplateId) {
      return NextResponse.json(
        { error: "Package slot id and target_slot_template_id are required." },
        { status: 400 },
      );
    }
    if (body.effective_mode && body.effective_mode !== "next_occurrence") {
      return NextResponse.json(
        { error: "Teachers may only move time slots with effective_mode=next_occurrence." },
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

    const result = await moveRecurringPackageSlotFromNextOccurrence(supabaseService, {
      tenantId: auth.tenantId,
      packageSlotId: id,
      targetSlotTemplateId,
      actorUserId: auth.userId,
      expectedTeacherId: auth.userId,
      requireTeacherAvailability: true,
    });

    return NextResponse.json(result.package_slot);
  } catch (error: unknown) {
    console.error("Teacher online package slot move error:", error);
    const message = error instanceof Error ? error.message : "Failed to move package slot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
