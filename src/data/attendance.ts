import type {
  AttendanceEntry,
  AttendanceStatus,
  ClassAttendance,
  AttendanceRecord,
  StudentAttendanceSummary,
  StudentProfile,
} from "@/types/attendance";

type Overrides = Partial<Record<string, AttendanceStatus>>;

const createRecord = (
  students: StudentProfile[],
  date: string,
  overrides: Overrides = {},
  submitted = true
) => ({
  date,
  statuses: students.reduce<Record<string, AttendanceStatus>>((acc, student) => {
    acc[student.id] = overrides[student.id] ?? "present";
    return acc;
  }, {}),
  submitted,
});

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const bukhariStudents: StudentProfile[] = [
  { id: "stu-afifi", name: "Muhammad Afifi Bin Sabri", familyId: "fam-sabri", classId: "bukhari" },
  { id: "stu-furqan", name: "Muhammad Furqon Bin Mohd Saupi", familyId: "fam-furqan", classId: "bukhari" },
  { id: "stu-ossumane", name: "Ossumane Bin Azmir", familyId: "fam-azmir", classId: "bukhari" },
  { id: "stu-zara", name: "Zara Sofea Binti Airul Adiba", familyId: "fam-yusof", classId: "bukhari" },
];

const darimiStudents: StudentProfile[] = [
  { id: "stu-numan", name: "Nu'man Hakim Bin Salleh", familyId: "fam-numan", classId: "darimi" },
  { id: "stu-ammar", name: "Ahmad Ammar Bin Yazid", familyId: "fam-ammar", classId: "darimi" },
  { id: "stu-sarah", name: "Nur Sarah Batrisyia", familyId: "fam-sarah", classId: "darimi" },
  { id: "stu-luqman", name: "Muhammad Luqman Hakim", familyId: "fam-luqman", classId: "darimi" },
];

const muslimStudents: StudentProfile[] = [
  { id: "stu-hakim", name: "Hakim Zhafran Bin Aiman", familyId: "fam-hakim", classId: "muslim" },
  { id: "stu-alya", name: "Alya Batrisyia Binti Yusof", familyId: "fam-yusof", classId: "muslim" },
  { id: "stu-aiman", name: "Aiman Danish Bin Haris", familyId: "fam-aiman", classId: "muslim" },
  { id: "stu-siti", name: "Siti Maryam Binti Azri", familyId: "fam-siti", classId: "muslim" },
];

const tirmidhiStudents: StudentProfile[] = [
  { id: "stu-hannah", name: "Hannah Batrisyia Binti Kassim", familyId: "fam-kassim", classId: "tirmidhi" },
  { id: "stu-aimanah", name: "Aimanah Binti Khalid", familyId: "fam-khalid", classId: "tirmidhi" },
  { id: "stu-irfan", name: "Irfan Danish Bin Shahir", familyId: "fam-irfan", classId: "tirmidhi" },
  { id: "stu-raihan", name: "Raihan Akif Bin Nadzri", familyId: "fam-raihan", classId: "tirmidhi" },
];

export const mockClassAttendance: ClassAttendance[] = [
  {
    id: "bukhari",
    name: "Bukhari",
    students: bukhariStudents,
    records: [
      createRecord(bukhariStudents, "2025-11-17", { "stu-zara": "absent" }),
      createRecord(bukhariStudents, "2025-11-18", { "stu-furqan": "absent" }),
      createRecord(bukhariStudents, "2025-11-19"),
    ],
  },
  {
    id: "darimi",
    name: "Darimi",
    students: darimiStudents,
    records: [
      createRecord(darimiStudents, "2025-11-17", { "stu-sarah": "absent" }),
      createRecord(darimiStudents, "2025-11-18"),
      createRecord(darimiStudents, "2025-11-19", { "stu-luqman": "absent" }),
    ],
  },
  {
    id: "muslim",
    name: "Muslim",
    students: muslimStudents,
    records: [
      createRecord(muslimStudents, "2025-11-17"),
      createRecord(muslimStudents, "2025-11-18", { "stu-alya": "absent", "stu-siti": "absent" }),
      createRecord(muslimStudents, "2025-11-19"),
    ],
  },
  {
    id: "tirmidhi",
    name: "Tirmidhi",
    students: tirmidhiStudents,
    records: [
      createRecord(tirmidhiStudents, "2025-11-17", { "stu-hannah": "absent" }),
      createRecord(tirmidhiStudents, "2025-11-18", { "stu-raihan": "absent" }),
      createRecord(tirmidhiStudents, "2025-11-19", { "stu-irfan": "absent" }),
    ],
  },
];

export const buildInitialAttendanceState = (classes: ClassAttendance[]): AttendanceRecord =>
  classes.reduce<AttendanceRecord>((acc, classItem) => {
    acc[classItem.id] = classItem.records.reduce<Record<string, AttendanceEntry>>((dateAcc, record) => {
      const statuses = { ...record.statuses };
      classItem.students.forEach((student) => {
        if (!statuses[student.id]) {
          statuses[student.id] = "present";
        }
      });
      dateAcc[record.date] = {
        statuses,
        note: record.note,
        submitted: Boolean(record.submitted),
      };
      return dateAcc;
    }, {});
    return acc;
  }, {});

export const createDefaultDailyRecord = (students: StudentProfile[]): AttendanceEntry => ({
  statuses: students.reduce<Record<string, AttendanceStatus>>((acc, student) => {
    acc[student.id] = "present";
    return acc;
  }, {}),
  submitted: false,
});

export const calculateClassDailyStats = (
  state: AttendanceRecord,
  classId: string,
  students: StudentProfile[],
  date: string
) => {
  const classState = state[classId] ?? {};
  const entry = classState[date] ?? createDefaultDailyRecord(students);
  const statuses = entry.statuses;
  const present = students.filter((student) => statuses[student.id] !== "absent").length;
  const absent = students.length - present;
  const percent = students.length ? Math.round((present / students.length) * 100) : 0;
  return {
    present,
    absent,
    percent,
    total: students.length,
    record: statuses,
    submitted: Boolean(entry.submitted),
  };
};

export const calculateOverallDailyStats = (state: AttendanceRecord, classes: ClassAttendance[], date: string) => {
  const totals = classes.reduce(
    (acc, classItem) => {
      const { present, total, submitted } = calculateClassDailyStats(state, classItem.id, classItem.students, date);
      if (!submitted) {
        return acc;
      }
      return {
        present: acc.present + present,
        total: acc.total + total,
      };
    },
    { present: 0, total: 0 }
  );
  const percent = totals.total ? Math.round((totals.present / totals.total) * 100) : 0;
  return { ...totals, percent };
};

interface StudentSummaryOptions {
  startDate?: string | null;
}

export const calculateStudentSummaries = (
  state: AttendanceRecord,
  classes: ClassAttendance[],
  options: StudentSummaryOptions = {}
): StudentAttendanceSummary[] => {
  const startDate = options.startDate ?? null;
  return classes.flatMap((classItem) => {
    const classState = state[classItem.id] ?? {};
    const dates = Object.keys(classState).sort();
    const filteredDates = startDate ? dates.filter((date) => date >= startDate) : dates;

    return classItem.students.map((student) => {
      let presentDays = 0;
      let absentDays = 0;
      let bestPresentStreak = 0;
      let currentStreak = 0;
      let lastAbsentDate: string | undefined;

      filteredDates.forEach((date) => {
        const entry = classState[date];
        if (!entry?.submitted) return;
        const status = entry.statuses?.[student.id] ?? "present";
        if (status === "present") {
          presentDays += 1;
          currentStreak += 1;
          if (currentStreak > bestPresentStreak) {
            bestPresentStreak = currentStreak;
          }
        } else {
          absentDays += 1;
          currentStreak = 0;
          lastAbsentDate = date;
        }
      });

      // Calculate current streak walking backwards
      let backwardsStreak = 0;
      for (let i = filteredDates.length - 1; i >= 0; i -= 1) {
        const date = filteredDates[i];
        const entry = classState[date];
        if (!entry?.submitted) continue;
        const status = entry.statuses?.[student.id] ?? "present";
        if (status === "present") backwardsStreak += 1;
        else break;
      }

      const totalDays = filteredDates.reduce((count, date) => (classState[date]?.submitted ? count + 1 : count), 0);
      const attendancePercent = totalDays ? Math.round((presentDays / totalDays) * 100) : 100;

      return {
        id: student.id,
        name: student.name,
        classId: student.classId,
        className: classItem.name,
        familyId: student.familyId,
        totalDays,
        presentDays,
        absentDays,
        attendancePercent,
        currentPresentStreak: backwardsStreak,
        bestPresentStreak,
        lastAbsentDate,
      };
    });
  });
};

export const getClassAnalyticsForDate = (
  state: AttendanceRecord,
  classes: ClassAttendance[],
  date: string
) =>
  classes.map((classItem) => {
    const { percent, present, total, submitted } = calculateClassDailyStats(
      state,
      classItem.id,
      classItem.students,
      date
    );
    return {
      classId: classItem.id,
      className: classItem.name,
      percent,
      present,
      total,
      submitted,
    };
  });

export const getClassAnalyticsForRange = (
  state: AttendanceRecord,
  classes: ClassAttendance[],
  startDate: string,
  endDate: string
) => {
  const dayList: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (!Number.isNaN(cursor.getTime()) && !Number.isNaN(end.getTime())) {
    while (cursor <= end) {
      dayList.push(toLocalDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Fallback to single day (endDate) if parsing failed or range is empty
  if (!dayList.length) {
    if (!Number.isNaN(end.getTime())) {
      dayList.push(toLocalDateKey(end));
    } else if (!Number.isNaN(cursor.getTime())) {
      dayList.push(toLocalDateKey(cursor));
    } else if (endDate) {
      dayList.push(endDate);
    }
  }

  return classes.map((classItem) => {
    let present = 0;
    let total = 0;
    let submittedDays = 0;
    dayList.forEach((date) => {
      const stats = calculateClassDailyStats(state, classItem.id, classItem.students, date);
      if (!stats.submitted) return;
      present += stats.present;
      total += stats.total;
      submittedDays += 1;
    });
    const percent = total ? Math.round((present / total) * 100) : 0;
    return {
      classId: classItem.id,
      className: classItem.name,
      percent,
      present,
      total,
      daysTracked: submittedDays,
      studentCount: classItem.students.length,
    };
  });
};

export const getStudentHistory = (
  state: AttendanceRecord,
  classId: string,
  studentId: string
): Array<{ date: string; status: AttendanceStatus }> => {
  const classState = state[classId] ?? {};
  return Object.keys(classState)
    .sort((a, b) => (a > b ? -1 : 1))
    .filter((date) => classState[date]?.submitted)
    .map((date) => ({
      date,
      status: classState[date]?.statuses?.[studentId] ?? "present",
    }));
};

export const getFamilyStudents = (classes: ClassAttendance[], familyId: string): StudentProfile[] =>
  classes.flatMap((classItem) => classItem.students.filter((student) => student.familyId === familyId));
