import { NextRequest, NextResponse } from "next/server";
import {
  buildAvailabilityDayRanges,
  buildMissingEnrollmentTemplateRows,
  filterEnrollmentAvailabilityTemplates,
} from "@/lib/online/availabilityRanges";
import { isMissingColumnError } from "@/lib/online/db";
import { fetchAllPagedRows } from "@/lib/online/recurringStore";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

const ACTIVE_PACKAGE_STATUSES = ["active", "pending_payment", "draft"] as const;
const MAX_UPDATES = 5000;
const MIN_FREE_DAYS_PER_AVAILABLE_TIME = 2;
const SLOT_TEMPLATE_UNIQUE_CONFLICT_TARGET =
  "tenant_id,course_id,day_of_week,start_time,duration_minutes";

type AvailabilityUpdate = {
  slot_template_id?: unknown;
  is_available?: unknown;
};

type AvailabilityPatchBody = {
  updates?: AvailabilityUpdate[];
};

type AvailabilityRow = {
  slot_template_id: string;
  teacher_id: string;
  is_available: boolean;
  last_assigned_at: string | null;
  availability_source?: "manual" | "auto_schedule" | null;
};

type SlotTemplateRow = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone: string;
  is_active: boolean;
};

type CourseRow = {
  id: string;
};

const isMissingSlotTemplateConflictTarget = (error: { message?: string } | null | undefined) =>
  (error?.message ?? "")
    .toLowerCase()
    .includes("there is no unique or exclusion constraint matching the on conflict specification");

const loadSlotTemplatesForCourses = async (tenantId: string, courseIds: string[]) => {
  if (courseIds.length === 0) return [] as SlotTemplateRow[];

  const response = await fetchAllPagedRows<SlotTemplateRow>((from, to) =>
    supabaseService
      .from("online_slot_templates")
      .select("id, course_id, day_of_week, start_time, duration_minutes, timezone, is_active")
      .eq("tenant_id", tenantId)
      .in("course_id", courseIds)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (response.error) throw response.error;
  return response.data ?? [];
};

const ensureThirtyMinuteEnrollmentTemplates = async (params: {
  tenantId: string;
  courses: CourseRow[];
  templates: SlotTemplateRow[];
}) => {
  const activeCourseIds = params.courses.map((course) => String(course.id ?? "")).filter(Boolean);
  const activeCourseIdSet = new Set(activeCourseIds);
  const activeCourseTemplates = params.templates.filter((template) =>
    activeCourseIdSet.has(template.course_id),
  );
  const dayRanges = buildAvailabilityDayRanges(activeCourseTemplates);
  const rowsToInsert = buildMissingEnrollmentTemplateRows({
    tenantId: params.tenantId,
    courseIds: activeCourseIds,
    templates: activeCourseTemplates,
    dayRanges,
  });
  if (rowsToInsert.length > 0) {
    const { error } = await supabaseService
      .from("online_slot_templates")
      .upsert(rowsToInsert, { onConflict: SLOT_TEMPLATE_UNIQUE_CONFLICT_TARGET });

    if (error && !isMissingSlotTemplateConflictTarget(error)) throw error;
    if (error) {
      const fallback = await supabaseService
        .from("online_slot_templates")
        .insert(rowsToInsert);
      if (fallback.error) throw fallback.error;
    }

    const refreshedTemplates = await loadSlotTemplatesForCourses(params.tenantId, activeCourseIds);
    return {
      templates: filterEnrollmentAvailabilityTemplates(
        refreshedTemplates.filter((template) => template.is_active !== false),
      ),
      dayRanges,
    };
  }

  const nextTemplates = filterEnrollmentAvailabilityTemplates([
    ...activeCourseTemplates.filter((template) => template.is_active !== false),
  ]);

  return {
    templates: nextTemplates,
    dayRanges,
  };
};

const normalizeDateKey = (value: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const isCurrentOrFuturePackageSlot = (
  row: { status?: string | null; effective_to?: string | null },
  dateKey: string,
) => {
  if (row.status && row.status !== "active") return false;
  const effectiveTo = normalizeDateKey(row.effective_to);
  return !effectiveTo || effectiveTo >= dateKey;
};

const isCurrentOrFuturePackage = (
  row: { effective_to?: string | null },
  dateKey: string,
) => {
  const effectiveTo = normalizeDateKey(row.effective_to);
  return !effectiveTo || effectiveTo >= dateKey;
};

const isMissingAvailabilitySourceColumn = (error: { message?: string } | null | undefined) =>
  isMissingColumnError(error, "availability_source", "online_teacher_slot_preferences");

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

const formatTimeLabel = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour24 = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return value.slice(0, 5);

  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
};

const buildOccupiedDayTimeKeys = (
  templates: SlotTemplateRow[],
  occupiedCounts: Map<string, number>,
) => {
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const occupiedKeys = new Set<string>();
  occupiedCounts.forEach((count, slotTemplateId) => {
    if (count <= 0) return;
    const template = templateById.get(slotTemplateId);
    if (!template) return;
    occupiedKeys.add(`${template.day_of_week}:${template.start_time}`);
  });
  return occupiedKeys;
};

const buildSlotGroups = (
  templates: SlotTemplateRow[],
  availability: AvailabilityRow[],
  occupiedCounts: Map<string, number>,
) => {
  const availabilityByTemplateId = new Map(
    availability.map((row) => [row.slot_template_id, row]),
  );
  const occupiedDayTimeKeys = buildOccupiedDayTimeKeys(templates, occupiedCounts);
  const groups = new Map<
    string,
    {
      id: string;
      day_of_week: number;
      start_time: string;
      duration_minutes: number;
      timezone: string;
      slot_template_ids: string[];
      is_available: boolean;
      availability_source: "manual" | "auto_schedule" | null;
      occupied_count: number;
      configured_count: number;
    }
  >();

  templates.forEach((template) => {
    const groupId = `${template.day_of_week}:${template.start_time}`;
    const current =
      groups.get(groupId) ??
      {
        id: groupId,
        day_of_week: template.day_of_week,
        start_time: template.start_time,
        duration_minutes: template.duration_minutes,
        timezone: template.timezone,
        slot_template_ids: [],
        is_available: true,
        availability_source: null,
        occupied_count: 0,
        configured_count: 0,
      };
    const availabilityRow = availabilityByTemplateId.get(template.id);
    current.slot_template_ids.push(template.id);
    current.is_available = current.is_available && availabilityRow?.is_available === true;
    current.configured_count += 1;
    current.occupied_count += occupiedCounts.get(template.id) ?? 0;
    if (availabilityRow?.availability_source === "auto_schedule") {
      current.availability_source = "auto_schedule";
    } else if (!current.availability_source && availabilityRow?.availability_source) {
      current.availability_source = availabilityRow.availability_source;
    }
    if (occupiedDayTimeKeys.has(groupId)) {
      current.occupied_count = Math.max(current.occupied_count, 1);
    }
    groups.set(groupId, current);
  });

  return Array.from(groups.values()).sort((left, right) => {
    if (left.day_of_week !== right.day_of_week) return left.day_of_week - right.day_of_week;
    return left.start_time.localeCompare(right.start_time);
  });
};

const validateMinimumFreeDaysByTime = (params: {
  templates: SlotTemplateRow[];
  availability: AvailabilityRow[];
  occupiedCounts: Map<string, number>;
  updates: Array<{ slot_template_id: string; is_available: boolean }>;
}) => {
  const finalAvailability = new Map<string, boolean>();
  params.availability.forEach((row) => {
    finalAvailability.set(row.slot_template_id, row.is_available === true);
  });
  params.updates.forEach((update) => {
    finalAvailability.set(update.slot_template_id, update.is_available);
  });

  const occupiedDayTimeKeys = buildOccupiedDayTimeKeys(params.templates, params.occupiedCounts);
  const freeDaysByTime = new Map<string, Set<number>>();
  const templatesByDayTime = new Map<string, SlotTemplateRow[]>();

  params.templates.forEach((template) => {
    const dayTimeKey = `${template.day_of_week}:${template.start_time}`;
    const group = templatesByDayTime.get(dayTimeKey) ?? [];
    group.push(template);
    templatesByDayTime.set(dayTimeKey, group);
  });

  templatesByDayTime.forEach((dayTimeTemplates, dayTimeKey) => {
    if (occupiedDayTimeKeys.has(dayTimeKey)) return;
    if (!dayTimeTemplates.every((template) => finalAvailability.get(template.id) === true)) return;

    const template = dayTimeTemplates[0];
    const days = freeDaysByTime.get(template.start_time) ?? new Set<number>();
    days.add(template.day_of_week);
    freeDaysByTime.set(template.start_time, days);
  });

  const invalidTimes = Array.from(freeDaysByTime.entries())
    .filter(([, days]) => days.size > 0 && days.size < MIN_FREE_DAYS_PER_AVAILABLE_TIME)
    .map(([startTime, days]) => ({
      label: formatTimeLabel(startTime),
      selectedDays: days.size,
      missingDays: MIN_FREE_DAYS_PER_AVAILABLE_TIME - days.size,
    }));

  if (invalidTimes.length === 0) return null;
  if (invalidTimes.length === 1) {
    const issue = invalidTimes[0];
    return `${issue.label} has ${issue.selectedDays} of ${MIN_FREE_DAYS_PER_AVAILABLE_TIME} required days selected. ` +
      `Add ${issue.missingDays} more ${pluralize(issue.missingDays, "day")} or turn off ${issue.label}.`;
  }

  const issueList = invalidTimes
    .map((issue) => `${issue.label} (${issue.selectedDays}/${MIN_FREE_DAYS_PER_AVAILABLE_TIME})`)
    .join(", ");
  return `${invalidTimes.length} time slots need more available days before saving: ${issueList}. ` +
    "Add days or turn those times off.";
};

const requireTeacher = async (userId: string) => {
  const { data, error } = await supabaseService
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();
  if (error) throw error;
  return data?.role === "teacher";
};

const normalizeUpdates = (updates: AvailabilityUpdate[] | undefined) => {
  if (!Array.isArray(updates)) return null;
  if (updates.length > MAX_UPDATES) return null;

  const normalized = new Map<string, boolean>();
  for (const update of updates) {
    const slotTemplateId =
      typeof update.slot_template_id === "string" ? update.slot_template_id.trim() : "";
    if (!slotTemplateId || typeof update.is_available !== "boolean") return null;
    normalized.set(slotTemplateId, update.is_available);
  }

  return Array.from(normalized.entries()).map(([slot_template_id, is_available]) => ({
    slot_template_id,
    is_available,
  }));
};

const loadTeacherAvailability = async (tenantId: string, teacherId: string) => {
  const withSource = await supabaseService
    .from("online_teacher_slot_preferences")
    .select("slot_template_id, teacher_id, is_available, last_assigned_at, availability_source")
    .eq("tenant_id", tenantId)
    .eq("teacher_id", teacherId);

  if (!withSource.error) {
    return (withSource.data ?? []) as AvailabilityRow[];
  }
  if (!isMissingAvailabilitySourceColumn(withSource.error)) throw withSource.error;

  const fallback = await supabaseService
    .from("online_teacher_slot_preferences")
    .select("slot_template_id, teacher_id, is_available, last_assigned_at")
    .eq("tenant_id", tenantId)
    .eq("teacher_id", teacherId);
  if (fallback.error) throw fallback.error;

  return ((fallback.data ?? []) as AvailabilityRow[]).map((row) => ({
    ...row,
    availability_source: "manual" as const,
  }));
};

const upsertManualAvailability = async (params: {
  tenantId: string;
  teacherId: string;
  updates: Array<{ slot_template_id: string; is_available: boolean }>;
}) => {
  const timestamp = new Date().toISOString();
  const rows = params.updates.map((update) => ({
    tenant_id: params.tenantId,
    teacher_id: params.teacherId,
    slot_template_id: update.slot_template_id,
    is_available: update.is_available,
    last_assigned_at: update.is_available ? timestamp : null,
    availability_source: "manual",
  }));

  const withSource = await supabaseService
    .from("online_teacher_slot_preferences")
    .upsert(rows, { onConflict: "tenant_id,slot_template_id,teacher_id" })
    .select("slot_template_id, teacher_id, is_available, last_assigned_at, availability_source");

  if (!withSource.error) return withSource.data ?? [];
  if (!isMissingAvailabilitySourceColumn(withSource.error)) throw withSource.error;

  const fallbackRows = rows.map((row) => ({
    tenant_id: row.tenant_id,
    teacher_id: row.teacher_id,
    slot_template_id: row.slot_template_id,
    is_available: row.is_available,
    last_assigned_at: row.last_assigned_at,
  }));
  const fallback = await supabaseService
    .from("online_teacher_slot_preferences")
    .upsert(fallbackRows, { onConflict: "tenant_id,slot_template_id,teacher_id" })
    .select("slot_template_id, teacher_id, is_available, last_assigned_at");
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((row) => ({ ...row, availability_source: "manual" as const }));
};

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const isTeacher = await requireTeacher(auth.userId);
    if (!isTeacher) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [coursesRes, templatesRes, availability, packagesRes] = await Promise.all([
      supabaseService
        .from("online_courses")
        .select("id, name, sessions_per_week, monthly_fee_cents, default_slot_duration_minutes, is_active")
        .eq("tenant_id", auth.tenantId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      fetchAllPagedRows<SlotTemplateRow>((from, to) =>
        supabaseService
          .from("online_slot_templates")
          .select("id, course_id, day_of_week, start_time, duration_minutes, timezone, is_active")
          .eq("tenant_id", auth.tenantId)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadTeacherAvailability(auth.tenantId, auth.userId),
      supabaseService
        .from("online_recurring_packages")
        .select("id, effective_to")
        .eq("tenant_id", auth.tenantId)
        .eq("teacher_id", auth.userId)
        .in("status", [...ACTIVE_PACKAGE_STATUSES]),
    ]);

    if (coursesRes.error) throw coursesRes.error;
    if (templatesRes.error) throw templatesRes.error;
    if (packagesRes.error) throw packagesRes.error;

    const { templates, dayRanges } = await ensureThirtyMinuteEnrollmentTemplates({
      tenantId: auth.tenantId,
      courses: (coursesRes.data ?? []) as CourseRow[],
      templates: (templatesRes.data ?? []) as SlotTemplateRow[],
    });
    const todayKey = new Date().toISOString().slice(0, 10);
    const packageIds = (packagesRes.data ?? [])
      .filter((row) => isCurrentOrFuturePackage(row, todayKey))
      .map((row) => String(row.id ?? ""))
      .filter(Boolean);
    const occupiedCounts = new Map<string, number>();

    if (packageIds.length > 0) {
      const occupiedRes = await supabaseService
        .from("online_recurring_package_slots")
        .select("slot_template_id, status, effective_to")
        .eq("tenant_id", auth.tenantId)
        .eq("status", "active")
        .in("package_id", packageIds);
      if (occupiedRes.error) throw occupiedRes.error;

      (occupiedRes.data ?? [])
        .filter((row) => isCurrentOrFuturePackageSlot(row, todayKey))
        .forEach((row) => {
          const slotTemplateId = String(row.slot_template_id ?? "");
          if (!slotTemplateId) return;
          occupiedCounts.set(slotTemplateId, (occupiedCounts.get(slotTemplateId) ?? 0) + 1);
        });
    }

    return NextResponse.json({
      courses: coursesRes.data ?? [],
      templates,
      day_ranges: dayRanges,
      slot_groups: buildSlotGroups(templates, availability, occupiedCounts),
      availability,
      occupied_slots: Array.from(occupiedCounts.entries()).map(([slot_template_id, package_count]) => ({
        slot_template_id,
        package_count,
      })),
    });
  } catch (error: unknown) {
    console.error("Teacher online availability fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to load availability";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const isTeacher = await requireTeacher(auth.userId);
    if (!isTeacher) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as AvailabilityPatchBody;
    const updates = normalizeUpdates(body.updates);
    if (!updates) {
      return NextResponse.json(
        { error: `updates must include ${MAX_UPDATES} or fewer slot_template_id/is_available changes.` },
        { status: 400 },
      );
    }
    if (updates.length === 0) {
      return NextResponse.json({ availability: [] });
    }

    const slotTemplateIds = updates.map((update) => update.slot_template_id);
    const templateRes = await fetchAllPagedRows<SlotTemplateRow>((from, to) =>
      supabaseService
        .from("online_slot_templates")
        .select("id, course_id, day_of_week, start_time, duration_minutes, timezone, is_active")
        .eq("tenant_id", auth.tenantId)
        .eq("is_active", true)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (templateRes.error) throw templateRes.error;

    const activeTemplates = filterEnrollmentAvailabilityTemplates(
      (templateRes.data ?? []) as SlotTemplateRow[],
    );
    const validIds = new Set(activeTemplates.map((row) => String(row.id)));
    if (slotTemplateIds.some((slotTemplateId) => !validIds.has(slotTemplateId))) {
      return NextResponse.json(
        { error: "One or more slot templates are not available for this teacher." },
        { status: 400 },
      );
    }

    const packagesRes = await supabaseService
      .from("online_recurring_packages")
      .select("id, effective_to")
      .eq("tenant_id", auth.tenantId)
      .eq("teacher_id", auth.userId)
      .in("status", [...ACTIVE_PACKAGE_STATUSES]);
    if (packagesRes.error) throw packagesRes.error;

    const todayKey = new Date().toISOString().slice(0, 10);
    const packageIds = (packagesRes.data ?? [])
      .filter((row) => isCurrentOrFuturePackage(row, todayKey))
      .map((row) => String(row.id ?? ""))
      .filter(Boolean);
    const occupiedCounts = new Map<string, number>();
    if (packageIds.length > 0) {
      const occupiedRes = await supabaseService
        .from("online_recurring_package_slots")
        .select("slot_template_id, status, effective_to")
        .eq("tenant_id", auth.tenantId)
        .eq("status", "active")
        .in("package_id", packageIds);
      if (occupiedRes.error) throw occupiedRes.error;

      (occupiedRes.data ?? [])
        .filter((row) => isCurrentOrFuturePackageSlot(row, todayKey))
        .forEach((row) => {
          const slotTemplateId = String(row.slot_template_id ?? "");
          if (!slotTemplateId) return;
          occupiedCounts.set(slotTemplateId, (occupiedCounts.get(slotTemplateId) ?? 0) + 1);
        });
    }

    const templateById = new Map(activeTemplates.map((template) => [template.id, template]));
    const occupiedDayTimeKeys = buildOccupiedDayTimeKeys(activeTemplates, occupiedCounts);
    const occupiedUpdateIds = updates
      .map((update) => update.slot_template_id)
      .filter((slotTemplateId) => {
        if ((occupiedCounts.get(slotTemplateId) ?? 0) > 0) return true;
        const template = templateById.get(slotTemplateId);
        return template ? occupiedDayTimeKeys.has(`${template.day_of_week}:${template.start_time}`) : false;
      });
    if (occupiedUpdateIds.length > 0) {
      return NextResponse.json(
        { error: "In-use slots cannot be changed from the availability page." },
        { status: 400 },
      );
    }

    const currentAvailability = await loadTeacherAvailability(auth.tenantId, auth.userId);
    const validationError = validateMinimumFreeDaysByTime({
      templates: activeTemplates,
      availability: currentAvailability,
      occupiedCounts,
      updates,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const availability = await upsertManualAvailability({
      tenantId: auth.tenantId,
      teacherId: auth.userId,
      updates,
    });

    return NextResponse.json({ availability });
  } catch (error: unknown) {
    console.error("Teacher online availability update error:", error);
    const message = error instanceof Error ? error.message : "Failed to update availability";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
