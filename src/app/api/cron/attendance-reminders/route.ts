import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import * as webpush from "web-push";

// Force Node.js runtime (web-push requires Node crypto APIs)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@alkhayr.com";
const CRON_SECRET = process.env.CRON_SECRET || "";

let vapidConfigured = false;
try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
} catch (err) {
  console.error("VAPID setup failed:", err);
}

export async function POST(req: NextRequest) {
  try {
    // Auth: verify cron secret or service role key
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!CRON_SECRET && !serviceRoleKey) {
      console.error("Attendance reminder auth is not configured");
      return NextResponse.json(
        { error: "Cron authentication is not configured" },
        { status: 500 }
      );
    }

    if (!token || (token !== CRON_SECRET && token !== serviceRoleKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!vapidConfigured) {
      return NextResponse.json({
        error: "VAPID keys not configured",
        debug: {
          hasPublicKey: !!VAPID_PUBLIC_KEY,
          hasPrivateKey: !!VAPID_PRIVATE_KEY,
        }
      }, { status: 500 });
    }

    const supabase = getSupabaseAdminClient();

    // Get today's date and weekday in Malaysia timezone
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const weekdayStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kuala_Lumpur",
      weekday: "short",
    }).format(now);

    if (weekdayStr === "Sat" || weekdayStr === "Sun") {
      return NextResponse.json({ status: "skipped", reason: "weekend" });
    }

    // Get all push subscriptions
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id, tenant_id");

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ status: "ok", reason: "no_subscriptions" });
    }

    // Filter to teachers only
    const userIds = [...new Set(subscriptions.map((s) => s.user_id))];
    const { data: teachers } = await supabase
      .from("users")
      .select("id, role")
      .in("id", userIds)
      .eq("role", "teacher");

    const teacherIdSet = new Set((teachers || []).map((t) => t.id));
    const teacherSubs = subscriptions.filter((s) => teacherIdSet.has(s.user_id));

    if (teacherSubs.length === 0) {
      return NextResponse.json({ status: "ok", reason: "no_teacher_subscriptions" });
    }

    // Group by tenant
    const tenantGroups = new Map<string, typeof teacherSubs>();
    for (const sub of teacherSubs) {
      const group = tenantGroups.get(sub.tenant_id) || [];
      group.push(sub);
      tenantGroups.set(sub.tenant_id, group);
    }

    let totalSent = 0;
    let totalFailed = 0;
    const tenantResults: Record<string, { missing_count: number; sent: number; failed: number }> = {};

    for (const [tenantId, tenantSubs] of tenantGroups) {
      // Check tenant holidays
      const { data: holidays } = await supabase
        .from("school_holidays")
        .select("id")
        .eq("tenant_id", tenantId)
        .lte("start_date", today)
        .gte("end_date", today)
        .limit(1);

      if (holidays && holidays.length > 0) continue;

      // Check V2 flag
      const { data: v2Flag } = await supabase
        .from("tenant_feature_flags")
        .select("enabled")
        .eq("tenant_id", tenantId)
        .eq("feature_key", "attendance_v2")
        .maybeSingle();

      const v2FlagEnabled = v2Flag === null ? true : v2Flag.enabled === true;
      let isV2 = false;
      if (v2FlagEnabled) {
        const { count } = await supabase
          .from("campus_session_instances")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("session_date", today)
          .limit(1);
        isV2 = (count ?? 0) > 0;
      }

      let missingClasses: { id: string; name: string }[];

      if (isV2) {
        const currentTime = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kuala_Lumpur",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()).replace(/,/g, "");

        const { data: sessions } = await supabase
          .from("campus_session_instances")
          .select("id, class_id, start_time")
          .eq("tenant_id", tenantId)
          .eq("session_date", today)
          .lte("start_time", currentTime);

        if (!sessions || sessions.length === 0) continue;

        const sessionIds = sessions.map((s) => s.id);

        const { data: marks } = await supabase
          .from("campus_attendance_marks")
          .select("session_instance_id")
          .in("session_instance_id", sessionIds);

        const markCountBySession = new Map<string, number>();
        for (const m of marks || []) {
          markCountBySession.set(m.session_instance_id, (markCountBySession.get(m.session_instance_id) || 0) + 1);
        }

        const { data: rosterCounts } = await supabase
          .from("campus_session_roster_snapshots")
          .select("session_instance_id")
          .in("session_instance_id", sessionIds);

        const rosterCountBySession = new Map<string, number>();
        for (const r of rosterCounts || []) {
          rosterCountBySession.set(r.session_instance_id, (rosterCountBySession.get(r.session_instance_id) || 0) + 1);
        }

        const missingSessionClassIds = new Set<string>();
        for (const s of sessions) {
          const marked = markCountBySession.get(s.id) || 0;
          const expected = rosterCountBySession.get(s.id) || 0;
          if (marked === 0 || (expected > 0 && marked < expected)) {
            missingSessionClassIds.add(s.class_id);
          }
        }

        if (missingSessionClassIds.size === 0) continue;

        const { data: classNames } = await supabase
          .from("classes")
          .select("id, name")
          .in("id", [...missingSessionClassIds]);

        missingClasses = classNames || [];
      } else {
        // V1
        const { data: allClasses } = await supabase
          .from("classes")
          .select("id, name")
          .eq("tenant_id", tenantId);

        if (!allClasses || allClasses.length === 0) continue;

        const classIds = allClasses.map((c) => c.id);
        const { data: attendedClasses } = await supabase
          .from("attendance_records")
          .select("class_id")
          .eq("attendance_date", today)
          .in("class_id", classIds);

        const attendedClassIds = new Set((attendedClasses || []).map((r) => r.class_id));
        missingClasses = allClasses.filter((c) => !attendedClassIds.has(c.id));
      }

      if (missingClasses.length === 0) continue;

      const missingCount = missingClasses.length;
      const missingNames = missingClasses.map((c) => c.name).join(", ");
      const body = missingCount <= 2
        ? `Attendance not updated: ${missingNames}`
        : `${missingCount} classes have not updated attendance today`;

      const payload = JSON.stringify({
        title: "Attendance Reminder",
        body,
        url: "/teacher/attendance",
        tag: `attendance-${today}`,
      });

      // Send push in parallel
      const results = await Promise.allSettled(
        tenantSubs.map(async (sub) => {
          try {
            const result = await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 86400, urgency: "normal" as const }
            );
            console.log(`Push sent to ${sub.endpoint.slice(-20)}: ${result.statusCode}`);
            return result;
          } catch (err: unknown) {
            const pushErr = err as { statusCode?: number; body?: string };
            console.error(`Push failed to ${sub.endpoint.slice(-20)}: ${pushErr.statusCode} ${pushErr.body}`);
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
            throw err;
          }
        })
      );

      let sent = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled") sent++;
        else failed++;
      }

      totalSent += sent;
      totalFailed += failed;
      tenantResults[tenantId] = { missing_count: missingCount, sent, failed };
    }

    return NextResponse.json({
      status: "ok",
      notifications_sent: totalSent,
      notifications_failed: totalFailed,
      tenants: tenantResults,
    });
  } catch (err) {
    console.error("Attendance reminder error:", err);
    return NextResponse.json({ status: "error", message: String(err) }, { status: 500 });
  }
}
