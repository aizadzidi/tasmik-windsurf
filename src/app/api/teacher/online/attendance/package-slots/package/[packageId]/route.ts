import { NextRequest, NextResponse } from "next/server";
import { isMissingRelationError } from "@/lib/online/db";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

const rollbackSlotCancellation = async (tenantId: string, slotIds: string[]) => {
  if (slotIds.length === 0) return;
  const rollbackRes = await supabaseService
    .from("online_recurring_package_slots")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .in("id", slotIds);
  if (rollbackRes.error) {
    console.error("Teacher bulk unassign slot rollback error:", rollbackRes.error);
  }
};

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ packageId: string }> },
) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const { packageId } = await context.params;
    if (!packageId) {
      return NextResponse.json({ error: "Package id is required." }, { status: 400 });
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

    const packageRes = await supabaseService
      .from("online_recurring_packages")
      .select("id, teacher_id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageId)
      .maybeSingle();
    if (packageRes.error) throw packageRes.error;
    if (!packageRes.data?.id || packageRes.data.teacher_id !== auth.userId) {
      return NextResponse.json({ error: "Package not found for this teacher." }, { status: 404 });
    }

    const slotsRes = await supabaseService
      .from("online_recurring_package_slots")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("package_id", packageId)
      .eq("status", "active");
    if (slotsRes.error) throw slotsRes.error;

    const slotIds = Array.from(
      new Set((slotsRes.data ?? []).map((slot) => String(slot.id ?? "")).filter(Boolean)),
    );
    if (slotIds.length === 0) {
      return NextResponse.json({ error: "No active slots found for this package." }, { status: 404 });
    }

    const timestamp = new Date().toISOString();
    const todayKey = timestamp.slice(0, 10);

    const slotUpdateRes = await supabaseService
      .from("online_recurring_package_slots")
      .update({
        status: "cancelled",
        updated_at: timestamp,
      })
      .eq("tenant_id", auth.tenantId)
      .in("id", slotIds)
      .select("id");
    if (slotUpdateRes.error) {
      throw slotUpdateRes.error;
    }

    const futureOccurrenceRes = await supabaseService
      .from("online_recurring_occurrences")
      .update({
        cancelled_at: timestamp,
        updated_at: timestamp,
      })
      .eq("tenant_id", auth.tenantId)
      .in("package_slot_id", slotIds)
      .is("cancelled_at", null)
      .gt("session_date", todayKey);
    if (
      futureOccurrenceRes.error &&
      !isMissingRelationError(futureOccurrenceRes.error, "online_recurring_occurrences")
    ) {
      await rollbackSlotCancellation(auth.tenantId, slotIds);
      throw futureOccurrenceRes.error;
    }

    const todayOccurrenceRes = await supabaseService
      .from("online_recurring_occurrences")
      .update({
        cancelled_at: timestamp,
        updated_at: timestamp,
      })
      .eq("tenant_id", auth.tenantId)
      .in("package_slot_id", slotIds)
      .is("cancelled_at", null)
      .eq("session_date", todayKey)
      .is("attendance_status", null);
    if (
      todayOccurrenceRes.error &&
      !isMissingRelationError(todayOccurrenceRes.error, "online_recurring_occurrences")
    ) {
      await rollbackSlotCancellation(auth.tenantId, slotIds);
      throw todayOccurrenceRes.error;
    }

    return NextResponse.json({
      package_id: packageId,
      removed_slot_ids: slotIds,
      removed_count: slotIds.length,
    });
  } catch (error: unknown) {
    console.error("Teacher bulk unassign package slots error:", error);
    const message = error instanceof Error ? error.message : "Failed to unassign package slots";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
