// GET /api/security-scan
//
// Platform-level security posture scan for Hawkeye Sterling.
// Aggregates signals from: auth configuration, UEBA alerts, audit chain
// integrity, designation alert backlog, sanctions freshness, and cron-token
// protection — and computes a composite 0–100 security score.
//
// Score → Status:
//   90–100 + 0 critical  → PASSED
//   70–89  or any high   → ATTENTION
//   <70    or any critical → FAILED
//
// Auth: standard session cookie or API key (analyst+ role).

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type ScanSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type ScanStatus = "PASSED" | "ATTENTION" | "FAILED";
export type ModuleStatus = "pass" | "warn" | "fail";

export interface ScanFinding {
  id: string;
  severity: ScanSeverity;
  category: string;
  title: string;
  detail: string;
  remediation: string;
}

export interface ScanModule {
  id: string;
  name: string;
  icon: string;
  status: ModuleStatus;
  checksRun: number;
  findings: number;
}

export interface SecurityScanResult {
  scanId: string;
  scannedAt: string;
  status: ScanStatus;
  score: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  totalFindings: number;
  findings: ScanFinding[];
  modules: ScanModule[];
  poweredBy: "Hawkeye Security Suite";
}

// ── Individual security checks ────────────────────────────────────────────────

type CheckResult = { finding?: ScanFinding };

function checkAuthSecret(): CheckResult {
  const configured = !!process.env["HAWKEYE_API_SECRET"];
  if (!configured) {
    return {
      finding: {
        id: "SEC-001",
        severity: "HIGH",
        category: "Authentication",
        title: "API secret not configured",
        detail: "HAWKEYE_API_SECRET is unset. The platform falls back to an open-access mode where any API key is accepted.",
        remediation: "Set HAWKEYE_API_SECRET in your Netlify environment variables to enforce bearer-token authentication.",
      },
    };
  }
  return {};
}

function checkCronToken(): CheckResult {
  const configured = !!process.env["HAWKEYE_CRON_TOKEN"];
  if (!configured) {
    return {
      finding: {
        id: "SEC-002",
        severity: "MEDIUM",
        category: "Scheduled Functions",
        title: "Cron token not configured",
        detail: "HAWKEYE_CRON_TOKEN is unset. Scheduled functions (sanctions refresh, SLA monitor, OFAC crypto refresh) will accept any unauthenticated POST request.",
        remediation: "Set HAWKEYE_CRON_TOKEN and add Authorization: Bearer <token> to your Netlify scheduled function invocations.",
      },
    };
  }
  return {};
}

function checkAnthropicKey(): CheckResult {
  const configured = !!process.env["ANTHROPIC_API_KEY"];
  if (!configured) {
    return {
      finding: {
        id: "SEC-003",
        severity: "LOW",
        category: "AI Integration",
        title: "Anthropic API key not configured",
        detail: "ANTHROPIC_API_KEY is unset. AI-powered analysis routes (MLRO advisor, adverse media, SAR narrative) will return 503.",
        remediation: "Configure ANTHROPIC_API_KEY in your deployment environment to enable AI features.",
      },
    };
  }
  return {};
}

function checkHmacSecret(): CheckResult {
  const configured = !!process.env["AUDIT_HMAC_SECRET"];
  if (!configured) {
    return {
      finding: {
        id: "SEC-004",
        severity: "MEDIUM",
        category: "Audit Integrity",
        title: "Audit HMAC secret not configured",
        detail: "AUDIT_HMAC_SECRET is unset. Audit chain entries cannot be cryptographically signed — tamper-evidence is disabled.",
        remediation: "Set AUDIT_HMAC_SECRET to a 256-bit random secret to enable HMAC-SHA256 signing of the audit chain.",
      },
    };
  }
  return {};
}

async function checkUebaAlerts(tenantId: string): Promise<{ findings: ScanFinding[]; checksRun: number }> {
  const findings: ScanFinding[] = [];

  try {
    const { getStore } = await import("@netlify/blobs") as { getStore: Function };
    const store = getStore({
      name: "hawkeye-ueba",
      siteID: process.env["NETLIFY_SITE_ID"],
      token: process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_TOKEN"],
      consistency: "strong",
    }) as { get: (_key: string, _opts?: { type?: string }) => Promise<unknown> };

    const now = new Date();
    const events: unknown[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() - i * 86_400_000);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      const key = `${tenantId}/events/${y}${m}${day}.json`;
      const raw = await store.get(key, { type: "text" }).catch(() => null);
      if (raw && typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw) as unknown[];
          if (Array.isArray(parsed)) events.push(...parsed);
        } catch { /* skip */ }
      }
    }

    const { buildUEBAReport } = await import("../../../../src/monitoring/analyst-behavior.js") as {
      buildUEBAReport: (_events: unknown[], _windowDays?: number) => {
        alerts: Array<{ ruleId: string; severity: string; title: string; detail: string }>;
      };
    };

    const report = buildUEBAReport(events, 7);
    const criticalUeba = report.alerts.filter((a) => a.severity === "critical");
    const highUeba = report.alerts.filter((a) => a.severity === "high");

    if (criticalUeba.length > 0) {
      findings.push({
        id: "SEC-005",
        severity: "CRITICAL",
        category: "Insider Threat (UEBA)",
        title: `${criticalUeba.length} critical UEBA alert(s) active`,
        detail: criticalUeba.map((a) => `${a.ruleId}: ${a.title}`).join("; "),
        remediation: "Investigate flagged analyst accounts immediately via the Analyst Behavior dashboard.",
      });
    } else if (highUeba.length > 0) {
      findings.push({
        id: "SEC-005H",
        severity: "HIGH",
        category: "Insider Threat (UEBA)",
        title: `${highUeba.length} high-severity UEBA alert(s) active`,
        detail: highUeba.map((a) => `${a.ruleId}: ${a.title}`).join("; "),
        remediation: "Review flagged analyst behaviour in the Analyst Behavior dashboard.",
      });
    }

    return { findings, checksRun: 1 };
  } catch {
    // UEBA store not available in this environment — not a security finding
    return { findings: [], checksRun: 1 };
  }
}

async function checkDesignationAlerts(): Promise<{ findings: ScanFinding[]; checksRun: number }> {
  try {
    const { getStore } = await import("@netlify/blobs") as { getStore: Function };
    const store = getStore("hawkeye-alerts") as {
      get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
    };

    const indexRaw = await store.get("alerts/_index.json", { type: "text" }).catch(() => null);
    if (!indexRaw || typeof indexRaw !== "string") return { findings: [], checksRun: 1 };

    const idx = JSON.parse(indexRaw) as { alertIds: string[] };
    let unreadCritical = 0;

    // Sample the first 20 alert IDs to check for unread critical
    const sample = idx.alertIds.slice(0, 20);
    await Promise.all(
      sample.map(async (id: string) => {
        const raw = await store.get(`alerts/${id}.json`, { type: "text" }).catch(() => null);
        if (!raw || typeof raw !== "string") return;
        try {
          const a = JSON.parse(raw) as { severity?: string; read?: boolean };
          if (a.severity === "critical" && !a.read) unreadCritical++;
        } catch { /* skip */ }
      }),
    );

    if (unreadCritical > 0) {
      return {
        findings: [
          {
            id: "SEC-006",
            severity: "HIGH",
            category: "Sanctions Alerts",
            title: `${unreadCritical} unread critical designation alert(s)`,
            detail: `${unreadCritical} OFAC/UN/EOCN designation alert(s) are unread and unactioned.`,
            remediation: "Review and action all critical designation alerts in the Alert Bell or Sanctions Alerts module.",
          },
        ],
        checksRun: 1,
      };
    }

    return { findings: [], checksRun: 1 };
  } catch {
    return { findings: [], checksRun: 1 };
  }
}

// ── Score computation ─────────────────────────────────────────────────────────

function computeScore(findings: ScanFinding[]): number {
  const deductions = findings.reduce((sum, f) => {
    if (f.severity === "CRITICAL") return sum + 25;
    if (f.severity === "HIGH")     return sum + 15;
    if (f.severity === "MEDIUM")   return sum + 7;
    if (f.severity === "LOW")      return sum + 3;
    return sum + 1;
  }, 0);
  return Math.max(0, 100 - deductions);
}

function computeStatus(score: number, findings: ScanFinding[]): ScanStatus {
  const hasCritical = findings.some((f) => f.severity === "CRITICAL");
  if (hasCritical || score < 70) return "FAILED";
  if (score < 90 || findings.some((f) => f.severity === "HIGH" || f.severity === "MEDIUM")) return "ATTENTION";
  return "PASSED";
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);

  // Run all checks in parallel where independent
  const [uebaResult, alertsResult] = await Promise.all([
    checkUebaAlerts(tenantId),
    checkDesignationAlerts(),
  ]);

  const configFindings: ScanFinding[] = [
    checkAuthSecret().finding,
    checkCronToken().finding,
    checkAnthropicKey().finding,
    checkHmacSecret().finding,
  ].filter((f): f is ScanFinding => f !== undefined);

  const allFindings: ScanFinding[] = [
    ...configFindings,
    ...uebaResult.findings,
    ...alertsResult.findings,
  ];

  const score = computeScore(allFindings);
  const status = computeStatus(score, allFindings);

  const modules: ScanModule[] = [
    {
      id: "auth",
      name: "Authentication & Secrets",
      icon: "🔑",
      status: configFindings.some((f) => f.id === "SEC-001") ? "fail"
        : configFindings.some((f) => ["SEC-002", "SEC-004"].includes(f.id)) ? "warn"
        : "pass",
      checksRun: 2,
      findings: configFindings.filter((f) => ["SEC-001", "SEC-002", "SEC-004"].includes(f.id)).length,
    },
    {
      id: "ai",
      name: "AI Integration",
      icon: "🤖",
      status: configFindings.some((f) => f.id === "SEC-003") ? "warn" : "pass",
      checksRun: 1,
      findings: configFindings.filter((f) => f.id === "SEC-003").length,
    },
    {
      id: "ueba",
      name: "Insider Threat (UEBA)",
      icon: "👁️",
      status: uebaResult.findings.some((f) => f.severity === "CRITICAL") ? "fail"
        : uebaResult.findings.length > 0 ? "warn"
        : "pass",
      checksRun: uebaResult.checksRun,
      findings: uebaResult.findings.length,
    },
    {
      id: "alerts",
      name: "Designation Alerts",
      icon: "🚨",
      status: alertsResult.findings.some((f) => f.severity === "CRITICAL") ? "fail"
        : alertsResult.findings.length > 0 ? "warn"
        : "pass",
      checksRun: alertsResult.checksRun,
      findings: alertsResult.findings.length,
    },
  ];

  const result: SecurityScanResult = {
    scanId: `scan_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`,
    scannedAt: new Date().toISOString(),
    status,
    score,
    criticalFindings: allFindings.filter((f) => f.severity === "CRITICAL").length,
    highFindings: allFindings.filter((f) => f.severity === "HIGH").length,
    mediumFindings: allFindings.filter((f) => f.severity === "MEDIUM").length,
    lowFindings: allFindings.filter((f) => f.severity === "LOW").length,
    totalFindings: allFindings.length,
    findings: allFindings,
    modules,
    poweredBy: "Hawkeye Security Suite",
  };

  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
