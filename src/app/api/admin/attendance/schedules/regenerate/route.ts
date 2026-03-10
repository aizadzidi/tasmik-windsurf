import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { regenerateSessionInstances } from "@/lib/campusAttendanceService";

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type RegenerateBody = {
  from?: string;
  to?: string;
};

export async function POST(request: NextRequest) {
  const guard = await requireAdminPermission(request, ["admin:attendance"]);
  if (!guard.ok) return guard.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, guard.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const body = (await request.json()) as RegenerateBody;
    const from = (body.from || toDateKey(new Date())).slice(0, 10);
    const toDate = body.to ? new Date(`${body.to}T00:00:00`) : new Date();
    if (!body.to) toDate.setDate(toDate.getDate() + 30);
    const to = toDateKey(toDate).slice(0, 10);

    const result = await regenerateSessionInstances(guard.tenantId, guard.userId, from, to);
    return NextResponse.json({ from, to, ...result });
  } catch (error) {
    console.error("Admin attendance schedule regenerate error:", error);
    const message = error instanceof Error ? error.message : "Failed to regenerate sessions";
    const status = message.includes("Date range") || message.includes("before") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
