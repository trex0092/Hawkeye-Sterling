import crypto from "node:crypto";

export interface WebhookEvent {
  type:
    | "screening.completed"
    | "screening.delta"
    | "screening.escalated"
    | "ongoing.rerun"
    | "str.raised"
    | "tm.filed"
    | "escalation";
  subjectId: string;
  subjectName: string;
  severity?: string;
  topScore?: number;
  scoreDelta?: number;
  escalated?: boolean;
  newHits?: Array<{ listId: string; listRef: string; candidateName: string }>;
  asanaTaskUrl?: string;
  generatedAt: string;
  source: "hawkeye-sterling";
}

export interface WebhookResult {
  delivered: boolean;
  status?: number;
  error?: string;
  url?: string;
}

export async function postWebhook(event: WebhookEvent): Promise<WebhookResult> {
  const url = process.env["HAWKEYE_WEBHOOK_URL"];
  if (!url) return { delivered: false, error: "HAWKEYE_WEBHOOK_URL not set" };

  const secret = process.env["HAWKEYE_WEBHOOK_SECRET"] ?? "";
  if (!secret) {
    console.warn("[webhook] HAWKEYE_WEBHOOK_SECRET not set — outbound events will be unsigned");
  }
  const body = JSON.stringify(event);
  const timestamp = Date.now().toString();
  const signature = secret
    ? crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex")
    : "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hawkeye-timestamp": timestamp,
        "x-hawkeye-signature": signature ? `sha256=${signature}` : "",
        "user-agent": "HawkeyeSterling/0.2 (+https://hawkeye-sterling.netlify.app)",
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    return {
      delivered: res.ok,
      status: res.status,
      url,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    // Audit DR-08: previous code returned the raw Error.message which can
    // leak Node internals (request URLs, ECONNRESET stack hints) into
    // response payloads that downstream consumers persist. Map to a small
    // set of stable error categories and keep the detail in console only.
    const rawMessage = err instanceof Error ? err.message : String(err);
    const lower = rawMessage.toLowerCase();
    const category =
      lower.includes("abort") || lower.includes("timeout") ? "timeout"
        : lower.includes("econnreset") || lower.includes("network") || lower.includes("fetch failed") ? "network-error"
        : lower.includes("enotfound") || lower.includes("dns") ? "dns-failure"
        : "delivery-failed";
    console.warn(`[webhook] ${category} delivering to ${url}: ${rawMessage}`);
    return {
      delivered: false,
      error: category,
      url,
    };
  }
}
