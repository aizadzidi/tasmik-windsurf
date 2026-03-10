import { NextRequest, NextResponse } from 'next/server';
import { adminOperationSimple } from '@/lib/supabaseServiceClientSimple';
import { requireAdminPermission } from '@/lib/adminPermissions';

type EnrollmentRow = {
  programs?:
    | {
        type?: string | null;
      }
    | Array<{ type?: string | null }>
    | null;
};

const resolveScope = (scopeParam: string | null) =>
  scopeParam?.toLowerCase() === "online" ? "online" : "campus";

const extractProgramType = (programs: EnrollmentRow["programs"]) => {
  if (!programs) return null;
  if (Array.isArray(programs)) return programs[0]?.type ?? null;
  return programs.type ?? null;
};

// GET - Fetch individual student reports for admin view modal
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const viewMode = searchParams.get('viewMode') || 'all';
    const scope = resolveScope(searchParams.get("scope"));

    const guard = await requireAdminPermission(
      request,
      scope === "online"
        ? ["admin:online-reports", "admin:online"]
        : ["admin:reports", "admin:certificates"]
    );
    if (!guard.ok) return guard.response;

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    const data = await adminOperationSimple(async (client) => {
      const { data: enrollmentData, error: enrollmentError } = await client
        .from("enrollments")
        .select("programs(type)")
        .eq("tenant_id", guard.tenantId)
        .eq("student_id", studentId)
        .in("status", ["active", "paused", "pending_payment"]);

      if (enrollmentError) throw enrollmentError;

      const isOnlineStudent = ((enrollmentData ?? []) as EnrollmentRow[]).some((row) => {
        const programType = extractProgramType(row.programs);
        return programType === "online" || programType === "hybrid";
      });
      const inScope = scope === "online" ? isOnlineStudent : !isOnlineStudent;
      if (!inScope) return [];

      let query = client
        .from("reports")
        .select(`
          *,
          users!teacher_id (name)
        `)
        .eq("student_id", studentId)
        .eq("tenant_id", guard.tenantId);

      // Filter by report type based on view mode
      if (viewMode === 'tasmik') {
        query = query.eq("type", "Tasmi");
      } else if (viewMode === 'murajaah') {
        query = query.in("type", ["Murajaah", "Old Murajaah", "New Murajaah"]);
      }

      const { data, error } = await query.order("date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    });
    
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Admin student reports fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch student reports';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
