import { supabase } from "@/lib/supabaseClient";
import {
  getSessionWithRecovery,
  getUserWithRecovery,
  refreshSessionWithRecovery,
} from "@/lib/supabase/clientAuth";

let pendingAccessTokenPromise: Promise<string | null> | null = null;
let pendingAccessTokenVersion: number | null = null;
let authStateVersion = 0;
let authStateTrackingInitialized = false;

function ensureAuthStateTracking() {
  if (authStateTrackingInitialized || typeof window === "undefined") {
    return;
  }

  authStateTrackingInitialized = true;
  supabase.auth.onAuthStateChange(() => {
    authStateVersion += 1;
    pendingAccessTokenPromise = null;
    pendingAccessTokenVersion = null;
  });
}

async function resolveAccessToken() {
  ensureAuthStateTracking();

  const currentVersion = authStateVersion;
  if (pendingAccessTokenPromise && pendingAccessTokenVersion === currentVersion) {
    return pendingAccessTokenPromise;
  }

  pendingAccessTokenVersion = currentVersion;
  pendingAccessTokenPromise = (async () => {
    const { data: sessionData } = await getSessionWithRecovery(supabase);
    if (sessionData.session?.access_token) {
      return sessionData.session.access_token;
    }

    const { data: userData, error: userError } = await getUserWithRecovery(supabase);
    if (userError || !userData.user) {
      return null;
    }

    const { data: refreshData, error: refreshError } = await refreshSessionWithRecovery(supabase);
    if (!refreshError && refreshData.session?.access_token) {
      return refreshData.session.access_token;
    }

    const { data: latestSessionData } = await getSessionWithRecovery(supabase);
    return latestSessionData.session?.access_token ?? null;
  })();

  try {
    const token = await pendingAccessTokenPromise;
    if (pendingAccessTokenVersion !== currentVersion) {
      return resolveAccessToken();
    }
    return token;
  } finally {
    if (pendingAccessTokenVersion === currentVersion) {
      pendingAccessTokenPromise = null;
      pendingAccessTokenVersion = null;
    }
  }
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
