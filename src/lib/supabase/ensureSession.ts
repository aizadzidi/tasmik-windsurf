import { supabase as defaultClient } from "@/lib/supabaseClient";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

export async function ensureSession(
  supabase: SupabaseClient = defaultClient
): Promise<Session> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  return await new Promise((resolve) => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) {
        sub.subscription.unsubscribe();
        resolve(s);
      }
    });
  });
}