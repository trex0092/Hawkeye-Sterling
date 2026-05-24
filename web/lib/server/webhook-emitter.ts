// Hawkeye Sterling — outbound webhook emitter.
//
// Loads all active webhook registrations from Netlify Blobs and delivers
// signed POST requests to each subscribed URL. Never throws — all errors
// are caught and recorded in the delivery log.

import { createHmac, randomUUID } from "node:crypto";
import { getStore as getLocalStore, getJson, setJson } from "@/lib/server/store";

export type WebhookEvent =
  | "case.opened"
  | "case.closed"
  | "case.escalated"
  | "sar.filed"
  | "subject.frozen"
  | "subject.cleared"
  | "screening.completed"
  | "edd.triggered"
  | "four_eyes.approved";

export interface WebhookRegistration {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string; // HMAC-SHA256 signing secret, set by caller
  active: boolean;
  createdAt: string;
  lastDeliveryAt?: string;
  lastDeliveryStatus?: number;
  failureCount: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent | "test";
  payload: Record<string, unknown>;
  sentAt: string;
  statusCode?: number;
  success: boolean;
  responseMs?: number;
}

const REGISTRATIONS_KEY = "webhooks:registrations";
const DELIVERY_KEY_PREFIX = "webhooks:deliveries:";

// SSRF prevention — block private ranges and cloud metadata endpoints.
const BLOCKED_HOSTS = /^(localhost|.*\.local|metadata\.google\.internal)$/i;
const PRIVATE_IP =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1$|0\.0\.0\.0)/;

export function isSafeWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (BLOCKED_HOSTS.test(u.hostname) || PRIVATE_IP.test(u.hostname))
      return false;
    return true;
  } catch {
    return false;
  }
}

export async function loadRegistrations(): Promise<WebhookRegistration[]> {
  const store = getLocalStore();
  const raw = await store.get(REGISTRATIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WebhookRegistration[];
  } catch {
    return [];
  }
}

export async function saveRegistrations(
  registrations: WebhookRegistration[],
): Promise<void> {
  const store = getLocalStore();
  await store.set(REGISTRATIONS_KEY, JSON.stringify(registrations));
}

async function storeDelivery(delivery: WebhookDelivery): Promise<void> {
  await setJson(`${DELIVERY_KEY_PREFIX}${delivery.id}`, delivery);
}

export async function emitWebhookEvent(
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  let registrations: WebhookRegistration[];
  try {
    registrations = await loadRegistrations();
  } catch {
    console.warn("[webhook-emitter] Failed to load registrations");
    return;
  }

  const active = registrations.filter(
    (r) => r.active && r.events.includes(event) && isSafeWebhookUrl(r.url),
  );

  if (active.length === 0) return;

  await Promise.all(
    active.map(async (reg) => {
      const deliveryId = randomUUID();
      const sentAt = new Date().toISOString();
      const body = JSON.stringify({ event, ...payload, deliveryId, sentAt });

      const hmac = createHmac("sha256", reg.secret)
        .update(body)
        .digest("hex");

      const delivery: WebhookDelivery = {
        id: deliveryId,
        webhookId: reg.id,
        event,
        payload,
        sentAt,
        success: false,
      };

      const start = Date.now();
      try {
        const res = await fetch(reg.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hawkeye-Event": event,
            "X-Hawkeye-Delivery": deliveryId,
            "X-Hawkeye-Signature": `sha256=${hmac}`,
          },
          body,
          signal: AbortSignal.timeout(5000),
        });

        const responseMs = Date.now() - start;
        delivery.statusCode = res.status;
        delivery.success = res.ok;
        delivery.responseMs = responseMs;

        // Update registration stats
        reg.lastDeliveryAt = sentAt;
        reg.lastDeliveryStatus = res.status;
        if (!res.ok) {
          reg.failureCount = (reg.failureCount ?? 0) + 1;
        }
      } catch (err) {
        delivery.responseMs = Date.now() - start;
        delivery.success = false;
        reg.lastDeliveryAt = sentAt;
        reg.failureCount = (reg.failureCount ?? 0) + 1;
        console.warn(
          `[webhook-emitter] Delivery ${deliveryId} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }

      // Persist delivery record (never throw)
      await storeDelivery(delivery).catch((e) =>
        console.warn(
          "[webhook-emitter] Failed to store delivery record:",
          e instanceof Error ? e.message : e,
        ),
      );
    }),
  );

  // Persist updated registration stats (best-effort)
  await saveRegistrations(registrations).catch((e) =>
    console.warn(
      "[webhook-emitter] Failed to save registrations after delivery:",
      e instanceof Error ? e.message : e,
    ),
  );
}

export { getJson, setJson };
