import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureUserProfile } from "@/lib/tenantProvisioning";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) {
      return NextResponse.json({ error: "Missing profile" }, { status: 403 });
    }

    const ensuredProfile = profile?.tenant_id
      ? profile
      : await ensureUserProfile({ request, userId: user.id, supabaseAdmin });
    if (!ensuredProfile?.tenant_id) {
      return NextResponse.json({ error: "Missing profile" }, { status: 403 });
    }

    const tenantId = ensuredProfile.tenant_id;

    const [classesRes, subjectsRes, teacherProfilesRes] = await Promise.all([
      supabaseAdmin.from("classes").select("id, name").eq("tenant_id", tenantId).order("name"),
      supabaseAdmin.from("subjects").select("id, name").eq("tenant_id", tenantId).order("name"),
      supabaseAdmin
        .from("user_profiles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "teacher"),
    ]);

    if (classesRes.error) throw classesRes.error;
    if (subjectsRes.error) throw subjectsRes.error;
    if (teacherProfilesRes.error) throw teacherProfilesRes.error;

    const teacherIds = (teacherProfilesRes.data ?? []).map((row) => row.user_id);
    let teachers: Array<{ id: string; name: string | null; email: string | null }> = [];
    if (teacherIds.length > 0) {
      const { data: teacherRows, error: teacherError } = await supabaseAdmin
        .from("users")
        .select("id, name, email")
        .in("id", teacherIds)
        .order("name");
      if (teacherError) throw teacherError;
      teachers =
        teacherRows?.map((row) => ({
          id: String(row.id),
          name: row.name ?? null,
          email: row.email ?? null,
        })) ?? [];
    }

    return NextResponse.json({
      classes: classesRes.data ?? [],
      subjects: subjectsRes.data ?? [],
      teachers,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load metadata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
