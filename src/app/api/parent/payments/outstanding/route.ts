import { NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get('parentId');
  if (!parentId) {
    return NextResponse.json({ error: 'parentId is required' }, { status: 400 });
  }

  try {
    const payload = await adminOperationSimple(async client => {
      const [{ data: summaryRow, error: summaryError }, { data: childRows, error: childError }] =
        await Promise.all([
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
            .eq('parent_id', parentId)
        ]);

      if (summaryError) throw summaryError;
      if (childError) throw childError;

      const childIds = (childRows ?? [])
        .map(row => row.child_id)
        .filter((value): value is string => typeof value === 'string');

      let childNames: Record<string, string> = {};
      if (childIds.length) {
        const { data: children, error: childLookupError } = await client
          .from('students')
          .select('id, name')
          .in('id', childIds);

        if (childLookupError) throw childLookupError;
        childNames = Object.fromEntries((children ?? []).map(child => [child.id, child.name ?? '']));
      }

      return {
        totalOutstandingCents: summaryRow?.outstanding_cents ?? 0,
        totalDueCents: summaryRow?.total_due_cents ?? 0,
        totalPaidCents: summaryRow?.total_paid_cents ?? 0,
        totalAdjustmentCents: summaryRow?.total_adjustment_cents ?? 0,
        childBreakdown: (childRows ?? []).map(row => ({
          childId: row.child_id,
          childName: row.child_id ? childNames[row.child_id] ?? 'Anak' : 'Pelarasan Manual',
          outstandingCents: row.outstanding_cents ?? 0,
          totalDueCents: row.total_due_cents ?? 0,
          totalPaidCents: row.total_paid_cents ?? 0,
          totalAdjustmentCents: row.total_adjustment_cents ?? 0,
          dueMonths: Array.isArray(row.due_months) ? row.due_months : []
        }))
      };
    });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error('Parent outstanding error:', error);
    const message = error instanceof Error ? error.message : 'Gagal mendapatkan baki tertunggak';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
