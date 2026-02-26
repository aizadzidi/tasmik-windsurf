import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { requireAdminPermission } from '@/lib/adminPermissions';

type StudentRow = {
  id: string;
  name: string | null;
  assigned_teacher_id: string | null;
  class_id: string | null;
  memorization_completed: string | null;
  memorization_completed_date: string | null;
  users?: { name?: string | null } | null;
  classes?: { name?: string | null } | null;
};

type MemorizationReportRow = {
  student_id: string;
  juzuk: number | null;
};

type JuzTestRow = {
  student_id: string;
  juz_number: number | null;
  test_date?: string | null;
  passed?: boolean | null;
  total_percentage?: number | null;
  examiner_name?: string | null;
  test_mode?: string | null;
  test_hizb?: boolean | null;
  hizb_number?: number | null;
  page_from?: number | null;
  page_to?: number | null;
};

type ReportRow = {
  id: string;
  student_id: string;
  type?: string | null;
  date?: string | null;
  [key: string]: unknown;
};

type EnrollmentRow = {
  student_id: string | null;
  programs?:
    | {
        type?: string | null;
      }
    | Array<{ type?: string | null }>
    | null;
};

const extractProgramType = (programs: EnrollmentRow["programs"]) => {
  if (!programs) return null;
  if (Array.isArray(programs)) return programs[0]?.type ?? null;
  return programs.type ?? null;
};

// GET - Fetch student progress data for admin reports page
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ['admin:reports']);
    if (!guard.ok) return guard.response;

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
        `)
        .eq('tenant_id', guard.tenantId)
        .neq('record_type', 'prospect');

      if (studentsError) throw studentsError;

      const studentsSafe = (studentsData ?? []) as StudentRow[];

      if (studentsSafe.length === 0) {
        return [];
      }

      const studentIds = studentsSafe.map((student) => student.id);
      const { data: enrollmentData, error: enrollmentError } = await client
        .from("enrollments")
        .select("student_id, status, programs(type)")
        .eq("tenant_id", guard.tenantId)
        .in("status", ["active", "paused", "pending_payment"])
        .in("student_id", studentIds);
      if (enrollmentError) throw enrollmentError;

      const onlineStudentIds = new Set(
        ((enrollmentData ?? []) as EnrollmentRow[])
          .filter((row) => {
            const programType = extractProgramType(row.programs);
            return programType === "online" || programType === "hybrid";
          })
          .map((row) => row.student_id)
          .filter((id): id is string => Boolean(id))
      );

      const campusStudents = studentsSafe.filter((student) => !onlineStudentIds.has(student.id));
      if (campusStudents.length === 0) {
        return [];
      }

      const campusStudentIds = campusStudents.map((student) => student.id);

      if (viewMode === 'juz_tests') {
        // Fetch juz test related data
        const [memorizationResults, juzTestResults] = await Promise.all([
          // Get memorization data
          client
            .from('reports')
            .select('student_id, juzuk')
            .in('student_id', campusStudentIds)
            .eq('type', 'Tasmi')
            .not('juzuk', 'is', null)
            .order('juzuk', { ascending: false }),
          
          // Get juz test data (if table exists)
          client
            .from('juz_tests')
            .select('student_id, juz_number, test_date, passed, total_percentage, examiner_name, test_mode, test_hizb, hizb_number, page_from, page_to')
            .in('student_id', campusStudentIds)
            .order('test_date', { ascending: false })
            .order('id', { ascending: false })
            .then(result => {
              if (result.error?.message?.includes('relation "public.juz_tests" does not exist')) {
                return { data: [], error: null };
              }
              return result;
            })
        ]);

        // Process juz test data
        const memorizationRows = (memorizationResults.data ?? []) as MemorizationReportRow[];
        const memorizationByStudent = memorizationRows.reduce<Record<string, number[]>>((acc, item) => {
          if (!acc[item.student_id]) acc[item.student_id] = [];
          if (typeof item.juzuk === 'number') {
            acc[item.student_id].push(item.juzuk);
          }
          return acc;
        }, {});

        const juzTestRows = (juzTestResults.data ?? []) as JuzTestRow[];
        const juzTestsByStudent = juzTestRows.reduce<Record<string, JuzTestRow[]>>((acc, test) => {
          if (!acc[test.student_id]) acc[test.student_id] = [];
          acc[test.student_id].push(test);
          return acc;
        }, {});

        return campusStudents.map(student => ({
          ...student,
          teacher_name: student.users?.name || null,
          class_name: student.classes?.name || null,
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
          .in('student_id', campusStudentIds)
          .order('date', { ascending: false });

        if (reportsError) throw reportsError;

        // Group reports by student and type
        const reportRows = (reportsData ?? []) as ReportRow[];
        const reportsByStudent = reportRows.reduce<Record<string, { tasmik: ReportRow[], murajaah: ReportRow[] }>>((acc, report) => {
          if (!acc[report.student_id]) {
            acc[report.student_id] = { tasmik: [], murajaah: [] };
          }
          const type = report.type?.toLowerCase() === 'tasmi' ? 'tasmik' : 'murajaah';
          acc[report.student_id][type].push(report);
          return acc;
        }, {});

        return campusStudents.map(student => {
          const studentReports = reportsByStudent[student.id] || { tasmik: [], murajaah: [] };
          
          return {
            ...student,
            teacher_name: student.users?.name || null,
            class_name: student.classes?.name || null,
            latestTasmikReport: studentReports.tasmik[0] || null,
            latestMurajaahReport: studentReports.murajaah[0] || null,
            memorized_juzuks: [],
            juz_tests: []
          };
        });
      }
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin reports fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch reports data';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
