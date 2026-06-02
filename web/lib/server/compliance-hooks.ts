// Hawkeye Sterling — operator-configurable compliance event webhooks.
//
// Claude Code hooks system inspired: operators register HTTP webhook URLs
// that receive signed payloads when compliance events fire. Eliminates the
// need to poll the audit trail for integrations with case-management tools,
// ticketing systems, and compliance dashboards.
//
// Security:
//   - Payload signed with HMAC-SHA256(body, tenantSecret) in X-Hawkeye-Signature
//   - HTTPS enforced in production (HTTP URLs are rejected)
//   - Webhook secrets stored per-tenant in Netlify Blobs (not logged)
//   - Audit chain entry written on every fire attempt
//   - Failures are logged and retried up to maxRetries; never block the
//     compliance response path (fire-and-forget pattern)

import { createHmac } from "node:crypto";
import { getJson, setJson } from "./store";
import { writeAuditChainEntry } from "./audit-chain";
import { incrementCounter } from "./metrics-store";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComplianceEvent =
  | "screening_completed"
  | "sar_filed"
  | "four_eyes_required"
  | "four_eyes_approved"
  | "four_eyes_rejected"
  | "periodic_rescreen_due"
  | "ai_budget_downgrade"
  | "anomaly_detected"
  | "pep_hit"
  | "sanctions_hit";

export interface HookConfig {
  id: string;
  event: ComplianceEvent;
  /** HTTPS URL required in production. */
  url: string;
  /** HMAC-SHA256 signing secret. Stored but never logged. */
  secret: string;
  maxRetries: number;
  timeoutMs: number;
  createdAt: string;
  active: boolean;
}

export interface HookPayload {
  event: ComplianceEvent;
  tenantId: string;
  at: string;
  data: Record<string, unknown>;
}

export type HookListConfig = { hooks: HookConfig[] };

const HOOKS_PREFIX = "hooks/";

// ── Storage helpers ───────────────────────────────────────────────────────────

export async function getHooksForTenant(tenantId: string): Promise<HookConfig[]> {
  const key = `${HOOKS_PREFIX}${sanitiseTenantId(tenantId)}/config.json`;
  const stored = await getJson<HookListConfig>(key).catch(() => null);
  return stored?.hooks ?? [];
}

export async function saveHooksForTenant(
  tenantId: string,
  hooks: HookConfig[],
): Promise<void> {
  const key = `${HOOKS_PREFIX}${sanitiseTenantId(tenantId)}/config.json`;
  await setJson<HookListConfig>(key, { hooks });
}

function sanitiseTenantId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
}

// ── Signing ───────────────────────────────────────────────────────────────────

function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// ── HTTP delivery with retry ──────────────────────────────────────────────────

async function deliverOnce(
  url: string,
  body: string,
  signature: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "X-Hawkeye-Signature":  `sha256=${signature}`,
        "X-Hawkeye-Version":    "1",
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deliverWithRetry(
  hook: HookConfig,
  body: string,
  signature: string,
): Promise<"success" | "failed" | "retried"> {
  for (let attempt = 0; attempt < hook.maxRetries; attempt++) {
    const ok = await deliverOnce(hook.url, body, signature, hook.timeoutMs);
    if (ok) return attempt === 0 ? "success" : "retried";
    if (attempt < hook.maxRetries - 1) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return "failed";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire all registered hooks for a compliance event. Always fire-and-forget
 * from the caller's perspective — failures are logged but never propagate.
 *
 * Usage from route handlers:
 *   void fireHook("screening_completed", tenantId, { subjectName, verdict });
 */
export function fireHook(
  event: ComplianceEvent,
  tenantId: string,
  data: Record<string, unknown>,
): void {
  void (async () => {
    try {
      const hooks = await getHooksForTenant(tenantId);
      const matching = hooks.filter((h) => h.active && h.event === event);
      if (matching.length === 0) return;

      const payload: HookPayload = {
        event,
        tenantId,
        at: new Date().toISOString(),
        data,
      };
      const body = JSON.stringify(payload);

      for (const hook of matching) {
        // Reject HTTP URLs in production — compliance webhooks must use TLS
        if (process.env["NODE_ENV"] === "production" && !hook.url.startsWith("https://")) {
          console.warn(`[compliance-hooks] Skipping non-HTTPS webhook ${hook.id} for event ${event}`);
          incrementCounter("hawkeye_hook_fired_total", 1, { event, status: "skipped_http" });
          continue;
        }

        const signature = signPayload(body, hook.secret);
        const status    = await deliverWithRetry(hook, body, signature);

        incrementCounter("hawkeye_hook_fired_total", 1, { event, status });

        void writeAuditChainEntry(
          {
            event:  "hook_fired",
            actor:  "system",
            hookId: hook.id,
            hookEvent: event,
            url:    hook.url.replace(/\/\/.*@/, "//***@"),  // strip any auth credentials
            status,
          },
          tenantId,
        ).catch(() => undefined);
      }
    } catch (err) {
      console.error("[compliance-hooks] Unexpected error:", err instanceof Error ? err.message : String(err));
    }
  })();
}
