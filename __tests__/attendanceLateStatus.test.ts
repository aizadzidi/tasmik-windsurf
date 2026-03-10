import { describe, expect, it } from "vitest";
import {
  calculateClassDailyStats,
  calculateStudentSummaries,
  createDefaultDailyRecord,
} from "@/data/attendance";
import type { AttendanceRecord, ClassAttendance } from "@/types/attendance";

describe("attendance late status handling", () => {
  it("treats late as present in class daily stats", () => {
    const classes: ClassAttendance[] = [
      {
        id: "class-1",
        name: "Class 1",
        students: [
          { id: "student-1", name: "A", familyId: "fam-1", classId: "class-1" },
          { id: "student-2", name: "B", familyId: "fam-2", classId: "class-1" },
        ],
        records: [],
      },
    ];

    const state: AttendanceRecord = {
      "class-1": {
        "2026-02-27": {
          ...createDefaultDailyRecord(classes[0].students),
          submitted: true,
          statuses: {
            "student-1": "late",
            "student-2": "absent",
          },
        },
      },
    };

    const stats = calculateClassDailyStats(state, "class-1", classes[0].students, "2026-02-27");

    expect(stats.present).toBe(1);
    expect(stats.absent).toBe(1);
    expect(stats.percent).toBe(50);
  });

  it("counts late as non-absent in student summary", () => {
    const classes: ClassAttendance[] = [
      {
        id: "class-1",
        name: "Class 1",
        students: [{ id: "student-1", name: "A", familyId: "fam-1", classId: "class-1" }],
        records: [],
      },
    ];

    const state: AttendanceRecord = {
      "class-1": {
        "2026-02-20": { statuses: { "student-1": "late" }, submitted: true },
        "2026-02-21": { statuses: { "student-1": "absent" }, submitted: true },
        "2026-02-22": { statuses: { "student-1": "present" }, submitted: true },
      },
    };

    const summaries = calculateStudentSummaries(state, classes);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].presentDays).toBe(2);
    expect(summaries[0].absentDays).toBe(1);
    expect(summaries[0].attendancePercent).toBe(67);
  });
});
