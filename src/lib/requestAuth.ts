import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ensureUserProfile, resolveTenantIdFromRequest } from "@/lib/tenantProvisioning";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export type AuthGuardResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse };

export type TenantAuthGuardResult =
  | { ok: true; userId: string; email: string | null; tenantId: string }
  | { ok: false; response: NextResponse };

export type StudentTenantAuthGuardResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
      tenantId: string;
      studentId: string;
      studentName: string | null;
    }
  | { ok: false; response: NextResponse };

async function resolveTeacherTenantId(userId: string): Promise<string | null> {
  const tenantIds = new Set<string>();

  const [studentsRes, claimsRes] = await Promise.all([
    supabaseAdmin
      ?.from("students")
      .select("tenant_id")
      .eq("assigned_teacher_id", userId),
    supabaseAdmin
      ?.from("online_slot_claims")
      .select("tenant_id")
      .eq("assigned_teacher_id", userId),
  ]);

  [studentsRes, claimsRes].forEach((response) => {
    if (response?.error) return;
    (response?.data ?? []).forEach((row) => {
      const tenantId = row?.tenant_id;
      if (typeof tenantId === "string" && tenantId.length > 0) {
        tenantIds.add(tenantId);
      }
    });
  });

  return tenantIds.size === 1 ? Array.from(tenantIds)[0] : null;
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<AuthGuardResult> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, userId: data.user.id, email: data.user.email ?? null };
}

export async function requireAuthenticatedTenantUser(
  request: NextRequest
): Promise<TenantAuthGuardResult> {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth;

  if (!supabaseAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required for tenant resolution" },
        { status: 500 }
      ),
    };
  }

  const requestedTenantId = await resolveTenantIdFromRequest(request, supabaseAdmin);
  if (requestedTenantId) {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", auth.userId)
      .eq("tenant_id", requestedTenantId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        response: NextResponse.json({ error: error.message }, { status: 500 }),
      };
    }

    const ensuredProfile = data?.tenant_id
      ? data
      : await ensureUserProfile({ request, userId: auth.userId, supabaseAdmin });

    if (!ensuredProfile?.tenant_id || ensuredProfile.tenant_id !== requestedTenantId) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }

    return {
      ok: true,
      userId: auth.userId,
      email: auth.email,
      tenantId: ensuredProfile.tenant_id as string,
    };
  }

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select("tenant_id")
    .eq("user_id", auth.userId)
    .limit(2);

  if (profileError) {
    return {
      ok: false,
      response: NextResponse.json({ error: profileError.message }, { status: 500 }),
    };
  }

  if (!profiles || profiles.length === 0) {
    const ensuredProfile = await ensureUserProfile({ request, userId: auth.userId, supabaseAdmin });
    if (ensuredProfile?.tenant_id) {
      return {
        ok: true,
        userId: auth.userId,
        email: auth.email,
        tenantId: ensuredProfile.tenant_id as string,
      };
    }
  }

  const tenantIds = Array.from(
    new Set((profiles ?? []).map((row) => row.tenant_id).filter((id): id is string => !!id))
  );
  if (tenantIds.length === 1) {
    return { ok: true, userId: auth.userId, email: auth.email, tenantId: tenantIds[0] };
  }
  if (tenantIds.length > 1) {
    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", auth.userId)
      .maybeSingle();

    if (userError) {
      return {
        ok: false,
        response: NextResponse.json({ error: userError.message }, { status: 500 }),
      };
    }

    if (userRow?.role === "teacher") {
      const resolvedTeacherTenantId = await resolveTeacherTenantId(auth.userId);
      if (resolvedTeacherTenantId && tenantIds.includes(resolvedTeacherTenantId)) {
        return {
          ok: true,
          userId: auth.userId,
          email: auth.email,
          tenantId: resolvedTeacherTenantId,
        };
      }
    }

    return {
      ok: false,
      response: NextResponse.json(
        { error: "Tenant context required for this request" },
        { status: 400 }
      ),
    };
  }

  const { data: tenants, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .limit(2);
  if (tenantError) {
    return {
      ok: false,
      response: NextResponse.json({ error: tenantError.message }, { status: 500 }),
    };
  }
  if (!tenants || tenants.length !== 1) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Tenant context missing" }, { status: 400 }),
    };
  }

  return { ok: true, userId: auth.userId, email: auth.email, tenantId: tenants[0].id as string };
}

export async function requireAuthenticatedStudentTenantUser(
  request: NextRequest
): Promise<StudentTenantAuthGuardResult> {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth;

  if (!supabaseAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required for student access" },
        { status: 500 }
      ),
    };
  }

  const [userRowRes, studentRes] = await Promise.all([
    supabaseAdmin.from("users").select("role").eq("id", auth.userId).maybeSingle(),
    supabaseAdmin
      .from("students")
      .select("id, name")
      .eq("tenant_id", auth.tenantId)
      .eq("account_owner_user_id", auth.userId)
      .neq("record_type", "prospect")
      .maybeSingle(),
  ]);

  if (userRowRes.error) {
    return {
      ok: false,
      response: NextResponse.json({ error: userRowRes.error.message }, { status: 500 }),
    };
  }

  if (userRowRes.data?.role !== "student") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (studentRes.error) {
    return {
      ok: false,
      response: NextResponse.json({ error: studentRes.error.message }, { status: 500 }),
    };
  }

  if (!studentRes.data?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Student profile not found." }, { status: 404 }),
    };
  }

  return {
    ok: true,
    userId: auth.userId,
    email: auth.email,
    tenantId: auth.tenantId,
    studentId: studentRes.data.id,
    studentName: studentRes.data.name ?? null,
  };
}
