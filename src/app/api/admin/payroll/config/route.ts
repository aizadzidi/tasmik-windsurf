import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/adminPermissions";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import {
  DEFAULT_WORKING_DAYS,
  DEFAULT_EPF_EMPLOYEE_RATE,
  DEFAULT_EPF_EMPLOYER_RATE,
  DEFAULT_SOCSO_EMPLOYEE_RATE,
  DEFAULT_SOCSO_EMPLOYER_RATE,
  DEFAULT_EIS_EMPLOYEE_RATE,
  DEFAULT_EIS_EMPLOYER_RATE,
} from "@/types/payroll";
import { filterTeachersByTeachingScope } from "@/lib/adminTeacherScope";

const resolveTenantIdOrThrow = async (
  request: NextRequest,
  client: Parameters<Parameters<typeof adminOperationSimple>[0]>[0]
) => {
  const tenantId = await resolveTenantIdFromRequest(request, client);
  if (tenantId) return tenantId;
  const { data, error } = await client.from("tenants").select("id").limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error("Tenant context missing");
  return data[0].id as string;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:payroll"]);
    if (!guard.ok) return guard.response;

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      // Step 1: Enumerate ALL non-parent staff in tenant
      const { data: tenantProfiles, error: profilesErr } = await client
        .from("user_profiles")
        .select("user_id, role")
        .eq("tenant_id", tenantId);
      if (profilesErr) throw profilesErr;

      const allTenantUserIds = (tenantProfiles ?? [])
        .map((p) => p.user_id)
        .filter(Boolean);
      if (allTenantUserIds.length === 0) return [];

      const { data: allUsers, error: usersErr } = await client
        .from("users")
        .select("id, name, email, role")
        .in("id", allTenantUserIds)
        .neq("role", "parent");
      if (usersErr) throw usersErr;
      if (!allUsers || allUsers.length === 0) return [];

      // Step 1b: Exclude online-only teachers (campus payroll only)
      // Only filter teacher role - admin and general_worker pass through directly
      const teacherUsers = allUsers.filter((u) => u.role === "teacher");
      const nonTeacherStaff = allUsers.filter((u) => u.role !== "teacher");
      const campusTeachers = await filterTeachersByTeachingScope(
        client, teacherUsers, "campus", tenantId
      );
      const campusStaff = [...nonTeacherStaff, ...campusTeachers];

      // Step 2: Fetch existing salary configs
      const staffUserIds = campusStaff.map((u) => u.id);
      const { data: configs, error: configsErr } = await client
        .from("staff_salary_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("user_id", staffUserIds);
      if (configsErr) throw configsErr;

      const configMap = new Map(
        (configs ?? []).map((c) => [c.user_id, c])
      );

      const roleToPosition: Record<string, string> = {
        school_admin: "admin",
        admin: "admin",
        teacher: "teacher",
        general_worker: "general_worker",
      };

      const profileRoleMap = new Map(
        (tenantProfiles ?? []).map((p) => [p.user_id, p.role])
      );

      // Step 3: Return campus staff with config overlay
      return campusStaff
        .map((user) => {
          const config = configMap.get(user.id);
          const position =
            roleToPosition[user.role ?? ""] ??
            roleToPosition[profileRoleMap.get(user.id) ?? ""] ??
            "teacher";

          if (config) {
            return {
              ...config,
              user_name: user.name,
              user_email: user.email,
              user_role: position,
              has_config: true,
            };
          }

          return {
            id: null,
            tenant_id: tenantId,
            user_id: user.id,
            basic_salary: 0,
            working_days_per_month: DEFAULT_WORKING_DAYS,
            housing_allowance: 0,
            transport_allowance: 0,
            meal_allowance: 0,
            other_allowance: 0,
            other_allowance_label: "",
            epf_employee_rate: DEFAULT_EPF_EMPLOYEE_RATE,
            epf_employer_rate: DEFAULT_EPF_EMPLOYER_RATE,
            socso_employee_rate: DEFAULT_SOCSO_EMPLOYEE_RATE,
            socso_employer_rate: DEFAULT_SOCSO_EMPLOYER_RATE,
            eis_employee_rate: DEFAULT_EIS_EMPLOYEE_RATE,
            eis_employer_rate: DEFAULT_EIS_EMPLOYER_RATE,
            is_active: true,
            user_name: user.name,
            user_email: user.email,
            user_role: position,
            has_config: false,
          };
        })
        .sort((a, b) => (a.user_name ?? "").localeCompare(b.user_name ?? ""));
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch configs";
    const status = message.includes("Admin access required") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminPermission(request, ["admin:payroll"]);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    if (body.basic_salary !== undefined && body.basic_salary < 0) {
      return NextResponse.json({ error: "basic_salary must be >= 0" }, { status: 400 });
    }

    // Allowlist fields to prevent mass assignment (P0 security fix)
    const ALLOWED_FIELDS = [
      "basic_salary", "working_days_per_month",
      "housing_allowance", "transport_allowance", "meal_allowance",
      "other_allowance", "other_allowance_label",
      "epf_employee_rate", "epf_employer_rate",
      "socso_employee_rate", "socso_employer_rate",
      "eis_employee_rate", "eis_employer_rate",
    ] as const;

    const data = await adminOperationSimple(async (client) => {
      const tenantId = await resolveTenantIdOrThrow(request, client);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const safeFields: Record<string, any> = {};
      for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) safeFields[key] = body[key];
      }

      const upsertData = {
        tenant_id: tenantId,
        user_id,
        ...safeFields,
        updated_at: new Date().toISOString(),
      };

      const { data: result, error } = await client
        .from("staff_salary_config")
        .upsert(upsertData, { onConflict: "tenant_id,user_id" })
        .select()
        .single();

      if (error) throw error;
      return result;
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save config";
    const status = message.includes("Admin access required") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
