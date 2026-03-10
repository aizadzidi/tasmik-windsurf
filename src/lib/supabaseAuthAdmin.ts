type ErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const isSupabaseAuthUserNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;

  const candidate = error as ErrorLike;
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const code = asNonEmptyString(candidate.code)?.toLowerCase();
  const message = asNonEmptyString(candidate.message)?.toLowerCase() ?? "";

  return (
    status === 404 ||
    code === "user_not_found" ||
    message.includes("user not found")
  );
};

export const formatSupabaseAuthDeleteError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== "object") return "Unknown auth delete error";

  const candidate = error as ErrorLike;
  const message = asNonEmptyString(candidate.message);
  const code = asNonEmptyString(candidate.code);
  const status =
    typeof candidate.status === "number" ? String(candidate.status) : null;

  const parts = [message, code ? `code=${code}` : null, status ? `status=${status}` : null]
    .filter((value): value is string => Boolean(value));
  if (parts.length === 0) return "Unknown auth delete error";
  return parts.join(" | ");
};
