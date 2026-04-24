import { NextRequest, NextResponse } from "next/server";
import { currentMonthKey } from "@/lib/online/recurring";
import {
  fetchRecurringSnapshot,
  filterPackagesForMonth,
  hydratePlannerPackages,
} from "@/lib/online/recurringStore";
import { requireAuthenticatedStudentTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedStudentTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const [studentRes, snapshot] = await Promise.all([
      supabaseService
        .from("students")
        .select("id, name")
        .eq("tenant_id", auth.tenantId)
        .eq("id", auth.studentId)
        .eq("account_owner_user_id", auth.userId)
        .neq("record_type", "prospect")
        .maybeSingle(),
      fetchRecurringSnapshot(supabaseService, auth.tenantId),
    ]);

    if (studentRes.error) throw studentRes.error;
    if (!studentRes.data?.id) {
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    if (snapshot.warning) {
      return NextResponse.json({
        setup_required: true,
        student: studentRes.data,
        courses: [],
        package_options: [],
        pending_packages: [],
        active_packages: [],
      });
    }

    const availabilityCountByTemplate = new Map<string, number>();
    snapshot.teacherAvailability
      .filter((row) => row.is_available)
      .forEach((row) => {
        availabilityCountByTemplate.set(
          row.slot_template_id,
          (availabilityCountByTemplate.get(row.slot_template_id) ?? 0) + 1,
        );
      });

    const activePackages = hydratePlannerPackages({
      packages: filterPackagesForMonth(snapshot.packages, currentMonthKey()).filter(
        (pkg) => pkg.student_id === auth.studentId,
      ),
      packageSlots: snapshot.packageSlots,
      students: snapshot.students,
      courses: snapshot.courses,
    });

    const packageOptions = snapshot.courses
      .filter((course) => course.is_active)
      .map((course) => ({
        course_id: course.id,
        course_name: course.name,
        sessions_per_week: course.sessions_per_week,
        monthly_fee_cents: course.monthly_fee_cents,
        duration_minutes: course.default_slot_duration_minutes ?? 30,
        templates: snapshot.templates
          .filter((template) => template.course_id === course.id && template.is_active)
          .map((template) => ({
            slot_template_id: template.id,
            day_of_week: template.day_of_week,
            start_time: template.start_time,
            duration_minutes: template.duration_minutes,
            available_teachers: availabilityCountByTemplate.get(template.id) ?? 0,
          })),
      }))
      .filter((row) => row.templates.length > 0);

    return NextResponse.json({
      setup_required: false,
      student: {
        id: studentRes.data.id,
        name: studentRes.data.name ?? auth.studentName ?? "Student",
      },
      courses: snapshot.courses,
      package_options: packageOptions,
      pending_packages: activePackages.filter((pkg) => pkg.status === "pending_payment" || pkg.status === "draft"),
      active_packages: activePackages.filter((pkg) => pkg.status === "active"),
    });
  } catch (error: unknown) {
    console.error("Student online package explore error:", error);
    const message = error instanceof Error ? error.message : "Failed to load online package options";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
