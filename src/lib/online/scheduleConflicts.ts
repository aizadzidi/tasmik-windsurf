import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDateKey } from "@/lib/online/recurring";

const ACTIVE_PACKAGE_STATUSES = ["active", "pending_payment", "draft"] as const;
const OPEN_ENDED_DATE = "9999-12-31";

type ClientLike = Pick<SupabaseClient, "from">;

type PackageWindowRow = {
  id: string;
  effective_month: string;
  effective_from: string | null;
  effective_to: string | null;
  status: string;
};

type PackageSlotWindowRow = {
  day_of_week_snapshot: number;
  start_time_snapshot: string;
  effective_from: string | null;
  effective_to: string | null;
  status: string;
};

export type TeacherSlotConflictTarget = {
  day_of_week: number;
  start_time: string;
};

const timeKey = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value.slice(0, 8);
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:00`;
};

const packageOverlapsRange = (
  row: PackageWindowRow,
  rangeStart: string,
  rangeEnd: string,
) => {
  if (!ACTIVE_PACKAGE_STATUSES.some((status) => status === row.status)) return false;
  const effectiveFrom = normalizeDateKey(row.effective_from) ?? normalizeDateKey(row.effective_month);
  const effectiveTo = normalizeDateKey(row.effective_to);
  if (effectiveFrom && effectiveFrom > rangeEnd) return false;
  if (effectiveTo && effectiveTo < rangeStart) return false;
  return true;
};

const slotOverlapsRange = (
  row: PackageSlotWindowRow,
  rangeStart: string,
  rangeEnd: string,
) => {
  if (row.status !== "active") return false;
  const effectiveFrom = normalizeDateKey(row.effective_from);
  const effectiveTo = normalizeDateKey(row.effective_to);
  if (effectiveFrom && effectiveFrom > rangeEnd) return false;
  if (effectiveTo && effectiveTo < rangeStart) return false;
  return true;
};

export const hasTeacherSlotConflict = async (
  client: ClientLike,
  params: {
    tenantId: string;
    teacherId: string;
    targetSlots: TeacherSlotConflictTarget[];
    rangeStart: string;
    rangeEnd?: string | null;
    excludePackageIds?: string[];
  },
) => {
  const targetKeys = new Set(
    params.targetSlots.map((slot) => `${slot.day_of_week}:${timeKey(slot.start_time)}`),
  );
  if (targetKeys.size === 0) return false;

  const excludePackageIds = new Set((params.excludePackageIds ?? []).filter(Boolean));
  const rangeEnd = normalizeDateKey(params.rangeEnd) ?? OPEN_ENDED_DATE;
  const rangeStart = normalizeDateKey(params.rangeStart);
  if (!rangeStart) throw new Error("rangeStart must be a valid date.");

  const packagesRes = await client
    .from("online_recurring_packages")
    .select("id, effective_month, effective_from, effective_to, status")
    .eq("tenant_id", params.tenantId)
    .eq("teacher_id", params.teacherId)
    .in("status", [...ACTIVE_PACKAGE_STATUSES]);
  if (packagesRes.error) throw packagesRes.error;

  const packageIds = ((packagesRes.data ?? []) as PackageWindowRow[])
    .filter((row) => !excludePackageIds.has(String(row.id ?? "")))
    .filter((row) => packageOverlapsRange(row, rangeStart, rangeEnd))
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);
  if (packageIds.length === 0) return false;

  const slotsRes = await client
    .from("online_recurring_package_slots")
    .select("day_of_week_snapshot, start_time_snapshot, effective_from, effective_to, status")
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .in("package_id", packageIds);
  if (slotsRes.error) throw slotsRes.error;

  return ((slotsRes.data ?? []) as PackageSlotWindowRow[]).some(
    (slot) =>
      targetKeys.has(`${slot.day_of_week_snapshot}:${timeKey(slot.start_time_snapshot)}`) &&
      slotOverlapsRange(slot, rangeStart, rangeEnd),
  );
};

export const assertNoTeacherSlotConflict = async (
  client: ClientLike,
  params: Parameters<typeof hasTeacherSlotConflict>[1],
) => {
  if (await hasTeacherSlotConflict(client, params)) {
    throw new Error("One or more selected slot times are already scheduled for this teacher.");
  }
};
