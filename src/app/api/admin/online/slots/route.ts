import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

type SlotTemplateBody = {
  action?: "create_template" | "toggle_teacher";
  course_id?: string;
  slot_template_id?: string;
  teacher_id?: string;
  day_of_week?: number;
  start_time?: string;
  timezone?: string;
  is_active?: boolean;
  is_available?: boolean;
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

const normalizeStartTime = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const match = /^(\d{2}):(\d{2})/.exec(trimmed);
  if (!match) return "";
  return `${match[1]}:${match[2]}:00`;
};

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as SlotTemplateBody;
    const action = body.action ?? "create_template";
    const tenantId = await resolveTenantIdOrThrow(request);

    if (action === "create_template") {
      const courseId = (body.course_id ?? "").trim();
      const dayOfWeek = Number(body.day_of_week);
      const startTime = normalizeStartTime(body.start_time);
      if (!courseId || Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !startTime) {
        return NextResponse.json(
          { error: "course_id, day_of_week (0-6), and start_time (HH:MM) are required" },
          { status: 400 }
        );
      }

      const payload = await adminOperationSimple(async (client) => {
        const { data, error } = await client
          .from("online_slot_templates")
          .insert({
            tenant_id: tenantId,
            course_id: courseId,
            day_of_week: dayOfWeek,
            start_time: startTime,
            duration_minutes: 30,
            timezone: body.timezone?.trim() || "Asia/Kuala_Lumpur",
            is_active: body.is_active !== false,
          })
          .select("*")
          .single();
        if (error) throw error;
        return data;
      });

      return NextResponse.json(payload, { status: 201 });
    }

    if (action === "toggle_teacher") {
      const slotTemplateId = (body.slot_template_id ?? "").trim();
      const teacherId = (body.teacher_id ?? "").trim();
      if (!slotTemplateId || !teacherId) {
        return NextResponse.json(
          { error: "slot_template_id and teacher_id are required" },
          { status: 400 }
        );
      }

      const payload = await adminOperationSimple(async (client) => {
        const { data, error } = await client
          .from("online_teacher_slot_preferences")
          .upsert(
            {
              tenant_id: tenantId,
              slot_template_id: slotTemplateId,
              teacher_id: teacherId,
              is_available: body.is_available !== false,
            },
            { onConflict: "tenant_id,slot_template_id,teacher_id" }
          )
          .select("id, slot_template_id, teacher_id, is_available, last_assigned_at")
          .single();
        if (error) throw error;
        return data;
      });

      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: unknown) {
    console.error("Admin online slot mutation error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to mutate online slot");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as SlotTemplateBody;
    const slotTemplateId = (body.slot_template_id ?? "").trim();
    if (!slotTemplateId) {
      return NextResponse.json({ error: "slot_template_id is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);
    const updates: Record<string, unknown> = {};
    if (body.course_id !== undefined) updates.course_id = body.course_id.trim();
    if (body.day_of_week !== undefined) {
      const dayOfWeek = Number(body.day_of_week);
      if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return NextResponse.json({ error: "day_of_week must be between 0 and 6" }, { status: 400 });
      }
      updates.day_of_week = dayOfWeek;
    }
    if (body.start_time !== undefined) {
      const startTime = normalizeStartTime(body.start_time);
      if (!startTime) {
        return NextResponse.json({ error: "start_time must be HH:MM" }, { status: 400 });
      }
      updates.start_time = startTime;
    }
    if (body.timezone !== undefined) updates.timezone = body.timezone.trim() || "Asia/Kuala_Lumpur";
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const payload = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("online_slot_templates")
        .update(updates)
        .eq("tenant_id", tenantId)
        .eq("id", slotTemplateId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Admin online slot update error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to update online slot");
    return NextResponse.json({ error: message }, { status });
  }
}
