import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import {
  assertStaffCanAccessLeave,
  isForbiddenLeaveError,
  resolveStaffPosition,
} from "@/lib/leaveAccess";
import { DEFAULT_ENTITLEMENTS } from "@/types/leave";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const { userId, tenantId } = auth;
    await assertStaffCanAccessLeave(userId, tenantId);

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

        // Sync entitled_days with latest entitlements
        const pos = await resolveStaffPosition(client, userId, tenantId);

        // Seed missing entitlements before fetching
        const { data: allEntitlements } = await client
          .from("leave_entitlements")
          .select("position, leave_type")
          .eq("tenant_id", tenantId);

        const existingEntKeys = new Set(
          (allEntitlements ?? []).map((e: { position: string; leave_type: string }) => `${e.position}__${e.leave_type}`)
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
          const entMap = new Map(entitlements.map((e: { leave_type: string; days_per_year: number }) => [e.leave_type, e.days_per_year]));
          const existingTypes = new Set(existing.map((b: { leave_type: string }) => b.leave_type));

          let needsUpdate = false;
          for (const bal of existing) {
            const latest = entMap.get(bal.leave_type);
            if (latest !== undefined && latest !== bal.entitled_days) {
              needsUpdate = true;
              break;
            }
          }

          const missingRows = entitlements
            .filter((ent: { leave_type: string }) => !existingTypes.has(ent.leave_type))
            .map((ent: { leave_type: string; days_per_year: number }) => ({
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

      // Lazy-initialize: resolve position and seed balances
      const position = await resolveStaffPosition(client, userId, tenantId);

      const entitlementResult = await client
        .from("leave_entitlements")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("position", position);
      let entitlements = entitlementResult.data;
      const entErr = entitlementResult.error;

      if (entErr) throw entErr;

      // Seed missing default entitlements
      const existingKeys = new Set(
        (entitlements ?? []).map((e: { position: string; leave_type: string }) => `${e.position}__${e.leave_type}`)
      );
      const missing = DEFAULT_ENTITLEMENTS.filter(
        (d) => d.position === position && !existingKeys.has(`${d.position}__${d.leave_type}`)
      );

      if (missing.length > 0) {
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

      // Create balance records
      const balanceRows = (entitlements ?? []).map((ent: { leave_type: string; days_per_year: number }) => ({
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
    if (isForbiddenLeaveError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch leave balances";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
