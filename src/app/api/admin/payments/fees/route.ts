import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabaseServiceClient';
import { requireAdminPermission } from '@/lib/adminPermissions';
import { logPaymentError } from '@/lib/payments/paymentLogging';

const DEFAULT_CATEGORY = 'tuition';
const DEFAULT_BILLING = 'monthly';
const VALID_CATEGORIES = new Set(['tuition', 'club', 'donation', 'program', 'other']);
const VALID_BILLING_CYCLES = new Set(['monthly', 'yearly', 'one_time', 'ad_hoc']);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const { data: fees, error } = await supabaseService
      .from('payment_fee_catalog')
      .select('*')
      .eq('tenant_id', guard.tenantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ fees });
  } catch (error: unknown) {
    logPaymentError('admin-payments-fees-list', error);
    return NextResponse.json(
      { error: 'Failed to fetch fee catalog' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const {
      name,
      description,
      amount_cents,
      category = DEFAULT_CATEGORY,
      billing_cycle = DEFAULT_BILLING,
      is_optional = false,
      slug,
      metadata = {}
    } = body || {};

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName || typeof amount_cents !== 'number') {
      return NextResponse.json({ error: 'Name and amount are required' }, { status: 400 });
    }
    if (!Number.isFinite(amount_cents) || amount_cents < 0 || amount_cents > 100_000_000) {
      return NextResponse.json({ error: 'amount_cents must be a valid positive number' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (!VALID_BILLING_CYCLES.has(billing_cycle)) {
      return NextResponse.json({ error: 'Invalid billing_cycle' }, { status: 400 });
    }

    const safeMetadata =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

    const payload = {
      name: normalizedName.slice(0, 120),
      description: typeof description === 'string' ? description.trim().slice(0, 500) : null,
      amount_cents: Math.trunc(amount_cents),
      category,
      billing_cycle,
      is_optional: Boolean(is_optional),
      slug: slug && typeof slug === 'string' && slug.length > 0 ? slugify(slug) : slugify(normalizedName),
      metadata: safeMetadata
    };

    const { data: fee, error } = await supabaseService
      .from('payment_fee_catalog')
      .insert([{ ...payload, tenant_id: guard.tenantId }])
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ fee });
  } catch (error: unknown) {
    logPaymentError('admin-payments-fees-create', error);
    return NextResponse.json(
      { error: 'Failed to create fee' },
      { status: 500 }
    );
  }
}
