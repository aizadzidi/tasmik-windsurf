import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { ok, fail } from '@/types/http';
import { normalizeId } from '@/lib/ids';

const TABLE = 'subject_opt_outs';

type SubjectOptOutRow = {
  exam_id: string | number | null;
  subject_id: string | number | null;
  student_id: string | number | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');
    const subjectId = searchParams.get('subjectId');

    if (!examId) {
      return NextResponse.json({ error: 'examId is required' }, { status: 400 });
    }

    const entries = await adminOperationSimple(async (client) => {
      let query = client
        .from(TABLE)
        .select('exam_id, subject_id, student_id')
        .eq('exam_id', examId);
      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SubjectOptOutRow[];
    });

    if (subjectId) {
      const studentIds = entries
        .map((row) => normalizeId(row.student_id))
        .filter((id): id is string => Boolean(id));
      const payload = ok({ studentIds });
      return NextResponse.json(payload.data);
    }

    const normalized = entries.map((row) => ({
      examId: normalizeId(row.exam_id),
      subjectId: normalizeId(row.subject_id),
      studentId: normalizeId(row.student_id),
    })).filter((row) => row.examId && row.subjectId && row.studentId);

    const payload = ok({ entries: normalized });
    return NextResponse.json(payload.data);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '';
    if (message.includes(`relation "${TABLE}" does not exist`)) {
      const errorResult = fail(`${TABLE} table not found. Please run the provided SQL migration.`);
      return NextResponse.json({ error: errorResult.error }, { status: 500 });
    }
    console.error('Subject opt-outs fetch failed', error);
    return NextResponse.json({ error: 'Failed to load subject opt-outs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const examId = normalizeId(body?.examId);
    const subjectId = normalizeId(body?.subjectId);
    const studentId = normalizeId(body?.studentId);

    if (!examId || !subjectId || !studentId) {
      return NextResponse.json({ error: 'Missing examId, subjectId, or studentId' }, { status: 400 });
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from(TABLE)
        .upsert({ exam_id: examId, subject_id: subjectId, student_id: studentId }, { onConflict: 'exam_id,subject_id,student_id' });
      if (error) throw error;
      return null;
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '';
    if (message.includes(`relation "${TABLE}" does not exist`)) {
      const errorResult = fail(`${TABLE} table not found. Please run the provided SQL migration.`);
      return NextResponse.json({ error: errorResult.error }, { status: 500 });
    }
    console.error('Subject opt-outs insert failed', error);
    return NextResponse.json({ error: 'Failed to save subject opt-out' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = normalizeId(searchParams.get('examId'));
    const subjectId = normalizeId(searchParams.get('subjectId'));
    const studentId = normalizeId(searchParams.get('studentId'));

    if (!examId || !subjectId || !studentId) {
      return NextResponse.json({ error: 'Missing examId, subjectId, or studentId' }, { status: 400 });
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from(TABLE)
        .delete()
        .eq('exam_id', examId)
        .eq('subject_id', subjectId)
        .eq('student_id', studentId);
      if (error) throw error;
      return null;
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '';
    if (message.includes(`relation "${TABLE}" does not exist`)) {
      const errorResult = fail(`${TABLE} table not found. Please run the provided SQL migration.`);
      return NextResponse.json({ error: errorResult.error }, { status: 500 });
    }
    console.error('Subject opt-outs delete failed', error);
    return NextResponse.json({ error: 'Failed to remove subject opt-out' }, { status: 500 });
  }
}
