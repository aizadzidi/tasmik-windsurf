import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  requireAuthenticatedTenantUser,
  requireAuthenticatedUser,
} from "@/lib/requestAuth";

type ErrorDetails = {
  message: string;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function formatError(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message:
        typeof record.message === "string" ? record.message : "Unexpected error",
      code: record.code,
      details: record.details,
      hint: record.hint,
    };
  }

  return { message: "Unexpected error" };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const endpoint = readString(request.nextUrl.searchParams.get("endpoint"));
    if (!endpoint) {
      return NextResponse.json(
        { error: "endpoint is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ subscribed: Boolean(data) });
  } catch (error: unknown) {
    const formatted = formatError(error);
    console.error("Push subscription status check failed:", formatted);

    return NextResponse.json(
      {
        error: formatted.message,
        details: formatted.details ?? null,
        hint: formatted.hint ?? null,
        code: formatted.code ?? null,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedTenantUser(request);
    if (!auth.ok) return auth.response;

    const payload = await request.json();
    const endpoint = readString(payload?.endpoint);
    const p256dh = readString(payload?.p256dh);
    const authKey = readString(payload?.auth);

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { error: "endpoint, p256dh, and auth are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: auth.userId,
          tenant_id: auth.tenantId,
          endpoint,
          p256dh,
          auth: authKey,
        },
        { onConflict: "endpoint" }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const formatted = formatError(error);
    console.error("Push subscription save failed:", formatted);

    return NextResponse.json(
      {
        error: formatted.message,
        details: formatted.details ?? null,
        hint: formatted.hint ?? null,
        code: formatted.code ?? null,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const endpoint = readString(request.nextUrl.searchParams.get("endpoint"));
    if (!endpoint) {
      return NextResponse.json(
        { error: "endpoint is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", auth.userId)
      .eq("endpoint", endpoint);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const formatted = formatError(error);
    console.error("Push subscription delete failed:", formatted);

    return NextResponse.json(
      {
        error: formatted.message,
        details: formatted.details ?? null,
        hint: formatted.hint ?? null,
        code: formatted.code ?? null,
      },
      { status: 500 }
    );
  }
}
