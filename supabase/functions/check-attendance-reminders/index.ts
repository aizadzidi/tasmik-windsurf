import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@alkhayr.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Convert VAPID keys for Web Push
async function importVapidKeys() {
  const privateKeyBytes = base64UrlToBytes(VAPID_PRIVATE_KEY);
  const publicKeyBytes = base64UrlToBytes(VAPID_PUBLIC_KEY);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    convertECPrivateKey(privateKeyBytes, publicKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return { privateKey, publicKeyBytes };
}

function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Build PKCS8 DER from raw 32-byte EC private key + 65-byte public key
function convertECPrivateKey(privateBytes: Uint8Array, publicBytes: Uint8Array): ArrayBuffer {
  // DER-encoded PKCS8 wrapper for P-256 EC key
  const header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const middle = new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00]);
  const result = new Uint8Array(header.length + privateBytes.length + middle.length + publicBytes.length);
  result.set(header, 0);
  result.set(privateBytes, header.length);
  result.set(middle, header.length + privateBytes.length);
  result.set(publicBytes, header.length + privateBytes.length + middle.length);
  return result.buffer;
}

// Create a signed JWT for VAPID authentication
async function createVapidJwt(
  audience: string,
  privateKey: CryptoKey
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 86400, // 24 hours
    sub: VAPID_SUBJECT,
  };

  const headerB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Web Crypto ECDSA returns raw r||s (64 bytes for P-256), no conversion needed
  const sigB64 = bytesToBase64Url(new Uint8Array(signature));

  return `${unsignedToken}.${sigB64}`;
}

// Send a Web Push notification
async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPrivateKey: CryptoKey,
  vapidPublicKeyBytes: Uint8Array
): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;

    const jwt = await createVapidJwt(audience, vapidPrivateKey);
    const vapidPublicKeyB64 = bytesToBase64Url(vapidPublicKeyBytes);

    // Encrypt payload using Web Push encryption (aes128gcm)
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await encryptPayload(
      payloadBytes,
      base64UrlToBytes(subscription.p256dh),
      base64UrlToBytes(subscription.auth)
    );

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapidPublicKeyB64}`,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Urgency: "normal",
      },
      body: encrypted,
    });

    if (response.status === 410 || response.status === 404) {
      // Subscription expired — remove from DB
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint);
      return false;
    }

    return response.ok;
  } catch (err) {
    console.error("Push send failed:", err);
    return false;
  }
}

// Web Push payload encryption (aes128gcm)
async function encryptPayload(
  payload: Uint8Array,
  clientPublicKey: Uint8Array,
  clientAuth: Uint8Array
): Promise<Uint8Array> {
  // Generate a local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      localKeyPair.privateKey,
      256
    )
  );

  // Build info for HKDF
  const encoder = new TextEncoder();
  const keyInfoPrefix = encoder.encode("WebPush: info\0");
  const keyInfo = new Uint8Array(keyInfoPrefix.length + clientPublicKey.length + localPublicKeyRaw.length);
  keyInfo.set(keyInfoPrefix);
  keyInfo.set(clientPublicKey, keyInfoPrefix.length);
  keyInfo.set(localPublicKeyRaw, keyInfoPrefix.length + clientPublicKey.length);

  // IKM via HKDF with auth as salt
  const ikmKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: clientAuth, info: keyInfo },
      ikmKey,
      256
    )
  );

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive content encryption key (CEK) and nonce
  const prk = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: cekInfo },
      prk,
      128
    )
  );
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
      prk,
      96
    )
  );

  // Pad and encrypt
  const padded = new Uint8Array(payload.length + 2);
  padded.set(payload);
  padded[payload.length] = 2; // delimiter
  // remaining is zero-padding

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  // Build aes128gcm header: salt (16) + rs (4) + keyIdLen (1) + keyId (65) + encrypted
  const rs = payload.length + 2 + 16; // record size = padded + tag
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = localPublicKeyRaw.length;
  header.set(localPublicKeyRaw, 21);

  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header);
  result.set(encrypted, header.length);
  return result;
}

// --- Main handler ---

Deno.serve(async (req: Request) => {
  try {
    // Get today's date and weekday in Malaysia timezone (UTC+8)
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const today = dateFormatter.format(now); // YYYY-MM-DD

    // Use Intl to get the correct weekday in MYT (avoids UTC date-shift bug)
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kuala_Lumpur",
      weekday: "short",
    });
    const weekdayStr = weekdayFormatter.format(now); // "Mon", "Tue", etc.
    const isWeekend = weekdayStr === "Sat" || weekdayStr === "Sun";

    // Skip weekends
    if (isWeekend) {
      return new Response(JSON.stringify({ status: "skipped", reason: "weekend" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Note: school holidays are tenant-scoped, checked per-tenant in the loop below

    // Get all push subscriptions grouped by tenant
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id, tenant_id");

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ status: "ok", reason: "no_subscriptions" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Filter to only teachers
    const userIds = [...new Set(subscriptions.map((s) => s.user_id))];
    const { data: teachers } = await supabase
      .from("users")
      .select("id, role")
      .in("id", userIds)
      .eq("role", "teacher");

    const teacherIdSet = new Set((teachers || []).map((t) => t.id));
    const teacherSubs = subscriptions.filter((s) => teacherIdSet.has(s.user_id));

    if (teacherSubs.length === 0) {
      return new Response(
        JSON.stringify({ status: "ok", reason: "no_teacher_subscriptions" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Group subscriptions by tenant_id
    const tenantGroups = new Map<string, typeof teacherSubs>();
    for (const sub of teacherSubs) {
      const group = tenantGroups.get(sub.tenant_id) || [];
      group.push(sub);
      tenantGroups.set(sub.tenant_id, group);
    }

    const { privateKey, publicKeyBytes } = await importVapidKeys();
    let totalSent = 0;
    let totalFailed = 0;
    const tenantResults: Record<string, { missing_count: number; sent: number; failed: number }> = {};

    // Process each tenant separately
    for (const [tenantId, tenantSubs] of tenantGroups) {
      // Check school holidays for THIS tenant
      const { data: holidays } = await supabase
        .from("school_holidays")
        .select("id")
        .eq("tenant_id", tenantId)
        .lte("start_date", today)
        .gte("end_date", today)
        .limit(1);

      if (holidays && holidays.length > 0) continue; // skip this tenant — holiday

      // Determine if tenant uses Attendance V2
      // Check tenant_feature_flags directly — no env var dependency.
      // This matches the app's isAttendanceV2EnabledForTenant logic:
      // if the feature flag row exists with enabled=true, or doesn't exist (defaults true), it's V2.
      // But we also need to check if V2 infra actually exists for this tenant
      // by looking for campus_session_instances rows.
      const { data: v2Flag } = await supabase
        .from("tenant_feature_flags")
        .select("enabled")
        .eq("tenant_id", tenantId)
        .eq("feature_key", "attendance_v2")
        .maybeSingle();

      // If explicitly disabled, use V1. If enabled or no row, check if V2 sessions exist.
      const v2FlagEnabled = v2Flag === null ? true : v2Flag.enabled === true;
      let isV2 = false;
      if (v2FlagEnabled) {
        // Confirm V2 is actually in use: check if sessions exist for today
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
        // V2: only check sessions whose start_time has already passed
        // At 10am, a session starting at 11am shouldn't trigger a reminder
        const nowMYT = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kuala_Lumpur",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()); // "HH:MM:SS"
        const currentTime = nowMYT.replace(/,/g, ""); // clean format

        const { data: sessions } = await supabase
          .from("campus_session_instances")
          .select("id, class_id, start_time")
          .eq("tenant_id", tenantId)
          .eq("session_date", today)
          .lte("start_time", currentTime); // only sessions that should have started

        if (!sessions || sessions.length === 0) continue;

        const sessionIds = sessions.map((s) => s.id);

        // Get mark counts per session
        const { data: marks } = await supabase
          .from("campus_attendance_marks")
          .select("session_instance_id")
          .in("session_instance_id", sessionIds);

        const markCountBySession = new Map<string, number>();
        for (const m of (marks || [])) {
          markCountBySession.set(
            m.session_instance_id,
            (markCountBySession.get(m.session_instance_id) || 0) + 1
          );
        }

        // Get roster snapshot counts per session (expected student count)
        const { data: rosterCounts } = await supabase
          .from("campus_session_roster_snapshots")
          .select("session_instance_id")
          .in("session_instance_id", sessionIds);

        const rosterCountBySession = new Map<string, number>();
        for (const r of (rosterCounts || [])) {
          rosterCountBySession.set(
            r.session_instance_id,
            (rosterCountBySession.get(r.session_instance_id) || 0) + 1
          );
        }

        // A session is incomplete if: no marks at all, OR marks < roster count
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
        // V1: check all classes against legacy attendance_records
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
      const payload = {
        title: "Attendance Reminder",
        body,
        url: "/teacher/attendance",
        tag: `attendance-${today}`,
      };

      // Send push notifications in parallel
      const results = await Promise.allSettled(
        tenantSubs.map((sub) =>
          sendPushNotification(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            payload,
            privateKey,
            publicKeyBytes
          )
        )
      );

      let sent = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) sent++;
        else failed++;
      }

      totalSent += sent;
      totalFailed += failed;
      tenantResults[tenantId] = { missing_count: missingCount, sent, failed };
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        notifications_sent: totalSent,
        notifications_failed: totalFailed,
        tenants: tenantResults,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Attendance reminder error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
