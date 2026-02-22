import type { OnlineSlotTemplate } from "@/types/online";

export type SlotTemplateLite = Pick<
  OnlineSlotTemplate,
  "id" | "course_id" | "day_of_week" | "start_time" | "duration_minutes" | "is_active"
>;

export type SlotInstance = {
  slotTemplateId: string;
  courseId: string;
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
};

const toDateKey = (value: Date) => value.toISOString().slice(0, 10);

const startOfDayUtc = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const buildSlotInstances = (params: {
  templates: SlotTemplateLite[];
  fromDate: Date;
  toDate: Date;
}) => {
  const from = startOfDayUtc(params.fromDate);
  const to = startOfDayUtc(params.toDate);
  if (to < from) return [] as SlotInstance[];

  const instances: SlotInstance[] = [];
  for (
    let current = new Date(from);
    current <= to;
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const day = current.getUTCDay();
    params.templates.forEach((template) => {
      if (!template.is_active) return;
      if (template.day_of_week !== day) return;
      instances.push({
        slotTemplateId: template.id,
        courseId: template.course_id,
        sessionDate: toDateKey(current),
        startTime: template.start_time,
        durationMinutes: template.duration_minutes,
      });
    });
  }

  return instances.sort((left, right) => {
    if (left.sessionDate !== right.sessionDate) {
      return left.sessionDate.localeCompare(right.sessionDate);
    }
    if (left.startTime !== right.startTime) {
      return left.startTime.localeCompare(right.startTime);
    }
    return left.slotTemplateId.localeCompare(right.slotTemplateId);
  });
};

export const startTimeToMinutes = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 0;
  return hour * 60 + minute;
};

export const dayOfWeekLabel = (day: number) => {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels[day] ?? "Unknown";
};
