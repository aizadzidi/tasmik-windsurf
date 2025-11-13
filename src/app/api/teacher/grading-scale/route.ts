import { NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { ok, fail } from "@/types/http";

type GradingSystemRelation = {
  id: string;
  name?: string | null;
  grading_scale?: unknown;
  description?: string | null;
} | null;

type ExamWithGradingSystem = {
  id: string;
  name: string;
  grading_system_id?: string | null;
  grading_systems?: GradingSystemRelation | GradingSystemRelation[] | null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    if (!examId) {
      const errorResult = fail('Missing required parameter: examId');
      return NextResponse.json(
        { error: errorResult.error },
        { status: 400 }
      );
    }

    // Fetch exam's grading system with service role (bypass RLS for teacher tools)
    const { data: examData, error: examError } = await adminOperationSimple(async (client) => {
      return await client
        .from('exams')
        .select(`
          id,
          name,
          grading_system_id,
          grading_systems!inner(
            id,
            name,
            grading_scale,
            description
          )
        `)
        .eq('id', examId)
        .single();
    });

    if (examError) {
      console.error('Error fetching exam grading system:', examError);
      return NextResponse.json({
        error: 'Failed to fetch exam grading system',
        details: {
          code: examError.code,
          message: examError.message,
          hint: examError.hint,
        }
      }, { status: 500 });
    }

    if (!examData) {
      return NextResponse.json({
        error: 'Exam not found'
      }, { status: 404 });
    }

    // If no grading system assigned, try to get default
    let gradingScale: unknown = null;
    let systemName: string | undefined;

    const examRow = examData as ExamWithGradingSystem;
    // Supabase relation nesting may return an array or an object depending on join
    const related = examRow.grading_systems;
    const gsObj = Array.isArray(related) ? related[0] : related;

    if (gsObj) {
      gradingScale = gsObj?.grading_scale ?? null;
      systemName = gsObj?.name ?? undefined;
    } else {
      // Fallback to default grading system
      const { data: defaultSystem } = await adminOperationSimple(async (client) => {
        return await client
          .from('grading_systems')
          .select('grading_scale')
          .eq('is_default', true)
          .single();
      });
      
      gradingScale = defaultSystem?.grading_scale ?? null;
    }

    if (!gradingScale) {
      // Return hardcoded SPM 2023 as final fallback
      gradingScale = {
        type: 'letter',
        grades: [
          { min: 90, max: 100, letter: 'A+' },
          { min: 80, max: 89, letter: 'A' },
          { min: 70, max: 79, letter: 'A-' },
          { min: 65, max: 69, letter: 'B+' },
          { min: 60, max: 64, letter: 'B' },
          { min: 55, max: 59, letter: 'C+' },
          { min: 50, max: 54, letter: 'C' },
          { min: 45, max: 49, letter: 'D' },
          { min: 40, max: 44, letter: 'E' },
          { min: 0, max: 39, letter: 'G' },
        ]
      };
    }

    const payload = ok({
      success: true,
      gradingScale,
      examName: examRow.name,
      systemName: systemName || 'Default SPM 2023'
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
