export const ENROLLMENT_SLOT_DURATION_MINUTES = 30;
export const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";
export const ENROLLMENT_AVAILABILITY_DAY_SEQUENCE = [1, 2, 3, 4, 5, 6, 0] as const;
export const ENROLLMENT_AVAILABILITY_START_TIME = "05:00:00";
export const ENROLLMENT_AVAILABILITY_END_TIME = "23:00:00";

export type EnrollmentSlotTemplateLike = {
  id?: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone?: string | null;
  is_active?: boolean;
};

export type AvailabilityDayRange = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

export type MissingEnrollmentTemplateRow = {
  tenant_id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  timezone: string;
  is_active: boolean;
};

export const normalizeStartTime = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
};

export const timeToMinutes = (value: string) => {
  const startTime = normalizeStartTime(value);
  if (!startTime) return Number.NaN;

  const [hourRaw, minuteRaw] = startTime.split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
};

export const minutesToStartTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

export const isThirtyMinuteStart = (value: string) => {
  const minutes = timeToMinutes(value);
  return Number.isFinite(minutes) && minutes % ENROLLMENT_SLOT_DURATION_MINUTES === 0;
};

export const isEnrollmentAvailabilityTemplate = (template: EnrollmentSlotTemplateLike) =>
  template.duration_minutes === ENROLLMENT_SLOT_DURATION_MINUTES &&
  isThirtyMinuteStart(template.start_time);

const canonicalDaySet = new Set<number>(ENROLLMENT_AVAILABILITY_DAY_SEQUENCE);

export const buildCanonicalEnrollmentStartTimes = () => {
  const startMinutes = timeToMinutes(ENROLLMENT_AVAILABILITY_START_TIME);
  const endMinutes = timeToMinutes(ENROLLMENT_AVAILABILITY_END_TIME);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return [];

  const startTimes: string[] = [];
  for (
    let minute = startMinutes;
    minute <= endMinutes;
    minute += ENROLLMENT_SLOT_DURATION_MINUTES
  ) {
    startTimes.push(minutesToStartTime(minute));
  }
  return startTimes;
};

export const isCanonicalEnrollmentAvailabilityTemplate = (
  template: EnrollmentSlotTemplateLike,
) => {
  if (!isEnrollmentAvailabilityTemplate(template)) return false;
  if (!canonicalDaySet.has(template.day_of_week)) return false;

  const startMinutes = timeToMinutes(template.start_time);
  const canonicalStartMinutes = timeToMinutes(ENROLLMENT_AVAILABILITY_START_TIME);
  const canonicalEndMinutes = timeToMinutes(ENROLLMENT_AVAILABILITY_END_TIME);
  return (
    Number.isFinite(startMinutes) &&
    startMinutes >= canonicalStartMinutes &&
    startMinutes <= canonicalEndMinutes
  );
};

export const filterEnrollmentAvailabilityTemplates = <T extends EnrollmentSlotTemplateLike>(
  templates: T[],
) =>
  templates.filter(isCanonicalEnrollmentAvailabilityTemplate).map((template) => ({
    ...template,
    start_time: normalizeStartTime(template.start_time),
    duration_minutes: ENROLLMENT_SLOT_DURATION_MINUTES,
    timezone: template.timezone || DEFAULT_TIMEZONE,
  }));

export const buildCanonicalAvailabilityDayRanges = (
  timezone = DEFAULT_TIMEZONE,
): AvailabilityDayRange[] =>
  ENROLLMENT_AVAILABILITY_DAY_SEQUENCE.map((dayOfWeek) => ({
    day_of_week: dayOfWeek,
    start_time: ENROLLMENT_AVAILABILITY_START_TIME,
    end_time: ENROLLMENT_AVAILABILITY_END_TIME,
    timezone: timezone || DEFAULT_TIMEZONE,
  }));

export const buildAvailabilityDayRanges = (
  templates: EnrollmentSlotTemplateLike[],
): AvailabilityDayRange[] =>
  buildCanonicalAvailabilityDayRanges(
    templates.find((template) => template.timezone)?.timezone || DEFAULT_TIMEZONE,
  );

export const buildMissingEnrollmentTemplateRows = (params: {
  tenantId: string;
  courseIds: string[];
  templates: EnrollmentSlotTemplateLike[];
  dayRanges: AvailabilityDayRange[];
}) => {
  const activeCourseIds = new Set(params.courseIds.filter(Boolean));
  const canonicalTemplates = filterEnrollmentAvailabilityTemplates(params.templates)
    .filter((template) => activeCourseIds.has(template.course_id));
  const existingCanonicalKeys = new Set(
    canonicalTemplates.map(
      (template) => `${template.course_id}:${template.day_of_week}:${template.start_time}`,
    ),
  );
  const rows: MissingEnrollmentTemplateRow[] = [];

  Array.from(activeCourseIds).forEach((courseId) => {
    params.dayRanges.forEach((range) => {
      const startMinutes = timeToMinutes(range.start_time);
      const endMinutes = timeToMinutes(range.end_time);
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return;

      for (
        let minute = startMinutes;
        minute <= endMinutes;
        minute += ENROLLMENT_SLOT_DURATION_MINUTES
      ) {
        const startTime = minutesToStartTime(minute);
        const key = `${courseId}:${range.day_of_week}:${startTime}`;
        if (existingCanonicalKeys.has(key)) continue;

        existingCanonicalKeys.add(key);
        rows.push({
          tenant_id: params.tenantId,
          course_id: courseId,
          day_of_week: range.day_of_week,
          start_time: startTime,
          duration_minutes: ENROLLMENT_SLOT_DURATION_MINUTES,
          timezone: range.timezone || DEFAULT_TIMEZONE,
          is_active: true,
        });
      }
    });
  });

  return rows;
};
