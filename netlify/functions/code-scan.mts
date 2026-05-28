// Hawkeye Sterling — AI-powered code security scan (Code-Analyzer integration).
//
// Daily Netlify scheduled function (03:15 UTC) that fetches the 6 most
// security-critical source files from the Hawkeye Sterling GitHub repo
// and runs them through Claude in security-review mode (mirroring the
// Code-Analyzer security analysis patterns).
//
// Results are written to Netlify Blobs at hawkeye-code-scan/latest.json.
// The /api/security-scan route reads this blob to surface a "Code Analysis"
// module in the HAWKEYE SECURITY SUITE dashboard without blocking the
// synchronous scan request with slow LLM calls.
//
// Requires:
//   ANTHROPIC_API_KEY — Claude API key (already set for AI features)
//   GITHUB_TOKEN      — GitHub PAT or Actions token to read source files
//   GITHUB_REPO       — owner/repo (default: trex0092/Hawkeye-Sterling)

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { emit } from "../../dist/src/integrations/webhook-emitter.js";
import { writeHeartbeat } from "../lib/heartbeat.js";

const RUN_LABEL = "code-scan";
const STORE_NAME = "hawkeye-code-scan";
const LOCK_TTL_MS = 10 * 60 * 1000;
const LLM_TIMEOUT_MS = 60_000;
const GITHUB_API = "https://api.github.com";

// The 6 security-critical source files to analyse on every run.
const TARGET_FILES = [
  "web/lib/server/enforce.ts",
  "web/lib/server/jwt.ts",
  "web/lib/server/audit-chain.ts",
  "web/lib/server/egress-check.ts",
  "web/lib/server/rate-limit.ts",
  "web/lib/server/llm.ts",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CodeScanFinding {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  title: string;
  detail: string;
  remediation: string;
  cwe?: string;
  file?: string;
}

interface CodeScanResult {
  scannedAt: string;
  findings: CodeScanFinding[];
  totalFiles: number;
  filesAnalyzed: string[];
  durationMs: number;
}

// ── GitHub file fetch ─────────────────────────────────────────────────────────

async function fetchSourceFile(path: string, repo: string, token: string): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${repo}/contents/${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "application/vnd.github.raw+json",
        authorization: `Bearer ${token}`,
        "user-agent": "hawkeye-sterling/code-scan",
      },
    });
    if (!res.ok) {
      console.warn(`[${RUN_LABEL}] GitHub fetch ${path} → ${res.status}`);
      return null;
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── LLM security analysis ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a security code reviewer specialising in AML/CFT compliance platforms.
Analyse the provided TypeScript source file for security vulnerabilities.
Focus on: authentication bypasses, timing attacks, injection flaws, insecure cryptography,
secret leakage, privilege escalation, SSRF, open redirects, prototype pollution,
missing input validation, and OWASP Top 10 / CWE-classified issues.

Return ONLY a valid JSON array (no markdown, no commentary) of findings:
[
  {
    "id": "CA-001",
    "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
    "category": "Authentication|Cryptography|Injection|...",
    "title": "Short descriptive title",
    "detail": "Explanation of the vulnerability and where it appears",
    "remediation": "Concrete fix recommendation",
    "cwe": "CWE-NNN"
  }
]
Return an empty array [] if no findings.`;

async function analyseFile(
  path: string,
  content: string,
  apiKey: string,
): Promise<CodeScanFinding[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `<file path="${path}">\n${content.slice(0, 80_000)}\n</file>\n\nAnalyse this file for security vulnerabilities. Return JSON array only.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`[${RUN_LABEL}] Anthropic API ${res.status} for ${path}`);
      return [];
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "[]";

    // Extract JSON array — strip any accidental markdown fencing
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    return raw
      .filter((r) => r && typeof r === "object")
      .map((r, i): CodeScanFinding => ({
        id: typeof r["id"] === "string" ? r["id"] : `CA-${String(i + 1).padStart(3, "0")}`,
        severity: (["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].includes(String(r["severity"]))
          ? r["severity"]
          : "INFO") as CodeScanFinding["severity"],
        category: typeof r["category"] === "string" ? r["category"] : "General",
        title: typeof r["title"] === "string" ? r["title"] : "Untitled finding",
        detail: typeof r["detail"] === "string" ? r["detail"] : "",
        remediation: typeof r["remediation"] === "string" ? r["remediation"] : "",
        cwe: typeof r["cwe"] === "string" ? r["cwe"] : undefined,
        file: path,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// ── Blob helpers ──────────────────────────────────────────────────────────────

function buildStoreOptions(): Parameters<typeof getStore>[0] {
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  if (siteID && token) return { name: STORE_NAME, siteID, token, consistency: "strong" };
  return { name: STORE_NAME };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.warn(`[${RUN_LABEL}] ANTHROPIC_API_KEY not set — skipping code scan`);
    return jsonResponse({ ok: false, label: RUN_LABEL, error: "ANTHROPIC_API_KEY not configured" }, 503);
  }

  const githubToken = process.env["GITHUB_TOKEN"];
  if (!githubToken) {
    console.warn(`[${RUN_LABEL}] GITHUB_TOKEN not set — skipping code scan`);
    return jsonResponse({ ok: false, label: RUN_LABEL, error: "GITHUB_TOKEN not configured" }, 503);
  }

  const repo = process.env["GITHUB_REPO"] ?? "trex0092/Hawkeye-Sterling";

  let store: ReturnType<typeof getStore>;
  let hbStore: ReturnType<typeof getStore>;
  try {
    store = getStore(buildStoreOptions());
    hbStore = getStore("hawkeye-function-heartbeats");
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: err instanceof Error ? err.message : String(err) }, 503);
  }

  // Idempotency lock — prevents overlapping runs.
  const existingLock = await hbStore.get(`${RUN_LABEL}/lock`, { type: "json" }).catch(() => null) as { lockedAt: string } | null;
  if (existingLock) {
    const lockAge = Date.now() - new Date(existingLock.lockedAt).getTime();
    if (lockAge < LOCK_TTL_MS) {
      console.info(`[${RUN_LABEL}] already running (lock age ${Math.round(lockAge / 1000)}s) — skipping`);
      return jsonResponse({ ok: true, skipped: true, reason: "lock_active", lockAgeMs: lockAge });
    }
  }
  await hbStore.setJSON(`${RUN_LABEL}/lock`, { lockedAt: new Date().toISOString() }).catch(() => undefined);

  // Fetch + analyse files in parallel (rate-limited to 3 concurrent to respect API limits).
  const allFindings: CodeScanFinding[] = [];
  const filesAnalyzed: string[] = [];

  const batches: string[][] = [];
  for (let i = 0; i < TARGET_FILES.length; i += 3) {
    batches.push(TARGET_FILES.slice(i, i + 3));
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (filePath) => {
        const content = await fetchSourceFile(filePath, repo, githubToken);
        if (!content) {
          console.warn(`[${RUN_LABEL}] could not fetch ${filePath} — skipping`);
          return;
        }
        filesAnalyzed.push(filePath);
        const findings = await analyseFile(filePath, content, apiKey);
        allFindings.push(...findings);
      }),
    );
  }

  if (filesAnalyzed.length === 0) {
    await hbStore.delete(`${RUN_LABEL}/lock`).catch(() => undefined);
    return jsonResponse({ ok: false, label: RUN_LABEL, error: "no files could be fetched", durationMs: Date.now() - startedAt }, 502);
  }

  // Persist results.
  const result: CodeScanResult = {
    scannedAt: new Date().toISOString(),
    findings: allFindings,
    totalFiles: filesAnalyzed.length,
    filesAnalyzed,
    durationMs: Date.now() - startedAt,
  };

  try {
    await store.set("latest.json", JSON.stringify(result));
  } catch (err) {
    await hbStore.delete(`${RUN_LABEL}/lock`).catch(() => undefined);
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `blob write failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - startedAt,
    }, 503);
  }

  // Emit webhook if any critical or high findings found.
  const critCount = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const highCount = allFindings.filter((f) => f.severity === "HIGH").length;
  if (critCount + highCount > 0) {
    try {
      await emit("audit_drift", {
        kind: "code_scan_findings",
        critical: critCount,
        high: highCount,
        total: allFindings.length,
        filesAnalyzed,
        sample: allFindings
          .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
          .slice(0, 5)
          .map((f) => `${f.file}: [${f.severity}] ${f.title}`),
      });
    } catch {
      // best-effort
    }
  }

  await writeHeartbeat(RUN_LABEL);
  await hbStore.delete(`${RUN_LABEL}/lock`).catch(() => undefined);

  return jsonResponse({
    ok: true,
    label: RUN_LABEL,
    filesAnalyzed: filesAnalyzed.length,
    findings: allFindings.length,
    critical: critCount,
    high: highCount,
    durationMs: Date.now() - startedAt,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = {
  // Daily at 03:15 UTC.
  schedule: "15 3 * * *",
};
