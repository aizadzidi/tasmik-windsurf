import { NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

export async function GET() {
  try {
    const parents = await adminOperationSimple(async client => {
      const { data, error } = await client
        .from('users')
        .select('id, name, email')
        .eq('role', 'parent')
        .order('name', { ascending: true })
        .order('email', { ascending: true })
        .limit(2000);

      if (error) throw error;
      return data ?? [];
    });

    return NextResponse.json({ parents });
  } catch (error: unknown) {
    console.error('Admin fetch parents error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch parent list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
