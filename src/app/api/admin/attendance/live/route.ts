import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { listAdminLiveSessions } from "@/lib/campusAttendanceService";

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export async function GET(request: NextRequest) {
  const guard = await requireAdminPermission(request, ["admin:attendance"]);
  if (!guard.ok) return guard.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, guard.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const date = (searchParams.get("date") || toDateKey(new Date())).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const sessions = await listAdminLiveSessions(guard.tenantId, date);
    return NextResponse.json({ date, sessions });
  } catch (error) {
    console.error("Admin attendance live error:", error);
    const message = error instanceof Error ? error.message : "Failed to load live sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
