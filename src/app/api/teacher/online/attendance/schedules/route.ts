import { NextRequest, NextResponse } from "next/server";
import { isMissingRelationError } from "@/lib/online/db";
import { createTeacherRecurringSchedule, type TeacherScheduleSlotInput } from "@/lib/online/scheduling";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";

type CreateScheduleBody = {
  student_id?: string;
  course_id?: string;
  month?: string;
  slots?: TeacherScheduleSlotInput[];
};

const getErrorStatus = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("forbidden")) return 403;
  if (
    normalized.includes("required") ||
    normalized.includes("format") ||
    normalized.includes("must be") ||
    normalized.includes("exactly")
  ) {
    return 400;
  }
  if (normalized.includes("already") || normalized.includes("not available")) return 409;
  if (normalized.includes("not found")) return 404;
  return 500;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const { data: roleRow, error: roleError } = await supabaseService
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle();
    if (roleError) throw roleError;
    if (roleRow?.role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as CreateScheduleBody;
    const studentId = (body.student_id ?? "").trim();
    const courseId = (body.course_id ?? "").trim();
    const month = (body.month ?? "").trim();
    const slots = Array.isArray(body.slots) ? body.slots : [];

    if (!studentId || !courseId || !month || slots.length === 0) {
      return NextResponse.json(
        { error: "student_id, course_id, month, and slots are required." },
        { status: 400 },
      );
    }

    const payload = await createTeacherRecurringSchedule(supabaseService, {
      tenantId: auth.tenantId,
      teacherId: auth.userId,
      studentId,
      courseId,
      month,
      slots,
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error: unknown) {
    console.error("Teacher schedule create error:", error);
    const message = error instanceof Error ? error.message : "Failed to create schedule";
    if (
      isMissingRelationError(error as { message?: string }, "online_recurring_packages") ||
      isMissingRelationError(error as { message?: string }, "online_recurring_package_slots")
    ) {
      return NextResponse.json(
        { error: "Recurring package storage is not ready yet. Run the online attendance v2 migration first." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) });
  }
}
