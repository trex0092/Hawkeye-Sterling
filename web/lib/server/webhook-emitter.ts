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
  | "four_eyes.approved"
  | "maker_checker_pending";

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
  attempts: number;
  finalStatus: "success" | "failed";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// SSRF prevention — block private ranges and cloud metadata endpoints.
// Covers RFC 1918, CGNAT (100.64.0.0/10), Azure IMDS (168.63.129.x),
// IPv6 ULA (fc00::/7), IPv6 link-local (fe80::/10), IPv4-mapped (::ffff:).
const BLOCKED_HOSTS = /^(localhost|.*\.local|metadata\.google\.internal)$/i;
const PRIVATE_IP =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|168\.63\.129\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.0\.0\.0|::1$|::ffff:|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f])/i;

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

export async function loadRegistrations(tenantId: string): Promise<WebhookRegistration[]> {
  const store = getLocalStore();
  const raw = await store.get(`webhooks:registrations:${tenantId}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WebhookRegistration[];
  } catch {
    return [];
  }
}

export async function saveRegistrations(
  registrations: WebhookRegistration[],
  tenantId: string,
): Promise<void> {
  const store = getLocalStore();
  await store.set(`webhooks:registrations:${tenantId}`, JSON.stringify(registrations));
}

async function storeDelivery(delivery: WebhookDelivery, tenantId: string): Promise<void> {
  await setJson(`webhooks:deliveries:${tenantId}:${delivery.id}`, delivery);
}

export async function emitWebhookEvent(
  event: WebhookEvent,
  payload: Record<string, unknown>,
  tenantId: string,
): Promise<void> {
  let registrations: WebhookRegistration[];
  try {
    registrations = await loadRegistrations(tenantId);
  } catch {
    console.warn("[webhook-emitter] Failed to load registrations");
    return;
  }

  const active = registrations.filter(
    (r) => r.active && r.events.includes(event) && isSafeWebhookUrl(r.url),
  );

  if (active.length === 0) return;

  // Cap concurrent outbound HTTP deliveries to prevent unbounded fan-out.
  const CONCURRENCY_LIMIT = 10;
  for (let i = 0; i < active.length; i += CONCURRENCY_LIMIT) {
    await Promise.all(active.slice(i, i + CONCURRENCY_LIMIT).map(async (reg) => {
      // WEB-001 (forensic audit batch 3): top-level guard around the entire
      // per-registration callback. Body construction (JSON.stringify on a
      // caller-supplied payload), HMAC generation (reg.secret may be an
      // empty/corrupt string from a Blobs read), and storeDelivery() were
      // all able to throw outside the retry try/catch — which would reject
      // the Promise.all() and abort the whole batch silently. This outer
      // try ensures one bad registration record can never poison the rest.
      try {
      const deliveryId = randomUUID();
      const sentAt = new Date().toISOString();
      // Spread payload first so envelope fields (event, deliveryId, sentAt)
      // always win over any colliding keys in the caller-supplied payload.
      const body = JSON.stringify({ ...payload, event, deliveryId, sentAt });

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
        attempts: 0,
        finalStatus: "failed",
      };

      const start = Date.now();
      for (let attempt = 0; attempt <= 3; attempt++) {
        delivery.attempts = attempt + 1;
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

          delivery.statusCode = res.status;
          delivery.responseMs = Date.now() - start;

          if (res.ok) {
            delivery.success = true;
            delivery.finalStatus = "success";
            reg.lastDeliveryAt = sentAt;
            reg.lastDeliveryStatus = res.status;
            break;
          }

          // Non-2xx response
          reg.lastDeliveryStatus = res.status;
          if (attempt < 3) {
            await sleep(1000 * Math.pow(2, attempt));
          } else {
            delivery.finalStatus = "failed";
            reg.lastDeliveryAt = sentAt;
            reg.failureCount = (reg.failureCount ?? 0) + 1;
          }
        } catch (err) {
          delivery.responseMs = Date.now() - start;
          if (attempt < 3) {
            console.warn(
              `[webhook-emitter] Delivery ${deliveryId} attempt ${attempt + 1} failed, retrying:`,
              err instanceof Error ? err.message : String(err),
            );
            await sleep(1000 * Math.pow(2, attempt));
          } else {
            delivery.finalStatus = "failed";
            reg.lastDeliveryAt = sentAt;
            reg.failureCount = (reg.failureCount ?? 0) + 1;
            console.warn(
              `[webhook-emitter] Delivery ${deliveryId} failed after ${delivery.attempts} attempts:`,
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      }

      // Persist delivery record (never throw)
      await storeDelivery(delivery, tenantId).catch((e) =>
        console.warn(
          "[webhook-emitter] Failed to store delivery record:",
          e instanceof Error ? e.message : e,
        ),
      );
      } catch (outerErr) {
        // WEB-001 outer guard: catch anything that escaped the inner retry
        // loop — corrupt body, undefined HMAC key, randomUUID failure on
        // crypto-unavailable runtime, etc. Increment failureCount so the
        // dashboard reflects reality.
        console.error(
          `[webhook-emitter] CRITICAL outer failure for registration ${reg.id}:`,
          outerErr instanceof Error ? outerErr.message : String(outerErr),
        );
        reg.failureCount = (reg.failureCount ?? 0) + 1;
        reg.lastDeliveryAt = new Date().toISOString();
      }
    }));
  }

  // Persist updated registration stats (best-effort)
  await saveRegistrations(registrations, tenantId).catch((e) =>
    console.warn(
      "[webhook-emitter] Failed to save registrations after delivery:",
      e instanceof Error ? e.message : e,
    ),
  );
}

export { getJson, setJson };
