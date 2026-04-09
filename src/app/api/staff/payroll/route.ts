import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const resolveTenantIdOrThrow = async (
  request: NextRequest,
  client: Parameters<Parameters<typeof adminOperationSimple>[0]>[0],
  userId: string
) => {
  const tenantId = await resolveTenantIdFromRequest(request, client);
  if (tenantId) return tenantId;

  const { data: userProfiles, error: profileError } = await client
    .from("user_profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(2);
  if (profileError) throw profileError;

  const tenantIds = Array.from(
    new Set((userProfiles ?? []).map((profile) => profile.tenant_id).filter(Boolean))
  );
  if (tenantIds.length === 1) return tenantIds[0] as string;

  const { data, error } = await client.from("tenants").select("id").limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error("Tenant context required");
  return data[0].id as string;
};

function parseMonth(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return null;
}

/**
 * Staff payslip access - uses requester-scoped Supabase client
 * so RLS monthly_payroll_staff_read_own is actually enforced.
 * Also explicitly scopes by tenant_id for multi-tenant safety.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Requester-scoped client: RLS policies apply as this user
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user is authenticated
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve tenant for explicit scoping (multi-tenant safety)
    const tenantId = await adminOperationSimple(async (client) => {
      return resolveTenantIdOrThrow(request, client, authData.user.id);
    });

    const { searchParams } = new URL(request.url);
    const monthRaw = searchParams.get("month");

    let query = supabase
      .from("monthly_payroll")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("payroll_month", { ascending: false });

    // RLS enforces: user_id = auth.uid() AND status = 'finalized'
    if (monthRaw) {
      const monthStr = parseMonth(monthRaw);
      if (!monthStr) {
        return NextResponse.json({ error: "Invalid month format (YYYY-MM)" }, { status: 400 });
      }
      query = query.eq("payroll_month", `${monthStr}-01`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json(data ?? []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch payslips";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
