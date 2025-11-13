import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

const DEFAULT_CATEGORY = 'tuition';
const DEFAULT_BILLING = 'monthly';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function GET() {
  try {
    const fees = await adminOperationSimple(async client => {
      const { data, error } = await client
        .from('payment_fee_catalog')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    });

    return NextResponse.json({ fees });
  } catch (error: unknown) {
    console.error('Admin fee catalog fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch fee catalog';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      amount_cents,
      category = DEFAULT_CATEGORY,
      billing_cycle = DEFAULT_BILLING,
      is_optional = false,
      slug
    } = body || {};

    if (!name || typeof amount_cents !== 'number') {
      return NextResponse.json({ error: 'Name and amount are required' }, { status: 400 });
    }

    const payload = {
      name,
      description,
      amount_cents,
      category,
      billing_cycle,
      is_optional,
      slug: slug && slug.length > 0 ? slug : slugify(name)
    };

    const fee = await adminOperationSimple(async client => {
      const { data, error } = await client
        .from('payment_fee_catalog')
        .insert([payload])
        .select('*')
        .single();
      if (error) throw error;
      return data;
    });

    return NextResponse.json({ fee });
  } catch (error: unknown) {
    console.error('Admin fee create error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create fee';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
