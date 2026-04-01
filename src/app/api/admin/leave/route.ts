import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { SPECIAL_LEAVE_TYPES } from "@/types/leave";

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

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:leave"]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      let query = client
        .from("leave_applications")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: applications, error } = await query;
      if (error) throw error;

      // Get user names for display
      const userIds = [
        ...new Set(
          (applications ?? []).map((a) => a.user_id).filter(Boolean)
        ),
      ];

      if (userIds.length === 0) return applications ?? [];

      const { data: users, error: usersErr } = await client
        .from("users")
        .select("id, name, email, role")
        .in("id", userIds);

      if (usersErr) throw usersErr;

      const userMap = new Map(
        (users ?? []).map((u) => [u.id, { name: u.name, email: u.email, role: u.role }])
      );

      return (applications ?? []).map((app) => ({
        ...app,
        user_name: userMap.get(app.user_id)?.name ?? "Unknown",
        user_email: userMap.get(app.user_id)?.email ?? "",
        user_role: userMap.get(app.user_id)?.role ?? "",
      }));
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const { message, status } = adminErrorDetails(error, "Failed to fetch leave applications");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:leave"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { application_id, action, remarks } = body;

    if (!application_id || !action) {
      return NextResponse.json(
        { error: "application_id and action are required" },
        { status: 400 }
      );
    }

    if (!["approve", "reject", "cancel"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve', 'reject', or 'cancel'" },
        { status: 400 }
      );
    }

    const result = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      // Fetch the application
      const { data: app, error: appErr } = await client
        .from("leave_applications")
        .select("*")
        .eq("id", application_id)
        .eq("tenant_id", tenantId)
        .single();

      if (appErr || !app) throw new Error("Leave application not found");

      const previousStatus = app.status;

      // Only approved applications can be cancelled
      if (action === "cancel" && previousStatus !== "approved") {
        throw new Error("Only approved applications can be cancelled");
      }

      const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";

      // Update the application
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (action === "cancel") {
        // Preserve original review data (reviewed_by, reviewed_at) for audit trail
        // Only update remarks if admin provides cancellation remarks
        if (remarks) {
          updateData.review_remarks = remarks;
        }
      } else {
        updateData.reviewed_by = guard.userId;
        updateData.review_remarks = remarks || null;
        updateData.reviewed_at = new Date().toISOString();
      }

      const { data: updated, error: updateErr } = await client
        .from("leave_applications")
        .update(updateData)
        .eq("id", application_id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Adjust balance
      if (!SPECIAL_LEAVE_TYPES.has(app.leave_type)) {
        const year = new Date(app.start_date).getFullYear();

        if (action === "approve" && previousStatus !== "approved") {
          // Increment used_days
          const { data: balance } = await client
            .from("leave_balances")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("user_id", app.user_id)
            .eq("leave_type", app.leave_type)
            .eq("year", year)
            .maybeSingle();

          if (balance) {
            await client
              .from("leave_balances")
              .update({
                used_days: balance.used_days + app.total_days,
                updated_at: new Date().toISOString(),
              })
              .eq("id", balance.id);
          } else {
            // Balance row doesn't exist yet — create it with the correct used_days
            // Look up entitled_days from entitlements
            const { data: userRow } = await client
              .from("users")
              .select("role")
              .eq("id", app.user_id)
              .maybeSingle();

            const { data: profileRow } = await client
              .from("user_profiles")
              .select("role")
              .eq("user_id", app.user_id)
              .eq("tenant_id", tenantId)
              .maybeSingle();

            const roleToPosition: Record<string, string> = {
              school_admin: "admin",
              admin: "admin",
              teacher: "teacher",
              general_worker: "general_worker",
            };
            const position =
              roleToPosition[userRow?.role ?? ""] ??
              roleToPosition[profileRow?.role ?? ""] ??
              "teacher";

            const { data: entitlement } = await client
              .from("leave_entitlements")
              .select("days_per_year")
              .eq("tenant_id", tenantId)
              .eq("position", position)
              .eq("leave_type", app.leave_type)
              .maybeSingle();

            // Count ALL approved applications for this user/type/year
            // (including the one just approved) to avoid undercounting
            const { data: allApproved } = await client
              .from("leave_applications")
              .select("total_days, start_date")
              .eq("tenant_id", tenantId)
              .eq("user_id", app.user_id)
              .eq("leave_type", app.leave_type)
              .eq("status", "approved");

            let totalUsed = 0;
            for (const a of allApproved ?? []) {
              if (new Date(a.start_date).getFullYear() === year) totalUsed += a.total_days;
            }

            await client
              .from("leave_balances")
              .upsert(
                {
                  tenant_id: tenantId,
                  user_id: app.user_id,
                  leave_type: app.leave_type,
                  year,
                  entitled_days: entitlement?.days_per_year ?? 0,
                  used_days: totalUsed,
                },
                { onConflict: "tenant_id,user_id,leave_type,year" }
              );
          }
        } else if ((action === "reject" || action === "cancel") && previousStatus === "approved") {
          // Restore balance
          const { data: balance } = await client
            .from("leave_balances")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("user_id", app.user_id)
            .eq("leave_type", app.leave_type)
            .eq("year", year)
            .maybeSingle();

          if (balance) {
            await client
              .from("leave_balances")
              .update({
                used_days: Math.max(0, balance.used_days - app.total_days),
                updated_at: new Date().toISOString(),
              })
              .eq("id", balance.id);
          }
        }
      }

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const { message, status } = adminErrorDetails(error, "Failed to review leave application");
    return NextResponse.json({ error: message }, { status });
  }
}
