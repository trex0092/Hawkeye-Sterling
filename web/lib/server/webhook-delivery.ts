import { getJson, setJson } from "@/lib/server/store";
import { createHmac } from "node:crypto";

// Blocks hostnames that resolve to private/reserved ranges.
// Case-insensitive for normalised hostnames from URL().hostname.
const BLOCKED_HOSTS_RE = /^(localhost|.*\.local|metadata\.google\.internal)$/i;

// Covers all RFC 1918 / RFC 4193 / RFC 4291 / CGNAT / cloud-metadata ranges:
//   10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16  — RFC 1918
//   127.0.0.0/8                                  — loopback
//   169.254.0.0/16                               — link-local / AWS IMDS
//   168.63.129.x                                 — Azure IMDS
//   100.64.0.0/10                                — CGNAT (RFC 6598)
//   0.0.0.0                                      — unspecified
//   ::1                                          — IPv6 loopback
//   ::ffff:                                      — IPv4-mapped IPv6 (any embedded private)
//   fc00::/7  (f[cd]xx:)                         — IPv6 ULA (RFC 4193)
//   fe80::/10 (fe[89ab]x)                        — IPv6 link-local (RFC 4291)
const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|168\.63\.129\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.0\.0\.0|::1$|::ffff:|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f])/i;

function isSafeWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (BLOCKED_HOSTS_RE.test(u.hostname) || PRIVATE_IP_RE.test(u.hostname)) return false;
    return true;
  } catch { return false; }
}

interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  active: boolean;
  tenant: string;
  deliveryCount: number;
  lastDeliveredAt?: string;
  lastDeliveryStatus?: "ok" | "failed";
}

function webhookKey(tenant: string, id: string): string {
  return `webhooks/${tenant}/${id}.json`;
}

function webhookIndexKey(tenant: string): string {
  return `webhooks/${tenant}/_index.json`;
}

// Cap concurrent outbound HTTP deliveries to prevent unbounded fan-out under
// large webhook subscriber lists or during a retry storm.
const CONCURRENT_DELIVERY_LIMIT = 10;

export async function deliverWebhookEvent(
  tenant: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const idx = (await getJson<string[]>(webhookIndexKey(tenant))) ?? [];
  const registrations = (await Promise.all(
    idx.map((id) => getJson<WebhookRegistration>(webhookKey(tenant, id)))
  )).filter((r): r is WebhookRegistration => r !== null && r.active);

  const matching = registrations.filter(
    (r) => (r.events.includes("all") || r.events.includes(event)) && isSafeWebhookUrl(r.url)
  );
  if (matching.length === 0) return;

  const ts = new Date().toISOString();

  // Spread payload first so envelope fields (event, ts) always win over any
  // colliding keys in the caller-supplied payload object.
  const deliverOne = async (reg: WebhookRegistration): Promise<void> => {
    const body = { ...payload, event, ts };
    const bodyStr = JSON.stringify(body);
    const signature = reg.secret
      ? createHmac("sha256", reg.secret).update(bodyStr).digest("hex")
      : null;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(reg.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hawkeye-Event": event,
          ...(signature ? { "X-Hawkeye-Signature": signature } : {}),
          "X-Hawkeye-Delivery": `${reg.id}-${Date.now()}`,
        },
        body: bodyStr,
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      reg.deliveryCount = (reg.deliveryCount ?? 0) + 1;
      reg.lastDeliveredAt = ts;
      reg.lastDeliveryStatus = res.ok ? "ok" : "failed";
    } catch {
      clearTimeout(tid);
      reg.deliveryCount = (reg.deliveryCount ?? 0) + 1;
      reg.lastDeliveredAt = ts;
      reg.lastDeliveryStatus = "failed";
    }
    await setJson(webhookKey(tenant, reg.id), reg).catch(() => undefined);
  };

  // Deliver in capped batches — never more than CONCURRENT_DELIVERY_LIMIT
  // parallel outbound connections at once.
  for (let i = 0; i < matching.length; i += CONCURRENT_DELIVERY_LIMIT) {
    await Promise.all(matching.slice(i, i + CONCURRENT_DELIVERY_LIMIT).map(deliverOne));
  }
}
