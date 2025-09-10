import { NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    if (!examId) {
      return NextResponse.json({ 
        error: 'Missing required parameter: examId' 
      }, { status: 400 });
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
    let gradingScale: any = null;
    let systemName: string | undefined;

    // Supabase relation nesting may return an array or an object depending on join
    const related = (examData as any).grading_systems as any;
    const gsObj = Array.isArray(related) ? related[0] : related;

    if (gsObj) {
      gradingScale = gsObj?.grading_scale ?? null;
      systemName = gsObj?.name;
    } else {
      // Fallback to default grading system
      const { data: defaultSystem } = await adminOperationSimple(async (client) => {
        return await client
          .from('grading_systems')
          .select('grading_scale')
          .eq('is_default', true)
          .single();
      });
      
      gradingScale = defaultSystem?.grading_scale;
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

    return NextResponse.json({
      success: true,
      gradingScale,
      examName: examData.name,
      systemName: systemName || 'Default SPM 2023'
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
