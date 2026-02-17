import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabaseServiceClient';
import { requireAdminPermission } from '@/lib/adminPermissions';
import { logPaymentError } from '@/lib/payments/paymentLogging';

type AdjustmentPayload = {
  parentId: string;
  childId: string | null;
  feeId: string | null;
  monthKey: string;
  amountCents: number;
  reason: string;
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);

  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { data, error } = await supabaseService
      .from('parent_balance_adjustments')
      .select('*')
      .eq('tenant_id', guard.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const adjustments = (data ?? []).map(row => ({
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

    return NextResponse.json({ adjustments });
  } catch (error: unknown) {
    logPaymentError('admin-payments-adjustments-list', error);
    return NextResponse.json({ error: 'Unable to fetch adjustments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const payload = (await request.json()) as AdjustmentPayload;

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

    const [{ data: parentProfile, error: parentProfileError }, { data: feeRow, error: feeError }] = await Promise.all([
      supabaseService
        .from('user_profiles')
        .select('user_id')
        .eq('tenant_id', guard.tenantId)
        .eq('user_id', payload.parentId)
        .eq('role', 'parent')
        .maybeSingle(),
      payload.feeId
        ? supabaseService
            .from('payment_fee_catalog')
            .select('id')
            .eq('tenant_id', guard.tenantId)
            .eq('id', payload.feeId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (parentProfileError) throw parentProfileError;
    if (!parentProfile?.user_id) {
      return NextResponse.json({ error: 'Invalid parentId for this tenant' }, { status: 400 });
    }
    if (feeError) throw feeError;
    if (payload.feeId && !feeRow?.id) {
      return NextResponse.json({ error: 'Invalid feeId for this tenant' }, { status: 400 });
    }

    if (payload.childId) {
      const { data: childRow, error: childError } = await supabaseService
        .from('students')
        .select('id')
        .eq('tenant_id', guard.tenantId)
        .eq('id', payload.childId)
        .eq('parent_id', payload.parentId)
        .maybeSingle();
      if (childError) throw childError;
      if (!childRow?.id) {
        return NextResponse.json({ error: 'Invalid childId for this parent/tenant' }, { status: 400 });
      }
    }

    const { data: insertedRow, error: insertError } = await supabaseService
      .from('parent_balance_adjustments')
      .insert({
        tenant_id: guard.tenantId,
        parent_id: payload.parentId,
        child_id: payload.childId ?? null,
        fee_id: payload.feeId ?? null,
        month_key: monthDate,
        amount_cents: Math.trunc(payload.amountCents),
        reason: payload.reason.trim(),
        created_by: guard.userId
      })
      .select('*')
      .single();
    if (insertError) throw insertError;

    const inserted = {
      id: insertedRow.id,
      parentId: insertedRow.parent_id,
      childId: insertedRow.child_id,
      feeId: insertedRow.fee_id,
      monthKey: insertedRow.month_key,
      amountCents: insertedRow.amount_cents,
      reason: insertedRow.reason,
      createdBy: insertedRow.created_by,
      createdAt: insertedRow.created_at
    };

    return NextResponse.json({ adjustment: inserted });
  } catch (error: unknown) {
    logPaymentError('admin-payments-adjustments-create', error);
    return NextResponse.json({ error: 'Unable to create adjustment' }, { status: 500 });
  }
}
