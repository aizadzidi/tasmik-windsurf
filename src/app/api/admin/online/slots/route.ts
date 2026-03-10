import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { isMissingColumnError, isMissingRelationError } from "@/lib/online/db";

type SlotTemplateBody = {
  action?: "create_template" | "toggle_teacher" | "bulk_generate_templates";
  course_id?: string;
  course_ids?: string[];
  slot_template_id?: string;
  teacher_id?: string;
  day_of_week?: number;
  day_of_weeks?: number[];
  start_time?: string;
  end_time?: string;
  timezone?: string;
  duration_minutes?: number;
  is_active?: boolean;
  is_available?: boolean;
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

const normalizeStartTime = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const match = /^(\d{2}):(\d{2})/.exec(trimmed);
  if (!match) return "";
  return `${match[1]}:${match[2]}:00`;
};

const timeToMinutes = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return Number.NaN;
  return hour * 60 + minute;
};

const uniqueNumberList = (values: number[]) =>
  Array.from(new Set(values)).filter((value) => Number.isInteger(value));

const toPositiveDuration = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(5, Math.trunc(numeric));
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
        const { data: courseRow, error: courseError } = await client
          .from("online_courses")
          .select("default_slot_duration_minutes")
          .eq("tenant_id", tenantId)
          .eq("id", courseId)
          .maybeSingle();
        if (courseError && !isMissingColumnError(courseError, "default_slot_duration_minutes", "online_courses")) {
          throw courseError;
        }
        const durationMinutes = toPositiveDuration(
          body.duration_minutes,
          Number(courseRow?.default_slot_duration_minutes ?? 30)
        );

        const { data, error } = await client
          .from("online_slot_templates")
          .insert({
            tenant_id: tenantId,
            course_id: courseId,
            day_of_week: dayOfWeek,
            start_time: startTime,
            duration_minutes: durationMinutes,
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

    if (action === "bulk_generate_templates") {
      const courseIds = Array.from(
        new Set(
          (Array.isArray(body.course_ids) ? body.course_ids : [])
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0)
        )
      );
      const dayOfWeeks = uniqueNumberList(
        (Array.isArray(body.day_of_weeks) ? body.day_of_weeks : [])
          .map((value) => Number(value))
          .filter((value) => value >= 0 && value <= 6)
      );
      const startTime = normalizeStartTime(body.start_time);
      const endTime = normalizeStartTime(body.end_time);

      if (courseIds.length === 0 || dayOfWeeks.length === 0 || !startTime || !endTime) {
        return NextResponse.json(
          {
            error:
              "course_ids, day_of_weeks, start_time (HH:MM), and end_time (HH:MM) are required",
          },
          { status: 400 }
        );
      }

      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
        return NextResponse.json(
          { error: "end_time must be later than start_time" },
          { status: 400 }
        );
      }

      const payload = await adminOperationSimple(async (client) => {
        const { data: courseDurationRows, error: courseDurationError } = await client
          .from("online_courses")
          .select("id, default_slot_duration_minutes")
          .eq("tenant_id", tenantId)
          .in("id", courseIds);
        if (
          courseDurationError &&
          !isMissingColumnError(courseDurationError, "default_slot_duration_minutes", "online_courses")
        ) {
          throw courseDurationError;
        }
        const durationByCourseId = new Map(
          ((courseDurationRows ?? []) as Array<{ id?: string | null; default_slot_duration_minutes?: number | null }>)
            .filter((row) => Boolean(row?.id))
            .map((row) => [
              String(row.id),
              toPositiveDuration(row.default_slot_duration_minutes, toPositiveDuration(body.duration_minutes, 30)),
            ])
        );

        const { data: existingRows, error: existingError } = await client
          .from("online_slot_templates")
          .select("course_id, day_of_week, start_time, duration_minutes")
          .eq("tenant_id", tenantId)
          .in("course_id", courseIds)
          .in("day_of_week", dayOfWeeks);

        if (existingError) throw existingError;

        const existingKeys = new Set(
          ((existingRows ?? []) as Array<{
            course_id?: string | null;
            day_of_week?: number | null;
            start_time?: string | null;
            duration_minutes?: number | null;
          }>).map(
            (row) =>
              `${row.course_id ?? ""}:${row.day_of_week ?? -1}:${(row.start_time ?? "").slice(0, 8)}:${row.duration_minutes ?? 30}`
          )
        );

        const slotsPerDayByCourse = Object.fromEntries(
          courseIds.map((courseId) => {
            const durationMinutes =
              durationByCourseId.get(courseId) ?? toPositiveDuration(body.duration_minutes, 30);
            let count = 0;
            for (
              let minute = startMinutes;
              minute + durationMinutes <= endMinutes;
              minute += durationMinutes
            ) {
              count += 1;
            }
            return [courseId, count];
          })
        );

        const totalRequested = courseIds.reduce(
          (sum, courseId) => sum + (slotsPerDayByCourse[courseId] ?? 0) * dayOfWeeks.length,
          0
        );

        const rowsToInsert = courseIds.flatMap((courseId) => {
          const durationMinutes =
            durationByCourseId.get(courseId) ?? toPositiveDuration(body.duration_minutes, 30);
          const generatedTimes: string[] = [];
          for (
            let minute = startMinutes;
            minute + durationMinutes <= endMinutes;
            minute += durationMinutes
          ) {
            generatedTimes.push(
              `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`
            );
          }
          return dayOfWeeks.flatMap((dayOfWeek) =>
            generatedTimes
              .filter(
                (slotTime) =>
                  !existingKeys.has(`${courseId}:${dayOfWeek}:${slotTime}:${durationMinutes}`)
              )
              .map((slotTime) => ({
                tenant_id: tenantId,
                course_id: courseId,
                day_of_week: dayOfWeek,
                start_time: slotTime,
                duration_minutes: durationMinutes,
                timezone: body.timezone?.trim() || "Asia/Kuala_Lumpur",
                is_active: body.is_active !== false,
              }))
          );
        });

        let createdCount = 0;
        if (rowsToInsert.length > 0) {
          const { data, error } = await client
            .from("online_slot_templates")
            .insert(rowsToInsert)
            .select("id");
          if (error) throw error;
          createdCount = (data ?? []).length;
        }

        return {
          created_count: createdCount,
          skipped_count: Math.max(totalRequested - createdCount, 0),
          total_requested: totalRequested,
          slots_per_day: slotsPerDayByCourse[courseIds[0]] ?? 0,
          slots_per_day_by_course: slotsPerDayByCourse,
          days: dayOfWeeks,
          course_ids: courseIds,
        };
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

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:online"]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const slotTemplateId = (searchParams.get("id") ?? "").trim();
    if (!slotTemplateId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdOrThrow(request);

    await adminOperationSimple(async (client) => {
      const { count, error: claimError } = await client
        .from("online_slot_claims")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("slot_template_id", slotTemplateId)
        .in("status", ["pending_payment", "active"]);

      if (
        claimError &&
        !isMissingRelationError(claimError, "online_slot_claims") &&
        !isMissingColumnError(claimError, "tenant_id", "online_slot_claims") &&
        !isMissingColumnError(claimError, "slot_template_id", "online_slot_claims") &&
        !isMissingColumnError(claimError, "status", "online_slot_claims")
      ) {
        throw claimError;
      }
      if ((count ?? 0) > 0) {
        throw new Error("This slot has active bookings and cannot be deleted.");
      }

      const { error } = await client
        .from("online_slot_templates")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", slotTemplateId);

      if (error) throw error;
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Admin online slot delete error:", error);
    const { message, status } = adminErrorDetails(error, "Failed to delete online slot");
    return NextResponse.json({ error: message }, { status });
  }
}
