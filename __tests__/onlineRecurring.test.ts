import { afterEach, describe, expect, it, vi } from "vitest";
import { nextMonthKey } from "@/lib/online/recurring";
import {
  buildAvailabilityDayRanges,
  buildCanonicalEnrollmentStartTimes,
  buildMissingEnrollmentTemplateRows,
  ENROLLMENT_AVAILABILITY_DAY_SEQUENCE,
} from "@/lib/online/availabilityRanges";
import {
  attendanceOccurrenceKey,
  canonicalizeAttendanceRows,
  findStaleUnmarkedOccurrenceIds,
} from "@/lib/online/attendanceRows";
import { buildOccurrencesForMonth, fetchAllPagedRows } from "@/lib/online/recurringStore";
import { hasTeacherSlotConflict } from "@/lib/online/scheduleConflicts";
import {
  createTeacherRecurringSchedule,
  fillPackageSlots,
  moveRecurringPackageSlotFromNextOccurrence,
  normalizeTeacherScheduleSlots,
  resolveCurrentWeekReplacementCutover,
  resolveReplacementEffectiveFrom,
  resolveSlotReplacementEffectiveFrom,
} from "@/lib/online/scheduling";
import type { OnlinePlannerPackage } from "@/lib/online/recurring";
import type { OnlineSlotTemplate } from "@/types/online";

type MockQueryResponse = {
  data?: unknown;
  error?: { message?: string } | null;
};

type MockQueryCall = {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  selected?: string;
  filters: Array<{ method: string; args: unknown[] }>;
};

const createQueuedClient = (responsesByTable: Record<string, MockQueryResponse[]>) => {
  const calls: MockQueryCall[] = [];
  const nextResponse = (table: string) => {
    const response = responsesByTable[table]?.shift();
    if (!response) throw new Error(`No mocked response for ${table}`);
    return {
      data: response.data ?? null,
      error: response.error ?? null,
    };
  };

  const client = {
    from(table: string) {
      const call: MockQueryCall = {
        table,
        action: "select",
        filters: [],
      };
      const finish = () => {
        calls.push(call);
        return Promise.resolve(nextResponse(table));
      };
      const recordFilter = (method: string, args: unknown[]) => {
        call.filters.push({ method, args });
        return builder;
      };
      const builder = {
        select(columns?: string) {
          call.selected = columns;
          return builder;
        },
        insert(payload: unknown) {
          call.action = "insert";
          call.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          call.action = "update";
          call.payload = payload;
          return builder;
        },
        upsert(payload: unknown) {
          call.action = "upsert";
          call.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          return recordFilter("eq", [column, value]);
        },
        neq(column: string, value: unknown) {
          return recordFilter("neq", [column, value]);
        },
        in(column: string, value: unknown) {
          return recordFilter("in", [column, value]);
        },
        is(column: string, value: unknown) {
          return recordFilter("is", [column, value]);
        },
        gte(column: string, value: unknown) {
          return recordFilter("gte", [column, value]);
        },
        lt(column: string, value: unknown) {
          return recordFilter("lt", [column, value]);
        },
        lte(column: string, value: unknown) {
          return recordFilter("lte", [column, value]);
        },
        order(column: string, options?: unknown) {
          return recordFilter("order", [column, options]);
        },
        limit(value: number) {
          return recordFilter("limit", [value]);
        },
        range(from: number, to: number) {
          return recordFilter("range", [from, to]);
        },
        maybeSingle() {
          return finish();
        },
        single() {
          return finish();
        },
        then<TResult1 = MockQueryResponse, TResult2 = never>(
          onfulfilled?: ((value: MockQueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return finish().then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  };

  return { client, calls };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("nextMonthKey", () => {
  it("rolls December over to January of the next year", () => {
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });

  it("increments regular months without changing the year", () => {
    expect(nextMonthKey("2026-03")).toBe("2026-04");
  });
});

describe("online schedule effective windows", () => {
  const template = (id: string, day: number, startTime: string): OnlineSlotTemplate => ({
    id,
    tenant_id: "tenant-1",
    course_id: "course-1",
    day_of_week: day,
    start_time: startTime,
    duration_minutes: 30,
    timezone: "Asia/Kuala_Lumpur",
    is_active: true,
  });

  const plannerPackage = (slots: OnlinePlannerPackage["slots"]): OnlinePlannerPackage => ({
    id: "package-1",
    tenant_id: "tenant-1",
    student_id: "student-1",
    course_id: "course-1",
    teacher_id: "teacher-1",
    student_package_assignment_id: "assignment-1",
    status: "active",
    source: "test",
    effective_month: "2026-06-01",
    effective_from: "2026-06-01",
    effective_to: null,
    sessions_per_week: slots.length,
    monthly_fee_cents_snapshot: 10000,
    notes: null,
    hold_expires_at: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    student_name: "Student",
    parent_name: null,
    parent_contact_number: null,
    course_name: "Course",
    slots,
  });

  it("rejects duplicate weekdays in one package schedule", () => {
    expect(() =>
      normalizeTeacherScheduleSlots([
        { day_of_week: 2, start_time: "08:00" },
        { day_of_week: 2, start_time: "09:00" },
      ]),
    ).toThrow("more than one slot on the same weekday");
  });

  it("keeps present today on the old slot and moves unmarked or absent today", () => {
    expect(
      resolveSlotReplacementEffectiveFrom({
        todayKey: "2026-06-11",
        todayOccurrences: [{ attendance_status: "present" }],
      }),
    ).toBe("2026-06-12");

    expect(
      resolveSlotReplacementEffectiveFrom({
        todayKey: "2026-06-11",
        todayOccurrences: [{ attendance_status: null }],
      }),
    ).toBe("2026-06-11");

    expect(
      resolveSlotReplacementEffectiveFrom({
        todayKey: "2026-06-11",
        todayOccurrences: [{ attendance_status: "absent" }],
      }),
    ).toBe("2026-06-11");
  });

  it("uses the selected future month as the replacement start without touching today", async () => {
    const client = {
      from: () => {
        throw new Error("today occurrences should not be queried for future-month changes");
      },
    };

    await expect(
      resolveReplacementEffectiveFrom({
        client: client as never,
        tenantId: "tenant-1",
        packageSlotIds: ["slot-1"],
        timestamp: "2026-06-15T09:00:00.000Z",
        earliestEffectiveFrom: "2026-07-01",
      }),
    ).resolves.toBe("2026-07-01");
  });

  it("rejects expired package slots before moving them", async () => {
    const queriedTables: string[] = [];
    const client = {
      from: (table: string) => {
        queriedTables.push(table);
        if (table !== "online_recurring_package_slots") {
          throw new Error(`unexpected query: ${table}`);
        }

        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: "slot-expired",
                package_id: "package-1",
                slot_template_id: "template-old",
                day_of_week_snapshot: 2,
                start_time_snapshot: "08:00:00",
                duration_minutes_snapshot: 30,
                status: "active",
                effective_from: "2020-01-01",
                effective_to: "2020-01-31",
              },
              error: null,
            });
          },
        };
      },
    };

    await expect(
      moveRecurringPackageSlotFromNextOccurrence(client as never, {
        tenantId: "tenant-1",
        packageSlotId: "slot-expired",
        targetSlotTemplateId: "template-new",
        actorUserId: "teacher-1",
      }),
    ).rejects.toThrow("Package slot not found.");
    expect(queriedTables).toEqual(["online_recurring_package_slots"]);
  });

  it("keeps the package start and end date when rescheduling an existing package slot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));

    const { client, calls } = createQueuedClient({
      online_student_package_assignments: [
        {
          data: {
            id: "assignment-1",
            student_id: "student-1",
            course_id: "course-1",
            teacher_id: "teacher-1",
            status: "active",
            effective_from: "2026-06-01",
            effective_to: "2026-07-31",
            sessions_per_week_snapshot: 1,
            duration_minutes_snapshot: 30,
            monthly_fee_cents_snapshot: 10000,
          },
        },
      ],
      online_slot_templates: [
        {
          data: [
            {
              id: "template-new",
              course_id: "course-1",
              day_of_week: 3,
              start_time: "09:00:00",
              duration_minutes: 30,
            },
          ],
        },
      ],
      online_recurring_packages: [
        {
          data: [
            {
              id: "package-1",
              student_id: "student-1",
              course_id: "course-1",
              teacher_id: "teacher-1",
              student_package_assignment_id: "assignment-1",
              effective_month: "2026-06-01",
              effective_from: "2026-06-01",
              effective_to: "2026-07-31",
              status: "active",
            },
          ],
        },
        { data: { id: "package-1", effective_to: "2026-07-31" } },
      ],
      online_recurring_package_slots: [
        {
          data: [
            {
              package_id: "package-1",
              effective_from: "2026-07-01",
              effective_to: "2026-07-31",
              status: "active",
            },
          ],
        },
        {
          data: [
            {
              id: "slot-old",
              slot_template_id: "template-old",
              day_of_week_snapshot: 2,
              start_time_snapshot: "08:00:00",
              duration_minutes_snapshot: 30,
              status: "active",
              effective_from: "2026-07-01",
              effective_to: "2026-07-31",
            },
          ],
        },
        { data: [{ id: "slot-old", effective_from: "2026-07-01" }] },
        { data: null },
        { data: null },
        {
          data: [
            {
              id: "slot-new",
              effective_from: "2026-07-01",
              effective_to: "2026-07-31",
            },
          ],
        },
      ],
      online_recurring_occurrences: [
        { data: null },
        { data: null },
      ],
      online_teacher_slot_preferences: [
        { data: [] },
        { data: [] },
        { data: null },
      ],
    });

    await createTeacherRecurringSchedule(client as never, {
      tenantId: "tenant-1",
      teacherId: "teacher-1",
      assignmentId: "assignment-1",
      month: "2026-07",
      slots: [{ day_of_week: 3, start_time: "09:00" }],
    });

    expect(
      calls.find(
        (call) => call.table === "online_recurring_packages" && call.action === "update",
      )?.payload,
    ).toEqual(expect.objectContaining({
      effective_from: "2026-06-01",
      effective_to: "2026-07-31",
    }));
    expect(
      calls.find(
        (call) => call.table === "online_recurring_package_slots" && call.action === "insert",
      )?.payload,
    ).toEqual([expect.objectContaining({ effective_to: "2026-07-31" })]);
  });

  it("allows filling a finite package when a same-time future slot does not overlap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));

    const { client, calls } = createQueuedClient({
      online_recurring_packages: [
        {
          data: {
            id: "package-current",
            student_id: "student-1",
            course_id: "course-1",
            teacher_id: "teacher-1",
            student_package_assignment_id: null,
            status: "active",
            effective_month: "2026-07-01",
            effective_from: "2026-07-01",
            effective_to: "2026-07-31",
            sessions_per_week: 1,
            monthly_fee_cents_snapshot: 10000,
          },
        },
        {
          data: [
            {
              id: "package-future",
              effective_month: "2026-09-01",
              effective_to: null,
            },
          ],
        },
      ],
      online_recurring_package_slots: [
        { data: [] },
        {
          data: [
            {
              id: "slot-future",
              day_of_week_snapshot: 1,
              start_time_snapshot: "08:00:00",
              effective_from: "2026-09-01",
              effective_to: null,
              status: "active",
            },
          ],
        },
        {
          data: [
            {
              id: "slot-current",
              effective_from: "2026-07-01",
              effective_to: "2026-07-31",
            },
          ],
        },
      ],
      online_slot_templates: [
        {
          data: [
            {
              id: "template-current",
              course_id: "course-1",
              day_of_week: 1,
              start_time: "08:00:00",
              duration_minutes: 30,
            },
          ],
        },
      ],
      online_teacher_slot_preferences: [
        { data: [] },
        { data: null },
      ],
    });

    await expect(
      fillPackageSlots(client as never, {
        tenantId: "tenant-1",
        teacherId: "teacher-1",
        packageId: "package-current",
        slots: [{ day_of_week: 1, start_time: "08:00" }],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        package_id: "package-current",
        total_active_slots: 1,
      }),
    );
    expect(
      calls.find(
        (call) => call.table === "online_recurring_package_slots" && call.action === "insert",
      )?.payload,
    ).toEqual([expect.objectContaining({ effective_to: "2026-07-31" })]);
  });

  it("cuts over an unmarked old slot earlier in the current week to avoid over-scheduling", () => {
    expect(
      resolveCurrentWeekReplacementCutover({
        tentativeEffectiveFrom: "2026-06-12",
        sessionsPerWeek: 3,
        oldSlots: [{ id: "old-tue", day_of_week: 2 }],
        targetDaysOfWeek: [5],
        weekOccurrences: [
          { package_slot_id: "mon", session_date: "2026-06-08", attendance_status: null },
          { package_slot_id: "old-tue", session_date: "2026-06-09", attendance_status: null },
          { package_slot_id: "thu", session_date: "2026-06-11", attendance_status: null },
        ],
      }),
    ).toEqual({
      effectiveFrom: "2026-06-12",
      currentWeekCutoverSlotIds: ["old-tue"],
    });
  });

  it("delays replacement to next week when the current-week old slot is already present", () => {
    expect(
      resolveCurrentWeekReplacementCutover({
        tentativeEffectiveFrom: "2026-06-12",
        sessionsPerWeek: 3,
        oldSlots: [{ id: "old-tue", day_of_week: 2 }],
        targetDaysOfWeek: [5],
        weekOccurrences: [
          { package_slot_id: "mon", session_date: "2026-06-08", attendance_status: null },
          { package_slot_id: "old-tue", session_date: "2026-06-09", attendance_status: "present" },
          { package_slot_id: "thu", session_date: "2026-06-11", attendance_status: null },
        ],
      }),
    ).toEqual({
      effectiveFrom: "2026-06-15",
      currentWeekCutoverSlotIds: [],
    });
  });

  it("generates occurrences only inside each package slot effective window", () => {
    const oldTemplate = template("old-tue", 2, "08:00:00");
    const newTemplate = template("new-tue", 2, "09:00:00");
    const rows = buildOccurrencesForMonth({
      packages: [
        plannerPackage([
          {
            id: "slot-old",
            tenant_id: "tenant-1",
            package_id: "package-1",
            slot_template_id: oldTemplate.id,
            day_of_week_snapshot: 2,
            start_time_snapshot: "08:00:00",
            duration_minutes_snapshot: 30,
            status: "active",
            effective_from: "2026-06-01",
            effective_to: "2026-06-10",
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-10T00:00:00.000Z",
          },
          {
            id: "slot-new",
            tenant_id: "tenant-1",
            package_id: "package-1",
            slot_template_id: newTemplate.id,
            day_of_week_snapshot: 2,
            start_time_snapshot: "09:00:00",
            duration_minutes_snapshot: 30,
            status: "active",
            effective_from: "2026-06-11",
            effective_to: null,
            created_at: "2026-06-11T00:00:00.000Z",
            updated_at: "2026-06-11T00:00:00.000Z",
          },
        ]),
      ],
      monthKey: "2026-06",
      templateById: new Map([
        [oldTemplate.id, oldTemplate],
        [newTemplate.id, newTemplate],
      ]),
    });

    expect(rows.map((row) => `${row.package_slot_id}:${row.session_date}`)).toEqual([
      "slot-old:2026-06-02",
      "slot-old:2026-06-09",
      "slot-new:2026-06-16",
      "slot-new:2026-06-23",
      "slot-new:2026-06-30",
    ]);
  });

  it("detects overlapping teacher slot conflicts outside excluded packages", async () => {
    const { client } = createQueuedClient({
      online_recurring_packages: [
        {
          data: [
            {
              id: "current-package",
              effective_month: "2026-06-01",
              effective_from: "2026-06-01",
              effective_to: null,
              status: "active",
            },
            {
              id: "conflicting-package",
              effective_month: "2026-08-01",
              effective_from: "2026-08-01",
              effective_to: null,
              status: "active",
            },
            {
              id: "past-package",
              effective_month: "2026-05-01",
              effective_from: "2026-05-01",
              effective_to: "2026-06-30",
              status: "active",
            },
          ],
        },
      ],
      online_recurring_package_slots: [
        {
          data: [
            {
              day_of_week_snapshot: 2,
              start_time_snapshot: "09:00:00",
              effective_from: "2026-08-01",
              effective_to: null,
              status: "active",
            },
          ],
        },
      ],
    });

    await expect(
      hasTeacherSlotConflict(client as never, {
        tenantId: "tenant-1",
        teacherId: "teacher-1",
        targetSlots: [{ day_of_week: 2, start_time: "09:00" }],
        rangeStart: "2026-07-01",
        rangeEnd: null,
        excludePackageIds: ["current-package"],
      }),
    ).resolves.toBe(true);
  });
});

describe("online recurring snapshot pagination", () => {
  it("keeps fetching after Supabase returns a full 1000-row page", async () => {
    const calls: Array<[number, number]> = [];
    const firstPage = Array.from({ length: 1000 }, (_, index) => index);
    const secondPage = [1000];

    const response = await fetchAllPagedRows<number>(async (from, to) => {
      calls.push([from, to]);
      if (from === 0) return { data: firstPage, error: null };
      return { data: secondPage, error: null };
    });

    expect(response.error).toBeNull();
    expect(response.data).toHaveLength(1001);
    expect(response.data.at(-1)).toBe(1000);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("online attendance row canonicalization", () => {
  it("prefers marked historical rows and caps rows to package sessions per week", () => {
    const rows = canonicalizeAttendanceRows(
      [
        {
          id: "old-mon",
          package_id: "package-1",
          session_date: "2026-05-04",
          start_time: "08:00:00",
          attendance_status: "present",
        },
        {
          id: "old-tue",
          package_id: "package-1",
          session_date: "2026-05-05",
          start_time: "08:00:00",
          attendance_status: "present",
        },
        {
          id: "old-wed",
          package_id: "package-1",
          session_date: "2026-05-06",
          start_time: "08:00:00",
          attendance_status: "present",
        },
        {
          id: "new-thu",
          package_id: "package-1",
          session_date: "2026-05-07",
          start_time: "09:00:00",
          attendance_status: null,
        },
      ],
      new Map([["package-1", 3]]),
    );

    expect(rows.map((row) => row.id)).toEqual(["old-mon", "old-tue", "old-wed"]);
  });

  it("deduplicates same-package same-date rows before display", () => {
    const rows = canonicalizeAttendanceRows(
      [
        {
          id: "unmarked-new",
          package_id: "package-1",
          session_date: "2026-05-12",
          start_time: "09:00:00",
          attendance_status: null,
        },
        {
          id: "marked-old",
          package_id: "package-1",
          session_date: "2026-05-12",
          start_time: "08:00:00",
          attendance_status: "present",
        },
      ],
      new Map([["package-1", 3]]),
    );

    expect(rows.map((row) => row.id)).toEqual(["marked-old"]);
  });

  it("finds only unmarked invalid occurrence rows from the cleanup window onward", () => {
    const validRow = {
      id: "valid",
      package_id: "package-1",
      package_slot_id: "slot-valid",
      session_date: "2026-06-12",
      start_time: "09:00:00",
      attendance_status: null,
    };
    const staleCurrentWeek = {
      id: "stale-current",
      package_id: "package-1",
      package_slot_id: "slot-old",
      session_date: "2026-06-09",
      start_time: "09:00:00",
      attendance_status: null,
    };
    const stalePastHistory = {
      id: "stale-past",
      package_id: "package-1",
      package_slot_id: "slot-old",
      session_date: "2026-05-26",
      start_time: "09:00:00",
      attendance_status: null,
    };
    const markedStale = {
      id: "marked-stale",
      package_id: "package-1",
      package_slot_id: "slot-old",
      session_date: "2026-06-16",
      start_time: "09:00:00",
      attendance_status: "present" as const,
    };

    expect(
      findStaleUnmarkedOccurrenceIds(
        [validRow, staleCurrentWeek, stalePastHistory, markedStale],
        new Set([attendanceOccurrenceKey(validRow)]),
        { fromDateKey: "2026-06-08" },
      ),
    ).toEqual(["stale-current"]);

    expect(
      findStaleUnmarkedOccurrenceIds(
        [validRow, staleCurrentWeek, stalePastHistory, markedStale],
        new Set([attendanceOccurrenceKey(validRow)]),
        {
          forceStaleOccurrenceKeys: new Set([attendanceOccurrenceKey(stalePastHistory)]),
          fromDateKey: "2026-06-08",
        },
      ),
    ).toEqual(["stale-current", "stale-past"]);
  });
});

describe("online availability day ranges", () => {
  it("uses the canonical 5 AM to 11 PM range for every day", () => {
    const ranges = buildAvailabilityDayRanges([]);
    const startTimes = buildCanonicalEnrollmentStartTimes();

    expect(startTimes).toHaveLength(37);
    expect(startTimes[0]).toBe("05:00:00");
    expect(startTimes.at(-1)).toBe("23:00:00");
    expect(ranges).toEqual(
      ENROLLMENT_AVAILABILITY_DAY_SEQUENCE.map((dayOfWeek) => ({
        day_of_week: dayOfWeek,
        start_time: "05:00:00",
        end_time: "23:00:00",
        timezone: "Asia/Kuala_Lumpur",
      })),
    );
  });

  it("fills missing canonical templates for every active course", () => {
    const templates = [
      { course_id: "course-1", day_of_week: 1, start_time: "05:00:00", duration_minutes: 30 },
      { course_id: "course-1", day_of_week: 0, start_time: "23:00:00", duration_minutes: 30 },
      { course_id: "course-2", day_of_week: 5, start_time: "10:00:00", duration_minutes: 30 },
      { course_id: "course-2", day_of_week: 1, start_time: "04:30:00", duration_minutes: 30 },
    ].map((row, index) => ({
      id: `template-${index}`,
      timezone: "Asia/Kuala_Lumpur",
      is_active: index !== 2,
      ...row,
    }));
    const ranges = buildAvailabilityDayRanges(templates);
    const rows = buildMissingEnrollmentTemplateRows({
      tenantId: "tenant-1",
      courseIds: ["course-1", "course-2", "course-3"],
      templates,
      dayRanges: ranges,
    });
    const rowKeys = rows.map((row) => `${row.course_id}:${row.day_of_week}:${row.start_time}`);
    const slotsPerCourse = ENROLLMENT_AVAILABILITY_DAY_SEQUENCE.length *
      buildCanonicalEnrollmentStartTimes().length;

    expect(rows).toHaveLength(slotsPerCourse * 3 - 3);
    expect(rowKeys).not.toContain("course-1:1:05:00:00");
    expect(rowKeys).not.toContain("course-1:0:23:00:00");
    expect(rowKeys).not.toContain("course-2:5:10:00:00");
    expect(rowKeys).toContain("course-3:4:05:00:00");
    expect(rowKeys).toContain("course-3:0:23:00:00");
    expect(rowKeys).not.toContain("course-2:1:04:30:00");
  });
});
