import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedTenantUser(_request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Package slot id is required." }, { status: 400 });
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

    const slotRes = await supabaseService
      .from("online_recurring_package_slots")
      .select("id, package_id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("id", id)
      .maybeSingle();
    if (slotRes.error) throw slotRes.error;
    if (!slotRes.data?.id) {
      return NextResponse.json({ error: "Package slot not found." }, { status: 404 });
    }

    const packageRes = await supabaseService
      .from("online_recurring_packages")
      .select("id, teacher_id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", slotRes.data.package_id)
      .maybeSingle();
    if (packageRes.error) throw packageRes.error;
    if (!packageRes.data?.id || packageRes.data.teacher_id !== auth.userId) {
      return NextResponse.json({ error: "Package not found for this teacher." }, { status: 404 });
    }

    const timestamp = new Date().toISOString();
    const slotUpdateRes = await supabaseService
      .from("online_recurring_package_slots")
      .update({
        status: "cancelled",
        updated_at: timestamp,
      })
      .eq("tenant_id", auth.tenantId)
      .eq("id", id)
      .select("*")
      .single();
    if (slotUpdateRes.error) throw slotUpdateRes.error;

    const todayKey = new Date().toISOString().slice(0, 10);
    const cancelFutureOccurrenceRes = await supabaseService
      .from("online_recurring_occurrences")
      .update({
        cancelled_at: timestamp,
        updated_at: timestamp,
      })
      .eq("tenant_id", auth.tenantId)
      .eq("package_slot_id", id)
      .is("cancelled_at", null)
      .gt("session_date", todayKey);
    if (cancelFutureOccurrenceRes.error) throw cancelFutureOccurrenceRes.error;

    const cancelTodayUnmarkedOccurrenceRes = await supabaseService
      .from("online_recurring_occurrences")
      .update({
        cancelled_at: timestamp,
        updated_at: timestamp,
      })
      .eq("tenant_id", auth.tenantId)
      .eq("package_slot_id", id)
      .is("cancelled_at", null)
      .eq("session_date", todayKey)
      .is("attendance_status", null);
    if (cancelTodayUnmarkedOccurrenceRes.error) throw cancelTodayUnmarkedOccurrenceRes.error;

    return NextResponse.json(slotUpdateRes.data);
  } catch (error: unknown) {
    console.error("Teacher unassign package slot error:", error);
    const message = error instanceof Error ? error.message : "Failed to unassign package slot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
