import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { requireAdminPermission } from '@/lib/adminPermissions';

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const payments = await adminOperationSimple(async client => {
      const { data, error } = await client
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
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    });

    return NextResponse.json({ payments });
  } catch (error: unknown) {
    console.error('Admin payments fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch payments';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
