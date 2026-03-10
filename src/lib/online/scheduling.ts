import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/online/db";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const ACTIVE_ENROLLMENT_STATUSES = ["active", "paused", "pending_payment"] as const;
const ACTIVE_PACKAGE_STATUSES = ["active", "pending_payment", "draft"] as const;
const DEFAULT_SLOT_DURATION_MINUTES = 30;

type ClientLike = Pick<SupabaseClient, "from">;

type StudentCandidate = {
  id: string;
  name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
};

type CourseWithDuration = {
  id: string;
  name: string;
  sessions_per_week: number;
  monthly_fee_cents: number;
  default_slot_duration_minutes: number;
};

type SlotTemplateRow = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
};

export type TeacherScheduleSlotInput = {
  day_of_week: number;
  start_time: string;
};

export type TeacherScheduleRequest = {
  tenantId: string;
  teacherId: string;
  studentId: string;
  courseId: string;
  month: string;
  slots: TeacherScheduleSlotInput[];
};

export type TeacherSchedulerStudentOption = {
  id: string;
  name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
};

export type TeacherSchedulerCourseOption = {
  id: string;
  name: string;
  sessions_per_week: number;
  monthly_fee_cents: number;
  duration_minutes: number;
};

export type TeacherSchedulerOptions = {
  students: TeacherSchedulerStudentOption[];
  courses: TeacherSchedulerCourseOption[];
  slot_capacity: "single_student";
};

const normalizeStartTime = (value: string) => {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return "";
  return `${match[1]}:${match[2]}:00`;
};

const toMonthStart = (monthKey: string) => {
  const match = MONTH_PATTERN.exec(monthKey.trim());
  if (!match) return "";
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return `${match[1]}-${match[2]}-01`;
};

const uniqueSlotInputs = (slots: TeacherScheduleSlotInput[]) => {
  const normalized: Array<{ day_of_week: number; start_time: string }> = [];
  const keys = new Set<string>();

  for (const slot of slots) {
    const dayOfWeek = Number(slot.day_of_week);
    const startTime = normalizeStartTime(slot.start_time ?? "");
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !startTime) {
      throw new Error("Each slot must include day_of_week (0-6) and start_time (HH:MM).");
    }
    const key = `${dayOfWeek}:${startTime}`;
    if (keys.has(key)) {
      throw new Error("Duplicate day/time slots are not allowed in the same schedule.");
    }
    keys.add(key);
    normalized.push({ day_of_week: dayOfWeek, start_time: startTime });
  }

  return normalized;
};

const fetchOnlineProgramIds = async (client: ClientLike, tenantId: string) => {
  const programRes = await client
    .from("programs")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("type", ["online", "hybrid"]);
  if (programRes.error) throw programRes.error;

  return (programRes.data ?? [])
    .map((row) => row.id as string | null)
    .filter((value): value is string => Boolean(value));
};

const fetchEligibleTeacherStudents = async (client: ClientLike, tenantId: string, teacherId: string) => {
  const onlineProgramIds = await fetchOnlineProgramIds(client, tenantId);
  if (onlineProgramIds.length === 0) return [] as StudentCandidate[];

  const enrollmentRes = await client
    .from("enrollments")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .in("program_id", onlineProgramIds)
    .in("status", [...ACTIVE_ENROLLMENT_STATUSES]);
  if (enrollmentRes.error) throw enrollmentRes.error;

  const studentIds = Array.from(
    new Set(
      (enrollmentRes.data ?? [])
        .map((row) => row.student_id as string | null)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (studentIds.length === 0) return [] as StudentCandidate[];

  const studentRes = await client
    .from("students")
    .select("id, name, parent_name, parent_contact_number, record_type")
    .eq("tenant_id", tenantId)
    .eq("assigned_teacher_id", teacherId)
    .in("id", studentIds)
    .order("name", { ascending: true });
  if (studentRes.error) throw studentRes.error;

  return (studentRes.data ?? [])
    .filter((row) => (row.record_type ?? null) !== "prospect")
    .map((row) => ({
      id: String(row.id),
      name: row.name ?? "Student",
      parent_name: row.parent_name ?? null,
      parent_contact_number: row.parent_contact_number ?? null,
    }));
};

const fetchActiveCourses = async (client: ClientLike, tenantId: string) => {
  const selectColumns =
    "id, name, sessions_per_week, monthly_fee_cents, is_active, default_slot_duration_minutes";
  const courseRes = await client
    .from("online_courses")
    .select(selectColumns)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (!courseRes.error) {
    return (courseRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: row.name ?? "Online Course",
      sessions_per_week: Math.max(Number(row.sessions_per_week) || 1, 1),
      monthly_fee_cents: Number(row.monthly_fee_cents) || 0,
      default_slot_duration_minutes:
        Number(row.default_slot_duration_minutes) > 0
          ? Number(row.default_slot_duration_minutes)
          : DEFAULT_SLOT_DURATION_MINUTES,
    })) as CourseWithDuration[];
  }

  if (!isMissingColumnError(courseRes.error, "default_slot_duration_minutes", "online_courses")) {
    throw courseRes.error;
  }

  const fallbackRes = await client
    .from("online_courses")
    .select("id, name, sessions_per_week, monthly_fee_cents, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (fallbackRes.error) throw fallbackRes.error;

  return (fallbackRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: row.name ?? "Online Course",
    sessions_per_week: Math.max(Number(row.sessions_per_week) || 1, 1),
    monthly_fee_cents: Number(row.monthly_fee_cents) || 0,
    default_slot_duration_minutes: DEFAULT_SLOT_DURATION_MINUTES,
  })) as CourseWithDuration[];
};

const resolveTemplate = async (params: {
  client: ClientLike;
  tenantId: string;
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
}) => {
  const { client, tenantId, courseId, dayOfWeek, startTime, durationMinutes } = params;
  const existingRes = await client
    .from("online_slot_templates")
    .select("id, course_id, day_of_week, start_time, duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("course_id", courseId)
    .eq("day_of_week", dayOfWeek)
    .eq("start_time", startTime)
    .limit(1);
  if (existingRes.error) throw existingRes.error;

  const existing = (existingRes.data ?? [])[0] as SlotTemplateRow | undefined;
  if (existing?.id) return existing;

  const createRes = await client
    .from("online_slot_templates")
    .insert({
      tenant_id: tenantId,
      course_id: courseId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      duration_minutes: durationMinutes,
      timezone: "Asia/Kuala_Lumpur",
      is_active: true,
    })
    .select("id, course_id, day_of_week, start_time, duration_minutes")
    .single();
  if (createRes.error) throw createRes.error;
  return createRes.data as SlotTemplateRow;
};

export const buildTeacherSchedulerOptions = async (params: {
  client: ClientLike;
  tenantId: string;
  teacherId: string;
}): Promise<TeacherSchedulerOptions> => {
  const [students, courses] = await Promise.all([
    fetchEligibleTeacherStudents(params.client, params.tenantId, params.teacherId),
    fetchActiveCourses(params.client, params.tenantId),
  ]);

  return {
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      parent_name: student.parent_name,
      parent_contact_number: student.parent_contact_number,
    })),
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name,
      sessions_per_week: course.sessions_per_week,
      monthly_fee_cents: course.monthly_fee_cents,
      duration_minutes: course.default_slot_duration_minutes,
    })),
    slot_capacity: "single_student",
  };
};

export const createTeacherRecurringSchedule = async (
  client: ClientLike,
  payload: TeacherScheduleRequest,
) => {
  const monthStart = toMonthStart(payload.month);
  if (!monthStart) {
    throw new Error("month must be in YYYY-MM format.");
  }

  const slots = uniqueSlotInputs(payload.slots ?? []);
  if (slots.length === 0) {
    throw new Error("At least one slot is required.");
  }

  const schedulerOptions = await buildTeacherSchedulerOptions({
    client,
    tenantId: payload.tenantId,
    teacherId: payload.teacherId,
  });
  const selectedStudent = schedulerOptions.students.find((student) => student.id === payload.studentId);
  if (!selectedStudent) {
    throw new Error("Student must be assigned to this teacher and enrolled in online/hybrid.");
  }

  const selectedCourse = schedulerOptions.courses.find((course) => course.id === payload.courseId);
  if (!selectedCourse) {
    throw new Error("Course is not available for scheduling.");
  }

  if (slots.length !== selectedCourse.sessions_per_week) {
    throw new Error(`This course requires exactly ${selectedCourse.sessions_per_week} weekly slot(s).`);
  }

  const templateRows = await Promise.all(
    slots.map((slot) =>
      resolveTemplate({
        client,
        tenantId: payload.tenantId,
        courseId: payload.courseId,
        dayOfWeek: slot.day_of_week,
        startTime: slot.start_time,
        durationMinutes: selectedCourse.duration_minutes,
      }),
    ),
  );
  const templateIds = templateRows.map((row) => row.id);

  const activePackagesRes = await client
    .from("online_recurring_packages")
    .select("id, student_id, course_id, effective_month, effective_to")
    .eq("tenant_id", payload.tenantId)
    .eq("teacher_id", payload.teacherId)
    .in("status", [...ACTIVE_PACKAGE_STATUSES]);
  if (activePackagesRes.error) throw activePackagesRes.error;

  const activePackages = (activePackagesRes.data ?? []) as Array<{
    id: string;
    student_id: string;
    course_id: string;
    effective_month: string;
    effective_to: string | null;
  }>;
  const monthActivePackages = activePackages.filter(
    (row) =>
      row.effective_month <= monthStart &&
      (row.effective_to === null || row.effective_to >= monthStart),
  );

  const monthActivePackageIds = monthActivePackages.map((row) => row.id);
  const slotsByPackageId = new Map<string, number>();
  if (monthActivePackageIds.length > 0) {
    const activePackageSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("package_id")
      .eq("tenant_id", payload.tenantId)
      .eq("status", "active")
      .in("package_id", monthActivePackageIds);
    if (activePackageSlotsRes.error) throw activePackageSlotsRes.error;

    (activePackageSlotsRes.data ?? []).forEach((row) => {
      const packageId = String(row.package_id ?? "");
      if (!packageId) return;
      slotsByPackageId.set(packageId, (slotsByPackageId.get(packageId) ?? 0) + 1);
    });
  }

  const monthScheduledPackages = monthActivePackages.filter((row) => (slotsByPackageId.get(row.id) ?? 0) > 0);
  const existingPackage = monthScheduledPackages.find((row) => row.student_id === payload.studentId) ?? null;

  const activePackageIds = monthScheduledPackages
    .filter((row) => row.id !== existingPackage?.id)
    .map((row) => row.id);
  if (activePackageIds.length > 0) {
    const slotConflictRes = await client
      .from("online_recurring_package_slots")
      .select("id")
      .eq("tenant_id", payload.tenantId)
      .in("package_id", activePackageIds)
      .eq("status", "active")
      .in("slot_template_id", templateIds)
      .limit(1);
    if (slotConflictRes.error) throw slotConflictRes.error;
    if ((slotConflictRes.data ?? []).length > 0) {
      throw new Error("One or more selected slot times are already scheduled for this teacher.");
    }
  }

  const timestamp = new Date().toISOString();
  let packageData: Record<string, unknown> | null = null;
  let packageSlotsData: Array<Record<string, unknown>> = [];

  if (existingPackage) {
    const packageUpdateRes = await client
      .from("online_recurring_packages")
      .update({
        course_id: payload.courseId,
        status: "active",
        source: "teacher_direct",
        sessions_per_week: selectedCourse.sessions_per_week,
        monthly_fee_cents_snapshot: selectedCourse.monthly_fee_cents,
        updated_at: timestamp,
        updated_by: payload.teacherId,
      })
      .eq("tenant_id", payload.tenantId)
      .eq("id", existingPackage.id)
      .select("*")
      .single();
    if (packageUpdateRes.error) throw packageUpdateRes.error;
    packageData = packageUpdateRes.data as Record<string, unknown>;

    const existingSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("id")
      .eq("tenant_id", payload.tenantId)
      .eq("package_id", existingPackage.id)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (existingSlotsRes.error) throw existingSlotsRes.error;

    const existingSlots = (existingSlotsRes.data ?? []) as Array<{ id: string }>;
    const reusableSlots = existingSlots.slice(0, templateRows.length);
    for (let index = 0; index < reusableSlots.length; index += 1) {
      const updateSlotRes = await client
        .from("online_recurring_package_slots")
        .update({
          slot_template_id: templateRows[index].id,
          day_of_week_snapshot: templateRows[index].day_of_week,
          start_time_snapshot: templateRows[index].start_time,
          duration_minutes_snapshot: templateRows[index].duration_minutes,
          status: "active",
          updated_at: timestamp,
        })
        .eq("tenant_id", payload.tenantId)
        .eq("id", reusableSlots[index].id);
      if (updateSlotRes.error) throw updateSlotRes.error;
    }

    const templatesToInsert = templateRows.slice(reusableSlots.length);
    if (templatesToInsert.length > 0) {
      const insertRows = templatesToInsert.map((template) => ({
        tenant_id: payload.tenantId,
        package_id: existingPackage.id,
        slot_template_id: template.id,
        day_of_week_snapshot: template.day_of_week,
        start_time_snapshot: template.start_time,
        duration_minutes_snapshot: template.duration_minutes,
        status: "active" as const,
      }));
      const insertRes = await client
        .from("online_recurring_package_slots")
        .insert(insertRows);
      if (insertRes.error) throw insertRes.error;
    }

    const staleSlotIds = existingSlots.slice(templateRows.length).map((slot) => slot.id);
    if (staleSlotIds.length > 0) {
      const cancelRes = await client
        .from("online_recurring_package_slots")
        .update({
          status: "cancelled",
          updated_at: timestamp,
        })
        .eq("tenant_id", payload.tenantId)
        .in("id", staleSlotIds);
      if (cancelRes.error) throw cancelRes.error;
    }

    const refreshedSlotsRes = await client
      .from("online_recurring_package_slots")
      .select("*")
      .eq("tenant_id", payload.tenantId)
      .eq("package_id", existingPackage.id)
      .eq("status", "active")
      .order("day_of_week_snapshot", { ascending: true })
      .order("start_time_snapshot", { ascending: true });
    if (refreshedSlotsRes.error) throw refreshedSlotsRes.error;
    packageSlotsData = (refreshedSlotsRes.data ?? []) as Array<Record<string, unknown>>;
  } else {
    const packageRes = await client
      .from("online_recurring_packages")
      .insert({
        tenant_id: payload.tenantId,
        student_id: payload.studentId,
        course_id: payload.courseId,
        teacher_id: payload.teacherId,
        status: "active",
        source: "teacher_direct",
        effective_month: monthStart,
        effective_from: monthStart,
        sessions_per_week: selectedCourse.sessions_per_week,
        monthly_fee_cents_snapshot: selectedCourse.monthly_fee_cents,
        notes: null,
        created_by: payload.teacherId,
        updated_by: payload.teacherId,
      })
      .select("*")
      .single();
    if (packageRes.error) throw packageRes.error;
    packageData = packageRes.data as Record<string, unknown>;

    const slotInsertRows = templateRows.map((template) => ({
      tenant_id: payload.tenantId,
      package_id: packageRes.data.id,
      slot_template_id: template.id,
      day_of_week_snapshot: template.day_of_week,
      start_time_snapshot: template.start_time,
      duration_minutes_snapshot: template.duration_minutes,
      status: "active" as const,
    }));
    const packageSlotRes = await client
      .from("online_recurring_package_slots")
      .insert(slotInsertRows)
      .select("*");
    if (packageSlotRes.error) {
      await client
        .from("online_recurring_packages")
        .update({
          status: "cancelled",
          effective_to: monthStart,
          updated_at: timestamp,
          updated_by: payload.teacherId,
        })
        .eq("tenant_id", payload.tenantId)
        .eq("id", packageRes.data.id);
      throw packageSlotRes.error;
    }

    packageSlotsData = (packageSlotRes.data ?? []) as Array<Record<string, unknown>>;
  }

  const availabilityRows = templateIds.map((slotTemplateId) => ({
    tenant_id: payload.tenantId,
    teacher_id: payload.teacherId,
    slot_template_id: slotTemplateId,
    is_available: true,
    last_assigned_at: timestamp,
  }));
  const availabilityRes = await client
    .from("online_teacher_slot_preferences")
    .upsert(availabilityRows, { onConflict: "tenant_id,slot_template_id,teacher_id" });
  if (availabilityRes.error) throw availabilityRes.error;

  return {
    package: packageData,
    package_slots: packageSlotsData,
  };
};
