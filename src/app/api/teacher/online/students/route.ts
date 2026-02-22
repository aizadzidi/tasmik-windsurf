import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";

type UserRoleRow = {
  role: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const { data: userRow, error: userError } = await supabaseService
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle<UserRoleRow>();
    if (userError) throw userError;
    if (userRow?.role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseService
      .from("online_slot_claims")
      .select(
        "id, status, session_date, seat_hold_expires_at, student_id, students(name, parent_name, parent_contact_number), course_id, online_courses(name)"
      )
      .eq("tenant_id", auth.tenantId)
      .eq("assigned_teacher_id", auth.userId)
      .in("status", ["pending_payment", "active"])
      .order("session_date", { ascending: true });
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error: unknown) {
    console.error("Teacher online students fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch assigned online students";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
