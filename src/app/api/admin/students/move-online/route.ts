import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import {
  MoveOnlineError,
  toMoveOnlineError,
  validateMoveOnlineApplyResult,
} from "@/lib/moveOnline";

type MoveOnlineBody = {
  student_id?: string;
  transition_mode?: "switch" | "coexist";
  close_previous_status?: "paused" | "cancelled";
  clear_class_on_online_switch?: boolean;
  reason?: string;
};

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const guard = await requireAdminPermission(request, ["admin:dashboard"]);
    if (!guard.ok) return guard.response;

    let body: MoveOnlineBody;
    try {
      body = (await request.json()) as MoveOnlineBody;
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body.",
          code: "VALIDATION_ERROR",
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const studentId = body.student_id?.trim();
    if (!studentId) {
      return NextResponse.json(
        {
          error: "student_id is required",
          code: "VALIDATION_ERROR",
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const transitionMode = body.transition_mode === "coexist" ? "coexist" : "switch";
    const closePreviousStatus =
      body.close_previous_status === "cancelled" ? "cancelled" : "paused";
    const clearClassOnSwitch = body.clear_class_on_online_switch ?? true;
    const reason = (body.reason || "Admin UI quick move to online").trim();

    const result = await adminOperationSimple(async (client) => {
      const { data: studentRow, error: studentError } = await client
        .from("students")
        .select("id")
        .eq("tenant_id", guard.tenantId)
        .eq("id", studentId)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!studentRow?.id) {
        throw new MoveOnlineError({
          status: 404,
          code: "STUDENT_NOT_FOUND",
          clientMessage: "Student not found in this tenant.",
        });
      }

      const { count: pendingCount, error: pendingError } = await client
        .from("student_program_migration_staging")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", guard.tenantId)
        .eq("student_id", studentId)
        .is("applied_at", null);

      if (pendingError) throw pendingError;

      if ((pendingCount ?? 0) > 0) {
        throw new MoveOnlineError({
          status: 409,
          code: "PENDING_MIGRATION_EXISTS",
          clientMessage: "This student already has a pending migration. Clear it first.",
        });
      }

      const { data: stagedRow, error: insertError } = await client
        .from("student_program_migration_staging")
        .insert({
          tenant_id: guard.tenantId,
          student_id: studentId,
          target_program_type: "online",
          transition_mode: transitionMode,
          close_previous_status: closePreviousStatus,
          clear_class_on_online_switch: clearClassOnSwitch,
          reason,
          created_by: guard.userId,
        })
        .select("id, student_id")
        .single();

      if (insertError) throw insertError;
      if (!stagedRow?.id) {
        throw new MoveOnlineError({
          status: 500,
          code: "STAGING_INSERT_FAILED",
          clientMessage: "Could not create migration staging row.",
        });
      }

      const { data: applyResult, error: applyError } = await client.rpc(
        "apply_single_student_program_migration_staging",
        {
          p_tenant_id: guard.tenantId,
          p_staging_id: stagedRow.id,
        }
      );

      if (applyError) throw applyError;

      return validateMoveOnlineApplyResult(applyResult, {
        stagingId: stagedRow.id,
        studentId,
      });
    });

    return NextResponse.json({ ok: true, request_id: requestId, result });
  } catch (error: unknown) {
    const mapped = toMoveOnlineError(error);
    console.error(`[move-online][${requestId}]`, error);
    return NextResponse.json(
      {
        error: mapped.clientMessage,
        code: mapped.code,
        request_id: requestId,
      },
      { status: mapped.status }
    );
  }
}
