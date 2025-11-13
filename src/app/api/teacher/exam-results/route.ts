import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { ok, fail } from "@/types/http";
import { normalizeId } from "@/lib/ids";

type ExamResultInput = {
  studentId: string;
  mark: number;
  finalScore?: number | null;
};

type ExamResultRow = {
  student_id: string;
  mark: number | null;
  grade: string | null;
  final_score: number | null;
  updated_at: string | null;
};

const toSupabaseErrorDetails = (error: unknown) => {
  if (error && typeof error === 'object') {
    const err = error as { code?: string; message?: string; hint?: string };
    return {
      code: err.code,
      message: err.message,
      hint: err.hint,
    };
  }
  return { code: undefined, message: undefined, hint: undefined };
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const examId = normalizeId(body?.examId);
    const subjectId = normalizeId(body?.subjectId);
    const { results } = body;

    if (!examId || !subjectId || !Array.isArray(results)) {
      const errorResult = fail('Missing required fields: examId, subjectId, results[]');
      return NextResponse.json(
        { error: errorResult.error },
        { status: 400 }
      );
    }

    // Prepare batch upsert data
    const typedResults = (results ?? []) as ExamResultInput[];
    const upsertData = typedResults.map((result) => ({
      exam_id: examId,
      student_id: result.studentId,
      subject_id: subjectId,
      mark: result.mark,
      final_score: result.finalScore || result.mark,
      // grade will be computed by trigger
    }));

    // Single atomic upsert operation that returns all computed data
    let savedResults: ExamResultRow[] = [];

    try {
      savedResults = await adminOperationSimple(async (client) => {
        const { data, error } = await client
          .from('exam_results')
          .upsert(upsertData, { 
            onConflict: 'exam_id,student_id,subject_id',
            ignoreDuplicates: false 
          })
          .select('student_id, mark, grade, final_score, updated_at');
        if (error) throw error;
        return (data ?? []) as ExamResultRow[];
      });
    } catch (error: unknown) {
      console.error('Exam results upsert error:', error);
      return NextResponse.json(
        { error: 'Failed to save exam results', details: toSupabaseErrorDetails(error) },
        { status: 500 }
      );
    }

    // Return the fresh data with computed grades
    const payload = ok({
      success: true,
      results: savedResults,
      message: `Successfully saved ${savedResults?.length || 0} exam results`
    });

    return NextResponse.json(payload.data);

  } catch (error: unknown) {
    console.error('API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json({
      error: 'Internal server error',
      details: {
        message,
        stack: process.env.NODE_ENV === 'development' ? stack : undefined
      }
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const examId = normalizeId(body?.examId);
    const subjectId = normalizeId(body?.subjectId);
    const studentIdsInput = Array.isArray(body?.studentIds) ? body.studentIds : [];
    const studentIds = studentIdsInput
      .map((id: unknown) => normalizeId(id))
      .filter((id: string | null): id is string => typeof id === 'string' && id.length > 0);
    if (!examId || !subjectId || studentIds.length === 0) {
      return NextResponse.json({ error: 'Missing examId, subjectId, or studentIds[]' }, { status: 400 });
    }

    try {
      await adminOperationSimple(async (client) => {
        const { error } = await client
          .from('exam_results')
          .delete()
          .eq('exam_id', examId)
          .eq('subject_id', subjectId)
          .in('student_id', studentIds);
        if (error) throw error;
        return null;
      });
    } catch (error) {
      console.error('Exam results delete error:', error);
      return NextResponse.json(
        { error: 'Failed to delete exam results', details: toSupabaseErrorDetails(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Exam results delete error:', error);
    return NextResponse.json({ error: 'Failed to delete exam results' }, { status: 500 });
  }
}
