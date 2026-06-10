import { NextResponse } from "next/server";
import { isMissingFunctionError } from "@/lib/online/db";
import { supabaseService } from "@/lib/supabaseServiceClient";

type ClaimRpcRow = {
  ok: boolean;
  code: string;
  message: string;
  package_id: string | null;
  assigned_teacher_id: string | null;
  seat_hold_expires_at: string | null;
  package_slots: unknown;
};

export type AtomicPackageClaimParams = {
  tenantId: string;
  studentId: string;
  courseId: string;
  slotTemplateIds: string[];
  effectiveMonthStart: string;
  source: "parent_self_pick" | "student_self_pick";
  actorUserId: string;
};

export type AtomicPackageClaimResult =
  | {
      ok: true;
      code: "claimed";
      package_id: string;
      assigned_teacher_id: string;
      seat_hold_expires_at: string;
      package_slots: unknown;
    }
  | { ok: false; response: NextResponse };

const codeStatus = (code: string) => {
  if (code === "course_not_found" || code === "slot_not_found") return 404;
  if (
    code === "invalid_request" ||
    code === "invalid_slots" ||
    code === "invalid_slot_count"
  ) {
    return 400;
  }
  return 409;
};

export const claimOnlineRecurringPackageAtomic = async (
  params: AtomicPackageClaimParams,
): Promise<AtomicPackageClaimResult> => {
  const { data, error } = await supabaseService.rpc("claim_online_recurring_package_atomic", {
    p_tenant_id: params.tenantId,
    p_student_id: params.studentId,
    p_course_id: params.courseId,
    p_slot_template_ids: params.slotTemplateIds,
    p_effective_month: params.effectiveMonthStart,
    p_source: params.source,
    p_actor_user_id: params.actorUserId,
  });

  if (error) {
    if (isMissingFunctionError(error, "claim_online_recurring_package_atomic")) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Online package claiming is not configured yet. Run the latest online package migration." },
          { status: 503 },
        ),
      };
    }
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as ClaimRpcRow | null | undefined;
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Package claim returned no result." }, { status: 500 }),
    };
  }

  if (!row.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: row.message || "Failed to claim package.", code: row.code },
        { status: codeStatus(row.code) },
      ),
    };
  }

  if (!row.package_id || !row.assigned_teacher_id || !row.seat_hold_expires_at) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Package claim returned incomplete data." }, { status: 500 }),
    };
  }

  return {
    ok: true,
    code: "claimed",
    package_id: row.package_id,
    assigned_teacher_id: row.assigned_teacher_id,
    seat_hold_expires_at: row.seat_hold_expires_at,
    package_slots: row.package_slots ?? [],
  };
};
