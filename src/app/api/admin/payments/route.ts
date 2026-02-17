import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabaseServiceClient';
import { requireAdminPermission } from '@/lib/adminPermissions';
import { logPaymentError } from '@/lib/payments/paymentLogging';

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { data: payments, error } = await supabaseService
      .from('payments')
      .select(`
        id,
        parent_id,
        status,
        total_amount_cents,
        merchant_fee_cents,
        billplz_id,
        payable_months,
        created_at,
        updated_at,
        paid_at,
        parent:users!payments_parent_id_fkey (
          id,
          name,
          email
        ),
        line_items:payment_line_items (
          id,
          label,
          subtotal_cents
        )
      `)
      .eq('tenant_id', guard.tenantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ payments });
  } catch (error: unknown) {
    logPaymentError('admin-payments-list', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
