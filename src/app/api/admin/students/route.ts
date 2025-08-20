import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// GET - Fetch all students (admin only)
export async function GET() {
  try {
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('students')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Admin students fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch students' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}

// POST - Create new student (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, parent_id, assigned_teacher_id, class_id } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Student name is required' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('students')
        .insert([{
          name,
          parent_id,
          assigned_teacher_id: assigned_teacher_id || null,
          class_id: class_id || null
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Admin student creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create student' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}

// PUT - Update student (admin only)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, parent_id, assigned_teacher_id, class_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('students')
        .update({
          name,
          parent_id,
          assigned_teacher_id,
          class_id
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Admin student update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update student' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}

// DELETE - Delete student (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from('students')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin student deletion error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete student' },
      { status: error.message.includes('Admin access required') ? 403 : 500 }
    );
  }
}