import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("Admin access required") ? 403 : 500;
  return { message, status };
};

const resolveTenantIdOrThrow = async (request: NextRequest) =>
  adminOperationSimple(async (client) => {
    const tenantId = await resolveTenantIdFromRequest(request, client);
    if (tenantId) return tenantId;

    const { data, error } = await client.from("tenants").select("id").limit(2);
    if (error) throw error;
    if (!data || data.length !== 1) {
      throw new Error("Tenant context missing");
    }

    return data[0].id;
  });

const toNullableText = (value?: string | null) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// GET - Fetch CRM stages (admin only)
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:crm"]);
    if (!guard.ok) return guard.response;

    const tenantId = await resolveTenantIdOrThrow(request);
    const recordType = new URL(request.url).searchParams.get("record_type");

    const data = await adminOperationSimple(async (client) => {
      let query = client
        .from("crm_stages")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

      if (recordType) {
        query = query.eq("record_type", recordType);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      return rows;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Admin CRM stages fetch error:", error);
    const { message, status } = adminErrorDetails(
      error,
      "Failed to fetch CRM stages"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Create CRM stage (admin only)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:crm"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const {
      record_type,
      stage_key,
      label,
      sort_order,
      color_bg,
      color_text,
      is_active
    } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!record_type || !stage_key || !label) {
      return NextResponse.json(
        { error: "record_type, stage_key and label are required" },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data: row, error } = await client
        .from("crm_stages")
        .insert([
          {
            tenant_id: tenantId,
            record_type,
            stage_key,
            label,
            sort_order: sort_order ?? 0,
            color_bg: toNullableText(color_bg),
            color_text: toNullableText(color_text),
            is_active: is_active !== false
          }
        ])
        .select()
        .single();
      if (error) throw error;
      return row;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Admin CRM stage creation error:", error);
    const { message, status } = adminErrorDetails(
      error,
      "Failed to create CRM stage"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Update CRM stage (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:crm"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const {
      id,
      label,
      sort_order,
      color_bg,
      color_text,
      is_active
    } = body;
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json(
        { error: "Stage ID is required" },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data: row, error } = await client
        .from("crm_stages")
        .update({
          label,
          sort_order,
          color_bg: toNullableText(color_bg),
          color_text: toNullableText(color_text),
          is_active
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return row;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Admin CRM stage update error:", error);
    const { message, status } = adminErrorDetails(
      error,
      "Failed to update CRM stage"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE - Delete CRM stage (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:crm"]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const tenantId = await resolveTenantIdOrThrow(request);

    if (!id) {
      return NextResponse.json(
        { error: "Stage ID is required" },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from("crm_stages")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", id);
      if (error) throw error;
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Admin CRM stage delete error:", error);
    const { message, status } = adminErrorDetails(
      error,
      "Failed to delete CRM stage"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
