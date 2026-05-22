import { getJson, setJson } from "@/lib/server/store";
import { createHmac } from "node:crypto";

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
    (r) => r.events.includes("all") || r.events.includes(event)
  );
  if (matching.length === 0) return;

  const ts = new Date().toISOString();
  await Promise.all(matching.map(async (reg) => {
    const body = { event, ...payload, ts };
    const bodyStr = JSON.stringify(body);
    const signature = reg.secret
      ? createHmac("sha256", reg.secret).update(bodyStr).digest("hex")
      : "";
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(reg.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hawkeye-Event": event,
          "X-Hawkeye-Signature": signature,
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
      reg.deliveryCount = (reg.deliveryCount ?? 0) + 1;
      reg.lastDeliveredAt = ts;
      reg.lastDeliveryStatus = "failed";
    }
    await setJson(webhookKey(tenant, reg.id), reg).catch(() => undefined);
  }));
}
