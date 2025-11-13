import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { ok } from '@/types/http';

type NotificationRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  status?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type LookupRow = {
  id: string;
  name: string | null;
};

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

      const notificationsSafe = (notifications ?? []) as NotificationRow[];

      // 2) Batch resolve missing names
      const missingStudentIds = Array.from(new Set(
        notificationsSafe
          .filter((n) => !n.student_name)
          .map((n) => n.student_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ));
      const missingTeacherIds = Array.from(new Set(
        notificationsSafe
          .filter((n) => !n.teacher_name)
          .map((n) => n.teacher_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ));

      const fetchLookupRows = async (table: 'students' | 'users', ids: string[]) => {
        if (ids.length === 0) return [] as LookupRow[];
        const { data, error } = await client
          .from(table)
          .select('id, name')
          .in('id', ids);
        if (error) throw error;
        return (data ?? []) as LookupRow[];
      };

      const [studentsLookupRows, teachersLookupRows] = await Promise.all([
        fetchLookupRows('students', missingStudentIds),
        fetchLookupRows('users', missingTeacherIds)
      ]);

      const studentIdToName: Record<string, string> = Object.fromEntries(
        studentsLookupRows.map((s) => [s.id, s.name || ''])
      );
      const teacherIdToName: Record<string, string> = Object.fromEntries(
        teachersLookupRows.map((u) => [u.id, u.name || ''])
      );

      const processed = notificationsSafe.map((n) => {
        const resolvedStudentName =
          n.student_name || (n.student_id ? studentIdToName[n.student_id] : undefined) || 'Unknown Student';
        const resolvedTeacherName =
          n.teacher_name || (n.teacher_id ? teacherIdToName[n.teacher_id] : undefined) || 'Unknown Teacher';
        return {
          ...n,
          student_name: resolvedStudentName,
          teacher_name: resolvedTeacherName
        };
      });

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
            (async () => {
              const { error: updateError } = await client
                .from('juz_test_notifications')
                .update({ student_name: u.student_name, teacher_name: u.teacher_name })
                .eq('id', u.id);
              if (updateError) throw updateError;
            })()
          )
        );
      }

      return processed;
    });

    const payload = ok({ notifications: data });
    return NextResponse.json(payload.data);
  } catch (error: unknown) {
    console.error('Admin notifications fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch notifications';
    return NextResponse.json(
      { notifications: [], error: message },
      { status: 500 }
    );
  }
}
