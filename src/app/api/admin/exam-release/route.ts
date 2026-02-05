import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminPermission } from '@/lib/adminPermissions';

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:exam']);
    if (!guard.ok) return guard.response;

    const { examId, released } = await request.json();
    if (!examId || typeof released !== 'boolean') {
      return NextResponse.json({ error: 'examId and released are required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error } = await supabaseAdmin
      .from('exams')
      .update({ released, released_at: released ? new Date().toISOString() : null })
      .eq('id', examId);

    if (error) {
      console.error('Failed to toggle exam release:', error);
      return NextResponse.json({ error: 'Failed to toggle release' }, { status: 500 });
    }

    if (released) {
      try {
        const { count } = await supabaseAdmin
          .from('exam_roster')
          .select('student_id', { count: 'exact', head: true })
          .eq('exam_id', examId);
        if (!count || count === 0) {
          const { data: examClasses, error: classErr } = await supabaseAdmin
            .from('exam_classes')
            .select('class_id')
            .eq('exam_id', examId);
          if (classErr) throw classErr;
          const classIds = (examClasses ?? [])
            .map((row) => (row?.class_id ? String(row.class_id) : null))
            .filter((id): id is string => Boolean(id));
          if (classIds.length > 0) {
            const { data: rosterRows, error: rosterErr } = await supabaseAdmin
              .from('students')
              .select('id, class_id')
              .neq('record_type', 'prospect')
              .in('class_id', classIds);
            if (rosterErr) throw rosterErr;
            let excludedSet = new Set<string>();
            try {
              const { data: excludedRows, error: excludedErr } = await supabaseAdmin
                .from('exam_excluded_students')
                .select('student_id')
                .eq('exam_id', examId);
              if (excludedErr) throw excludedErr;
              excludedSet = new Set(
                (excludedRows ?? [])
                  .map((row) => (row?.student_id ? String(row.student_id) : null))
                  .filter((id): id is string => Boolean(id))
              );
            } catch (excludedError) {
              console.warn('Exam roster release exclusion fetch failed:', excludedError);
            }
            const rows = (rosterRows ?? [])
              .filter((row) => row?.id && row.class_id)
              .filter((row) => !excludedSet.has(String(row.id)))
              .map((row) => ({
                exam_id: examId,
                student_id: String(row.id),
                class_id: String(row.class_id)
              }));
            if (rows.length > 0) {
              const { error: insertErr } = await supabaseAdmin
                .from('exam_roster')
                .upsert(rows, { onConflict: 'exam_id,student_id' });
              if (insertErr) throw insertErr;
            }
          }
        }
      } catch (snapshotError) {
        console.error('Failed to create exam roster snapshot on release:', snapshotError);
      }
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Error in exam-release API:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
