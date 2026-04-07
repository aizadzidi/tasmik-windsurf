import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL_ENV =
  Deno.env.get("APP_URL") ??
  Deno.env.get("NEXT_PUBLIC_APP_URL") ??
  "";
const LEGACY_APP_HOST = "class.akademialkhayr.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  return token === SUPABASE_SERVICE_ROLE_KEY || (CRON_SECRET.length > 0 && token === CRON_SECRET);
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }

  if (trimmed === "localhost" || trimmed.startsWith("localhost:")) {
    return `http://${trimmed.replace(/\/+$/, "")}`;
  }

  return `https://${trimmed.replace(/\/+$/, "")}`;
}

async function resolveAppBaseUrl() {
  const envUrl = normalizeBaseUrl(APP_URL_ENV);
  if (envUrl && !envUrl.includes("localhost")) {
    return envUrl;
  }

  const { data, error } = await supabase
    .from("tenant_domains")
    .select("domain")
    .order("domain", { ascending: true });

  if (error) {
    throw new Error(`Failed to resolve app domain: ${error.message}`);
  }

  const domains = (data ?? [])
    .map((row) => (typeof row.domain === "string" ? row.domain.trim() : ""))
    .filter((domain) => domain.length > 0);

  const preferredDomain =
    domains.find((domain) => domain === LEGACY_APP_HOST) ??
    domains.find((domain) => domain !== "localhost") ??
    domains[0];

  const resolved = normalizeBaseUrl(preferredDomain ?? envUrl ?? "");
  if (!resolved) {
    throw new Error("Unable to resolve deployed app URL for attendance reminders.");
  }

  return resolved;
}

async function forwardAttendanceReminderRequest(request: Request) {
  const appBaseUrl = await resolveAppBaseUrl();
  const targetUrl = `${appBaseUrl}/api/cron/attendance-reminders`;
  const authToken = CRON_SECRET || SUPABASE_SERVICE_ROLE_KEY;

  console.log("Forwarding attendance reminder cron", { targetUrl });

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "X-Cron-Source": "supabase-edge",
    },
    body: await request.text().catch(() => "{}"),
  });

  const responseText = await response.text();

  return new Response(responseText, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  try {
    if (!isAuthorized(request)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return await forwardAttendanceReminderRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Attendance reminder proxy failed:", message);

    return new Response(JSON.stringify({ status: "error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
