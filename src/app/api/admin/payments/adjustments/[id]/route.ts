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

type AdjustmentRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: AdjustmentRouteContext) {
  const { id: adjustmentId } = await context.params;

  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

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

    const { data, error } = await supabaseService
      .from('parent_balance_adjustments')
      .update({
        parent_id: payload.parentId,
        child_id: payload.childId ?? null,
        fee_id: payload.feeId ?? null,
        month_key: monthDate,
        amount_cents: Math.trunc(payload.amountCents),
        reason: payload.reason.trim()
      })
      .eq('id', adjustmentId)
      .eq('tenant_id', guard.tenantId)
      .select('*')
      .single();
    if (error) throw error;

    const updated = {
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

    return NextResponse.json({ adjustment: updated });
  } catch (error: unknown) {
    logPaymentError('admin-payments-adjustments-update', error);
    return NextResponse.json({ error: 'Unable to update adjustment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: AdjustmentRouteContext) {
  const { id: adjustmentId } = await context.params;

  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    if (!adjustmentId) {
      return NextResponse.json({ error: 'Adjustment ID is required' }, { status: 400 });
    }

    const { error } = await supabaseService
      .from('parent_balance_adjustments')
      .delete()
      .eq('id', adjustmentId)
      .eq('tenant_id', guard.tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logPaymentError('admin-payments-adjustments-delete', error);
    return NextResponse.json({ error: 'Unable to delete adjustment' }, { status: 500 });
  }
}
