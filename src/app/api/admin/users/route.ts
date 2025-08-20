import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// GET - Fetch users by role (admin only)
export async function GET(request: NextRequest) {
  try {
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
  } catch (error: any) {
    console.error('Admin users fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}

// PUT - Update user role (admin only)
export async function PUT(request: NextRequest) {
  try {
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
      const { data, error } = await client
        .from('users')
        .update({ role })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Admin user update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}