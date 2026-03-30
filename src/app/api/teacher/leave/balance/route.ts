import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const { userId, tenantId } = auth;
    const year = new Date().getFullYear();

    const balances = await adminOperationSimple(async (client) => {
      // Check if balances exist for this user + year
      const { data: existing, error: existingErr } = await client
        .from("leave_balances")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("year", year);

      if (existingErr) throw existingErr;

      if (existing && existing.length > 0) return existing;

      // Lazy-initialize: get user's position from user_profiles
      const { data: profile } = await client
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      // Map profile role to position for entitlement lookup
      const roleToPosition: Record<string, string> = {
        school_admin: "admin",
        admin: "admin",
        teacher: "teacher",
        general_worker: "general_worker",
      };

      // Also check users table for global role
      const { data: userRow } = await client
        .from("users")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      const position =
        roleToPosition[profile?.role ?? ""] ??
        roleToPosition[userRow?.role ?? ""] ??
        "teacher";

      // Get entitlements for this position, auto-seed defaults if none exist
      let { data: entitlements, error: entErr } = await client
        .from("leave_entitlements")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("position", position);

      if (entErr) throw entErr;

      if (!entitlements || entitlements.length === 0) {
        // Seed default entitlements for all positions
        const defaults = [
          { position: "admin", leave_type: "annual_leave", days_per_year: 14 },
          { position: "admin", leave_type: "medical_leave", days_per_year: 14 },
          { position: "admin", leave_type: "unpaid_leave", days_per_year: 0 },
          { position: "teacher", leave_type: "annual_leave", days_per_year: 12 },
          { position: "teacher", leave_type: "medical_leave", days_per_year: 14 },
          { position: "teacher", leave_type: "unpaid_leave", days_per_year: 0 },
          { position: "general_worker", leave_type: "annual_leave", days_per_year: 10 },
          { position: "general_worker", leave_type: "medical_leave", days_per_year: 14 },
          { position: "general_worker", leave_type: "unpaid_leave", days_per_year: 0 },
        ];

        const { error: seedErr } = await client
          .from("leave_entitlements")
          .upsert(
            defaults.map((d) => ({ ...d, tenant_id: tenantId })),
            { onConflict: "tenant_id,position,leave_type" }
          );
        if (seedErr) throw seedErr;

        const { data: seeded, error: seededErr } = await client
          .from("leave_entitlements")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("position", position);
        if (seededErr) throw seededErr;
        entitlements = seeded;
      }

      // Create balance records for this user + year
      const balanceRows = (entitlements ?? []).map((ent) => ({
        tenant_id: tenantId,
        user_id: userId,
        leave_type: ent.leave_type,
        year,
        entitled_days: ent.days_per_year,
        used_days: 0,
      }));

      const { data: inserted, error: insertErr } = await client
        .from("leave_balances")
        .upsert(balanceRows, {
          onConflict: "tenant_id,user_id,leave_type,year",
        })
        .select();

      if (insertErr) throw insertErr;
      return inserted;
    });

    return NextResponse.json(balances);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch leave balances";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
