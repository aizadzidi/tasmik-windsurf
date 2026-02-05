import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { requireAdminPermission } from '@/lib/adminPermissions';

const asMonthKey = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    // supports "YYYY-MM" or "YYYY-MM-DD"
    return value.slice(0, 7);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 7);
  }
  return null;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const data = await adminOperationSimple(async client => {
      const [
        { data: outstandingRows, error: outstandingError },
        { data: paidRows, error: paidError },
        { data: dueMonthlyRows, error: dueMonthlyError },
        { data: paidMonthlyRows, error: paidMonthlyError },
        { data: adjustmentMonthlyRows, error: adjustmentMonthlyError }
      ] = await Promise.all([
        client
          .from('parent_outstanding_summary')
          .select('outstanding_cents, total_due_cents, total_paid_cents, total_adjustment_cents'),
        client.from('payments').select('total_amount_cents').eq('status', 'paid'),
        client.from('due_fee_months').select('month_key, amount_cents'),
        client.from('paid_line_items').select('month_key, signed_amount_cents'),
        client.from('parent_balance_adjustments').select('month_key, amount_cents')
      ]);

      if (outstandingError) throw outstandingError;
      if (paidError) throw paidError;
      if (dueMonthlyError) throw dueMonthlyError;
      if (paidMonthlyError) throw paidMonthlyError;
      if (adjustmentMonthlyError) throw adjustmentMonthlyError;

      const outstandingAggregate = (outstandingRows ?? []).reduce(
        (acc, row) => {
          acc.totalOutstandingCents += row?.outstanding_cents ?? 0;
          acc.totalDueCents += row?.total_due_cents ?? 0;
          acc.totalPaidAgainstDueCents += row?.total_paid_cents ?? 0;
          acc.totalAdjustmentsCents += row?.total_adjustment_cents ?? 0;
          return acc;
        },
        {
          totalOutstandingCents: 0,
          totalDueCents: 0,
          totalPaidAgainstDueCents: 0,
          totalAdjustmentsCents: 0
        }
      );

      const totalCollectedCents = (paidRows ?? []).reduce(
        (sum, row) => sum + (row?.total_amount_cents ?? 0),
        0
      );

      const normalizeMonth = (value?: string | null) => asMonthKey(value);

      const dueByMonth = new Map<string, number>();
      (dueMonthlyRows ?? []).forEach(row => {
        const month = normalizeMonth(row.month_key as string | null);
        if (!month) return;
        dueByMonth.set(month, (dueByMonth.get(month) ?? 0) + (row.amount_cents ?? 0));
      });

      const paidByMonth = new Map<string, number>();
      (paidMonthlyRows ?? []).forEach(row => {
        const month = normalizeMonth(row.month_key as string | null);
        if (!month) return;
        paidByMonth.set(month, (paidByMonth.get(month) ?? 0) + (row.signed_amount_cents ?? 0));
      });

      const adjustmentsByMonth = new Map<string, number>();
      (adjustmentMonthlyRows ?? []).forEach(row => {
        const month = normalizeMonth(row.month_key as string | null);
        if (!month) return;
        adjustmentsByMonth.set(month, (adjustmentsByMonth.get(month) ?? 0) + (row.amount_cents ?? 0));
      });

      const monthKeys = Array.from(
        new Set([
          ...dueByMonth.keys(),
          ...paidByMonth.keys(),
          ...adjustmentsByMonth.keys()
        ])
      ).sort();

      const monthlyLedger = monthKeys.map(month => {
        const dueCents = dueByMonth.get(month) ?? 0;
        const paidCents = paidByMonth.get(month) ?? 0;
        const adjustmentCents = adjustmentsByMonth.get(month) ?? 0;
        const outstandingCents = dueCents + adjustmentCents - paidCents;

        return {
          month,
          dueCents,
          paidCents,
          adjustmentCents,
          outstandingCents,
          collectedCents: Math.max(paidCents, 0)
        };
      });

      return {
        summary: {
          ...outstandingAggregate,
          totalCollectedCents
        },
        monthlyLedger
      };
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin summary error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load payments summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
