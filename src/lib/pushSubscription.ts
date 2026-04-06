import { supabase } from "@/lib/supabaseClient";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export async function subscribeToPush(userId: string, tenantId: string): Promise<boolean> {
  try {
    if (!VAPID_PUBLIC_KEY) {
      console.error("VAPID public key not configured");
      return false;
    }

    const permission = await requestNotificationPermission();
    if (!permission) return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subscriptionJson = subscription.toJSON();
    const { endpoint } = subscriptionJson;
    const p256dh = subscriptionJson.keys?.p256dh || "";
    const auth = subscriptionJson.keys?.auth || "";

    // Use RPC function to safely handle shared device case —
    // if another user previously subscribed on this browser, their row is replaced
    const { error } = await supabase.rpc("upsert_push_subscription", {
      p_user_id: userId,
      p_tenant_id: tenantId,
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
    });

    if (error) {
      console.error("Failed to save push subscription:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return false;
  }
}

export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();

      const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint);

      if (error) {
        console.error("Failed to remove push subscription from DB:", error);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error("Push unsubscribe failed:", err);
    return false;
  }
}

export async function isSubscribed(userId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    // Check browser-level subscription exists
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    // Verify this endpoint is actually registered to the current user in DB
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}
