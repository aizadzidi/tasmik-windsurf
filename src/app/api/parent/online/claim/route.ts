import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { claimOnlineSlot } from "@/lib/online/claims";
import { isMissingFunctionError, isMissingRelationError } from "@/lib/online/db";

type ClaimBody = {
  student_id?: string;
  slot_template_id?: string;
  session_date?: string;
};

type ReleaseBody = {
  claim_id?: string;
  reason?: string;
};

const statusForClaimCode = (code: string) => {
  if (code === "slot_taken") return 409;
  if (code === "no_teacher_available") return 409;
  if (code === "slot_not_found" || code === "weekend_not_allowed" || code === "slot_day_mismatch") {
    return 400;
  }
  if (code === "invalid_request") return 400;
  return 500;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ClaimBody;
    const studentId = (body.student_id ?? "").trim();
    const slotTemplateId = (body.slot_template_id ?? "").trim();
    const sessionDate = (body.session_date ?? "").trim();

    if (!studentId || !slotTemplateId || !sessionDate) {
      return NextResponse.json(
        { error: "student_id, slot_template_id, and session_date are required" },
        { status: 400 }
      );
    }

    const { data: studentRow, error: studentError } = await supabaseService
      .from("students")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", studentId)
      .eq("parent_id", auth.userId)
      .neq("record_type", "prospect")
      .maybeSingle();

    if (studentError) throw studentError;
    if (!studentRow?.id) {
      return NextResponse.json({ error: "Student not found for this parent." }, { status: 403 });
    }

    const result = await claimOnlineSlot(
      async (fn, args) => await supabaseService.rpc(fn, args),
      {
        tenantId: auth.tenantId,
        parentId: auth.userId,
        studentId,
        slotTemplateId,
        sessionDate,
        actorUserId: auth.userId,
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message, claim_id: result.claimId ?? null },
        { status: statusForClaimCode(result.code) }
      );
    }

    return NextResponse.json({
      ok: true,
      code: result.code,
      message: result.message,
      claim_id: result.claimId,
      assigned_teacher_id: result.assignedTeacherId,
      seat_hold_expires_at: result.seatHoldExpiresAt,
      enrollment_id: result.enrollmentId,
    });
  } catch (error: unknown) {
    console.error("Parent online claim error:", error);
    if (
      isMissingFunctionError(error as { message?: string }, "claim_online_slot_atomic") ||
      isMissingRelationError(error as { message?: string }, "online_slot_claims")
    ) {
      return NextResponse.json(
        { error: "Online enrollment is not configured yet. Please contact support." },
        { status: 503 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to claim online slot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ReleaseBody;
    const claimId = (body.claim_id ?? "").trim();
    if (!claimId) {
      return NextResponse.json({ error: "claim_id is required" }, { status: 400 });
    }

    const { data: claimRow, error: claimError } = await supabaseService
      .from("online_slot_claims")
      .select("id, parent_id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("id", claimId)
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimRow?.id || claimRow.parent_id !== auth.userId) {
      return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    }

    const { data: rpcData, error: rpcError } = await supabaseService.rpc("release_online_slot_claim", {
      p_tenant_id: auth.tenantId,
      p_claim_id: claimId,
      p_reason: body.reason?.trim() || "parent_release",
    });

    if (rpcError) throw rpcError;
    const row = Array.isArray(rpcData) ? rpcData[0] : null;
    if (!row || !row.ok) {
      return NextResponse.json(
        { error: row?.message || "Unable to release claim.", code: row?.code || "release_failed" },
        { status: row?.code === "active_claim" ? 409 : 400 }
      );
    }

    return NextResponse.json({ ok: true, code: row.code, message: row.message });
  } catch (error: unknown) {
    console.error("Parent online claim release error:", error);
    const message = error instanceof Error ? error.message : "Failed to release online claim";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
