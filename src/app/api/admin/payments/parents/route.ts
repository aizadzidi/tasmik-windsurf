import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabaseServiceClient';
import { requireAdminPermission } from '@/lib/adminPermissions';
import { logPaymentError } from '@/lib/payments/paymentLogging';

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { data: profileRows, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('user_id')
      .eq('tenant_id', guard.tenantId)
      .eq('role', 'parent')
      .limit(2000);
    if (profileError) throw profileError;

    const parentIds = Array.from(
      new Set((profileRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)))
    );
    if (!parentIds.length) {
      return NextResponse.json({ parents: [] });
    }

    const { data: parents, error } = await supabaseService
      .from('users')
      .select('id, name, email')
      .in('id', parentIds)
      .eq('role', 'parent')
      .order('name', { ascending: true })
      .order('email', { ascending: true })
      .limit(2000);
    if (error) throw error;

    return NextResponse.json({ parents });
  } catch (error: unknown) {
    logPaymentError('admin-payments-parents', error);
    return NextResponse.json({ error: 'Failed to fetch parent list' }, { status: 500 });
  }
}
