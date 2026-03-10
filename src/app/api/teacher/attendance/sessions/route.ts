import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { listTeacherSessionsByDate } from "@/lib/campusAttendanceService";

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getUserRole = async (userId: string) => {
  const { data, error } = await supabaseService
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role ?? null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, auth.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const role = await getUserRole(auth.userId);
    if (role !== "teacher") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = (searchParams.get("date") || toDateKey(new Date())).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const sessions = await listTeacherSessionsByDate(auth.tenantId, auth.userId, date);
    return NextResponse.json({ date, sessions });
  } catch (error) {
    console.error("Teacher attendance sessions error:", error);
    const message = error instanceof Error ? error.message : "Failed to load sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
