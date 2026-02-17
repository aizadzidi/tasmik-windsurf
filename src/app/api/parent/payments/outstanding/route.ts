import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { logPaymentError } from "@/lib/payments/paymentLogging";

const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const asMonthKey = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") {
    return value.slice(0, 7);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 7);
  }
  return null;
};

const toCents = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

const keyForLine = (childId: string, feeId: string, monthKey: string) => `${childId}:${feeId}:${monthKey}`;

const parseLineMonths = (metadata: unknown): string[] => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const candidate = metadata as { months?: unknown };
  if (!Array.isArray(candidate.months)) return [];
  return Array.from(
    new Set(
      candidate.months
        .filter((item): item is string => typeof item === "string")
        .map((month) => month.trim())
        .filter((month) => monthKeyPattern.test(month))
    )
  ).sort();
};

type DueRow = {
  child_id: string | null;
  fee_id: string | null;
  month_key: string | null;
  amount_cents: number | null;
};

type PaymentLineRow = {
  child_id: string | null;
  fee_id: string | null;
  unit_amount_cents: number | null;
  metadata: unknown;
};

type PaymentRow = {
  status: string | null;
  line_items: PaymentLineRow[] | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  const ip = getClientIp(request);
  const limit = await enforceRateLimit({
    key: `payments:outstanding:${auth.tenantId}:${auth.userId}:${ip}`,
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many outstanding balance requests. Please retry shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedParentId = searchParams.get("parentId");
  if (requestedParentId && requestedParentId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data: childRows, error: childError } = await supabaseService
      .from("students")
      .select("id, name")
      .eq("tenant_id", auth.tenantId)
      .eq("parent_id", auth.userId)
      .neq("record_type", "prospect");

    if (childError) throw childError;

    const childIds = (childRows ?? []).map((row) => row.id as string);
    const childNames = Object.fromEntries(
      (childRows ?? []).map((child) => [child.id as string, (child.name as string | null) ?? "Anak"])
    );

    const [dueRes, paymentRes, adjustmentRes] = await Promise.all([
      childIds.length > 0
        ? supabaseService
            .from("due_fee_months")
            .select("child_id, fee_id, month_key, amount_cents")
            .eq("parent_id", auth.userId)
            .in("child_id", childIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseService
        .from("payments")
        .select("status, line_items:payment_line_items(child_id, fee_id, unit_amount_cents, metadata)")
        .eq("tenant_id", auth.tenantId)
        .eq("parent_id", auth.userId)
        .in("status", ["paid", "refunded"]),
      supabaseService
        .from("parent_balance_adjustments")
        .select("child_id, month_key, amount_cents")
        .eq("tenant_id", auth.tenantId)
        .eq("parent_id", auth.userId),
    ]);

    if (dueRes.error) throw dueRes.error;
    if (paymentRes.error) throw paymentRes.error;
    if (adjustmentRes.error) throw adjustmentRes.error;

    const adjustmentMonthsByChild: Record<string, string[]> = {};
    const adjustmentByChild = new Map<string, number>();
    let manualAdjustmentCents = 0;
    (adjustmentRes.data ?? []).forEach((row) => {
      const month = asMonthKey(row.month_key);
      const childKey = (row.child_id as string | null) ?? "manual-adjustment";
      const amount = Number(row.amount_cents ?? 0);
      if (month) {
        const list = adjustmentMonthsByChild[childKey] ?? [];
        adjustmentMonthsByChild[childKey] = Array.from(new Set([...list, month])).sort();
      }
      if (row.child_id) {
        adjustmentByChild.set(childKey, (adjustmentByChild.get(childKey) ?? 0) + amount);
      } else {
        manualAdjustmentCents += amount;
      }
    });

    const dueByKey = new Map<string, number>();
    const dueByChild = new Map<string, number>();
    const dueMonthsByChild = new Map<string, Set<string>>();
    ((dueRes.data ?? []) as DueRow[]).forEach((row) => {
      if (!row.child_id || !row.fee_id) return;
      const month = asMonthKey(row.month_key);
      if (!month) return;
      const dueAmount = toCents(row.amount_cents);
      const key = keyForLine(row.child_id, row.fee_id, month);
      dueByKey.set(key, (dueByKey.get(key) ?? 0) + dueAmount);
      dueByChild.set(row.child_id, (dueByChild.get(row.child_id) ?? 0) + dueAmount);
      const monthSet = dueMonthsByChild.get(row.child_id) ?? new Set<string>();
      monthSet.add(month);
      dueMonthsByChild.set(row.child_id, monthSet);
    });

    const paidByKey = new Map<string, number>();
    ((paymentRes.data ?? []) as PaymentRow[]).forEach((payment) => {
      const sign = payment.status === "refunded" ? -1 : 1;
      (payment.line_items ?? []).forEach((line) => {
        if (!line.child_id || !line.fee_id) return;
        const months = parseLineMonths(line.metadata);
        if (!months.length) return;
        const unitAmount = toCents(line.unit_amount_cents);
        if (unitAmount <= 0) return;
        months.forEach((month) => {
          const key = keyForLine(line.child_id as string, line.fee_id as string, month);
          paidByKey.set(key, (paidByKey.get(key) ?? 0) + sign * unitAmount);
        });
      });
    });

    const paidAgainstDueByChild = new Map<string, number>();
    const outstandingByChild = new Map<string, number>();
    dueByKey.forEach((dueAmount, key) => {
      const [childId] = key.split(":", 1);
      const paidForKey = Math.max(paidByKey.get(key) ?? 0, 0);
      const paidAgainstDue = Math.min(paidForKey, dueAmount);
      const outstanding = Math.max(dueAmount - paidAgainstDue, 0);

      paidAgainstDueByChild.set(childId, (paidAgainstDueByChild.get(childId) ?? 0) + paidAgainstDue);
      outstandingByChild.set(childId, (outstandingByChild.get(childId) ?? 0) + outstanding);
    });

    const childBreakdown: Array<{
      childId: string | null;
      childName: string;
      outstandingCents: number;
      totalDueCents: number;
      totalPaidCents: number;
      totalAdjustmentCents: number;
      dueMonths: string[];
    }> = [];

    childIds.forEach((childId) => {
      const dueMonths = Array.from(dueMonthsByChild.get(childId) ?? []);
      const adjustmentMonths = adjustmentMonthsByChild[childId] ?? [];
      const mergedMonths = Array.from(new Set([...dueMonths, ...adjustmentMonths])).sort();

      const totalDueCents = dueByChild.get(childId) ?? 0;
      const totalPaidCents = paidAgainstDueByChild.get(childId) ?? 0;
      const totalAdjustmentCents = adjustmentByChild.get(childId) ?? 0;
      const outstandingDueCents = outstandingByChild.get(childId) ?? 0;
      const outstandingCents = outstandingDueCents + totalAdjustmentCents;

      if (
        totalDueCents === 0 &&
        totalPaidCents === 0 &&
        totalAdjustmentCents === 0 &&
        outstandingCents === 0 &&
        mergedMonths.length === 0
      ) {
        return;
      }

      childBreakdown.push({
        childId,
        childName: childNames[childId] ?? "Anak",
        outstandingCents,
        totalDueCents,
        totalPaidCents,
        totalAdjustmentCents,
        dueMonths: mergedMonths,
      });
    });

    if (manualAdjustmentCents !== 0 || (adjustmentMonthsByChild["manual-adjustment"] ?? []).length > 0) {
      childBreakdown.push({
        childId: null,
        childName: "Pelarasan Manual",
        outstandingCents: manualAdjustmentCents,
        totalDueCents: 0,
        totalPaidCents: 0,
        totalAdjustmentCents: manualAdjustmentCents,
        dueMonths: adjustmentMonthsByChild["manual-adjustment"] ?? [],
      });
    }

    let earliestDueMonth: string | null = null;
    for (const child of childBreakdown) {
      if ((child.outstandingCents ?? 0) === 0) continue;
      for (const month of child.dueMonths) {
        if (!earliestDueMonth || month < earliestDueMonth) earliestDueMonth = month;
      }
    }

    let totalOutstandingCents = 0;
    let totalDueCents = 0;
    let totalPaidCents = 0;
    let totalAdjustmentCents = 0;
    for (const child of childBreakdown) {
      totalOutstandingCents += child.outstandingCents ?? 0;
      totalDueCents += child.totalDueCents ?? 0;
      totalPaidCents += child.totalPaidCents ?? 0;
      totalAdjustmentCents += child.totalAdjustmentCents ?? 0;
    }

    return NextResponse.json({
      totalOutstandingCents,
      totalDueCents,
      totalPaidCents,
      totalAdjustmentCents,
      earliestDueMonth,
      childBreakdown,
    });
  } catch (error: unknown) {
    logPaymentError("parent-payments-outstanding", error);
    return NextResponse.json({ error: "Gagal mendapatkan baki tertunggak" }, { status: 500 });
  }
}
