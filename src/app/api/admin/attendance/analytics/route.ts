import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { getAttendanceAnalytics } from "@/lib/campusAttendanceService";

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
    const to = (searchParams.get("to") || toDateKey(new Date())).slice(0, 10);
    const fromDefault = new Date(`${to}T00:00:00`);
    fromDefault.setDate(fromDefault.getDate() - 29);
    const from = (searchParams.get("from") || toDateKey(fromDefault)).slice(0, 10);
    const classId = searchParams.get("classId") || null;
    const teacherId = searchParams.get("teacherId") || null;

    const { rows, heatmap } = await getAttendanceAnalytics(
      guard.tenantId,
      from,
      to,
      classId,
      teacherId,
    );

    return NextResponse.json({ from, to, rows, heatmap });
  } catch (error) {
    console.error("Admin attendance analytics error:", error);
    const message = error instanceof Error ? error.message : "Failed to load analytics";
    const status = message.includes("Date range") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
