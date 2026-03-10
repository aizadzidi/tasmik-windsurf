import type { SupabaseClient } from "@supabase/supabase-js";

const FEATURE_KEY = "attendance_v2";

const normalizeBool = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback;
  return value.toLowerCase() === "true";
};

export const isAttendanceV2GloballyEnabled = () =>
  normalizeBool(process.env.NEXT_PUBLIC_ENABLE_ATTENDANCE_V2, false);

export async function isAttendanceV2EnabledForTenant(
  client: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  if (!isAttendanceV2GloballyEnabled()) {
    return false;
  }

  const { data, error } = await client
    .from("tenant_feature_flags")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("feature_key", FEATURE_KEY)
    .maybeSingle();

  if (error) {
    // Keep legacy mode when migration is not yet applied.
    if (/tenant_feature_flags|relation .*tenant_feature_flags/i.test(error.message || "")) {
      return false;
    }
    throw error;
  }

  if (typeof data?.enabled === "boolean") {
    return data.enabled;
  }

  return true;
}

export const attendanceV2FeatureKey = FEATURE_KEY;
