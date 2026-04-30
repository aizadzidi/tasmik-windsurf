import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/adminPermissions";
import {
  OnlineFamilyRecoveryError,
  recoverOnlineClaimedFamily,
  type OnlineFamilyRecoveryStore,
  type OnlineFamilyRecoveryStudent,
  type OnlineFamilyRecoveryUser,
} from "@/lib/online/familyRecovery";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

type FamilyRecoveryBody = {
  claimed_student_id?: unknown;
  student_ids?: unknown;
};

type EnrollmentRow = {
  student_id: string | null;
  programs:
    | { type?: string | null }
    | Array<{ type?: string | null }>
    | null;
};

const toStudentIds = (value: unknown) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

const createRecoveryStore = (client: SupabaseClient): OnlineFamilyRecoveryStore => ({
  async fetchStudentsByIds(tenantId, studentIds) {
    const { data, error } = await client
      .from("students")
      .select("id, name, parent_id, record_type, account_owner_user_id")
      .eq("tenant_id", tenantId)
      .in("id", studentIds);
    if (error) throw error;
    return (data ?? []) as OnlineFamilyRecoveryStudent[];
  },

  async fetchOnlineStudentIds(tenantId, studentIds) {
    const { data, error } = await client
      .from("enrollments")
      .select("student_id, programs(type)")
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds)
      .in("status", ["pending_payment", "active", "paused"]);
    if (error) throw error;

    return new Set(
      ((data ?? []) as EnrollmentRow[])
        .filter((row) => {
          const program = Array.isArray(row.programs) ? row.programs[0] : row.programs;
          return program?.type === "online" || program?.type === "hybrid";
        })
        .map((row) => row.student_id)
        .filter((studentId): studentId is string => Boolean(studentId))
    );
  },

  async fetchUserById(userId) {
    const { data, error } = await client
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle<OnlineFamilyRecoveryUser>();
    if (error) throw error;
    return data ?? null;
  },

  async promoteUserToParent({ tenantId, userId }) {
    const [userRes, profileRes] = await Promise.all([
      client.from("users").update({ role: "parent" }).eq("id", userId),
      client
        .from("user_profiles")
        .update({ role: "parent" })
        .eq("user_id", userId)
        .eq("tenant_id", tenantId),
    ]);
    if (userRes.error) throw userRes.error;
    if (profileRes.error) throw profileRes.error;
  },

  async linkStudentsToParent({ tenantId, studentIds, parentId }) {
    const { error } = await client
      .from("students")
      .update({ parent_id: parentId })
      .eq("tenant_id", tenantId)
      .in("id", studentIds);
    if (error) throw error;
  },
});

const errorResponse = (error: unknown) => {
  if (error instanceof OnlineFamilyRecoveryError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : "Failed to recover family account";
  const status = message.includes("Admin access required") ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as FamilyRecoveryBody;
    const claimedStudentId =
      typeof body.claimed_student_id === "string" ? body.claimed_student_id.trim() : "";
    const studentIds = toStudentIds(body.student_ids);

    const payload = await adminOperationSimple(async (client) =>
      recoverOnlineClaimedFamily(createRecoveryStore(client), {
        tenantId: guard.tenantId,
        claimedStudentId,
        studentIds,
      })
    );

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("Admin online family recovery error:", error);
    return errorResponse(error);
  }
}
