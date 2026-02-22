import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { buildSlotInstances } from "@/lib/online/slots";
import { isMissingRelationError } from "@/lib/online/db";

type StudentRow = {
  id: string;
  name: string | null;
};

type CourseRow = {
  id: string;
  name: string;
  description: string | null;
  monthly_fee_cents: number | null;
  sessions_per_week: number | null;
};

type TemplateRow = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
};

type AvailabilityRow = {
  slot_template_id: string;
  teacher_id: string;
  is_available: boolean;
};

type ClaimRow = {
  id: string;
  slot_template_id: string;
  session_date: string;
  status: string | null;
  seat_hold_expires_at: string | null;
  student_id: string | null;
  parent_id: string | null;
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  const from = startOfUtcDay(new Date());
  const to = new Date(from.getTime() + 20 * 24 * 60 * 60 * 1000);

  try {
    const [{ data: studentsData, error: studentsError }, { data: coursesData, error: coursesError }, { data: templatesData, error: templatesError }, { data: availabilityData, error: availabilityError }, { data: claimsData, error: claimsError }] =
      await Promise.all([
        supabaseService
          .from("students")
          .select("id, name")
          .eq("tenant_id", auth.tenantId)
          .eq("parent_id", auth.userId)
          .neq("record_type", "prospect")
          .order("name", { ascending: true }),
        supabaseService
          .from("online_courses")
          .select("id, name, description, monthly_fee_cents, sessions_per_week")
          .eq("tenant_id", auth.tenantId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabaseService
          .from("online_slot_templates")
          .select("id, course_id, day_of_week, start_time, duration_minutes, is_active")
          .eq("tenant_id", auth.tenantId)
          .eq("is_active", true),
        supabaseService
          .from("online_teacher_slot_preferences")
          .select("slot_template_id, teacher_id, is_available")
          .eq("tenant_id", auth.tenantId)
          .eq("is_available", true),
        supabaseService
          .from("online_slot_claims")
          .select("id, slot_template_id, session_date, status, seat_hold_expires_at, student_id, parent_id")
          .eq("tenant_id", auth.tenantId)
          .in("status", ["pending_payment", "active"])
          .gte("session_date", toDateKey(from))
          .lte("session_date", toDateKey(to)),
      ]);

    if (studentsError) throw studentsError;

    if (coursesError || templatesError || availabilityError || claimsError) {
      const missingTable =
        (coursesError && isMissingRelationError(coursesError, "online_courses")) ||
        (templatesError && isMissingRelationError(templatesError, "online_slot_templates")) ||
        (availabilityError && isMissingRelationError(availabilityError, "online_teacher_slot_preferences")) ||
        (claimsError && isMissingRelationError(claimsError, "online_slot_claims"));

      if (missingTable) {
        return NextResponse.json({
          setup_required: true,
          students: (studentsData ?? []) as StudentRow[],
          courses: [],
          slots: [],
          claims: [],
        });
      }
      throw coursesError ?? templatesError ?? availabilityError ?? claimsError;
    }

    const courses = (coursesData ?? []) as CourseRow[];
    const templates = (templatesData ?? []) as TemplateRow[];
    const availabilityRows = (availabilityData ?? []) as AvailabilityRow[];
    const claims = (claimsData ?? []) as ClaimRow[];
    const students = (studentsData ?? []) as StudentRow[];

    const teacherCountByTemplate = new Map<string, number>();
    availabilityRows.forEach((row) => {
      teacherCountByTemplate.set(
        row.slot_template_id,
        (teacherCountByTemplate.get(row.slot_template_id) ?? 0) + 1
      );
    });

    const courseById = new Map(courses.map((course) => [course.id, course]));
    const claimBySlotInstance = new Map<string, ClaimRow>();
    claims.forEach((claim) => {
      const key = `${claim.slot_template_id}:${claim.session_date}`;
      if (!claimBySlotInstance.has(key)) {
        claimBySlotInstance.set(key, claim);
      }
    });

    const slotInstances = buildSlotInstances({ templates, fromDate: from, toDate: to });
    const slots = slotInstances.map((instance) => {
      const key = `${instance.slotTemplateId}:${instance.sessionDate}`;
      const claim = claimBySlotInstance.get(key);
      const availableTeachers = teacherCountByTemplate.get(instance.slotTemplateId) ?? 0;
      const claimedBySelf = claim?.parent_id === auth.userId;
      const unavailable = Boolean(claim) && !claimedBySelf;
      return {
        slot_template_id: instance.slotTemplateId,
        course_id: instance.courseId,
        course_name: courseById.get(instance.courseId)?.name ?? "Unknown Course",
        session_date: instance.sessionDate,
        start_time: instance.startTime,
        duration_minutes: instance.durationMinutes,
        available_teachers: availableTeachers,
        is_available: availableTeachers > 0 && !unavailable,
        claim_id: claim?.id ?? null,
        claim_status: claim?.status ?? null,
        seat_hold_expires_at: claim?.seat_hold_expires_at ?? null,
        claimed_by_self: claimedBySelf,
      };
    });

    const parentClaims = claims
      .filter((claim) => claim.parent_id === auth.userId)
      .sort((left, right) => left.session_date.localeCompare(right.session_date));

    return NextResponse.json({
      setup_required: false,
      students,
      courses,
      slots,
      claims: parentClaims,
    });
  } catch (error: unknown) {
    console.error("Parent online explore error:", error);
    const message = error instanceof Error ? error.message : "Failed to load online explore data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
