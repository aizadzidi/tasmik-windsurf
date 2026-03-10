import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { getTeacherRiskStudents } from "@/lib/campusAttendanceService";

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

    const students = await getTeacherRiskStudents(auth.tenantId, auth.userId);
    return NextResponse.json({ students });
  } catch (error) {
    console.error("Teacher attendance risk error:", error);
    const message = error instanceof Error ? error.message : "Failed to load risk students";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
