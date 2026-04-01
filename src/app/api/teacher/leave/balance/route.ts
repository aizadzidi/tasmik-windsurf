import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { DEFAULT_ENTITLEMENTS } from "@/types/leave";

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

      if (existing && existing.length > 0) {
        // Reconcile used_days from actual approved applications
        const { data: approvedApps, error: approvedErr } = await client
          .from("leave_applications")
          .select("leave_type, total_days, start_date")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .eq("status", "approved");

        if (approvedErr) throw approvedErr;

        const actualUsed = new Map<string, number>();
        for (const app of approvedApps ?? []) {
          const appYear = new Date(app.start_date).getFullYear();
          if (appYear !== year) continue;
          actualUsed.set(app.leave_type, (actualUsed.get(app.leave_type) ?? 0) + app.total_days);
        }

        for (const bal of existing) {
          const correctUsed = actualUsed.get(bal.leave_type) ?? 0;
          if (bal.used_days !== correctUsed) {
            await client
              .from("leave_balances")
              .update({ used_days: correctUsed, updated_at: new Date().toISOString() })
              .eq("id", bal.id);
            bal.used_days = correctUsed;
          }
        }

        // Sync entitled_days with latest entitlements in case admin changed them
        const { data: profile } = await client
          .from("user_profiles")
          .select("role")
          .eq("user_id", userId)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const roleMap: Record<string, string> = {
          school_admin: "admin",
          admin: "admin",
          teacher: "teacher",
          general_worker: "general_worker",
        };

        const { data: userRow } = await client
          .from("users")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        // Prefer users.role (admin-controlled, always up-to-date)
        // over user_profiles.role (tenant-scoped, can lag after role changes)
        const pos =
          roleMap[userRow?.role ?? ""] ??
          roleMap[profile?.role ?? ""] ??
          "teacher";

        // Seed missing entitlements before fetching
        const { data: allEntitlements } = await client
          .from("leave_entitlements")
          .select("position, leave_type")
          .eq("tenant_id", tenantId);

        const existingEntKeys = new Set(
          (allEntitlements ?? []).map((e) => `${e.position}__${e.leave_type}`)
        );
        const missingEnts = DEFAULT_ENTITLEMENTS.filter(
          (d) => !existingEntKeys.has(`${d.position}__${d.leave_type}`)
        );
        if (missingEnts.length > 0) {
          await client
            .from("leave_entitlements")
            .upsert(
              missingEnts.map((d) => ({ ...d, tenant_id: tenantId })),
              { onConflict: "tenant_id,position,leave_type" }
            );
        }

        const { data: entitlements } = await client
          .from("leave_entitlements")
          .select("leave_type, days_per_year")
          .eq("tenant_id", tenantId)
          .eq("position", pos);

        if (entitlements && entitlements.length > 0) {
          const entMap = new Map(entitlements.map((e) => [e.leave_type, e.days_per_year]));
          const existingTypes = new Set(existing.map((b) => b.leave_type));

          // Check for stale entitled_days
          let needsUpdate = false;
          for (const bal of existing) {
            const latest = entMap.get(bal.leave_type);
            if (latest !== undefined && latest !== bal.entitled_days) {
              needsUpdate = true;
              break;
            }
          }

          // Check for missing balance rows (new leave types)
          const missingRows = entitlements
            .filter((ent) => !existingTypes.has(ent.leave_type))
            .map((ent) => ({
              tenant_id: tenantId,
              user_id: userId,
              leave_type: ent.leave_type,
              year,
              entitled_days: ent.days_per_year,
              used_days: 0,
            }));

          if (needsUpdate) {
            for (const ent of entitlements) {
              await client
                .from("leave_balances")
                .update({ entitled_days: ent.days_per_year })
                .eq("tenant_id", tenantId)
                .eq("user_id", userId)
                .eq("leave_type", ent.leave_type)
                .eq("year", year);
            }
          }

          if (missingRows.length > 0) {
            await client
              .from("leave_balances")
              .upsert(missingRows, { onConflict: "tenant_id,user_id,leave_type,year" });
          }

          if (needsUpdate || missingRows.length > 0) {
            const { data: refreshed } = await client
              .from("leave_balances")
              .select("*")
              .eq("tenant_id", tenantId)
              .eq("user_id", userId)
              .eq("year", year);
            return refreshed ?? existing;
          }
        }

        return existing;
      }

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
        roleToPosition[userRow?.role ?? ""] ??
        roleToPosition[profile?.role ?? ""] ??
        "teacher";

      // Get entitlements for this position, auto-seed defaults if none exist
      let { data: entitlements, error: entErr } = await client
        .from("leave_entitlements")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("position", position);

      if (entErr) throw entErr;

      // Seed missing default entitlements (handles both empty and new leave types)
      const existingKeys = new Set(
        (entitlements ?? []).map((e) => `${e.position}__${e.leave_type}`)
      );
      const missing = DEFAULT_ENTITLEMENTS.filter(
        (d) => d.position === position && !existingKeys.has(`${d.position}__${d.leave_type}`)
      );

      if (missing.length > 0) {
        // Only seed missing entitlements for THIS position to avoid overwriting other positions' custom values
        const { error: seedErr } = await client
          .from("leave_entitlements")
          .upsert(
            missing.map((d) => ({ ...d, tenant_id: tenantId })),
            { onConflict: "tenant_id,position,leave_type" }
          );
        if (seedErr) throw seedErr;

        const { data: refreshed, error: refreshErr } = await client
          .from("leave_entitlements")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("position", position);
        if (refreshErr) throw refreshErr;
        entitlements = refreshed;
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
