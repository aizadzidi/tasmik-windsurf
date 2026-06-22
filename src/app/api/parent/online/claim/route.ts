import { NextRequest, NextResponse } from "next/server";
import { currentMonthKey, normalizeDateKey } from "@/lib/online/recurring";
import { isMissingRelationError } from "@/lib/online/db";
import { claimOnlineRecurringPackageAtomic } from "@/lib/online/packageClaims";
import { ONLINE_SELF_SERVICE_ENROLLMENT_ENABLED } from "@/lib/online/selfService";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

type ClaimBody = {
  student_id?: string;
  course_id?: string;
  slot_template_ids?: string[];
  effective_month?: string;
};

type ReleaseBody = {
  package_id?: string;
};

const toEffectiveMonthStart = (value: string) => {
  const normalized = normalizeDateKey(value);
  if (!normalized) return null;
  return `${normalized.slice(0, 7)}-01`;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  if (!ONLINE_SELF_SERVICE_ENROLLMENT_ENABLED) {
    return NextResponse.json(
      { error: "Online self enrollment is currently disabled. Please contact admin." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as ClaimBody;
    const studentId = (body.student_id ?? "").trim();
    const courseId = (body.course_id ?? "").trim();
    const slotTemplateIds = Array.from(
      new Set((Array.isArray(body.slot_template_ids) ? body.slot_template_ids : []).map(String).map((value) => value.trim()).filter(Boolean)),
    );
    const effectiveMonthStart = toEffectiveMonthStart(
      (body.effective_month ?? currentMonthKey()).trim(),
    );

    if (!studentId || !courseId || slotTemplateIds.length === 0) {
      return NextResponse.json(
        { error: "student_id, course_id, and slot_template_ids are required" },
        { status: 400 },
      );
    }
    if (!effectiveMonthStart) {
      return NextResponse.json(
        { error: "effective_month must be in YYYY-MM or YYYY-MM-DD format" },
        { status: 400 },
      );
    }

    const studentRes = await supabaseService
      .from("students")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", studentId)
      .eq("parent_id", auth.userId)
      .neq("record_type", "prospect")
      .maybeSingle();
    if (studentRes.error) throw studentRes.error;
    if (!studentRes.data?.id) {
      return NextResponse.json({ error: "Student not found for this parent." }, { status: 403 });
    }

    const claimResult = await claimOnlineRecurringPackageAtomic({
      tenantId: auth.tenantId,
      studentId,
      courseId,
      slotTemplateIds,
      effectiveMonthStart,
      source: "parent_self_pick",
      actorUserId: auth.userId,
    });
    if (!claimResult.ok) return claimResult.response;

    return NextResponse.json({
      ok: true,
      code: "claimed",
      package_id: claimResult.package_id,
      assigned_teacher_id: claimResult.assigned_teacher_id,
      seat_hold_expires_at: claimResult.seat_hold_expires_at,
      package_slots: claimResult.package_slots,
    });
  } catch (error: unknown) {
    console.error("Parent online package claim error:", error);
    if (
      isMissingRelationError(error as { message?: string }, "online_recurring_packages") ||
      isMissingRelationError(error as { message?: string }, "online_recurring_package_slots")
    ) {
      return NextResponse.json(
        { error: "Online package enrollment is not configured yet. Please contact support." },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to claim package";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ReleaseBody;
    const packageId = (body.package_id ?? "").trim();
    if (!packageId) {
      return NextResponse.json({ error: "package_id is required" }, { status: 400 });
    }

    const packageRes = await supabaseService
      .from("online_recurring_packages")
      .select("id, student_id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageId)
      .maybeSingle();
    if (packageRes.error) throw packageRes.error;
    if (!packageRes.data?.id) {
      return NextResponse.json({ error: "Package draft not found." }, { status: 404 });
    }

    const studentRes = await supabaseService
      .from("students")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageRes.data.student_id)
      .eq("parent_id", auth.userId)
      .maybeSingle();
    if (studentRes.error) throw studentRes.error;
    if (!studentRes.data?.id) {
      return NextResponse.json({ error: "Package draft not found for this parent." }, { status: 404 });
    }
    if (packageRes.data.status === "active") {
      return NextResponse.json({ error: "Active packages cannot be released directly." }, { status: 409 });
    }

    const deleteSlotRes = await supabaseService
      .from("online_recurring_package_slots")
      .delete()
      .eq("tenant_id", auth.tenantId)
      .eq("package_id", packageId);
    if (deleteSlotRes.error) throw deleteSlotRes.error;

    const deletePackageRes = await supabaseService
      .from("online_recurring_packages")
      .delete()
      .eq("tenant_id", auth.tenantId)
      .eq("id", packageId);
    if (deletePackageRes.error) throw deletePackageRes.error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Parent online package release error:", error);
    const message = error instanceof Error ? error.message : "Failed to release package draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
