import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

const resolveTenantIdOrThrow = async (
  request: NextRequest,
  client: Parameters<Parameters<typeof adminOperationSimple>[0]>[0]
) => {
  const tenantId = await resolveTenantIdFromRequest(request, client);
  if (tenantId) return tenantId;
  const { data, error } = await client.from("tenants").select("id").limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error("Tenant context missing");
  return data[0].id as string;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:leave"]);
    if (!guard.ok) return guard.response;

    const currentYear = new Date().getFullYear();

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      // ── Step 1: Get ALL non-parent staff in this tenant ──
      const { data: tenantProfiles, error: profilesErr } = await client
        .from("user_profiles")
        .select("user_id, role")
        .eq("tenant_id", tenantId);

      if (profilesErr) throw profilesErr;

      const allTenantUserIds = (tenantProfiles ?? [])
        .map((p) => p.user_id)
        .filter(Boolean);

      if (allTenantUserIds.length === 0) return [];

      const { data: allUsers, error: allUsersErr } = await client
        .from("users")
        .select("id, name, email, role")
        .in("id", allTenantUserIds)
        .neq("role", "parent");

      if (allUsersErr) throw allUsersErr;
      if (!allUsers || allUsers.length === 0) return [];

      const staffUserIds = allUsers.map((u) => u.id);

      const profileRoleMap = new Map(
        (tenantProfiles ?? []).map((p) => [p.user_id, p.role])
      );

      const roleToPosition: Record<string, string> = {
        school_admin: "admin",
        admin: "admin",
        teacher: "teacher",
        general_worker: "general_worker",
      };

      // ── Step 2: Fetch entitlements ──
      const { data: entitlements } = await client
        .from("leave_entitlements")
        .select("position, leave_type, days_per_year")
        .eq("tenant_id", tenantId);

      const entMap = new Map(
        (entitlements ?? []).map((e) => [`${e.position}__${e.leave_type}`, e.days_per_year])
      );

      // ── Step 3: Check which staff are missing balance rows for current year ──
      const { data: existingBalances, error: existBalErr } = await client
        .from("leave_balances")
        .select("user_id, leave_type")
        .eq("tenant_id", tenantId)
        .eq("year", currentYear)
        .in("user_id", staffUserIds);

      if (existBalErr) throw existBalErr;

      const existingKeys = new Set(
        (existingBalances ?? []).map((b) => `${b.user_id}__${b.leave_type}`)
      );

      const leaveTypes = ["annual_leave", "medical_leave", "unpaid_leave", "maternity_leave", "paternity_leave", "ihsan_leave"];

      const missingRows: {
        tenant_id: string;
        user_id: string;
        leave_type: string;
        year: number;
        entitled_days: number;
        used_days: number;
      }[] = [];

      for (const user of allUsers) {
        const position =
          roleToPosition[user.role ?? ""] ??
          roleToPosition[profileRoleMap.get(user.id) ?? ""] ??
          "teacher";

        for (const lt of leaveTypes) {
          if (!existingKeys.has(`${user.id}__${lt}`)) {
            const entitled = entMap.get(`${position}__${lt}`) ?? 0;
            missingRows.push({
              tenant_id: tenantId,
              user_id: user.id,
              leave_type: lt,
              year: currentYear,
              entitled_days: entitled,
              used_days: 0,
            });
          }
        }
      }

      // ── Step 4: Bulk upsert missing rows (idempotent) ──
      if (missingRows.length > 0) {
        const { error: upsertErr } = await client
          .from("leave_balances")
          .upsert(missingRows, {
            onConflict: "tenant_id,user_id,leave_type,year",
          });

        if (upsertErr) throw upsertErr;
      }

      // ── Step 5: Reconcile used_days from actual approved applications ──
      const { data: approvedApps, error: approvedErr } = await client
        .from("leave_applications")
        .select("user_id, leave_type, total_days, start_date")
        .eq("tenant_id", tenantId)
        .eq("status", "approved")
        .in("user_id", staffUserIds);

      if (approvedErr) throw approvedErr;

      // Build a map of actual used days: userId__leaveType__year → total
      const actualUsed = new Map<string, number>();
      for (const app of approvedApps ?? []) {
        const appYear = new Date(app.start_date).getFullYear();
        if (appYear !== currentYear) continue;
        const key = `${app.user_id}__${app.leave_type}`;
        actualUsed.set(key, (actualUsed.get(key) ?? 0) + app.total_days);
      }

      // Fetch all balances for current year
      const { data: balances, error: balErr } = await client
        .from("leave_balances")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("year", currentYear)
        .in("user_id", staffUserIds);

      if (balErr) throw balErr;
      if (!balances || balances.length === 0) return [];

      // Fix any mismatched used_days
      const usedFixUpdates: { id: string; used_days: number }[] = [];
      for (const bal of balances) {
        const key = `${bal.user_id}__${bal.leave_type}`;
        const correctUsed = actualUsed.get(key) ?? 0;
        if (bal.used_days !== correctUsed) {
          usedFixUpdates.push({ id: bal.id, used_days: correctUsed });
          bal.used_days = correctUsed;
        }
      }

      if (usedFixUpdates.length > 0) {
        await Promise.all(
          usedFixUpdates.map((fix) =>
            client
              .from("leave_balances")
              .update({ used_days: fix.used_days, updated_at: new Date().toISOString() })
              .eq("id", fix.id)
          )
        );
      }

      const userMap = new Map(
        allUsers.map((u) => [u.id, { name: u.name, email: u.email, role: u.role }])
      );

      // ── Step 6: Group balances by user, sync entitled_days with current entitlements ──
      const grouped: Record<
        string,
        {
          user_id: string;
          user_name: string;
          user_email: string;
          user_role: string;
          balances: { leave_type: string; entitled_days: number; used_days: number }[];
        }
      > = {};

      const staleUpdates: { userId: string; leaveType: string; entitledDays: number }[] = [];

      for (const b of balances) {
        if (!grouped[b.user_id]) {
          const user = userMap.get(b.user_id);
          grouped[b.user_id] = {
            user_id: b.user_id,
            user_name: user?.name ?? "Unknown",
            user_email: user?.email ?? "",
            user_role: user?.role ?? "",
            balances: [],
          };
        }

        const user = userMap.get(b.user_id);
        const profileRole = profileRoleMap.get(b.user_id);
        const position =
          roleToPosition[user?.role ?? ""] ??
          roleToPosition[profileRole ?? ""] ??
          "teacher";

        const currentEntitled = entMap.get(`${position}__${b.leave_type}`);
        const entitledDays = currentEntitled !== undefined ? currentEntitled : b.entitled_days;

        if (entitledDays !== b.entitled_days) {
          staleUpdates.push({ userId: b.user_id, leaveType: b.leave_type, entitledDays });
        }

        grouped[b.user_id].balances.push({
          leave_type: b.leave_type,
          entitled_days: entitledDays,
          used_days: b.used_days,
        });
      }

      // Fix stale entitled_days in database
      if (staleUpdates.length > 0) {
        await Promise.all(
          staleUpdates.map((upd) =>
            client
              .from("leave_balances")
              .update({ entitled_days: upd.entitledDays })
              .eq("tenant_id", tenantId)
              .eq("user_id", upd.userId)
              .eq("leave_type", upd.leaveType)
              .eq("year", currentYear)
          )
        );
      }

      return Object.values(grouped);
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch balances";
    const status = message.includes("Admin access required") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
