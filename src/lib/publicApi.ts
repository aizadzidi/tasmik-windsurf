import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { isPublicSaasRegistrationHost } from "@/lib/hostResolution";

export type PublicApiErrorOptions = {
  error: string;
  code: string;
  status: number;
  extra?: Record<string, unknown>;
};

export type PublicApiErrorBody = {
  error: string;
  code: string;
  request_id: string;
  [key: string]: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export function jsonError(requestId: string, options: PublicApiErrorOptions) {
  const body: PublicApiErrorBody = {
    error: options.error,
    code: options.code,
    request_id: requestId,
  };
  if (options.extra) {
    Object.assign(body, options.extra);
  }
  return NextResponse.json(body, { status: options.status });
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidEmail(email: string): boolean {
  if (!email) return false;
  if (email.length > 254) return false;
  return EMAIL_PATTERN.test(email);
}

export function isValidSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.length < 3 || slug.length > 63) return false;
  return SLUG_PATTERN.test(slug);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

export async function enforcePublicRateLimit(params: {
  request: Request;
  keyPrefix: string;
  limit: number;
  windowMs: number;
}) {
  const ip = getClientIp(params.request);
  const result = await enforceRateLimit({
    key: `${params.keyPrefix}:${ip}`,
    limit: params.limit,
    windowMs: params.windowMs,
  });
  return { ip, result };
}

export function hashForRateLimit(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function buildIdempotencyKey(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function assertPublicRegistrationHost(host: string | null) {
  return isPublicSaasRegistrationHost(host);
}

