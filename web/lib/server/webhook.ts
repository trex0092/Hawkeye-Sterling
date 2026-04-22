import crypto from "node:crypto";

export interface WebhookEvent {
  type:
    | "screening.completed"
    | "screening.delta"
    | "ongoing.rerun"
    | "str.raised"
    | "escalation";
  subjectId: string;
  subjectName: string;
  severity?: string;
  topScore?: number;
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
    });
    return {
      delivered: res.ok,
      status: res.status,
      url,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      delivered: false,
      error: err instanceof Error ? err.message : String(err),
      url,
    };
  }
}
