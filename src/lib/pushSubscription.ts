import { authFetch } from "@/lib/authFetch";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushActionResult = {
  ok: boolean;
  error?: string;
};

type PushApiError = {
  error: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

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

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : "Unexpected error",
      code: typeof record.code === "string" ? record.code : undefined,
      details: typeof record.details === "string" ? record.details : undefined,
      hint: typeof record.hint === "string" ? record.hint : undefined,
    };
  }

  return { message: String(error) };
}

async function readApiError(response: Response): Promise<PushApiError> {
  try {
    const payload = (await response.json()) as Partial<PushApiError>;
    return {
      error:
        typeof payload.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}`,
      code: typeof payload.code === "string" ? payload.code : null,
      details: typeof payload.details === "string" ? payload.details : null,
      hint: typeof payload.hint === "string" ? payload.hint : null,
    };
  } catch {
    return { error: `Request failed with status ${response.status}` };
  }
}

export async function subscribeToPush(): Promise<PushActionResult> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { ok: false, error: "This browser does not support push notifications." };
    }

    if (!VAPID_PUBLIC_KEY) {
      console.error("VAPID public key not configured");
      return {
        ok: false,
        error: "Push notification service not configured. Contact admin.",
      };
    }

    const permission = await requestNotificationPermission();
    if (!permission) {
      return {
        ok: false,
        error:
          Notification.permission === "denied"
            ? "Notifications blocked. Please enable in browser settings."
            : "Notification permission was not granted.",
      };
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    const subscriptionJson = subscription.toJSON();
    const { endpoint } = subscriptionJson;
    const p256dh = subscriptionJson.keys?.p256dh || "";
    const auth = subscriptionJson.keys?.auth || "";

    const response = await authFetch("/api/push-subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint,
        p256dh,
        auth,
      }),
    });

    if (!response.ok) {
      const apiError = await readApiError(response);
      console.error("Failed to save push subscription:", apiError);

      if (!existingSubscription) {
        await subscription.unsubscribe().catch(() => undefined);
      }

      return { ok: false, error: apiError.error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Push subscription failed:", serializeError(err));
    return { ok: false, error: "Failed to enable notifications. Please try again." };
  }
}

export async function unsubscribeFromPush(): Promise<PushActionResult> {
  try {
    if (!("serviceWorker" in navigator)) {
      return { ok: true };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return { ok: true };
    }

    const response = await authFetch(
      `/api/push-subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      const apiError = await readApiError(response);
      console.error("Failed to remove push subscription from DB:", apiError);
      return { ok: false, error: apiError.error };
    }

    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed) {
      console.warn("Browser push subscription remained active after server record deletion");
    }

    return { ok: true };
  } catch (err) {
    console.error("Push unsubscribe failed:", serializeError(err));
    return { ok: false, error: "Failed to disable notifications. Please try again." };
  }
}

export async function isSubscribed(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    // Check browser-level subscription exists
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    const response = await authFetch(
      `/api/push-subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`
    );
    if (!response.ok) return false;

    const payload = (await response.json()) as { subscribed?: boolean };
    return payload.subscribed === true;
  } catch {
    return false;
  }
}
