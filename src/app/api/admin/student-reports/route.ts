import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// GET - Fetch individual student reports for admin view modal
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const viewMode = searchParams.get('viewMode') || 'all';

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      let query = client
        .from("reports")
        .select(`
          *,
          users!teacher_id (name)
        `)
        .eq("student_id", studentId);

      // Filter by report type based on view mode
      if (viewMode === 'tasmik') {
        query = query.eq("type", "Tasmi");
      } else if (viewMode === 'murajaah') {
        query = query.in("type", ["Murajaah", "Old Murajaah", "New Murajaah"]);
      }

      const { data, error } = await query.order("date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin student reports fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch student reports';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
