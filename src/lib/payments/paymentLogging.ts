const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|secret|signature|token|password|credential|webhook)/i;

function sanitizeString(value: string): string {
  if (!value) return value;

  if (/^[A-Za-z0-9+/_=-]{24,}$/.test(value)) {
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }

  return value
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, "$1***")
    .replace(/(api[_-]?key|secret|token|signature)\s*[:=]\s*['"]?[^'"\s,]+/gi, "$1=***");
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || typeof value === "undefined") return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "***";
      } else {
        output[key] = sanitizeValue(entry);
      }
    });
    return output;
  }

  return value;
}

export function logPaymentError(context: string, error: unknown, details?: Record<string, unknown>) {
  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: sanitizeString(error.message),
          stack: error.stack ? sanitizeString(error.stack) : undefined,
        }
      : sanitizeValue(error);

  console.error(`[payment:${context}]`, {
    error: normalizedError,
    details: sanitizeValue(details),
  });
}
