import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { requireAdminPermission } from '@/lib/adminPermissions';

// PUT - Toggle student completion status (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:dashboard']);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { student_id, completed } = body;

    if (!student_id || completed === undefined) {
      return NextResponse.json(
        { error: 'Student ID and completion status are required' },
        { status: 400 }
      );
    }

    await adminOperationSimple(async (client) => {
      // Call the database function to update completion status
      const { error } = await client.rpc('admin_mark_student_completed', {
        student_uuid: student_id,
        completed: completed
      });
      
      if (error) throw error;
    });

    // Fetch updated students list
    const updatedStudents = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from('students')
        .select('*')
        .neq('record_type', 'prospect')
        .order('name');
      
      if (error) throw error;
      return data;
    });
    
    return NextResponse.json({ success: true, students: updatedStudents });
  } catch (error: unknown) {
    console.error('Admin completion toggle error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update completion status';
    const status = message.includes('Admin access required') ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
