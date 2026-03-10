import type { CampusSessionTemplate } from "@/types/campusAttendance";

const DAY_MS = 24 * 60 * 60 * 1000;

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDate = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  return parsed;
};

export const expandDateRange = (start: Date, end: Date) => {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

export type PlannedSessionRow = {
  template_id: string;
  class_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  state: "planned" | "holiday";
};

export function buildPlannedSessionsForRange(args: {
  templates: CampusSessionTemplate[];
  rangeStart: string;
  rangeEnd: string;
  holidayDates: Set<string>;
}): PlannedSessionRow[] {
  const start = parseDate(args.rangeStart);
  const end = parseDate(args.rangeEnd);
  const output: PlannedSessionRow[] = [];

  args.templates.forEach((template) => {
    const templateStart = parseDate(template.effective_from);
    const templateEnd = template.effective_to ? parseDate(template.effective_to) : end;
    const effectiveStart = templateStart > start ? templateStart : start;
    const effectiveEnd = templateEnd < end ? templateEnd : end;

    if (effectiveStart > effectiveEnd) return;

    expandDateRange(effectiveStart, effectiveEnd).forEach((day) => {
      if (day.getDay() !== Number(template.day_of_week)) return;
      const dateKey = toDateKey(day);
      output.push({
        template_id: template.id,
        class_id: template.class_id,
        subject_id: template.subject_id,
        teacher_id: template.teacher_id,
        session_date: dateKey,
        start_time: template.start_time,
        end_time: template.end_time,
        state: args.holidayDates.has(dateKey) ? "holiday" : "planned",
      });
    });
  });

  return output.sort((left, right) => {
    const dateCompare = left.session_date.localeCompare(right.session_date);
    if (dateCompare !== 0) return dateCompare;
    if (left.class_id !== right.class_id) return left.class_id.localeCompare(right.class_id);
    return left.start_time.localeCompare(right.start_time);
  });
}

export const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
