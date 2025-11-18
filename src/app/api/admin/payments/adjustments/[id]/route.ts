import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

type AdjustmentPayload = {
  parentId: string;
  childId: string | null;
  feeId: string | null;
  monthKey: string;
  amountCents: number;
  reason: string;
  createdBy: string | null;
};

function normalizeMonthKey(input: string | null | undefined): string {
  if (!input) {
    throw new Error('monthKey is required');
  }
  const trimmed = input.trim();
  // Expect "YYYY-MM"
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error('monthKey must follow YYYY-MM');
  }
  // Store always as first day of month to avoid timezone issues
  return `${match[1]}-${match[2]}-01`;
}

type AdjustmentRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: AdjustmentRouteContext) {
  const { id: adjustmentId } = await context.params;

  try {
    const payload = (await request.json()) as AdjustmentPayload;

    if (!adjustmentId) {
      return NextResponse.json({ error: 'Adjustment ID is required' }, { status: 400 });
    }
    if (!payload.parentId) {
      return NextResponse.json({ error: 'parentId is required' }, { status: 400 });
    }
    let monthDate: string;
    try {
      monthDate = normalizeMonthKey(payload.monthKey);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'monthKey must follow YYYY-MM';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (typeof payload.amountCents !== 'number' || Number.isNaN(payload.amountCents)) {
      return NextResponse.json({ error: 'amountCents must be a valid number' }, { status: 400 });
    }
    if (!payload.reason?.trim()) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    const updated = await adminOperationSimple(async client => {
      const { data, error } = await client
        .from('parent_balance_adjustments')
        .update({
          parent_id: payload.parentId,
          child_id: payload.childId ?? null,
          fee_id: payload.feeId ?? null,
          month_key: monthDate,
          amount_cents: Math.trunc(payload.amountCents),
          reason: payload.reason.trim(),
          created_by: payload.createdBy ?? null
        })
        .eq('id', adjustmentId)
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

    return NextResponse.json({ adjustment: updated });
  } catch (error: unknown) {
    console.error('Update adjustment error:', error);
    const message = error instanceof Error ? error.message : 'Unable to update adjustment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
