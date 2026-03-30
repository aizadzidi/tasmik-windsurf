import { supabase } from "@/lib/supabaseClient";

async function resolveAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return null;
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshData.session?.access_token) {
    return refreshData.session.access_token;
  }

  const { data: latestSessionData } = await supabase.auth.getSession();
  return latestSessionData.session?.access_token ?? null;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await resolveAccessToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const method = (init.method ?? "GET").toUpperCase();

  return fetch(input, {
    ...init,
    headers,
    // Authenticated app data should prefer fresh reads unless a caller opts into caching explicitly.
    ...(init.cache === undefined && (method === "GET" || method === "HEAD")
      ? { cache: "no-store" as RequestCache }
      : {}),
  });
}
