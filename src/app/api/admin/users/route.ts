import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { ensureUserProfile } from '@/lib/tenantProvisioning';
import { requireAdminPermission } from '@/lib/adminPermissions';

// GET - Fetch users by role (admin only)
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:users',
    ]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    const data = await adminOperationSimple(async (client) => {
      let query = client
        .from('users')
        .select('*')
        .order('name');

      if (role) {
        query = query.eq('role', role);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin users fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

// PUT - Update user role (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:users']);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { id, role } = body;

    if (!id || !role) {
      return NextResponse.json(
        { error: 'User ID and role are required' },
        { status: 400 }
      );
    }

    if (!['admin', 'teacher', 'parent'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be admin, teacher, or parent' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const profile = await ensureUserProfile({
        request,
        userId: id,
        supabaseAdmin: client,
      });
      if (!profile) {
        throw new Error(`Missing user profile for userId=${id}`);
      }
      if (!profile.tenant_id) {
        throw new Error(`User profile missing tenant_id for userId=${id}`);
      }

      const { data, error } = await client
        .from('users')
        .update({ role })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      try {
        const refreshedProfile = await ensureUserProfile({
          request,
          userId: id,
          supabaseAdmin: client,
        });
        if (!refreshedProfile?.tenant_id) {
          console.warn('Admin role update: missing tenant profile', { userId: id });
        }
      } catch (profileError) {
        console.warn('Admin role update: failed to refresh profile', profileError);
      }

      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin user update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update user';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
