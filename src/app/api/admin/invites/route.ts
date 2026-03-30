import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
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

// GET - List all invites for this tenant
export async function GET(request: NextRequest) {
  const guard = await requireAdminPermission(request, ["admin:users"]);
  if (!guard.ok) return guard.response;

  const tenantId = guard.tenantId;

  try {
    const invites = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("tenant_invites")
        .select("id, code, max_uses, use_count, expires_at, is_active, created_at, created_by")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
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

  try {
    const body = await request.json();
    if (typeof body.max_uses === "number" && body.max_uses > 0 && body.max_uses <= 1000) {
      maxUses = body.max_uses;
    }
    if (typeof body.expires_in_days === "number" && body.expires_in_days > 0 && body.expires_in_days <= 365) {
      expiresInDays = body.expires_in_days;
    }
  } catch {
    // Use defaults
  }

  try {
    const invite = await adminOperationSimple(async (client) => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      // Retry up to 3 times in case of code collision
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = generateInviteCode();
        const { data, error } = await client
          .from("tenant_invites")
          .insert({
            code,
            tenant_id: tenantId,
            created_by: guard.userId,
            max_uses: maxUses,
            expires_at: expiresAt.toISOString(),
          })
          .select("id, code, max_uses, use_count, expires_at, is_active, created_at")
          .single();

        if (!error) return data;

        // If it's a unique constraint violation, retry with a new code
        const isUniqueViolation =
          error.code === "23505" || error.message?.includes("duplicate");
        if (!isUniqueViolation) throw error;
      }
      throw new Error("Failed to generate unique invite code after 3 attempts");
    });

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/invites failed", error);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
