export type AttendanceCanonicalRow = {
  id?: string | null;
  package_id: string;
  session_date: string;
  start_time: string;
  attendance_status: "present" | "absent" | null;
  cancelled_at?: string | null;
};

const markedRank = (row: Pick<AttendanceCanonicalRow, "attendance_status">) =>
  row.attendance_status ? 0 : 1;

const rowSortValue = (row: AttendanceCanonicalRow) =>
  `${row.session_date}|${row.start_time}|${row.id ?? ""}`;

export const attendancePackageDateKey = (
  row: Pick<AttendanceCanonicalRow, "package_id" | "session_date">,
) => `${row.package_id}:${row.session_date}`;

export const attendanceOccurrenceKey = (
  row: Pick<AttendanceOccurrenceRow, "package_slot_id" | "session_date">,
) => `${row.package_slot_id}:${row.session_date}`;

export const attendanceWeekStartKey = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;

  const day = parsed.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + diff);
  return parsed.toISOString().slice(0, 10);
};

export type AttendanceOccurrenceRow = AttendanceCanonicalRow & {
  id?: string | null;
  package_slot_id: string;
};

export const findStaleUnmarkedOccurrenceIds = <T extends AttendanceOccurrenceRow>(
  rows: T[],
  validOccurrenceKeys: ReadonlySet<string>,
  options: {
    forceStaleOccurrenceKeys?: ReadonlySet<string>;
    fromDateKey?: string | null;
  } = {},
) =>
  rows
    .filter((row) => {
      const key = attendanceOccurrenceKey(row);
      return (
        row.id &&
        !row.cancelled_at &&
        !row.attendance_status &&
        !validOccurrenceKeys.has(key) &&
        (options.forceStaleOccurrenceKeys?.has(key) ||
          !options.fromDateKey ||
          row.session_date >= options.fromDateKey)
      );
    })
    .map((row) => row.id as string);

const pickOnePerPackageDate = <T extends AttendanceCanonicalRow>(rows: T[]) => {
  const byPackageDate = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = attendancePackageDateKey(row);
    byPackageDate.set(key, [...(byPackageDate.get(key) ?? []), row]);
  });

  return Array.from(byPackageDate.values()).map((dateRows) =>
    [...dateRows].sort(
      (left, right) =>
        markedRank(left) - markedRank(right) ||
        left.start_time.localeCompare(right.start_time) ||
        String(left.id ?? "").localeCompare(String(right.id ?? "")),
    )[0],
  );
};

export const canonicalizeAttendanceRows = <T extends AttendanceCanonicalRow>(
  rows: T[],
  sessionsPerWeekByPackageId: ReadonlyMap<string, number>,
  options: { currentDateKey?: string | null } = {},
) => {
  const activeRows = rows.filter((row) => !row.cancelled_at);
  const packageDateRows = pickOnePerPackageDate(activeRows);
  const byPackageWeek = new Map<string, T[]>();
  const currentWeekStart = options.currentDateKey
    ? attendanceWeekStartKey(options.currentDateKey)
    : null;

  packageDateRows.forEach((row) => {
    const key = `${row.package_id}:${attendanceWeekStartKey(row.session_date)}`;
    byPackageWeek.set(key, [...(byPackageWeek.get(key) ?? []), row]);
  });

  return Array.from(byPackageWeek.values())
    .flatMap((weekRows) => {
      const packageId = weekRows[0]?.package_id;
      const weekStart = weekRows[0] ? attendanceWeekStartKey(weekRows[0].session_date) : null;
      const limit = packageId ? sessionsPerWeekByPackageId.get(packageId) : undefined;
      if (currentWeekStart && weekStart && weekStart >= currentWeekStart) return weekRows;
      if (!limit || limit <= 0 || weekRows.length <= limit) return weekRows;

      const markedRows = weekRows.filter((row) => row.attendance_status);
      const keepCount = Math.max(limit, markedRows.length);
      return [...weekRows]
        .sort(
          (left, right) =>
            markedRank(left) - markedRank(right) ||
            rowSortValue(left).localeCompare(rowSortValue(right)),
        )
        .slice(0, keepCount);
    })
    .sort((left, right) => rowSortValue(left).localeCompare(rowSortValue(right)));
};
