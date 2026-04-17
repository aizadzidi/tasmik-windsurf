import { supabase as defaultClient } from "@/lib/supabaseClient";
import type {
  Session,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

const INVALID_REFRESH_TOKEN_PATTERNS = [
  "Invalid Refresh Token",
  "Refresh Token Not Found",
  "refresh_token_not_found",
  "Refresh Token Already Used",
];

const AUTH_SETTLE_DELAY_MS = 25;

type AuthResult<T> = Promise<{
  data: T;
  error: unknown;
}>;

type SessionData = { session: Session | null };
type UserData = { user: User | null };

function readErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = readErrorMessage(error);
  if (!message) return false;
  return INVALID_REFRESH_TOKEN_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function clearLocalSupabaseSession(
  supabase: SupabaseClient = defaultClient
): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Do not escalate into a global sign-out when local cleanup fails.
  }
}

async function runWithInvalidRefreshRetry<T>(
  operation: () => AuthResult<T>,
  hasData: (data: T) => boolean,
  supabase: SupabaseClient = defaultClient
): Promise<{ data: T; error: unknown }> {
  const initial = await operation();
  if (!isInvalidRefreshTokenError(initial.error)) {
    return initial;
  }

  // Give concurrent refresh/broadcast updates time to settle before treating it as a hard logout.
  await delay(AUTH_SETTLE_DELAY_MS);

  const retried = await operation();
  if (hasData(retried.data) || !isInvalidRefreshTokenError(retried.error)) {
    return retried;
  }

  await clearLocalSupabaseSession(supabase);
  return retried;
}

export async function getSessionWithRecovery(
  supabase: SupabaseClient = defaultClient
): Promise<{ data: { session: Session | null }; error: unknown }> {
  return runWithInvalidRefreshRetry<SessionData>(
    () => supabase.auth.getSession(),
    (data) => Boolean(data.session),
    supabase
  );
}

export async function getUserWithRecovery(
  supabase: SupabaseClient = defaultClient
): Promise<{ data: { user: User | null }; error: unknown }> {
  return runWithInvalidRefreshRetry<UserData>(
    () => supabase.auth.getUser(),
    (data) => Boolean(data.user),
    supabase
  );
}

export async function refreshSessionWithRecovery(
  supabase: SupabaseClient = defaultClient
): Promise<{ data: { session: Session | null; user: User | null }; error: unknown }> {
  return runWithInvalidRefreshRetry<{ session: Session | null; user: User | null }>(
    () => supabase.auth.refreshSession(),
    (data) => Boolean(data.session?.access_token),
    supabase
  );
}
