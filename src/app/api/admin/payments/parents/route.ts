import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { requireAdminPermission } from '@/lib/adminPermissions';

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:payments']);
    if (!guard.ok) return guard.response;

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
