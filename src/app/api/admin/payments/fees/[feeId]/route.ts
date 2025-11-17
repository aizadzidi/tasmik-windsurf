import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

type FeeRouteContext = {
  params: Promise<{ feeId: string }>;
};

export async function PUT(req: NextRequest, context: FeeRouteContext) {
  try {
    const { feeId } = await context.params;
    if (!feeId) {
      return NextResponse.json({ error: 'Fee ID required' }, { status: 400 });
    }

    const updates = await req.json();
    const parsedUpdates = { ...updates };

    if ('metadata' in parsedUpdates) {
      const meta = parsedUpdates.metadata;
      parsedUpdates.metadata =
        meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    }

    const fee = await adminOperationSimple(async client => {
      const { data, error } = await client
        .from('payment_fee_catalog')
        .update({
          ...parsedUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', feeId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    });

    return NextResponse.json({ fee });
  } catch (error: unknown) {
    console.error('Admin fee update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update fee';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: FeeRouteContext) {
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
  } catch (error: unknown) {
    console.error('Admin fee delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete fee';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
