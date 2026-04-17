import { NextRequest, NextResponse } from "next/server";
import {
  asTrimmedText,
  enforcePublicRateLimit,
  isValidEmail,
  isValidPassword,
  jsonError,
  normalizeEmail,
} from "@/lib/publicApi";
import {
  registerStaffWithInvite,
  staffResultToResponse,
} from "@/lib/staffRegistration";

/**
 * Backwards-compatible teacher registration endpoint.
 * Delegates to the shared staff registration helper.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  // Rate limit by IP
  const ipRate = await enforcePublicRateLimit({
    request,
    keyPrefix: "public:teacher-register:ip",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipRate.result.allowed) {
    return jsonError(requestId, {
      error: "Too many signup attempts. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      extra: { retry_after_seconds: ipRate.result.retryAfterSeconds },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(requestId, {
      error: "Invalid JSON body.",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const name = asTrimmedText(body.name, 120);
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const password = typeof body.password === "string" ? body.password : "";
  const phone = asTrimmedText(body.phone, 32);
  const inviteCode = asTrimmedText(body.invite_code, 32);

  if (!name) {
    return jsonError(requestId, { error: "Name is required.", code: "VALIDATION_ERROR", status: 400 });
  }
  if (!isValidEmail(email)) {
    return jsonError(requestId, { error: "Email is invalid.", code: "VALIDATION_ERROR", status: 400 });
  }
  if (!isValidPassword(password)) {
    return jsonError(requestId, { error: "Password must be between 8 and 128 characters.", code: "VALIDATION_ERROR", status: 400 });
  }
  if (!inviteCode) {
    return jsonError(requestId, { error: "Invite code is required.", code: "VALIDATION_ERROR", status: 400 });
  }

  const result = await registerStaffWithInvite({
    name,
    email,
    password,
    phone,
    inviteCode,
    requestId,
  });

  // Map response codes for backwards compatibility
  if (result.ok) {
    const mappedResult = {
      ...result,
      code: result.code === "STAFF_REGISTERED" ? "TEACHER_REGISTERED" as const : "TEACHER_ALREADY_REGISTERED" as const,
    };
    return NextResponse.json(mappedResult, { status: result.code === "STAFF_REGISTERED" ? 201 : 200 });
  }

  return staffResultToResponse(requestId, result);
}
