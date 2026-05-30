"use client";

import { useState, useRef, useEffect } from "react";
import { ModuleHero } from "@/components/layout/ModuleLayout";
import type { AnalysisResult } from "@/app/api/security-analyse/route";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

const TOOLS = [
  {
    name: "Semgrep",
    tier: "Free",
    colorClass: "text-blue border-blue/30 bg-blue-dim",
    accentClass: "text-blue",
    borderClass: "border-blue/20",
    what: "Static code analysis — finds OWASP Top 10 vulnerabilities in JS/TS",
    steps: [
      "Install: npm install -g semgrep  OR  pip install semgrep",
      "Clone repo: git clone https://github.com/trex0092/Hawkeye-Sterling",
      "Run: semgrep --config=auto .",
      "JS-specific: semgrep --config=p/javascript .",
      "Secrets scan: semgrep --config=p/secrets .",
      "Export: semgrep --config=auto . --json > semgrep-report.json",
    ],
    critical:
      "Detects hardcoded API keys in screening-app.js and tfs-engine.js",
  },
  {
    name: "Snyk",
    tier: "Free tier",
    colorClass: "text-violet border-violet/30 bg-violet-dim",
    accentClass: "text-violet",
    borderClass: "border-violet/20",
    what: "Scans package.json dependencies for known CVEs",
    steps: [
      "Install: npm install -g snyk",
      "Authenticate: snyk auth",
      "In repo root: snyk test",
      "Code analysis: snyk code test",
      "Netlify functions: cd netlify/functions && snyk test",
      "Report: snyk test --json > snyk-report.json",
    ],
    critical:
      "Check Netlify function dependencies for CVEs in AML/screening libraries",
  },
  {
    name: "OWASP ZAP",
    tier: "Free",
    colorClass: "text-red border-red/30 bg-red-dim",
    accentClass: "text-red",
    borderClass: "border-red/20",
    what: "Live scanner — attacks your running Hawkeye Sterling app",
    steps: [
      "Download OWASP ZAP from zaproxy.org",
      "Launch ZAP → Automated Scan",
      "Enter URL: https://hawkeye-sterling.netlify.app",
      "Run Full Scan (~10–20 min)",
      "Review: Active Scan → Alerts tab",
      "Export: Report → Generate HTML Report",
    ],
    critical:
      "Tests live CSP, security headers, XSS vectors, and API endpoint exposure",
  },
  {
    name: "CodeQL",
    tier: "Free (public repo)",
    colorClass: "text-green border-green/30 bg-green-dim",
    accentClass: "text-green",
    borderClass: "border-green/20",
    what: "Deep semantic analysis — finds logic flaws and data flow issues",
    steps: [
      "Go to: github.com/trex0092/Hawkeye-Sterling/security",
      "Click: 'Enable code scanning'",
      "Select: CodeQL Analysis workflow",
      "Commit the generated .github/workflows/codeql.yml",
      "Push triggers automatic scan",
      "View: Security → Code scanning alerts",
    ],
    critical:
      "Best for broken access control in tfs-engine.js and screening logic",
  },
];

const CHECKLIST = [
  {
    category: "API Key Security",
    severity: "CRITICAL" as const,
    items: [
      { id: "api1", text: "Anthropic API key is NOT in any frontend JS file (screening-app.js, tfs-engine.js, app.html)" },
      { id: "api2", text: "Asana API token stored only in Netlify environment variables, not hardcoded" },
      { id: "api3", text: "All api.anthropic.com calls go through netlify/functions, never direct from browser" },
      { id: "api4", text: "Environment variables verified in Netlify dashboard: Site Settings → Environment Variables" },
    ],
  },
  {
    category: "Content Security Policy",
    severity: "HIGH" as const,
    items: [
      { id: "csp1", text: "Remove 'unsafe-inline' from style-src — use nonces or hashes instead" },
      { id: "csp2", text: "Change X-Frame-Options from SAMEORIGIN to DENY (align with frame-ancestors 'none')" },
      { id: "csp3", text: "Add report-uri or report-to directive to CSP for violation monitoring" },
      { id: "csp4", text: "Add upgrade-insecure-requests to CSP" },
      { id: "csp5", text: "Remove connect-src api.anthropic.com if API calls move fully to serverless" },
    ],
  },
  {
    category: "Netlify Functions",
    severity: "HIGH" as const,
    items: [
      { id: "fn1", text: "All functions validate and sanitize incoming request bodies before processing" },
      { id: "fn2", text: "Functions return generic error messages (no stack traces or internal paths to client)" },
      { id: "fn3", text: "Rate limiting implemented on screening endpoints to prevent abuse" },
      { id: "fn4", text: "CORS origins explicitly restricted (not wildcard *)" },
    ],
  },
  {
    category: "Authentication & Access Control",
    severity: "HIGH" as const,
    items: [
      { id: "auth1", text: "Screening console (app.html) is protected — not publicly accessible without authentication" },
      { id: "auth2", text: "Session tokens expire appropriately and are invalidated on logout" },
      { id: "auth3", text: "No sensitive compliance data (PII, screening results) stored in localStorage or sessionStorage" },
      { id: "auth4", text: "Role-based access: MLRO functions require elevated permissions" },
    ],
  },
  {
    category: "Audit Trail & Data Integrity",
    severity: "MEDIUM" as const,
    items: [
      { id: "aud1", text: "Screening results are immutable once written — no client-side tampering possible" },
      { id: "aud2", text: "All API calls to Asana are server-side only (audit trail cannot be bypassed from browser)" },
      { id: "aud3", text: "Timestamps on compliance events use server time, not client time" },
    ],
  },
  {
    category: "Dependency & Supply Chain",
    severity: "MEDIUM" as const,
    items: [
      { id: "dep1", text: "npm audit run on root package.json — zero high/critical CVEs" },
      { id: "dep2", text: "npm audit run on web/ subdirectory" },
      { id: "dep3", text: "Snyk or Dependabot enabled for automated CVE alerts" },
      { id: "dep4", text: "gen-weaponized-brain.cjs script reviewed — does not embed secrets in output" },
    ],
  },
  {
    category: "Netlify Configuration",
    severity: "LOW" as const,
    items: [
      { id: "net1", text: "Cross-Origin-Opener-Policy (COOP) header added: same-origin" },
      { id: "net2", text: "Cross-Origin-Resource-Policy (CORP) header added: same-origin" },
      { id: "net3", text: "Deploy previews restricted — not publicly accessible to unauthenticated users" },
      { id: "net4", text: "Netlify access logs enabled and reviewed periodically" },
    ],
  },
];

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

const SEV: Record<Severity, { badge: string; border: string; dot: string }> = {
  CRITICAL: { badge: "bg-red-dim text-red", border: "border-l-red", dot: "bg-red" },
  HIGH: { badge: "bg-orange-dim text-orange", border: "border-l-orange", dot: "bg-orange" },
  MEDIUM: { badge: "bg-amber-dim text-amber", border: "border-l-amber", dot: "bg-amber" },
  LOW: { badge: "bg-blue-dim text-blue", border: "border-l-blue", dot: "bg-blue" },
  INFO: { badge: "bg-bg-2 text-ink-2", border: "border-l-hair-2", dot: "bg-ink-3" },
};

type ChecklistState = Record<string, boolean>;

const CHECKLIST_STORAGE = "hawkeye.security-audit.v1";

function loadChecked(): ChecklistState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE);
    return raw ? (JSON.parse(raw) as ChecklistState) : {};
  } catch { return {}; }
}

function saveChecked(state: ChecklistState): void {
  try { window.localStorage.setItem(CHECKLIST_STORAGE, JSON.stringify(state)); } catch { /* quota exceeded */ }
}

export function SecurityAuditSection() {
  const [tab, setTab] = useState<"analyser" | "tools" | "checklist">("analyser");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState(0);
  const [checked, setChecked] = useState<ChecklistState>(loadChecked);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [result]);

  const allItems = CHECKLIST.flatMap((c) => c.items);
  const doneCount = allItems.filter((i) => checked[i.id]).length;
  const pct = Math.round((doneCount / allItems.length) * 100);

  const toggleItem = (id: string) =>
    setChecked((prev: ChecklistState) => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecked(next);
      return next;
    });

  const analyseCode = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/security-analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({})) as AnalysisResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? apiErrorMessage(res.status));
      }
      setResult(data);
    } catch (e) {
      setError(caughtErrorMessage(e, "Analysis failed"));
    }
    setLoading(false);
  };

  const scoreColor =
    result &&
    (result.score >= 70
      ? "text-green"
      : result.score >= 40
        ? "text-amber"
        : "text-red");

  const postureColor =
    pct >= 70 ? "bg-green" : pct >= 40 ? "bg-amber" : "bg-red";

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "analyser", label: "AI Analyser" },
    { id: "tools", label: "Free Tools" },
    { id: "checklist", label: `Checklist ${doneCount}/${allItems.length}` },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl">
      <ModuleHero
        eyebrow="Security Suite"
        title="Security audit"
        titleEm="dashboard."
        intro={
          <>
            Analyse your Hawkeye Sterling codebase for vulnerabilities, track
            remediation progress, and run the four recommended free scanning
            tools against the live deployment.
          </>
        }
        kpis={[
          { value: String(allItems.length), label: "audit checks" },
          { value: "4", label: "free scan tools" },
          { value: `${pct}%`, label: "remediated" },
        ]}
      />

      {/* Security posture inline bar */}
      <div className="mb-4 px-4 py-3 bg-bg-panel border border-hair-2 rounded-lg flex items-center gap-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-ink-3 shrink-0">
          Security posture
        </p>
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1 h-1.5 rounded-full bg-bg-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${postureColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-ink-1">{pct}%</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-hair mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "text-brand border-brand"
                : "text-ink-3 border-transparent hover:text-ink-1"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── AI Analyser ── */}
      {tab === "analyser" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-2 leading-relaxed">
            Paste any file from your repo —{" "}
            <span className="text-brand font-mono text-[12px]">screening-app.js</span>
            ,{" "}
            <span className="text-brand font-mono text-[12px]">tfs-engine.js</span>
            , or a Netlify function. Claude analyses it server-side for security vulnerabilities.
          </p>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste code here…"
            aria-label="Code to analyse"
            className="w-full h-52 bg-bg-1 border border-hair-2 rounded text-ink-0 font-mono text-[12px] p-4 resize-y outline-none focus:border-brand/40 leading-relaxed placeholder:text-ink-4 transition-colors"
          />

          <div className="flex gap-3 items-center">
            <button
              onClick={analyseCode}
              disabled={loading || !code.trim()}
              className="px-6 py-2.5 font-mono text-[11px] uppercase tracking-widest font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-brand text-white hover:bg-brand-hover disabled:bg-bg-2 disabled:text-ink-3"
            >
              {loading ? "Analysing…" : "Run security analysis"}
            </button>
            {code && (
              <button
                onClick={() => { setCode(""); setResult(null); setError(null); }}
                className="px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-ink-3 border border-hair-2 hover:text-ink-1 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-dim border border-red/30 text-red font-mono text-[12px]">
              ⚠ {error}
            </div>
          )}

          {result && (
            <div ref={resultRef} className="space-y-4 pt-2">
              <div className="flex gap-5 items-start p-5 bg-bg-1 border border-hair-2">
                <div className="text-center shrink-0">
                  <div className={`font-mono text-4xl font-semibold ${scoreColor}`}>
                    {result.score}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-ink-3 mt-0.5">
                    Score
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-0 leading-relaxed mb-2">{result.summary}</p>
                  <p className="font-mono text-[11px] text-brand leading-relaxed">
                    ⚡ TOP PRIORITY: {result.topPriority}
                  </p>
                </div>
              </div>

              <p className="font-mono text-[10px] uppercase tracking-widest text-ink-3">
                {result.findings?.length ?? 0} finding{result.findings?.length !== 1 ? "s" : ""}
              </p>

              {result.findings?.map((f, i) => {
                const sev = SEV[f.severity] ?? SEV.INFO;
                return (
                  <div
                    key={`${f.severity}-${i}`}
                    className={`p-4 bg-bg-1 border border-hair border-l-4 ${sev.border} space-y-1.5`}
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 ${sev.badge}`}>
                        {f.severity}
                      </span>
                      <span className="text-[13px] text-ink-0">{f.title}</span>
                    </div>
                    <p className="text-[12px] text-ink-2 leading-relaxed">{f.description}</p>
                    {f.location && (
                      <p className="font-mono text-[11px] text-ink-3">📍 {f.location}</p>
                    )}
                    <p className="font-mono text-[11px] text-green leading-relaxed">
                      ✓ Fix: {f.fix}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Free Tools ── */}
      {tab === "tools" && (
        <div className="space-y-5">
          <p className="text-sm text-ink-2 leading-relaxed">
            Four free tools you can run on the Hawkeye Sterling repository today.
          </p>

          <div className="flex gap-2 flex-wrap">
            {TOOLS.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setActiveTool(i)}
                className={`px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-all border ${
                  activeTool === i
                    ? t.colorClass
                    : "text-ink-3 border-hair-2 hover:text-ink-1"
                }`}
              >
                {t.name}
                <span className="ml-1.5 opacity-60 normal-case text-[10px]">
                  {t.tier}
                </span>
              </button>
            ))}
          </div>

          {(() => {
            const t = TOOLS[activeTool];
            if (!t) return null;
            return (
              <div className={`border ${t.borderClass} p-5 space-y-4`}>
                <div>
                  <p className={`font-mono text-[11px] uppercase tracking-widest mb-0.5 ${t.accentClass}`}>
                    {t.name}
                  </p>
                  <p className="text-sm text-ink-2 leading-relaxed">{t.what}</p>
                </div>

                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-ink-3 mb-3">
                    Setup steps
                  </p>
                  <ol className="space-y-2">
                    {t.steps.map((s, i) => (
                      <li key={s} className="flex gap-3 items-start">
                        <span className={`font-mono text-[12px] shrink-0 w-5 ${t.accentClass}`}>
                          {i + 1}.
                        </span>
                        <code className="text-[12px] text-ink-0 bg-bg-0 px-2.5 py-1 rounded flex-1 leading-relaxed break-all">
                          {s}
                        </code>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className={`p-3 border-l-2 ${t.borderClass} bg-bg-1 font-mono text-[11px] leading-relaxed ${t.accentClass}`}>
                  ⚡ Why this matters: {t.critical}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Checklist ── */}
      {tab === "checklist" && (
        <div className="space-y-5">
          <div className="p-4 bg-bg-1 border border-hair-2 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-3">
                Remediation progress
              </span>
              <span className="font-mono text-[12px] text-ink-1">
                {doneCount} / {allItems.length} completed
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${postureColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {CHECKLIST.map((cat) => {
            const catDone = cat.items.filter((i) => checked[i.id]).length;
            const sev = SEV[cat.severity] ?? SEV.INFO;
            return (
              <div key={cat.category}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 ${sev.badge}`}>
                      {cat.severity}
                    </span>
                    <span className="text-[13px] text-ink-0">{cat.category}</span>
                  </div>
                  <span className="font-mono text-[11px] text-ink-3">
                    {catDone}/{cat.items.length}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {cat.items.map((item) => {
                    const done = !!checked[item.id];
                    return (
                      <div
                        key={item.id}
                        role="checkbox"
                        aria-checked={done}
                        tabIndex={0}
                        onClick={() => toggleItem(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleItem(item.id);
                          }
                        }}
                        className={`flex items-start gap-3 px-3.5 py-2.5 cursor-pointer transition-colors border ${
                          done
                            ? "bg-green-dim border-green/20"
                            : "bg-bg-1 border-hair hover:border-hair-2"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 mt-0.5 shrink-0 border flex items-center justify-center transition-colors ${
                            done
                              ? "bg-green border-green"
                              : "border-hair-3 bg-transparent"
                          }`}
                        >
                          {done && (
                            <span className="text-bg-0 text-[10px] font-bold leading-none">
                              ✓
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[12px] leading-relaxed transition-colors ${
                            done
                              ? "text-ink-3 line-through"
                              : "text-ink-1"
                          }`}
                        >
                          {item.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
