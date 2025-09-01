import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';

// GET - Fetch student progress data for admin reports page
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const viewMode = searchParams.get('viewMode') || 'tasmik';

    const data = await adminOperationSimple(async (client) => {
      // Fetch students with teacher and class info
      const { data: studentsData, error: studentsError } = await client
        .from('students')
        .select(`
          id,
          name,
          assigned_teacher_id,
          class_id,
          memorization_completed,
          memorization_completed_date,
          users!assigned_teacher_id(name),
          classes(name)
        `);

      if (studentsError) throw studentsError;

      if (!studentsData || studentsData.length === 0) {
        return [];
      }

      const studentIds = studentsData.map(s => s.id);

      if (viewMode === 'juz_tests') {
        // Fetch juz test related data
        const [memorizationResults, juzTestResults] = await Promise.all([
          // Get memorization data
          client
            .from('reports')
            .select('student_id, juzuk')
            .in('student_id', studentIds)
            .eq('type', 'Tasmi')
            .not('juzuk', 'is', null)
            .order('juzuk', { ascending: false }),
          
          // Get juz test data (if table exists)
          client
            .from('juz_tests')
            .select('student_id, juz_number, test_date, passed, total_percentage, examiner_name, test_hizb')
            .in('student_id', studentIds)
            .order('juz_number', { ascending: false })
            .then(result => {
              if (result.error?.message?.includes('relation "public.juz_tests" does not exist')) {
                return { data: [], error: null };
              }
              return result;
            })
        ]);

        // Process juz test data
        const memorizationByStudent = memorizationResults.data?.reduce((acc, item) => {
          if (!acc[item.student_id]) acc[item.student_id] = [];
          acc[item.student_id].push(item.juzuk);
          return acc;
        }, {} as Record<string, number[]>) || {};

        const juzTestsByStudent = juzTestResults.data?.reduce((acc, test) => {
          if (!acc[test.student_id]) acc[test.student_id] = [];
          acc[test.student_id].push(test);
          return acc;
        }, {} as Record<string, any[]>) || {};

        return studentsData.map(student => ({
          ...student,
          teacher_name: (student.users as { name?: string } | null)?.name || null,
          class_name: (student.classes as { name?: string } | null)?.name || null,
          memorized_juzuks: memorizationByStudent[student.id] || [],
          juz_tests: juzTestsByStudent[student.id] || [],
          latestTasmikReport: null,
          latestMurajaahReport: null
        }));

      } else {
        // Fetch regular reports data for tasmik/murajaah modes
        const { data: reportsData, error: reportsError } = await client
          .from('reports')
          .select('*')
          .in('student_id', studentIds)
          .order('date', { ascending: false });

        if (reportsError) throw reportsError;

        // Group reports by student and type
        const reportsByStudent = reportsData?.reduce((acc, report) => {
          if (!acc[report.student_id]) {
            acc[report.student_id] = { tasmik: [], murajaah: [] };
          }
          const type = report.type?.toLowerCase() === 'tasmi' ? 'tasmik' : 'murajaah';
          acc[report.student_id][type].push(report);
          return acc;
        }, {} as Record<string, { tasmik: any[], murajaah: any[] }>) || {};

        return studentsData.map(student => {
          const studentReports = reportsByStudent[student.id] || { tasmik: [], murajaah: [] };
          
          return {
            ...student,
            teacher_name: (student.users as { name?: string } | null)?.name || null,
            class_name: (student.classes as { name?: string } | null)?.name || null,
            latestTasmikReport: studentReports.tasmik[0] || null,
            latestMurajaahReport: studentReports.murajaah[0] || null,
            memorized_juzuks: [],
            juz_tests: []
          };
        });
      }
    });
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Admin reports fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reports data' },
      { status: 500 }
    );
  }
}