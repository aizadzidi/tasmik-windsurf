import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { assertNoTeacherSlotConflict } from "@/lib/online/scheduleConflicts";
import { moveRecurringPackageSlotFromNextOccurrence } from "@/lib/online/scheduling";
import { nextMonthKey } from "@/lib/online/recurring";
import { isMissingRelationError } from "@/lib/online/db";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

type PackageSlotPatchBody = {
  target_slot_template_id?: string;
  effective_mode?: "next_occurrence" | "next_month";
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const { id } = await context.params;
    const body = (await request.json()) as PackageSlotPatchBody;
    const targetSlotTemplateId = (body.target_slot_template_id ?? "").trim();
    const effectiveMode = body.effective_mode ?? "next_occurrence";
    if (!id || !targetSlotTemplateId) {
      return NextResponse.json({ error: "Package slot id and target_slot_template_id are required." }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const payload = await adminOperationSimple(async (client) => {
      const packageSlotRes = await client
        .from("online_recurring_package_slots")
        .select(
          "id, tenant_id, package_id, slot_template_id, day_of_week_snapshot, start_time_snapshot, duration_minutes_snapshot, status, effective_from, effective_to"
        )
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (packageSlotRes.error) throw packageSlotRes.error;
      if (!packageSlotRes.data?.id) throw new Error("Package slot not found.");

      const packageRes = await client
        .from("online_recurring_packages")
        .select(
          "id, tenant_id, student_id, course_id, teacher_id, status, source, effective_month, effective_from, effective_to, sessions_per_week, monthly_fee_cents_snapshot, notes"
        )
        .eq("tenant_id", tenantId)
        .eq("id", packageSlotRes.data.package_id)
        .maybeSingle();
      if (packageRes.error) throw packageRes.error;
      if (!packageRes.data?.id) throw new Error("Package not found.");

      const targetTemplateRes = await client
        .from("online_slot_templates")
        .select("id, course_id, day_of_week, start_time, duration_minutes")
        .eq("tenant_id", tenantId)
        .eq("id", targetSlotTemplateId)
        .maybeSingle();
      if (targetTemplateRes.error) throw targetTemplateRes.error;
      if (!targetTemplateRes.data?.id) throw new Error("Target slot template not found.");

      if (targetTemplateRes.data.course_id !== packageRes.data.course_id) {
        throw new Error("Target slot must belong to the same course.");
      }

      const availabilityRes = await client
        .from("online_teacher_slot_preferences")
        .select("id, is_available")
        .eq("tenant_id", tenantId)
        .eq("teacher_id", packageRes.data.teacher_id)
        .eq("slot_template_id", targetSlotTemplateId)
        .maybeSingle();
      if (availabilityRes.error) throw availabilityRes.error;
      if (!availabilityRes.data?.id || availabilityRes.data.is_available !== true) {
        throw new Error("Teacher is not available for the selected target slot.");
      }

      if (effectiveMode === "next_occurrence") {
        const result = await moveRecurringPackageSlotFromNextOccurrence(client, {
          tenantId,
          packageSlotId: id,
          targetSlotTemplateId,
          actorUserId: guard.userId,
          requireTeacherAvailability: true,
        });

        return { mode: effectiveMode, ...result };
      }

      const nextMonth = nextMonthKey(String(packageRes.data.effective_month).slice(0, 7));
      const nextMonthStart = `${nextMonth}-01`;
      const existingChangeRes = await client
        .from("online_package_change_requests")
        .select("id, next_package_id_draft, effective_month, pricing_delta_cents, billing_status, status")
        .eq("tenant_id", tenantId)
        .eq("current_package_id", packageRes.data.id)
        .eq("effective_month", `${nextMonth}-01`)
        .in("status", ["draft", "pending_payment", "scheduled"])
        .maybeSingle();
      if (existingChangeRes.error && !isMissingRelationError(existingChangeRes.error, "online_package_change_requests")) {
        throw existingChangeRes.error;
      }

      let draftPackageId = existingChangeRes.data?.next_package_id_draft ?? null;
      await assertNoTeacherSlotConflict(client, {
        tenantId,
        teacherId: packageRes.data.teacher_id,
        targetSlots: [
          {
            day_of_week: targetTemplateRes.data.day_of_week,
            start_time: targetTemplateRes.data.start_time,
          },
        ],
        rangeStart: nextMonthStart,
        rangeEnd: null,
        excludePackageIds: [packageRes.data.id, draftPackageId ?? ""],
      });

      if (!draftPackageId) {
        const insertDraftRes = await client
          .from("online_recurring_packages")
          .insert({
            tenant_id: tenantId,
            student_id: packageRes.data.student_id,
            course_id: packageRes.data.course_id,
            teacher_id: packageRes.data.teacher_id,
            status: "draft",
            source: "admin_next_month_change",
            effective_month: `${nextMonth}-01`,
            effective_from: `${nextMonth}-01`,
            sessions_per_week: packageRes.data.sessions_per_week,
            monthly_fee_cents_snapshot: packageRes.data.monthly_fee_cents_snapshot,
            notes: packageRes.data.notes ?? null,
            created_by: guard.userId,
            updated_by: guard.userId,
          })
          .select("*")
          .single();
        if (insertDraftRes.error) throw insertDraftRes.error;
        draftPackageId = insertDraftRes.data.id;

        const currentSlotsRes = await client
          .from("online_recurring_package_slots")
          .select("slot_template_id, day_of_week_snapshot, start_time_snapshot, duration_minutes_snapshot, status, effective_to")
          .eq("tenant_id", tenantId)
          .eq("package_id", packageRes.data.id)
          .eq("status", "active");
        if (currentSlotsRes.error) throw currentSlotsRes.error;

        const cloneRows = (currentSlotsRes.data ?? [])
          .filter((row) => !row.effective_to || String(row.effective_to).slice(0, 10) >= nextMonthStart)
          .map((row) => ({
            tenant_id: tenantId,
            package_id: draftPackageId,
            slot_template_id: row.slot_template_id,
            day_of_week_snapshot: row.day_of_week_snapshot,
            start_time_snapshot: row.start_time_snapshot,
            duration_minutes_snapshot: row.duration_minutes_snapshot,
            status: row.status,
            effective_from: nextMonthStart,
            effective_to: null,
          }));
        if (cloneRows.length > 0) {
          const insertSlotClones = await client
            .from("online_recurring_package_slots")
            .insert(cloneRows)
            .select("*");
          if (insertSlotClones.error) throw insertSlotClones.error;
        }

        const changeRequestRes = await client
          .from("online_package_change_requests")
          .insert({
            tenant_id: tenantId,
            student_id: packageRes.data.student_id,
            current_package_id: packageRes.data.id,
            next_package_id_draft: draftPackageId,
            requested_by: guard.userId,
            effective_month: `${nextMonth}-01`,
            pricing_delta_cents: 0,
            billing_status: "not_required",
            status: "scheduled",
          })
          .select("*")
          .single();
        if (changeRequestRes.error) throw changeRequestRes.error;
      }

      const matchingDraftSlotRes = await client
        .from("online_recurring_package_slots")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("package_id", draftPackageId)
        .eq("slot_template_id", packageSlotRes.data.slot_template_id)
        .eq("day_of_week_snapshot", packageSlotRes.data.day_of_week_snapshot)
        .eq("status", "active")
        .maybeSingle();
      if (matchingDraftSlotRes.error) throw matchingDraftSlotRes.error;
      if (!matchingDraftSlotRes.data?.id) {
        throw new Error("Unable to locate draft package slot for next-month change.");
      }

      const sameDayDraftSlotRes = await client
        .from("online_recurring_package_slots")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("package_id", draftPackageId)
        .eq("status", "active")
        .eq("day_of_week_snapshot", targetTemplateRes.data.day_of_week)
        .neq("id", matchingDraftSlotRes.data.id)
        .limit(1);
      if (sameDayDraftSlotRes.error) throw sameDayDraftSlotRes.error;
      if ((sameDayDraftSlotRes.data ?? []).length > 0) {
        throw new Error("A package cannot have more than one slot on the same weekday.");
      }

      const updateDraftRes = await client
        .from("online_recurring_package_slots")
        .update({
          slot_template_id: targetTemplateRes.data.id,
          day_of_week_snapshot: targetTemplateRes.data.day_of_week,
          start_time_snapshot: targetTemplateRes.data.start_time,
          duration_minutes_snapshot: targetTemplateRes.data.duration_minutes,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("id", matchingDraftSlotRes.data.id)
        .select("*")
        .single();
      if (updateDraftRes.error) throw updateDraftRes.error;

      return {
        mode: effectiveMode,
        package_slot: updateDraftRes.data,
        effective_month: `${nextMonth}-01`,
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online package slot patch error:", error);
    const message = error instanceof Error ? error.message : "Failed to move package slot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
