import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabaseServiceClient';
import { requireAdminPermission } from '@/lib/adminPermissions';
import { logPaymentError } from '@/lib/payments/paymentLogging';

const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const asMonthKey = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 7);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 7);
  return null;
};

const toCents = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

const keyForLine = (parentId: string, childId: string, feeId: string, monthKey: string) =>
  `${parentId}:${childId}:${feeId}:${monthKey}`;

const parseLineMonths = (metadata: unknown): string[] => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const candidate = metadata as { months?: unknown };
  if (!Array.isArray(candidate.months)) return [];
  return Array.from(
    new Set(
      candidate.months
        .filter((item): item is string => typeof item === 'string')
        .map((month) => month.trim())
        .filter((month) => monthKeyPattern.test(month))
    )
  ).sort();
};

type DueRow = {
  parent_id: string | null;
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
  parent_id: string | null;
  status: string | null;
  total_amount_cents: number | null;
  line_items: PaymentLineRow[] | null;
};

type AdjustmentRow = {
  month_key: string | null;
  amount_cents: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { data: profileRows, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('user_id')
      .eq('tenant_id', guard.tenantId)
      .eq('role', 'parent')
      .limit(5000);
    if (profileError) throw profileError;

    const parentIds = Array.from(
      new Set((profileRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)))
    );
    if (!parentIds.length) {
      return NextResponse.json({
        summary: {
          totalOutstandingCents: 0,
          totalDueCents: 0,
          totalPaidAgainstDueCents: 0,
          totalAdjustmentsCents: 0,
          totalCollectedCents: 0,
        },
        monthlyLedger: [],
      });
    }

    const [{ data: dueRows, error: dueError }, { data: paymentRows, error: paymentError }, { data: adjustmentMonthlyRows, error: adjustmentMonthlyError }] = await Promise.all([
      supabaseService
        .from('due_fee_months')
        .select('parent_id, child_id, fee_id, month_key, amount_cents')
        .in('parent_id', parentIds),
      supabaseService
        .from('payments')
        .select('parent_id, status, total_amount_cents, line_items:payment_line_items(child_id, fee_id, unit_amount_cents, metadata)')
        .eq('tenant_id', guard.tenantId)
        .in('parent_id', parentIds)
        .in('status', ['paid', 'refunded']),
      supabaseService
        .from('parent_balance_adjustments')
        .select('month_key, amount_cents')
        .eq('tenant_id', guard.tenantId)
        .in('parent_id', parentIds),
    ]);

    if (dueError) throw dueError;
    if (paymentError) throw paymentError;
    if (adjustmentMonthlyError) throw adjustmentMonthlyError;

    const dueByKey = new Map<string, number>();
    const dueByMonth = new Map<string, number>();
    ((dueRows ?? []) as DueRow[]).forEach((row) => {
      if (!row.parent_id || !row.child_id || !row.fee_id) return;
      const month = asMonthKey(row.month_key);
      if (!month) return;
      const dueAmount = toCents(row.amount_cents);
      const key = keyForLine(row.parent_id, row.child_id, row.fee_id, month);
      dueByKey.set(key, (dueByKey.get(key) ?? 0) + dueAmount);
      dueByMonth.set(month, (dueByMonth.get(month) ?? 0) + dueAmount);
    });

    const paidByKey = new Map<string, number>();
    let totalCollectedCents = 0;
    ((paymentRows ?? []) as PaymentRow[]).forEach((payment) => {
      if (!payment.parent_id) return;
      if (payment.status === 'paid') {
        totalCollectedCents += Number(payment.total_amount_cents ?? 0);
      }

      const sign = payment.status === 'refunded' ? -1 : 1;
      (payment.line_items ?? []).forEach((line) => {
        if (!line.child_id || !line.fee_id) return;
        const months = parseLineMonths(line.metadata);
        if (!months.length) return;
        const unitAmount = toCents(line.unit_amount_cents);
        if (unitAmount <= 0) return;
        months.forEach((month) => {
          const key = keyForLine(payment.parent_id as string, line.child_id as string, line.fee_id as string, month);
          paidByKey.set(key, (paidByKey.get(key) ?? 0) + sign * unitAmount);
        });
      });
    });

    let totalDueCents = 0;
    let totalPaidAgainstDueCents = 0;
    let totalDueOutstandingCents = 0;
    const paidByMonth = new Map<string, number>();
    const dueOutstandingByMonth = new Map<string, number>();

    dueByKey.forEach((dueAmount, key) => {
      const month = key.split(':').pop() ?? '';
      const paidForKey = Math.max(paidByKey.get(key) ?? 0, 0);
      const paidAgainstDue = Math.min(paidForKey, dueAmount);
      const dueOutstanding = Math.max(dueAmount - paidAgainstDue, 0);

      totalDueCents += dueAmount;
      totalPaidAgainstDueCents += paidAgainstDue;
      totalDueOutstandingCents += dueOutstanding;
      paidByMonth.set(month, (paidByMonth.get(month) ?? 0) + paidAgainstDue);
      dueOutstandingByMonth.set(month, (dueOutstandingByMonth.get(month) ?? 0) + dueOutstanding);
    });

    const totalAdjustmentsCents = ((adjustmentMonthlyRows ?? []) as AdjustmentRow[]).reduce(
      (sum, row) => sum + Number(row.amount_cents ?? 0),
      0
    );
    const totalOutstandingCents = totalDueOutstandingCents + totalAdjustmentsCents;

    const adjustmentsByMonth = new Map<string, number>();
    ((adjustmentMonthlyRows ?? []) as AdjustmentRow[]).forEach((row) => {
      const month = asMonthKey(row.month_key);
      if (!month) return;
      adjustmentsByMonth.set(month, (adjustmentsByMonth.get(month) ?? 0) + Number(row.amount_cents ?? 0));
    });

    const monthKeys = Array.from(
      new Set([
        ...dueByMonth.keys(),
        ...paidByMonth.keys(),
        ...dueOutstandingByMonth.keys(),
        ...adjustmentsByMonth.keys(),
      ])
    ).sort();

    const monthlyLedger = monthKeys.map((month) => {
      const dueCents = dueByMonth.get(month) ?? 0;
      const paidCents = paidByMonth.get(month) ?? 0;
      const dueOutstandingCents = dueOutstandingByMonth.get(month) ?? 0;
      const adjustmentCents = adjustmentsByMonth.get(month) ?? 0;
      const outstandingCents = dueOutstandingCents + adjustmentCents;
      return {
        month,
        dueCents,
        paidCents,
        adjustmentCents,
        outstandingCents,
        collectedCents: Math.max(paidCents, 0),
      };
    });

    return NextResponse.json({
      summary: {
        totalOutstandingCents,
        totalDueCents,
        totalPaidAgainstDueCents,
        totalAdjustmentsCents,
        totalCollectedCents,
      },
      monthlyLedger,
    });
  } catch (error: unknown) {
    logPaymentError('admin-payments-summary', error);
    return NextResponse.json({ error: 'Failed to load payments summary' }, { status: 500 });
  }
}
