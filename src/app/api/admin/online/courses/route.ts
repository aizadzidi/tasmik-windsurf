import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { isMissingRelationError } from "@/lib/online/db";

type CoursePayload = {
  name?: string;
  description?: string | null;
  monthly_fee_cents?: number;
  sessions_per_week?: number;
  is_active?: boolean;
};

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

const toIntOrFallback = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online", "admin:dashboard"]);
    if (!guard.ok) return guard.response;

    const tenantId = await resolveTenantIdOrThrow(request);

    const payload = await adminOperationSimple(async (client) => {
      const { data: courseRows, error: courseError } = await client
        .from("online_courses")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

      if (courseError) {
        if (isMissingRelationError(courseError, "online_courses")) {
          return { courses: [], templates: [], teacher_availability: [], teachers: [] };
        }
        throw courseError;
      }

      const { data: templateRows, error: templateError } = await client
        .from("online_slot_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      if (templateError) throw templateError;

      const { data: prefRows, error: prefError } = await client
        .from("online_teacher_slot_preferences")
        .select("slot_template_id, teacher_id, is_available, last_assigned_at")
        .eq("tenant_id", tenantId);
      if (prefError) throw prefError;

      const { data: teacherRows, error: teacherError } = await client
        .from("users")
        .select("id, name")
        .eq("role", "teacher")
        .order("name", { ascending: true });
      if (teacherError) throw teacherError;

      return {
        courses: courseRows ?? [],
        templates: templateRows ?? [],
        teacher_availability: prefRows ?? [],
        teachers: (teacherRows ?? []).map((row) => ({
          id: row.id,
          name: row.name ?? "Unnamed Teacher",
        })),
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online courses fetch error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to fetch online courses");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as CoursePayload;
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const monthlyFeeCents = toIntOrFallback(body.monthly_fee_cents, 0);
    const sessionsPerWeek = Math.min(Math.max(toIntOrFallback(body.sessions_per_week, 3), 1), 14);

    const payload = await adminOperationSimple(async (client) => {
      const { data: programRows, error: programError } = await client
        .from("programs")
        .select("id, type")
        .eq("tenant_id", tenantId)
        .in("type", ["online", "hybrid"])
        .order("created_at", { ascending: true });
      if (programError) throw programError;

      const onlineProgramId =
        (programRows ?? []).find((row) => row.type === "online")?.id ??
        (programRows ?? [])[0]?.id ??
        null;

      const { data, error } = await client
        .from("online_courses")
        .insert({
          tenant_id: tenantId,
          program_id: onlineProgramId,
          name,
          description: body.description?.trim() || null,
          monthly_fee_cents: monthlyFeeCents,
          sessions_per_week: sessionsPerWeek,
          is_active: body.is_active !== false,
          created_by: guard.userId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    console.error("Admin online course creation error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to create online course");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as CoursePayload & { id?: string };
    const id = (body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.monthly_fee_cents !== undefined) {
      updates.monthly_fee_cents = toIntOrFallback(body.monthly_fee_cents, 0);
    }
    if (body.sessions_per_week !== undefined) {
      updates.sessions_per_week = Math.min(
        Math.max(toIntOrFallback(body.sessions_per_week, 3), 1),
        14
      );
    }
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const payload = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("online_courses")
        .update(updates)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online course update error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to update online course");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = (searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from("online_courses")
        .update({ is_active: false })
        .eq("tenant_id", tenantId)
        .eq("id", id);
      if (error) throw error;
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Admin online course delete error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to archive online course");
    return NextResponse.json({ error: message }, { status });
  }
}
