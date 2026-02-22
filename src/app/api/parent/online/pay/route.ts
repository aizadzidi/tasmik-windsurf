import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { confirmOnlineSlotPayment } from "@/lib/online/claims";
import { isMissingFunctionError, isMissingRelationError } from "@/lib/online/db";

type PayBody = {
  claim_id?: string;
  payment_reference?: string | null;
};

const statusForCode = (code: string) => {
  if (code === "hold_expired") return 409;
  if (code === "invalid_status") return 409;
  if (code === "claim_not_found") return 404;
  if (code === "invalid_request") return 400;
  return 500;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as PayBody;
    const claimId = (body.claim_id ?? "").trim();
    if (!claimId) {
      return NextResponse.json({ error: "claim_id is required" }, { status: 400 });
    }

    const { data: claimRow, error: claimError } = await supabaseService
      .from("online_slot_claims")
      .select("id, parent_id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", claimId)
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimRow?.id || claimRow.parent_id !== auth.userId) {
      return NextResponse.json({ error: "Claim not found for this parent." }, { status: 404 });
    }

    const result = await confirmOnlineSlotPayment(
      async (fn, args) => await supabaseService.rpc(fn, args),
      {
        tenantId: auth.tenantId,
        claimId,
        actorUserId: auth.userId,
        paymentReference: body.payment_reference ?? null,
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          error: result.message,
          enrollment_id: result.enrollmentId,
          claim_status: result.claimStatus,
        },
        { status: statusForCode(result.code) }
      );
    }

    return NextResponse.json({
      ok: true,
      code: result.code,
      message: result.message,
      enrollment_id: result.enrollmentId,
      claim_status: result.claimStatus,
    });
  } catch (error: unknown) {
    console.error("Parent online payment confirm error:", error);
    if (
      isMissingFunctionError(error as { message?: string }, "confirm_online_slot_payment") ||
      isMissingRelationError(error as { message?: string }, "online_slot_claims")
    ) {
      return NextResponse.json(
        { error: "Online payment flow is not configured yet. Please contact support." },
        { status: 503 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to confirm payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
