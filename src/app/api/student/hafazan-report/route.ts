import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedStudentTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedStudentTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const [studentRes, reportsRes, juzTestsRes] = await Promise.all([
      supabaseService
        .from("students")
        .select("id, name, assigned_teacher_id, class_id, memorization_completed, memorization_completed_date")
        .eq("tenant_id", auth.tenantId)
        .eq("id", auth.studentId)
        .eq("account_owner_user_id", auth.userId)
        .neq("record_type", "prospect")
        .maybeSingle(),
      supabaseService
        .from("reports")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .eq("student_id", auth.studentId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabaseService
        .from("juz_tests")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .eq("student_id", auth.studentId)
        .order("test_date", { ascending: false })
        .order("id", { ascending: false }),
    ]);

    if (studentRes.error) throw studentRes.error;
    if (reportsRes.error) throw reportsRes.error;

    const student = studentRes.data;
    if (!student?.id) {
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    const teacherId = student.assigned_teacher_id ?? null;
    const classId = student.class_id ?? null;

    const [teacherRes, classRes] = await Promise.all([
      teacherId
        ? supabaseService
            .from("users")
            .select("name")
            .eq("id", teacherId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      classId
        ? supabaseService
            .from("classes")
            .select("name")
            .eq("id", classId)
            .eq("tenant_id", auth.tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (teacherRes.error) throw teacherRes.error;
    if (classRes.error) throw classRes.error;

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name ?? auth.studentName ?? "Student",
        teacher_name: teacherRes.data?.name ?? null,
        class_name: classRes.data?.name ?? null,
        memorization_completed: Boolean(student.memorization_completed),
        memorization_completed_date: student.memorization_completed_date ?? null,
      },
      reports: reportsRes.data ?? [],
      juz_tests: juzTestsRes.error ? [] : (juzTestsRes.data ?? []),
    });
  } catch (error: unknown) {
    console.error("Student hafazan report load error:", error);
    const message = error instanceof Error ? error.message : "Failed to load hafazan report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
