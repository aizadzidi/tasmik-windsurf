import { NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get('parentId');
  if (!parentId) {
    return NextResponse.json({ error: 'parentId is required' }, { status: 400 });
  }

  try {
    const payload = await adminOperationSimple(async client => {
      const [
        { data: summaryRow, error: summaryError },
        { data: childRows, error: childError },
        { data: adjustmentMonths, error: adjustmentError }
      ] = await Promise.all([
        client
          .from('parent_outstanding_summary')
          .select('outstanding_cents, total_due_cents, total_paid_cents, total_adjustment_cents')
          .eq('parent_id', parentId)
          .maybeSingle(),
        client
          .from('parent_child_outstanding')
          .select(
            'child_id, outstanding_cents, total_due_cents, total_paid_cents, total_adjustment_cents, due_months'
          )
          .eq('parent_id', parentId),
        client
          .from('parent_balance_adjustments')
          .select('child_id, month_key')
          .eq('parent_id', parentId)
          .not('month_key', 'is', null)
      ]);

      if (summaryError) throw summaryError;
      if (childError) throw childError;
      if (adjustmentError) throw adjustmentError;

      const childIds = (childRows ?? [])
        .map(row => row.child_id)
        .filter((value): value is string => typeof value === 'string');

      let childNames: Record<string, string> = {};
      if (childIds.length) {
        const { data: children, error: childLookupError } = await client
          .from('students')
          .select('id, name')
          .neq('record_type', 'prospect')
          .in('id', childIds);

        if (childLookupError) throw childLookupError;
        childNames = Object.fromEntries((children ?? []).map(child => [child.id, child.name ?? '']));
      }

      const adjustmentMonthsByChild: Record<string, string[]> = {};
      (adjustmentMonths ?? []).forEach(row => {
        const month = asMonthKey(row.month_key);
        if (!month) return;
        const childKey = (row.child_id as string | null) ?? 'manual-adjustment';
        const list = adjustmentMonthsByChild[childKey] ?? [];
        adjustmentMonthsByChild[childKey] = Array.from(new Set([...list, month])).sort();
      });

      const childBreakdown = (childRows ?? []).map(row => {
        const childKey = row.child_id ?? 'manual-adjustment';
        const dueBase = Array.isArray(row.due_months) ? row.due_months : [];
        const mergedMonths = Array.from(
          new Set([
            ...dueBase.map(asMonthKey).filter((m): m is string => !!m),
            ...(adjustmentMonthsByChild[childKey] ?? [])
          ])
        ).sort();

        return {
          childId: row.child_id,
          childName: row.child_id ? childNames[row.child_id] ?? 'Anak' : 'Pelarasan Manual',
          outstandingCents: row.outstanding_cents ?? 0,
          totalDueCents: row.total_due_cents ?? 0,
          totalPaidCents: row.total_paid_cents ?? 0,
          totalAdjustmentCents: row.total_adjustment_cents ?? 0,
          dueMonths: mergedMonths
        };
      });

      let earliestDueMonth: string | null = null;
      childBreakdown.forEach(child => {
        if ((child.outstandingCents ?? 0) === 0) return;
        child.dueMonths.forEach(month => {
          if (!earliestDueMonth || month < earliestDueMonth) {
            earliestDueMonth = month;
          }
        });
      });

      return {
        totalOutstandingCents: summaryRow?.outstanding_cents ?? 0,
        totalDueCents: summaryRow?.total_due_cents ?? 0,
        totalPaidCents: summaryRow?.total_paid_cents ?? 0,
        totalAdjustmentCents: summaryRow?.total_adjustment_cents ?? 0,
        earliestDueMonth,
        childBreakdown
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error('Parent outstanding error:', error);
    const message = error instanceof Error ? error.message : 'Gagal mendapatkan baki tertunggak';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
