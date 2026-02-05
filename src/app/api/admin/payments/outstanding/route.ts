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
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);

  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const data = await adminOperationSimple(async client => {
      const { data: outstandingRows, error } = await client
        .from('parent_outstanding_summary')
        .select('parent_id, outstanding_cents, total_due_cents, total_paid_cents, total_adjustment_cents')
        .order('outstanding_cents', { ascending: false })
        .limit(limit);

      if (error) throw error;
      const parentIds = (outstandingRows ?? [])
        .filter(row => (row.outstanding_cents ?? 0) !== 0)
        .map(row => row.parent_id as string);

      let parentsById: Record<string, { name: string | null; email: string | null }> = {};
      if (parentIds.length) {
        const { data: parentRows, error: parentError } = await client
          .from('users')
          .select('id, name, email')
          .in('id', parentIds);

        if (parentError) throw parentError;
        parentsById = Object.fromEntries(
          (parentRows ?? []).map(row => [row.id, { name: row.name ?? null, email: row.email ?? null }])
        );
      }

      const earliestByParent: Record<string, string | null> = {};
      const monthsByParent: Record<string, string[]> = {};
      if (parentIds.length) {
        const [{ data: childRows, error: childError }, { data: adjustmentMonths, error: adjustmentError }] =
          await Promise.all([
            client
              .from('parent_child_outstanding')
              .select('parent_id, outstanding_cents, due_months')
              .in('parent_id', parentIds),
            client
              .from('parent_balance_adjustments')
              .select('parent_id, month_key')
              .in('parent_id', parentIds)
              .not('month_key', 'is', null)
          ]);

        if (childError) throw childError;
        if (adjustmentError) throw adjustmentError;

        (childRows ?? []).forEach(row => {
          if (!row.parent_id) return;
          if ((row.outstanding_cents ?? 0) === 0) return;
          const parentId = row.parent_id as string;

          const due = Array.isArray(row.due_months) ? (row.due_months as string[]) : [];
          const baseMonths = due.map(asMonthKey).filter((m): m is string => !!m);

          const next = monthsByParent[parentId] ?? [];
          monthsByParent[parentId] = Array.from(new Set([...next, ...baseMonths])).sort();
        });

        (adjustmentMonths ?? []).forEach(row => {
          const parentId = row.parent_id as string;
          const month = asMonthKey(row.month_key);
          if (!month) return;
          const next = monthsByParent[parentId] ?? [];
          monthsByParent[parentId] = Array.from(new Set([...next, month])).sort();
        });

        Object.entries(monthsByParent).forEach(([parentId, months]) => {
          earliestByParent[parentId] = months[0] ?? null;
        });
      }

      return (outstandingRows ?? [])
        .filter(row => (row.outstanding_cents ?? 0) !== 0)
        .map(row => {
          const parentId = row.parent_id as string;
          const parent = parentsById[parentId] ?? { name: null, email: null };
          return {
            parentId,
            parentName: parent.name,
            email: parent.email,
            outstandingCents: row.outstanding_cents ?? 0,
            totalDueCents: row.total_due_cents ?? 0,
            totalPaidCents: row.total_paid_cents ?? 0,
            totalAdjustmentCents: row.total_adjustment_cents ?? 0,
            earliestDueMonth: earliestByParent[parentId] ?? null
          };
        });
    });

    return NextResponse.json({ parents: data });
  } catch (error: unknown) {
    console.error('Admin outstanding list error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch outstanding list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
