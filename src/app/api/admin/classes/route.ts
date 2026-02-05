import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { requireAdminPermission } from '@/lib/adminPermissions';

// GET - Fetch all classes (admin only)
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('classes')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin classes fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch classes';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

// POST - Create new class (admin only)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, level } = body;
    const allowedLevels = [
      'Lower Primary',
      'Upper Primary',
      'Lower Secondary',
      'Upper Secondary'
    ];

    if (!name) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    if (level && !allowedLevels.includes(level)) {
      return NextResponse.json(
        { error: 'Invalid class level' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('classes')
        .insert([{ name, level: level || null }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin class creation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create class';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

// PUT - Update class name (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { id, name, level } = body;
    const allowedLevels = [
      'Lower Primary',
      'Upper Primary',
      'Lower Secondary',
      'Upper Secondary'
    ];

    if (!id || !name) {
      return NextResponse.json(
        { error: 'Class id and name are required' },
        { status: 400 }
      );
    }

    if (level && !allowedLevels.includes(level)) {
      return NextResponse.json(
        { error: 'Invalid class level' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('classes')
        .update({ name, level: level || null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin class update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update class';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

// DELETE - Remove class (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, [
      'admin:dashboard',
      'admin:crm',
      'admin:certificates',
    ]);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Class id is required' },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from('classes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Admin class delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete class';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
