import type {
  ConfirmPaymentRpcRow,
  OnlineClaimRpcRow,
  OnlineClaimStatus,
} from "@/types/online";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

type RpcResponse<T> = {
  data: T[] | null;
  error: SupabaseErrorLike | null;
};

export type ClaimSlotParams = {
  tenantId: string;
  parentId: string;
  studentId: string;
  slotTemplateId: string;
  sessionDate: string;
  actorUserId: string;
};

export type ClaimSlotOutcome =
  | {
      ok: true;
      code: "claimed";
      message: string;
      claimId: string;
      assignedTeacherId: string;
      seatHoldExpiresAt: string;
      enrollmentId: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      claimId?: string | null;
    };

export type ConfirmPaymentParams = {
  tenantId: string;
  claimId: string;
  actorUserId: string;
  paymentReference?: string | null;
};

export type ConfirmPaymentOutcome =
  | {
      ok: true;
      code: "activated" | "already_active";
      message: string;
      enrollmentId: string | null;
      claimStatus: OnlineClaimStatus | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      enrollmentId: string | null;
      claimStatus: OnlineClaimStatus | null;
    };

const getErrorText = (error: SupabaseErrorLike | null) => {
  if (!error) return "";
  return `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
};

const normalizeClaimRow = (row: OnlineClaimRpcRow | undefined): ClaimSlotOutcome => {
  if (!row) {
    return { ok: false, code: "empty_response", message: "Claim RPC returned no data." };
  }

  if (!row.ok) {
    return {
      ok: false,
      code: row.code || "claim_failed",
      message: row.message || "Claim failed.",
      claimId: row.claim_id,
    };
  }

  if (!row.claim_id || !row.assigned_teacher_id || !row.seat_hold_expires_at) {
    return {
      ok: false,
      code: "invalid_claim_response",
      message: "Claim response is missing required fields.",
    };
  }

  return {
    ok: true,
    code: "claimed",
    message: row.message || "Slot claimed successfully.",
    claimId: row.claim_id,
    assignedTeacherId: row.assigned_teacher_id,
    seatHoldExpiresAt: row.seat_hold_expires_at,
    enrollmentId: row.enrollment_id ?? null,
  };
};

const normalizeConfirmRow = (row: ConfirmPaymentRpcRow | undefined): ConfirmPaymentOutcome => {
  if (!row) {
    return {
      ok: false,
      code: "empty_response",
      message: "Payment confirmation RPC returned no data.",
      enrollmentId: null,
      claimStatus: null,
    };
  }

  const claimStatus = row.claim_status ?? null;
  const enrollmentId = row.enrollment_id ?? null;

  if (!row.ok) {
    return {
      ok: false,
      code: row.code || "confirm_failed",
      message: row.message || "Payment confirmation failed.",
      enrollmentId,
      claimStatus,
    };
  }

  const code = row.code === "already_active" ? "already_active" : "activated";
  return {
    ok: true,
    code,
    message: row.message || "Payment confirmed.",
    enrollmentId,
    claimStatus,
  };
};

export const mapClaimRpcError = (error: SupabaseErrorLike | null): ClaimSlotOutcome => {
  const text = getErrorText(error);
  if (error?.code === "23505" || text.includes("duplicate key")) {
    return { ok: false, code: "slot_taken", message: "Slot already claimed." };
  }

  if (text.includes("slot already claimed")) {
    return { ok: false, code: "slot_taken", message: "Slot already claimed." };
  }

  return {
    ok: false,
    code: "rpc_error",
    message: error?.message || "Unable to claim slot.",
  };
};

export const mapConfirmRpcError = (error: SupabaseErrorLike | null): ConfirmPaymentOutcome => ({
  ok: false,
  code: "rpc_error",
  message: error?.message || "Unable to confirm payment.",
  enrollmentId: null,
  claimStatus: null,
});

export const claimOnlineSlot = async (
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResponse<OnlineClaimRpcRow>>,
  params: ClaimSlotParams
): Promise<ClaimSlotOutcome> => {
  const { data, error } = await rpc("claim_online_slot_atomic", {
    p_tenant_id: params.tenantId,
    p_parent_id: params.parentId,
    p_student_id: params.studentId,
    p_slot_template_id: params.slotTemplateId,
    p_session_date: params.sessionDate,
    p_actor_user_id: params.actorUserId,
  });

  if (error) {
    return mapClaimRpcError(error);
  }

  return normalizeClaimRow(data?.[0]);
};

export const confirmOnlineSlotPayment = async (
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResponse<ConfirmPaymentRpcRow>>,
  params: ConfirmPaymentParams
): Promise<ConfirmPaymentOutcome> => {
  const { data, error } = await rpc("confirm_online_slot_payment", {
    p_tenant_id: params.tenantId,
    p_claim_id: params.claimId,
    p_payment_reference: params.paymentReference ?? null,
    p_actor_user_id: params.actorUserId,
  });

  if (error) {
    return mapConfirmRpcError(error);
  }

  return normalizeConfirmRow(data?.[0]);
};
