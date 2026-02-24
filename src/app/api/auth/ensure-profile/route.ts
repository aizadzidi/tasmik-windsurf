import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureUserProfile, TenantReassignmentError } from "@/lib/tenantProvisioning";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env vars: ${name}`);
  }
  return value;
}

const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const supabaseServiceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

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

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await ensureUserProfile({ request, userId: user.id, supabaseAdmin });
    if (!profile?.tenant_id) {
      return NextResponse.json({ error: "Missing profile" }, { status: 404 });
    }

    if (profile.role === "school_admin") {
      const { error: trialError } = await supabaseAdmin.rpc(
        "start_tenant_trial_on_first_admin_login",
        {
          p_tenant_id: profile.tenant_id,
          p_user_id: user.id,
        }
      );
      if (trialError) {
        console.warn("Ensure profile: trial start failed", trialError);
      }
    }

    return NextResponse.json({ ok: true, profile });
  } catch (error: unknown) {
    if (error instanceof TenantReassignmentError) {
      return NextResponse.json(
        { error: "User profile is already assigned to a different tenant." },
        { status: 409 }
      );
    }
    if (error instanceof Error) {
      console.error("Ensure profile failed", error.message, error.stack);
    } else {
      console.error("Ensure profile failed", error);
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
