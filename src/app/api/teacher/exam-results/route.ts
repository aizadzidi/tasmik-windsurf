import { NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { examId, subjectId, results } = body;

    if (!examId || !subjectId || !Array.isArray(results)) {
      return NextResponse.json({ 
        error: 'Missing required fields: examId, subjectId, results[]' 
      }, { status: 400 });
    }

    // Prepare batch upsert data
    const upsertData = results.map((result: any) => ({
      exam_id: examId,
      student_id: result.studentId,
      subject_id: subjectId,
      mark: result.mark,
      final_score: result.finalScore || result.mark,
      // grade will be computed by trigger
    }));

    // Single atomic upsert operation that returns all computed data
    const { data: savedResults, error } = await adminOperationSimple(async (client) => {
      return await client
        .from('exam_results')
        .upsert(upsertData, { 
          onConflict: 'exam_id,student_id,subject_id',
          ignoreDuplicates: false 
        })
        .select('student_id, mark, grade, final_score, updated_at');
    });

    if (error) {
      console.error('Exam results upsert error:', error);
      return NextResponse.json({ 
        error: 'Failed to save exam results',
        details: {
          code: error.code,
          message: error.message,
          hint: error.hint,
        }
      }, { status: 500 });
    }

    // Return the fresh data with computed grades
    return NextResponse.json({
      success: true,
      results: savedResults,
      message: `Successfully saved ${savedResults?.length || 0} exam results`
    });

  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }, { status: 500 });
  }
}