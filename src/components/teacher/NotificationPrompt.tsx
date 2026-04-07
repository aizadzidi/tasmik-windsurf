"use client";

import { useEffect, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import {
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribed,
} from "@/lib/pushSubscription";

interface NotificationPromptProps {
  userId: string;
}

export default function NotificationPrompt({ userId }: NotificationPromptProps) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const dismissKey = `notification-prompt-dismissed-${userId}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(dismissKey) === "true";
    }
    return false;
  });
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkStatus() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setSupported(false);
        return;
      }

      const status = await isSubscribed();
      setSubscribed(status);

      // Clear dismiss flag if user later subscribed via another device/session
      if (status) {
        localStorage.removeItem(dismissKey);
      }
    }
    checkStatus();
  }, [dismissKey]);

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await subscribeToPush();
      if (result.ok) {
        setSubscribed(true);
      } else {
        setError(result.error || "Failed to enable. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await unsubscribeFromPush();
      if (result.ok) {
        setSubscribed(false);
      } else {
        setError(result.error || "Failed to disable. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Don't render if not supported, still loading status, or dismissed
  if (!supported || subscribed === null || dismissed) return null;

  // Show enabled state as a small indicator
  if (subscribed) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50/80 backdrop-blur-md border border-green-200/60 text-green-700 text-sm">
        <Check className="w-4 h-4" />
        <span>Attendance reminders enabled</span>
        <button
          onClick={handleDisable}
          disabled={loading}
          className="ml-auto text-green-500 hover:text-green-700 text-xs underline"
        >
          {loading ? "..." : "Disable"}
        </button>
      </div>
    );
  }

  // Show prompt to enable
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/80 backdrop-blur-md border border-purple-200/60 shadow-sm">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
        <Bell className="w-4 h-4 text-purple-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">
          Enable attendance reminders
        </p>
        <p className="text-xs text-gray-500">
          Get notified at 10am if any class is missing attendance
        </p>
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleEnable}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Enable"}
        </button>
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem(dismissKey, "true");
          }}
          className="p-1 text-gray-400 hover:text-gray-600"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
