declare module "web-push" {
  export type Urgency = "very-low" | "low" | "normal" | "high";

  export type PushSubscription = {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };

  export type SendOptions = {
    TTL?: number;
    urgency?: Urgency;
    vapidDetails?: {
      subject: string;
      publicKey: string;
      privateKey: string;
    };
  };

  export type SendResult = {
    statusCode: number;
    body?: string;
    headers?: Record<string, string>;
  };

  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string,
    options?: SendOptions,
  ): Promise<SendResult>;
}
