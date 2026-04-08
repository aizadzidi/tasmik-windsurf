/**
 * Shared business day calculation utilities.
 * Extracted from duplicated implementations in teacher/leave and juz-test-schedule.
 */

/**
 * Count business days (Mon-Fri) between two dates, inclusive.
 */
export function countBusinessDays(start: string, end: string): number {
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

/**
 * Count business days of a leave period that fall within a specific month.
 * Clamps the leave period to month boundaries before counting.
 */
export function countBusinessDaysInMonth(
  leaveStart: string,
  leaveEnd: string,
  monthStart: Date,
  monthEnd: Date
): number {
  const ls = new Date(leaveStart + "T00:00:00Z");
  const le = new Date(leaveEnd + "T00:00:00Z");
  const ms = new Date(monthStart.toISOString().split("T")[0] + "T00:00:00Z");
  const me = new Date(monthEnd.toISOString().split("T")[0] + "T00:00:00Z");

  const effectiveStart = ls > ms ? ls : ms;
  const effectiveEnd = le < me ? le : me;

  if (effectiveStart > effectiveEnd) return 0;

  let count = 0;
  const current = new Date(effectiveStart);
  while (current <= effectiveEnd) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

/**
 * Get the first and last day of a month from a YYYY-MM string.
 */
export function getMonthBounds(monthStr: string): { start: Date; end: Date } {
  const [year, month] = monthStr.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0)),
  };
}

/**
 * Format a Date as YYYY-MM-DD string.
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}
