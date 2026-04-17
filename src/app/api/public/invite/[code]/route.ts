import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  isMissingTeacherInviteScopeSchemaError,
  normalizeTeacherInviteScope,
} from "@/lib/staffInvites";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { code } = await context.params;
  if (!code || code.length > 32) {
    return NextResponse.json(
      { ok: false, error: "Invalid invite code." },
      { status: 400 }
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();

    const inviteWithScope = await supabaseAdmin
      .from("tenant_invites")
      .select("id, code, tenant_id, max_uses, use_count, expires_at, is_active, target_role, teacher_scope")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    let invite = inviteWithScope.data;

    if (inviteWithScope.error) {
      if (!isMissingTeacherInviteScopeSchemaError(inviteWithScope.error)) {
        return NextResponse.json(
          { ok: false, error: "Unable to validate invite." },
          { status: 500 }
        );
      }

      const inviteWithoutScope = await supabaseAdmin
        .from("tenant_invites")
        .select("id, code, tenant_id, max_uses, use_count, expires_at, is_active, target_role")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (inviteWithoutScope.error) {
        return NextResponse.json(
          { ok: false, error: "Unable to validate invite." },
          { status: 500 }
        );
      }

      invite = inviteWithoutScope.data
        ? { ...inviteWithoutScope.data, teacher_scope: null }
        : null;
    }

    if (!invite) {
      return NextResponse.json(
        { ok: false, error: "Invite code not found." },
        { status: 404 }
      );
    }

    if (!invite.is_active) {
      return NextResponse.json(
        { ok: false, error: "This invite has been revoked." },
        { status: 410 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { ok: false, error: "This invite has expired." },
        { status: 410 }
      );
    }

    if (invite.use_count >= invite.max_uses) {
      return NextResponse.json(
        { ok: false, error: "This invite has reached its usage limit." },
        { status: 410 }
      );
    }

    const targetRole = invite.target_role ?? "teacher";
    if (targetRole === "teacher" && !normalizeTeacherInviteScope(invite.teacher_scope)) {
      return NextResponse.json(
        {
          ok: false,
          error: "This teacher invite is no longer valid. Please ask your admin for a new invite.",
        },
        { status: 409 }
      );
    }

    // Fetch school name
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("id", invite.tenant_id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      school_name: tenant?.name ?? null,
      remaining_uses: invite.max_uses - invite.use_count,
      target_role: targetRole,
      teacher_scope: invite.teacher_scope ?? null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
