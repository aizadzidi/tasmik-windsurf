import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabaseServiceClient';
import { requireAdminPermission } from '@/lib/adminPermissions';
import { logPaymentError } from '@/lib/payments/paymentLogging';

const VALID_CATEGORIES = new Set(['tuition', 'club', 'donation', 'program', 'other']);
const VALID_BILLING_CYCLES = new Set(['monthly', 'yearly', 'one_time', 'ad_hoc']);

type FeeRouteContext = {
  params: Promise<{ feeId: string }>;
};

export async function PUT(req: NextRequest, context: FeeRouteContext) {
  try {
    const guard = await requireAdminPermission(req, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { feeId } = await context.params;
    if (!feeId) {
      return NextResponse.json({ error: 'Fee ID required' }, { status: 400 });
    }

    const updates = await req.json();
    const parsedUpdates: Record<string, unknown> = {};
    const input = updates && typeof updates === 'object' ? (updates as Record<string, unknown>) : {};

    if ('name' in input) {
      if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        return NextResponse.json({ error: 'Name must be a non-empty string' }, { status: 400 });
      }
      parsedUpdates.name = input.name.trim().slice(0, 120);
    }

    if ('description' in input) {
      parsedUpdates.description =
        typeof input.description === 'string' ? input.description.trim().slice(0, 500) : null;
    }

    if ('amount_cents' in input) {
      if (typeof input.amount_cents !== 'number' || !Number.isFinite(input.amount_cents) || input.amount_cents < 0) {
        return NextResponse.json({ error: 'amount_cents must be a positive number' }, { status: 400 });
      }
      parsedUpdates.amount_cents = Math.trunc(input.amount_cents);
    }

    if ('category' in input) {
      if (typeof input.category !== 'string' || !VALID_CATEGORIES.has(input.category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      parsedUpdates.category = input.category;
    }

    if ('billing_cycle' in input) {
      if (typeof input.billing_cycle !== 'string' || !VALID_BILLING_CYCLES.has(input.billing_cycle)) {
        return NextResponse.json({ error: 'Invalid billing_cycle' }, { status: 400 });
      }
      parsedUpdates.billing_cycle = input.billing_cycle;
    }

    if ('is_optional' in input) {
      parsedUpdates.is_optional = Boolean(input.is_optional);
    }

    if ('is_active' in input) {
      parsedUpdates.is_active = Boolean(input.is_active);
    }

    if ('sort_order' in input) {
      if (typeof input.sort_order !== 'number' || !Number.isFinite(input.sort_order)) {
        return NextResponse.json({ error: 'sort_order must be a number' }, { status: 400 });
      }
      parsedUpdates.sort_order = Math.trunc(input.sort_order);
    }

    if ('slug' in input) {
      if (typeof input.slug !== 'string' || input.slug.trim().length === 0) {
        return NextResponse.json({ error: 'slug must be a non-empty string' }, { status: 400 });
      }
      parsedUpdates.slug = input.slug.trim().slice(0, 60);
    }

    if ('metadata' in input) {
      const meta = input.metadata;
      parsedUpdates.metadata = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    }

    if (Object.keys(parsedUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: fee, error } = await supabaseService
      .from('payment_fee_catalog')
      .update({
        ...parsedUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', feeId)
      .eq('tenant_id', guard.tenantId)
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ fee });
  } catch (error: unknown) {
    logPaymentError('admin-payments-fee-update', error);
    return NextResponse.json(
      { error: 'Failed to update fee' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: FeeRouteContext) {
  try {
    const guard = await requireAdminPermission(req, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { feeId } = await context.params;
    if (!feeId) {
      return NextResponse.json({ error: 'Fee ID required' }, { status: 400 });
    }

    const { error } = await supabaseService
      .from('payment_fee_catalog')
      .delete()
      .eq('id', feeId)
      .eq('tenant_id', guard.tenantId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logPaymentError('admin-payments-fee-delete', error);
    return NextResponse.json(
      { error: 'Failed to delete fee' },
      { status: 500 }
    );
  }
}
