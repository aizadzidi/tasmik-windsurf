import { describe, expect, it } from "vitest";
import { buildPlannedSessionsForRange } from "@/lib/campusAttendancePlanner";
import type { CampusSessionTemplate } from "@/types/campusAttendance";

const template: CampusSessionTemplate = {
  id: "tpl-1",
  tenant_id: "tenant-1",
  class_id: "class-1",
  subject_id: null,
  teacher_id: "teacher-1",
  day_of_week: 1,
  start_time: "08:00:00",
  end_time: "09:00:00",
  effective_from: "2026-03-01",
  effective_to: "2026-03-31",
  is_active: true,
  notes: null,
  created_by: null,
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
};

describe("buildPlannedSessionsForRange", () => {
  it("generates sessions by weekday and marks holiday state", () => {
    const rows = buildPlannedSessionsForRange({
      templates: [template],
      rangeStart: "2026-03-01",
      rangeEnd: "2026-03-14",
      holidayDates: new Set(["2026-03-09"]),
    });

    // Mondays in range: 2026-03-02 and 2026-03-09
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ session_date: "2026-03-02", state: "planned" });
    expect(rows[1]).toMatchObject({ session_date: "2026-03-09", state: "holiday" });
  });

  it("respects template effective window", () => {
    const rows = buildPlannedSessionsForRange({
      templates: [
        {
          ...template,
          effective_from: "2026-03-10",
          effective_to: "2026-03-10",
        },
      ],
      rangeStart: "2026-03-01",
      rangeEnd: "2026-03-31",
      holidayDates: new Set<string>(),
    });

    // 2026-03-10 is Tuesday while template weekday is Monday => no sessions.
    expect(rows).toHaveLength(0);
  });
});
