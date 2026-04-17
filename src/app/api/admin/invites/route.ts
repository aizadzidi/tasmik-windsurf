import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import {
  isMissingTeacherInviteScopeSchemaError,
  normalizeStaffInviteRole,
  normalizeTeacherInviteScope,
  validateTeacherInviteScope,
} from "@/lib/staffInvites";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1 to avoid confusion
  let code = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code;
}

const TEACHER_SCOPE_MIGRATION_REQUIRED =
  "Teacher scope is not available yet. Run the latest tenant_invites migration first.";

// GET - List all invites for this tenant
export async function GET(request: NextRequest) {
  const guard = await requireAdminPermission(request, ["admin:users"]);
  if (!guard.ok) return guard.response;

  const tenantId = guard.tenantId;

  try {
    const invites = await adminOperationSimple(async (client) => {
      const selectWithScope = await client
        .from("tenant_invites")
        .select(
          "id, code, target_role, teacher_scope, max_uses, use_count, expires_at, is_active, created_at, created_by"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (!selectWithScope.error) {
        return selectWithScope.data ?? [];
      }

      if (!isMissingTeacherInviteScopeSchemaError(selectWithScope.error)) {
        throw selectWithScope.error;
      }

      const { data, error } = await client
        .from("tenant_invites")
        .select("id, code, target_role, max_uses, use_count, expires_at, is_active, created_at, created_by")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((invite) => ({ ...invite, teacher_scope: null }));
    });

    return NextResponse.json(invites);
  } catch (error) {
    console.error("GET /api/admin/invites failed", error);
    return NextResponse.json({ error: "Failed to load invites" }, { status: 500 });
  }
}

// POST - Create a new invite
export async function POST(request: NextRequest) {
  const guard = await requireAdminPermission(request, ["admin:users"]);
  if (!guard.ok) return guard.response;

  const tenantId = guard.tenantId;

  let maxUses = 20;
  let expiresInDays = 30;
  let targetRole: "teacher" | "general_worker" = "teacher";
  let teacherScope: "campus" | "online" | null = null;

  try {
    const body = await request.json();
    if (typeof body.max_uses === "number" && body.max_uses > 0 && body.max_uses <= 1000) {
      maxUses = body.max_uses;
    }
    if (typeof body.expires_in_days === "number" && body.expires_in_days > 0 && body.expires_in_days <= 365) {
      expiresInDays = body.expires_in_days;
    }
    const normalizedRole = normalizeStaffInviteRole(body.target_role);
    if (normalizedRole) {
      targetRole = normalizedRole;
    }
    teacherScope = normalizeTeacherInviteScope(body.teacher_scope);
  } catch {
    // Use defaults
  }

  const validationError = validateTeacherInviteScope(targetRole, teacherScope);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const invite = await adminOperationSimple(async (client) => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      // Retry up to 3 times in case of code collision
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = generateInviteCode();
        const insertWithScope = await client
          .from("tenant_invites")
          .insert({
            code,
            tenant_id: tenantId,
            created_by: guard.userId,
            max_uses: maxUses,
            expires_at: expiresAt.toISOString(),
            target_role: targetRole,
            teacher_scope: targetRole === "teacher" ? teacherScope : null,
          })
          .select(
            "id, code, target_role, teacher_scope, max_uses, use_count, expires_at, is_active, created_at"
          )
          .single();

        if (!insertWithScope.error) return insertWithScope.data;

        if (isMissingTeacherInviteScopeSchemaError(insertWithScope.error)) {
          if (targetRole === "teacher") {
            throw new Error(TEACHER_SCOPE_MIGRATION_REQUIRED);
          }

          const fallbackInsert = await client
            .from("tenant_invites")
            .insert({
              code,
              tenant_id: tenantId,
              created_by: guard.userId,
              max_uses: maxUses,
              expires_at: expiresAt.toISOString(),
              target_role: targetRole,
            })
            .select("id, code, target_role, max_uses, use_count, expires_at, is_active, created_at")
            .single();

          if (!fallbackInsert.error) {
            return { ...fallbackInsert.data, teacher_scope: null };
          }
          if (
            fallbackInsert.error.code !== "23505" &&
            !fallbackInsert.error.message?.includes("duplicate")
          ) {
            throw fallbackInsert.error;
          }
          continue;
        }

        // If it's a unique constraint violation, retry with a new code
        const isUniqueViolation =
          insertWithScope.error.code === "23505" ||
          insertWithScope.error.message?.includes("duplicate");
        if (!isUniqueViolation) throw insertWithScope.error;
      }
      throw new Error("Failed to generate unique invite code after 3 attempts");
    });

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/invites failed", error);
    const message = error instanceof Error ? error.message : "Failed to create invite";
    const status = message === TEACHER_SCOPE_MIGRATION_REQUIRED ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
