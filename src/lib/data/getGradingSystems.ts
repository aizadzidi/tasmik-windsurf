import { supabase as defaultClient } from "@/lib/supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSession } from "@/lib/supabase/ensureSession";

export type GradeEntry = {
  letter?: string;
  grade?: string;
  min: number;
  max: number;
  gpa?: number;
};

export type GradingScale = {
  type: "letter" | "percentage" | "pass_fail";
  grades: GradeEntry[];
};

export type GradingSystem = {
  id: string;
  name: string;
  description: string | null;
  grading_scale: GradingScale;
  is_default: boolean;
  created_at?: string;
};

export async function fetchGradingSystems(
  supabase: SupabaseClient = defaultClient
): Promise<GradingSystem[]> {
  await ensureSession(supabase);

  // Try RPC first (security definer), fallback to table
  const r = await supabase.rpc("get_grading_systems");
  if (!r.error && Array.isArray(r.data)) return r.data as GradingSystem[];

  const t = await supabase
    .from("grading_systems")
    .select("id,name,description,grading_scale,is_default,created_at")
    .order("is_default", { ascending: false })
    .order("name");
  if (t.error) throw t.error;
  return (t.data ?? []) as GradingSystem[];
}