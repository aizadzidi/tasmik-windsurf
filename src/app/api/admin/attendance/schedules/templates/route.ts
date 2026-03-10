import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { supabaseService } from "@/lib/supabaseServiceClient";
import { isAttendanceV2EnabledForTenant } from "@/lib/attendanceV2";
import { createSessionTemplate } from "@/lib/campusAttendanceService";
import type { SessionTemplatePayload } from "@/types/campusAttendance";

export async function GET(request: NextRequest) {
  const guard = await requireAdminPermission(request, ["admin:attendance"]);
  if (!guard.ok) return guard.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, guard.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const { data, error } = await supabaseService
      .from("campus_session_templates")
      .select("*, classes(name), subjects(name), users(name)")
      .eq("tenant_id", guard.tenantId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error("Admin attendance schedule templates list error:", error);
    const message = error instanceof Error ? error.message : "Failed to load templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminPermission(request, ["admin:attendance"]);
  if (!guard.ok) return guard.response;

  try {
    const enabled = await isAttendanceV2EnabledForTenant(supabaseService, guard.tenantId);
    if (!enabled) {
      return NextResponse.json({ error: "Attendance V2 is not enabled for this tenant." }, { status: 404 });
    }

    const payload = (await request.json()) as SessionTemplatePayload;
    if (!payload.class_id) {
      return NextResponse.json({ error: "class_id is required" }, { status: 400 });
    }

    const template = await createSessionTemplate(guard.tenantId, guard.userId, payload);
    return NextResponse.json({ template });
  } catch (error) {
    console.error("Admin attendance schedule template create error:", error);
    const message = error instanceof Error ? error.message : "Failed to create template";
    const status = message.includes("must") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
