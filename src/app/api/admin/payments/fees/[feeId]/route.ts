import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

type FeeRouteContext = {
  params: Promise<{ feeId: string }>;
};

export async function PUT(
  request: NextRequest,
  context: FeeRouteContext
) {
  try {
    const updates = await request.json();
    const { feeId } = await context.params;

    if (!feeId) {
      return NextResponse.json({ error: 'Fee ID required' }, { status: 400 });
    }

    const fee = await adminOperationSimple(async client => {
      const { data, error } = await client
        .from('payment_fee_catalog')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', feeId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    });

    return NextResponse.json({ fee });
  } catch (error: any) {
    console.error('Admin fee update error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update fee' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: FeeRouteContext
) {
  try {
    const { feeId } = await context.params;
    if (!feeId) {
      return NextResponse.json({ error: 'Fee ID required' }, { status: 400 });
    }

    await adminOperationSimple(async client => {
      const { error } = await client
        .from('payment_fee_catalog')
        .delete()
        .eq('id', feeId);
      if (error) throw error;
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin fee delete error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to delete fee' },
      { status: 500 }
    );
  }
}
