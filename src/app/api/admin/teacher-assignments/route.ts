import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { requireAdminPermission } from "@/lib/adminPermissions";

type AssignmentRow = {
  teacher_id: string;
  program_id: string;
  programs?: { type?: string | null } | null;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:users"]);
    if (!guard.ok) return guard.response;

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdFromRequest(request, client);
      if (!tenantId) {
        throw new Error("Missing tenant context");
      }

      const { data, error } = await client
        .from("teacher_assignments")
        .select("teacher_id, program_id, programs(type)")
        .eq("tenant_id", tenantId);

      if (error) throw error;

      const grouped = new Map<string, Set<string>>();
      (data as AssignmentRow[] | null)?.forEach((row) => {
        const types = grouped.get(row.teacher_id) ?? new Set<string>();
        const programType = row.programs?.type ?? null;
        if (programType) {
          types.add(programType);
        }
        grouped.set(row.teacher_id, types);
      });

      return Array.from(grouped.entries()).map(([teacher_id, types]) => ({
        teacher_id,
        program_types: Array.from(types.values()),
      }));
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Admin teacher assignments fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch assignments";
    const status = message.includes("Admin access required") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:users"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { teacher_id, program_types } = body as {
      teacher_id?: string;
      program_types?: string[];
    };

    if (!teacher_id) {
      return NextResponse.json({ error: "teacher_id is required" }, { status: 400 });
    }

    if (program_types && !Array.isArray(program_types)) {
      return NextResponse.json({ error: "program_types must be an array" }, { status: 400 });
    }

    const normalizedTypes = (program_types ?? []).filter((type) =>
      ["campus", "online", "hybrid"].includes(type)
    );

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdFromRequest(request, client);
      if (!tenantId) {
        throw new Error("Missing tenant context");
      }

      const { data: programs, error: programsError } = await client
        .from("programs")
        .select("id, type")
        .eq("tenant_id", tenantId)
        .in("type", normalizedTypes.length > 0 ? normalizedTypes : ["campus", "online", "hybrid"]);

      if (programsError) throw programsError;

      const programIds = (programs ?? [])
        .filter((p) => normalizedTypes.length === 0 || normalizedTypes.includes(p.type))
        .map((p) => p.id);

      const { error: deleteError } = await client
        .from("teacher_assignments")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("teacher_id", teacher_id);

      if (deleteError) throw deleteError;

      if (programIds.length === 0) return { teacher_id, program_types: [] };

      const inserts = programIds.map((programId) => ({
        tenant_id: tenantId,
        teacher_id,
        program_id: programId,
        role: "teacher",
      }));

      const { error: insertError } = await client
        .from("teacher_assignments")
        .insert(inserts);

      if (insertError) throw insertError;

      return { teacher_id, program_types: normalizedTypes };
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Admin teacher assignments update error:", error);
    const message = error instanceof Error ? error.message : "Failed to update assignments";
    const status = message.includes("Admin access required") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
