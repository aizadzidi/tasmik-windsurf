import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import {
  assertStaffCanAccessLeave,
  countBusinessDays,
  isForbiddenLeaveError,
  ROLE_TO_POSITION,
} from "@/lib/leaveAccess";
import { SPECIAL_LEAVE_TYPES } from "@/types/leave";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const { userId, tenantId } = auth;
    await assertStaffCanAccessLeave(userId, tenantId);

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");

    const applications = await adminOperationSimple(async (client) => {
      let query = client
        .from("leave_applications")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (year) {
        query = query
          .gte("start_date", `${year}-01-01`)
          .lte("start_date", `${year}-12-31`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    });

    return NextResponse.json(applications);
  } catch (error: unknown) {
    if (isForbiddenLeaveError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch leave applications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const { userId, tenantId } = auth;
    await assertStaffCanAccessLeave(userId, tenantId);

    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get("id");

    if (!applicationId) {
      return NextResponse.json(
        { error: "Application id is required" },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { data: app, error: fetchErr } = await client
        .from("leave_applications")
        .select("id, user_id, tenant_id, status")
        .eq("id", applicationId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .single();

      if (fetchErr || !app) throw new Error("Application not found");
      if (app.status !== "pending") {
        throw new Error("Only pending applications can be cancelled");
      }

      const { error: deleteErr } = await client
        .from("leave_applications")
        .delete()
        .eq("id", applicationId);

      if (deleteErr) throw deleteErr;
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isForbiddenLeaveError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to cancel application";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only pending")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const { userId, tenantId } = auth;
    await assertStaffCanAccessLeave(userId, tenantId);

    const body = await request.json();
    const { application_id } = body;

    if (!application_id) {
      return NextResponse.json(
        { error: "application_id is required" },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { data: app, error: fetchErr } = await client
        .from("leave_applications")
        .select("*")
        .eq("id", application_id)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .single();

      if (fetchErr || !app) throw new Error("Application not found");
      if (app.status !== "approved") {
        throw new Error("Only approved applications can be cancelled");
      }

      const today = new Date().toISOString().slice(0, 10);
      if (app.start_date <= today) {
        throw new Error("Cannot cancel leave that has already started");
      }

      const { error: updateErr } = await client
        .from("leave_applications")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", application_id);

      if (updateErr) throw updateErr;

      // Restore balance
      if (!SPECIAL_LEAVE_TYPES.has(app.leave_type)) {
        const year = new Date(app.start_date).getFullYear();
        const { data: balance } = await client
          .from("leave_balances")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
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
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isForbiddenLeaveError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to cancel application";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only approved")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const { userId, tenantId } = auth;
    await assertStaffCanAccessLeave(userId, tenantId);

    const body = await request.json();
    const { leave_type, start_date, end_date, reason } = body;

    if (!leave_type || !start_date || !end_date) {
      return NextResponse.json(
        { error: "leave_type, start_date, and end_date are required" },
        { status: 400 }
      );
    }

    if (new Date(start_date) > new Date(end_date)) {
      return NextResponse.json(
        { error: "start_date must be before or equal to end_date" },
        { status: 400 }
      );
    }

    const total_days = countBusinessDays(start_date, end_date);
    if (total_days <= 0) {
      return NextResponse.json(
        { error: "Selected date range has no business days" },
        { status: 400 }
      );
    }

    const application = await adminOperationSimple(async (client) => {
      if (!SPECIAL_LEAVE_TYPES.has(leave_type)) {
        const year = new Date(start_date).getFullYear();
        let { data: balance } = await client
          .from("leave_balances")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .eq("leave_type", leave_type)
          .eq("year", year)
          .maybeSingle();

        // Auto-initialize balance if missing
        if (!balance) {
          const { data: userRow } = await client
            .from("users")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

          const position = ROLE_TO_POSITION[userRow?.role ?? ""] ?? "teacher";

          const { data: entitlement } = await client
            .from("leave_entitlements")
            .select("days_per_year")
            .eq("tenant_id", tenantId)
            .eq("position", position)
            .eq("leave_type", leave_type)
            .maybeSingle();

          const entitled_days = entitlement?.days_per_year ?? 0;

          const { data: created, error: createErr } = await client
            .from("leave_balances")
            .upsert(
              {
                tenant_id: tenantId,
                user_id: userId,
                leave_type,
                year,
                entitled_days,
                used_days: 0,
              },
              { onConflict: "tenant_id,user_id,leave_type,year" }
            )
            .select()
            .single();

          if (createErr) throw createErr;
          balance = created;
        }

        if (balance.entitled_days > 0) {
          const remaining = balance.entitled_days - balance.used_days;
          if (total_days > remaining) {
            throw new Error(
              `Insufficient balance. You have ${remaining} day(s) remaining for this leave type.`
            );
          }
        }
      }

      const { data, error } = await client
        .from("leave_applications")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          leave_type,
          start_date,
          end_date,
          total_days,
          reason: reason || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    return NextResponse.json(application, { status: 201 });
  } catch (error: unknown) {
    if (isForbiddenLeaveError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to apply for leave";
    const status = message.includes("Insufficient balance")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
