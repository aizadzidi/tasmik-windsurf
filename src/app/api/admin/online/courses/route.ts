import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";
import { filterTeachersByTeachingScope } from "@/lib/adminTeacherScope";

type CoursePayload = {
  name?: string;
  description?: string | null;
  monthly_fee_cents?: number;
  sessions_per_week?: number;
  color_hex?: string | null;
  color?: string | null;
  default_slot_duration_minutes?: number;
  is_active?: boolean;
};

const adminErrorDetails = (error: unknown, fallback: string) => {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message || fallback)
        : fallback;
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

const normalizeColorHex = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
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
        if (
          isMissingRelationError(courseError, "online_courses") ||
          isMissingColumnError(courseError, "tenant_id", "online_courses") ||
          isMissingColumnError(courseError, "created_at", "online_courses")
        ) {
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
      if (
        templateError &&
        !isMissingRelationError(templateError, "online_slot_templates") &&
        !isMissingColumnError(templateError, "tenant_id", "online_slot_templates") &&
        !isMissingColumnError(templateError, "day_of_week", "online_slot_templates") &&
        !isMissingColumnError(templateError, "start_time", "online_slot_templates")
      ) {
        throw templateError;
      }

      const { data: prefRowsWithLastAssignedAt, error: prefError } = await client
        .from("online_teacher_slot_preferences")
        .select("slot_template_id, teacher_id, is_available, last_assigned_at")
        .eq("tenant_id", tenantId);

      let prefRows: Array<{
        slot_template_id: string;
        teacher_id: string;
        is_available: boolean;
        last_assigned_at: string | null;
      }> = [];

      if (!prefError) {
        prefRows = (prefRowsWithLastAssignedAt ?? []) as typeof prefRows;
      } else if (isMissingRelationError(prefError, "online_teacher_slot_preferences")) {
        prefRows = [];
      } else if (isMissingColumnError(prefError, "tenant_id", "online_teacher_slot_preferences")) {
        prefRows = [];
      } else if (
        isMissingColumnError(prefError, "last_assigned_at", "online_teacher_slot_preferences")
      ) {
        const { data: prefRowsWithoutLastAssignedAt, error: prefFallbackError } = await client
          .from("online_teacher_slot_preferences")
          .select("slot_template_id, teacher_id, is_available")
          .eq("tenant_id", tenantId);
        if (prefFallbackError) throw prefFallbackError;
        prefRows = ((prefRowsWithoutLastAssignedAt ?? []) as Array<{
          slot_template_id: string;
          teacher_id: string;
          is_available: boolean;
        }>).map((row) => ({
          ...row,
          last_assigned_at: null,
        }));
      } else {
        throw prefError;
      }

      let teacherRows: Array<{ id: string; name: string | null }> = [];
      const { data: tenantTeacherRows, error: teacherError } = await client
        .from("users")
        .select("id, name")
        .eq("role", "teacher")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (teacherError && !isMissingColumnError(teacherError, "tenant_id", "users")) {
        throw teacherError;
      }

      if (teacherError) {
        const { data: fallbackTeacherRows, error: fallbackTeacherError } = await client
          .from("users")
          .select("id, name")
          .eq("role", "teacher")
          .order("name", { ascending: true });
        if (fallbackTeacherError) throw fallbackTeacherError;
        teacherRows = (fallbackTeacherRows ?? []) as typeof teacherRows;
      } else {
        teacherRows = (tenantTeacherRows ?? []) as typeof teacherRows;
      }

      teacherRows = await filterTeachersByTeachingScope(client, teacherRows, "online", tenantId);

      return {
        courses: courseRows ?? [],
        templates: templateRows ?? [],
        teacher_availability: prefRows,
        teachers: teacherRows.map((row) => ({
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
    const defaultSlotDurationMinutes = Math.min(
      Math.max(toIntOrFallback(body.default_slot_duration_minutes, 30), 15),
      180
    );
    const colorHex = normalizeColorHex(body.color_hex ?? body.color);

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

      const insertPayload: Record<string, unknown> = {
        tenant_id: tenantId,
        program_id: onlineProgramId,
        name,
        description: body.description?.trim() || null,
        monthly_fee_cents: monthlyFeeCents,
        sessions_per_week: sessionsPerWeek,
        default_slot_duration_minutes: defaultSlotDurationMinutes,
        color_hex: colorHex,
        is_active: body.is_active !== false,
        created_by: guard.userId,
      };

      const insertWithColor = await client
        .from("online_courses")
        .insert(insertPayload)
        .select("*")
        .single();
      if (!insertWithColor.error) return insertWithColor.data;

      if (!isMissingColumnError(insertWithColor.error, "color_hex", "online_courses")) {
        throw insertWithColor.error;
      }

      delete insertPayload.color_hex;
      const insertFallback = await client
        .from("online_courses")
        .insert(insertPayload)
        .select("*")
        .single();
      if (insertFallback.error) throw insertFallback.error;
      return insertFallback.data;
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
    if (body.default_slot_duration_minutes !== undefined) {
      updates.default_slot_duration_minutes = Math.min(
        Math.max(toIntOrFallback(body.default_slot_duration_minutes, 30), 15),
        180
      );
    }
    if (body.color_hex !== undefined || body.color !== undefined) {
      updates.color_hex = normalizeColorHex(body.color_hex ?? body.color);
    }
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const payload = await adminOperationSimple(async (client) => {
      const updateWithColor = await client
        .from("online_courses")
        .update(updates)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("*")
        .single();
      if (!updateWithColor.error) return updateWithColor.data;

      if (!isMissingColumnError(updateWithColor.error, "color_hex", "online_courses")) {
        throw updateWithColor.error;
      }

      const fallbackUpdates = { ...updates };
      delete fallbackUpdates.color_hex;
      if (Object.keys(fallbackUpdates).length === 0) {
        throw new Error("Course color is not available yet. Please run latest online courses migration.");
      }
      const updateFallback = await client
        .from("online_courses")
        .update(fallbackUpdates)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("*")
        .single();
      if (updateFallback.error) throw updateFallback.error;
      return updateFallback.data;
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
    const mode = (searchParams.get("mode") ?? "").trim().toLowerCase();
    const hardDelete = mode === "hard" || mode === "delete";
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    await adminOperationSimple(async (client) => {
      if (hardDelete) {
        const { error } = await client
          .from("online_courses")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("id", id);
        if (error) {
          const message = (error as { message?: string }).message ?? "";
          if (
            /foreign key|violates|referenced|constraint|still referenced|in use/i.test(message)
          ) {
            throw new Error("Course is still used by slots/packages. Archive it first.");
          }
          throw error;
        }
        return;
      }

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
