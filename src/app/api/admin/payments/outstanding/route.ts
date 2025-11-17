import { NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);

  try {
    const data = await adminOperationSimple(async client => {
      const { data: outstandingRows, error } = await client
        .from('parent_outstanding_summary')
        .select('parent_id, outstanding_cents, total_due_cents, total_paid_cents, total_adjustment_cents')
        .order('outstanding_cents', { ascending: false })
        .limit(limit);

      if (error) throw error;
      const parentIds = Array.from(new Set((outstandingRows ?? []).map(row => row.parent_id))).filter(
        Boolean
      );

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

      return (outstandingRows ?? []).map(row => ({
        parentId: row.parent_id,
        parent: parentsById[row.parent_id] ?? null,
        outstandingCents: row.outstanding_cents ?? 0,
        totalDueCents: row.total_due_cents ?? 0,
        totalPaidCents: row.total_paid_cents ?? 0,
        totalAdjustmentCents: row.total_adjustment_cents ?? 0
      }));
    });

    return NextResponse.json({ parents: data });
  } catch (error: unknown) {
    console.error('Admin outstanding list error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch outstanding list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
