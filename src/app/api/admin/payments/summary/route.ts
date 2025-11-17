import { NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

export async function GET() {
  try {
    const data = await adminOperationSimple(async client => {
      const [{ data: outstandingRows, error: outstandingError }, { data: paidRows, error: paidError }] =
        await Promise.all([
          client
            .from('parent_outstanding_summary')
            .select('outstanding_cents, total_due_cents, total_paid_cents, total_adjustment_cents'),
          client.from('payments').select('total_amount_cents').eq('status', 'paid')
        ]);

      if (outstandingError) throw outstandingError;
      if (paidError) throw paidError;

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

      return {
        ...outstandingAggregate,
        totalCollectedCents
      };
    });

    return NextResponse.json({ summary: data });
  } catch (error: unknown) {
    console.error('Admin summary error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load payments summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
