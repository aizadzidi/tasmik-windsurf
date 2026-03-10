import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";

type MoveBody = {
  target_slot_template_id?: string;
  effective_mode?: "next_occurrence";
};

const ACTIVE_PACKAGE_STATUSES = ["active", "pending_payment", "draft"] as const;

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

    const slotRes = await supabaseService
      .from("online_recurring_package_slots")
      .select("id, package_id, slot_template_id, day_of_week_snapshot, start_time_snapshot, duration_minutes_snapshot")
      .eq("tenant_id", auth.tenantId)
      .eq("id", id)
      .maybeSingle();
    if (slotRes.error) throw slotRes.error;
    if (!slotRes.data?.id) {
      return NextResponse.json({ error: "Package slot not found." }, { status: 404 });
    }

    const packageRes = await supabaseService
      .from("online_recurring_packages")
      .select("id, teacher_id, course_id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("id", slotRes.data.package_id)
      .maybeSingle();
    if (packageRes.error) throw packageRes.error;
    if (!packageRes.data?.id || packageRes.data.teacher_id !== auth.userId) {
      return NextResponse.json({ error: "Package not found for this teacher." }, { status: 404 });
    }

    const targetTemplateRes = await supabaseService
      .from("online_slot_templates")
      .select("id, course_id, day_of_week, start_time, duration_minutes")
      .eq("tenant_id", auth.tenantId)
      .eq("id", targetSlotTemplateId)
      .maybeSingle();
    if (targetTemplateRes.error) throw targetTemplateRes.error;
    if (!targetTemplateRes.data?.id) {
      return NextResponse.json({ error: "Target slot template not found." }, { status: 404 });
    }
    if (targetTemplateRes.data.course_id !== packageRes.data.course_id) {
      return NextResponse.json(
        { error: "Teachers can only move students within the same course package." },
        { status: 409 },
      );
    }
    if (slotRes.data.slot_template_id === targetSlotTemplateId) {
      return NextResponse.json(slotRes.data);
    }

    const availabilityRes = await supabaseService
      .from("online_teacher_slot_preferences")
      .select("id, is_available")
      .eq("tenant_id", auth.tenantId)
      .eq("teacher_id", auth.userId)
      .eq("slot_template_id", targetSlotTemplateId)
      .maybeSingle();
    if (availabilityRes.error) throw availabilityRes.error;
    if (!availabilityRes.data?.id || availabilityRes.data.is_available !== true) {
      return NextResponse.json(
        { error: "Target slot is not available for this teacher." },
        { status: 409 },
      );
    }

    const conflictingSlotRes = await supabaseService
      .from("online_recurring_package_slots")
      .select("id, package_id")
      .eq("tenant_id", auth.tenantId)
      .eq("slot_template_id", targetSlotTemplateId)
      .eq("status", "active")
      .neq("id", id);
    if (conflictingSlotRes.error) throw conflictingSlotRes.error;

    const conflictingPackageIds = Array.from(
      new Set(
        (conflictingSlotRes.data ?? [])
          .map((row) => String(row.package_id ?? ""))
          .filter((value) => value.length > 0),
      ),
    );
    if (conflictingPackageIds.length > 0) {
      const conflictingPackageRes = await supabaseService
        .from("online_recurring_packages")
        .select("id")
        .eq("tenant_id", auth.tenantId)
        .eq("teacher_id", auth.userId)
        .in("status", [...ACTIVE_PACKAGE_STATUSES])
        .in("id", conflictingPackageIds)
        .limit(1);
      if (conflictingPackageRes.error) throw conflictingPackageRes.error;
      if ((conflictingPackageRes.data ?? []).length > 0) {
        return NextResponse.json(
          { error: "Target slot is already occupied for this teacher." },
          { status: 409 },
        );
      }
    }

    const timestamp = new Date().toISOString();
    const updateRes = await supabaseService
      .from("online_recurring_package_slots")
      .update({
        slot_template_id: targetTemplateRes.data.id,
        day_of_week_snapshot: targetTemplateRes.data.day_of_week,
        start_time_snapshot: targetTemplateRes.data.start_time,
        duration_minutes_snapshot: targetTemplateRes.data.duration_minutes,
        updated_at: timestamp,
      })
      .eq("tenant_id", auth.tenantId)
      .eq("id", id)
      .select("*")
      .single();
    if (updateRes.error) throw updateRes.error;

    // Clear upcoming rows tied to the old slot timing so next reads regenerate correctly.
    const todayKey = timestamp.slice(0, 10);
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

    return NextResponse.json(updateRes.data);
  } catch (error: unknown) {
    console.error("Teacher online package slot move error:", error);
    const message = error instanceof Error ? error.message : "Failed to move package slot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
