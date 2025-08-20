import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// GET - Fetch juz test notifications with resolved names (service role)
export async function GET(_request: NextRequest) {
  try {
    const data = await adminOperationSimple(async (client) => {
      // 1) Fetch notifications base data (no joins to avoid edge-cases)
      const { data: notifications, error } = await client
        .from('juz_test_notifications')
        .select('*')
        .order('status', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const notificationsSafe = notifications || [];

      // 2) Batch resolve missing names
      const missingStudentIds = Array.from(new Set(
        notificationsSafe
          .filter(n => !n.student_name)
          .map(n => n.student_id)
          .filter(Boolean)
      ));
      const missingTeacherIds = Array.from(new Set(
        notificationsSafe
          .filter(n => !n.teacher_name)
          .map(n => n.teacher_id)
          .filter(Boolean)
      ));

      const [studentsLookupRes, teachersLookupRes] = await Promise.all([
        missingStudentIds.length > 0
          ? client.from('students').select('id, name').in('id', missingStudentIds)
          : Promise.resolve({ data: [], error: null } as any),
        missingTeacherIds.length > 0
          ? client.from('users').select('id, name').in('id', missingTeacherIds)
          : Promise.resolve({ data: [], error: null } as any)
      ]);

      const studentIdToName: Record<string, string> = Object.fromEntries(
        (studentsLookupRes.data || []).map((s: any) => [s.id, s.name])
      );
      const teacherIdToName: Record<string, string> = Object.fromEntries(
        (teachersLookupRes.data || []).map((u: any) => [u.id, u.name])
      );

      const processed = notificationsSafe.map((n: any) => ({
        ...n,
        student_name: n.student_name || studentIdToName[n.student_id] || 'Unknown Student',
        teacher_name: n.teacher_name || teacherIdToName[n.teacher_id] || 'Unknown Teacher'
      }));

      // 3) Best-effort persist newly resolved names so future reads are cheap
      const updates = processed
        .filter((n, idx) => (
          (!notificationsSafe[idx]?.student_name && n.student_name && n.student_name !== 'Unknown Student') ||
          (!notificationsSafe[idx]?.teacher_name && n.teacher_name && n.teacher_name !== 'Unknown Teacher')
        ))
        .map(n => ({ id: n.id, student_name: n.student_name, teacher_name: n.teacher_name }));

      if (updates.length > 0) {
        await Promise.all(
          updates.map(u =>
            client
              .from('juz_test_notifications')
              .update({ student_name: u.student_name, teacher_name: u.teacher_name })
              .eq('id', u.id)
          )
        );
      }

      return processed;
    });

    return NextResponse.json({ notifications: data });
  } catch (error: any) {
    console.error('Admin notifications fetch error:', error);
    return NextResponse.json(
      { notifications: [], error: error.message || 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}


