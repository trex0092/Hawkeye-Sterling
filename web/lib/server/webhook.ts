import crypto from "node:crypto";

// Retries on transient failures (network, timeout, DNS, 5xx).
// Does NOT retry on 4xx — those indicate a configuration problem.
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;

// Private/loopback IP ranges and cloud metadata hostnames that must never
// receive outbound webhook traffic (SSRF prevention).
// Covers RFC 1918, CGNAT (100.64.0.0/10), Azure IMDS (168.63.129.x),
// IPv6 ULA (fc00::/7), IPv6 link-local (fe80::/10), IPv4-mapped (::ffff:).
const BLOCKED_HOSTS = /^(localhost|.*\.local|metadata\.google\.internal)$/i;
const PRIVATE_IP =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|168\.63\.129\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.0\.0\.0|::1$|::ffff:|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f])/i;

export function assertSafeWebhookUrl(raw: string): void {
  let u: URL;
  try { u = new URL(raw); } catch {
    throw new Error("HAWKEYE_WEBHOOK_URL is not a valid URL");
  }
  if (u.protocol !== "https:") {
    throw new Error(`HAWKEYE_WEBHOOK_URL must use https, got: ${u.protocol}`);
  }
  if (BLOCKED_HOSTS.test(u.hostname) || PRIVATE_IP.test(u.hostname)) {
    throw new Error("HAWKEYE_WEBHOOK_URL resolves to a blocked host");
  }
}

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
  try { assertSafeWebhookUrl(url); } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid webhook URL";
    console.error("[webhook]", msg);
    return { delivered: false, error: msg };
  }

  const secret = process.env["HAWKEYE_WEBHOOK_SECRET"];
  if (!secret) {
    console.warn("[webhook] HAWKEYE_WEBHOOK_SECRET not set — outbound events will be delivered unsigned. " +
      "Set HAWKEYE_WEBHOOK_SECRET so receivers can verify payload integrity.");
  }
  const body = JSON.stringify(event);
  const timestamp = Date.now().toString();
  const signature = secret
    ? crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex")
    : null;

  // Only include the signature header when we actually computed one.
  // Sending an empty string header signals to receivers that signing is
  // not active, enabling downgrade attacks where an attacker strips the
  // real signature and sends an empty header instead.
  const signatureHeaders: Record<string, string> = signature
    ? { "x-hawkeye-signature": `sha256=${signature}` }
    : {};

  const headers = {
    "content-type": "application/json",
    "x-hawkeye-timestamp": timestamp,
    ...signatureHeaders,
    "user-agent": "HawkeyeSterling/0.2 (+https://hawkeye-sterling.netlify.app)",
  };

  let lastError: string = "delivery-failed";
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(8_000),
      });

      if (res.ok) {
        if (attempt > 0) console.info(`[webhook] delivered on attempt ${attempt + 1}`);
        return { delivered: true, status: res.status, url };
      }

      lastStatus = res.status;
      lastError = `HTTP ${res.status}`;

      // 4xx means the receiver rejected the payload — retrying won't help.
      if (res.status >= 400 && res.status < 500) {
        console.warn(`[webhook] non-retryable HTTP ${res.status} from ${url}`);
        return { delivered: false, status: res.status, error: lastError, url };
      }
    } catch (err) {
      // Audit DR-08: map to stable categories; never expose raw Error.message.
      const raw = err instanceof Error ? err.message : String(err);
      const lower = raw.toLowerCase();
      lastError =
        lower.includes("abort") || lower.includes("timeout") ? "timeout"
          : lower.includes("econnreset") || lower.includes("network") || lower.includes("fetch failed") ? "network-error"
          : lower.includes("enotfound") || lower.includes("dns") ? "dns-failure"
          : "delivery-failed";
      console.warn(`[webhook] attempt ${attempt + 1} ${lastError}: ${raw}`);
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }

  console.warn(`[webhook] all ${RETRY_DELAYS_MS.length + 1} attempts failed — last error: ${lastError}`);
  return {
    delivered: false,
    error: lastError,
    ...(lastStatus !== undefined ? { status: lastStatus } : {}),
    url,
  };
}
