import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// GET /api/teacher/exam-exclusions?examId=...&classId=... (optional)
// Returns: { excludedStudentIds: string[] }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');
    const classId = searchParams.get('classId');

    if (!examId) {
      return NextResponse.json({ error: 'examId is required' }, { status: 400 });
    }

    const data = await adminOperationSimple(async (client) => {
      let q = client
        .from('exam_excluded_students')
        .select('student_id')
        .eq('exam_id', examId);

      if (classId && classId !== 'all') {
        q = q.eq('class_id', classId);
      }

      const { data, error } = await q;
      if (error) throw error;
      const ids = (data || []).map((r: any) => String(r.student_id));
      return ids;
    });

    return NextResponse.json({ excludedStudentIds: data });
  } catch (error: any) {
    console.error('Teacher exam-exclusions fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch exam exclusions' },
      { status: 500 }
    );
  }
}

