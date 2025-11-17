import { NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

type AdjustmentPayload = {
  parentId: string;
  childId?: string | null;
  feeId?: string | null;
  monthKey?: string | null;
  amountCents: number;
  reason: string;
  createdBy?: string | null;
};

function normalizeMonthKey(monthKey?: string | null) {
  if (!monthKey) return null;
  const trimmed = monthKey.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    return null;
  }
  return `${trimmed}-01`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);

  try {
    const adjustments = await adminOperationSimple(async client => {
      const { data, error } = await client
        .from('parent_balance_adjustments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(row => ({
        id: row.id,
        parentId: row.parent_id,
        childId: row.child_id,
        feeId: row.fee_id,
        monthKey: row.month_key,
        amountCents: row.amount_cents,
        reason: row.reason,
        createdBy: row.created_by,
        createdAt: row.created_at
      }));
    });

    return NextResponse.json({ adjustments });
  } catch (error: unknown) {
    console.error('List adjustments error:', error);
    const message = error instanceof Error ? error.message : 'Unable to fetch adjustments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AdjustmentPayload;

    if (!payload.parentId) {
      return NextResponse.json({ error: 'parentId is required' }, { status: 400 });
    }
    if (typeof payload.amountCents !== 'number' || Number.isNaN(payload.amountCents)) {
      return NextResponse.json({ error: 'amountCents must be a valid number' }, { status: 400 });
    }
    if (!payload.reason?.trim()) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    const inserted = await adminOperationSimple(async client => {
      const monthDate = normalizeMonthKey(payload.monthKey);
      if (payload.monthKey && !monthDate) {
        throw new Error('monthKey must follow YYYY-MM format');
      }

      const { data, error } = await client
        .from('parent_balance_adjustments')
        .insert({
          parent_id: payload.parentId,
          child_id: payload.childId ?? null,
          fee_id: payload.feeId ?? null,
          month_key: monthDate,
          amount_cents: Math.trunc(payload.amountCents),
          reason: payload.reason.trim(),
          created_by: payload.createdBy ?? null
        })
        .select('*')
        .single();

      if (error) throw error;
      return {
        id: data.id,
        parentId: data.parent_id,
        childId: data.child_id,
        feeId: data.fee_id,
        monthKey: data.month_key,
        amountCents: data.amount_cents,
        reason: data.reason,
        createdBy: data.created_by,
        createdAt: data.created_at
      };
    });

    return NextResponse.json({ adjustment: inserted });
  } catch (error: unknown) {
    console.error('Create adjustment error:', error);
    const message = error instanceof Error ? error.message : 'Unable to create adjustment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
