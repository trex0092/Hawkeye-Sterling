"use client";

import dynamic from "next/dynamic";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import "swagger-ui-react/swagger-ui.css";

// Load swagger-ui-react without SSR — it references window/document internally.
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

// Brand-aligned overrides layered on top of swagger-ui.css.
// The goal: dark surface that matches bg-panel / ink tokens; pink accents
// for interactive states; IBM Plex Mono for code; zero default border-radii
// on inputs (we use our own radius tokens).
const CUSTOM_STYLES = `
  /* ── Page shell ─────────────────────────────────────────────────────── */
  #swagger-root {
    background: transparent;
  }
  .swagger-ui {
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: var(--ink-0, #1a1614);
  }

  /* ── Top info block (title, description, version) ───────────────────── */
  .swagger-ui .info { display: none !important; }

  /* ── Server bar ─────────────────────────────────────────────────────── */
  .swagger-ui .scheme-container {
    background: var(--bg-panel, #fff) !important;
    box-shadow: none !important;
    padding: 6px 0 !important;
    border-bottom: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    margin: 0 !important;
    position: sticky !important;
    top: 0 !important;
    z-index: 20 !important;
  }
  .swagger-ui .servers { margin: 0 !important; gap: 8px; display: flex; align-items: center; }
  .swagger-ui .servers > label {
    font-size: 10px !important;
    font-weight: 600 !important;
    letter-spacing: .08em !important;
    text-transform: uppercase !important;
    color: var(--ink-3, #a8a29e) !important;
    margin: 0 0 0 0 !important;
  }
  .swagger-ui .servers select {
    background: var(--bg-1, #f5f3f0) !important;
    border: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    border-radius: 6px !important;
    color: var(--ink-0, #1a1614) !important;
    font-size: 12px !important;
    padding: 3px 8px !important;
    height: 28px !important;
  }
  .swagger-ui .auth-wrapper { padding: 0 !important; }
  .swagger-ui .auth-btn-wrapper { margin: 0 !important; }
  .swagger-ui .btn.authorize {
    padding: 3px 12px !important;
    font-size: 11px !important;
    height: 28px !important;
    font-weight: 600 !important;
    letter-spacing: .04em !important;
    background: transparent !important;
    border: 1px solid var(--brand, #ec4899) !important;
    color: var(--brand, #ec4899) !important;
    border-radius: 6px !important;
    box-shadow: none !important;
    transition: background .15s, color .15s !important;
  }
  .swagger-ui .btn.authorize:hover {
    background: var(--brand, #ec4899) !important;
    color: #fff !important;
  }
  .swagger-ui .btn.authorize svg { fill: currentColor !important; }

  /* ── Filter bar ─────────────────────────────────────────────────────── */
  .swagger-ui .filter-container {
    background: var(--bg-1, #f5f3f0) !important;
    border-bottom: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    padding: 8px 0 !important;
  }
  .swagger-ui .operation-filter-input {
    background: var(--bg-panel, #fff) !important;
    border: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    border-radius: 6px !important;
    color: var(--ink-0, #1a1614) !important;
    font-size: 12px !important;
    padding: 4px 10px !important;
    width: 100% !important;
    box-shadow: none !important;
    font-family: inherit !important;
  }
  .swagger-ui .operation-filter-input:focus {
    outline: 2px solid rgba(236,72,153,.30) !important;
    outline-offset: 1px !important;
    border-color: var(--brand, #ec4899) !important;
  }
  .swagger-ui .operation-filter-input::placeholder {
    color: var(--ink-3, #a8a29e) !important;
  }

  /* ── Tag / section headers ──────────────────────────────────────────── */
  .swagger-ui .opblock-tag {
    background: var(--bg-1, #f5f3f0) !important;
    border: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    border-radius: 8px !important;
    margin-bottom: 4px !important;
    padding: 10px 16px !important;
    transition: background .15s !important;
  }
  .swagger-ui .opblock-tag:hover {
    background: var(--bg-2, #efebe6) !important;
  }
  .swagger-ui .opblock-tag h3 {
    font-size: 12px !important;
    font-weight: 700 !important;
    letter-spacing: .08em !important;
    text-transform: uppercase !important;
    color: var(--ink-0, #1a1614) !important;
  }
  .swagger-ui .opblock-tag span {
    font-size: 11px !important;
    color: var(--ink-2, #78716c) !important;
    font-weight: 400 !important;
    font-style: normal !important;
  }
  .swagger-ui .expand-methods svg,
  .swagger-ui .expand-operation svg,
  .swagger-ui .opblock-control-arrow {
    fill: var(--ink-3, #a8a29e) !important;
  }

  /* ── Operation blocks ───────────────────────────────────────────────── */
  .swagger-ui .opblock {
    border-radius: 7px !important;
    border-width: 1px !important;
    margin: 0 0 4px !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }
  .swagger-ui .opblock.opblock-post {
    background: rgba(16,185,129,.04) !important;
    border-color: rgba(16,185,129,.18) !important;
  }
  .swagger-ui .opblock.opblock-get {
    background: rgba(59,130,246,.04) !important;
    border-color: rgba(59,130,246,.18) !important;
  }
  .swagger-ui .opblock.opblock-delete {
    background: rgba(239,68,68,.04) !important;
    border-color: rgba(239,68,68,.18) !important;
  }
  .swagger-ui .opblock.opblock-put,
  .swagger-ui .opblock.opblock-patch {
    background: rgba(245,158,11,.04) !important;
    border-color: rgba(245,158,11,.18) !important;
  }
  .swagger-ui .opblock-summary {
    padding: 7px 12px !important;
    align-items: center !important;
    gap: 10px !important;
  }
  .swagger-ui .opblock-summary:hover {
    background: rgba(0,0,0,.02) !important;
  }
  .swagger-ui .opblock-summary-method {
    border-radius: 4px !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: .06em !important;
    min-width: 52px !important;
    text-align: center !important;
    padding: 3px 6px !important;
  }
  .swagger-ui .opblock.opblock-post .opblock-summary-method {
    background: #10b981 !important;
  }
  .swagger-ui .opblock.opblock-get .opblock-summary-method {
    background: #3b82f6 !important;
  }
  .swagger-ui .opblock.opblock-delete .opblock-summary-method {
    background: #ef4444 !important;
  }
  .swagger-ui .opblock.opblock-put .opblock-summary-method,
  .swagger-ui .opblock.opblock-patch .opblock-summary-method {
    background: #f59e0b !important;
    color: #1a1614 !important;
  }
  .swagger-ui .opblock-summary-path {
    font-family: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace !important;
    font-size: 12.5px !important;
    font-weight: 500 !important;
    color: var(--ink-0, #1a1614) !important;
  }
  .swagger-ui .opblock-summary-description {
    font-size: 11px !important;
    color: var(--ink-2, #78716c) !important;
  }
  .swagger-ui .opblock-body {
    background: var(--bg-panel, #fff) !important;
    border-top: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    padding: 12px 16px !important;
  }

  /* ── Buttons ────────────────────────────────────────────────────────── */
  .swagger-ui .btn {
    border-radius: 6px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    box-shadow: none !important;
    transition: background .15s, border-color .15s, color .15s !important;
  }
  .swagger-ui .btn.execute {
    background: var(--brand, #ec4899) !important;
    border-color: var(--brand, #ec4899) !important;
    color: #fff !important;
  }
  .swagger-ui .btn.execute:hover {
    background: var(--brand-hover, #db2777) !important;
    border-color: var(--brand-hover, #db2777) !important;
  }
  .swagger-ui .btn-clear {
    color: var(--ink-2, #78716c) !important;
    border-color: var(--hair-2, rgba(0,0,0,.10)) !important;
  }
  .swagger-ui .try-out__btn {
    border-color: var(--amber, #f59e0b) !important;
    color: var(--amber, #f59e0b) !important;
    background: transparent !important;
  }
  .swagger-ui .try-out__btn:hover,
  .swagger-ui .try-out__btn.cancel {
    background: var(--amber, #f59e0b) !important;
    color: #fff !important;
  }

  /* ── Inputs & textareas ─────────────────────────────────────────────── */
  .swagger-ui input[type=text],
  .swagger-ui textarea,
  .swagger-ui select {
    background: var(--bg-1, #f5f3f0) !important;
    border: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    border-radius: 5px !important;
    color: var(--ink-0, #1a1614) !important;
    font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace !important;
    font-size: 12px !important;
  }
  .swagger-ui input[type=text]:focus,
  .swagger-ui textarea:focus {
    outline: 2px solid rgba(236,72,153,.28) !important;
    border-color: var(--brand, #ec4899) !important;
  }

  /* ── Response / code blocks ─────────────────────────────────────────── */
  .swagger-ui .highlight-code,
  .swagger-ui .microlight {
    background: var(--bg-1, #f5f3f0) !important;
    border-radius: 5px !important;
    font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace !important;
    font-size: 12px !important;
    line-height: 1.6 !important;
    color: var(--ink-0, #1a1614) !important;
  }
  .swagger-ui .responses-table td {
    font-size: 12px !important;
    color: var(--ink-1, #44403c) !important;
  }
  .swagger-ui .response-col_status {
    font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace !important;
    font-weight: 700 !important;
    font-size: 12px !important;
  }

  /* ── Parameters table ───────────────────────────────────────────────── */
  .swagger-ui table.parameters th {
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: .08em !important;
    text-transform: uppercase !important;
    color: var(--ink-3, #a8a29e) !important;
    border-bottom: 1px solid var(--hair-2, rgba(0,0,0,.10)) !important;
    padding: 6px 8px !important;
  }
  .swagger-ui table.parameters td {
    font-size: 12px !important;
    padding: 7px 8px !important;
    border-bottom: 1px solid var(--hair, rgba(0,0,0,.06)) !important;
    vertical-align: top !important;
  }
  .swagger-ui .parameter__name {
    font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: var(--ink-0, #1a1614) !important;
  }
  .swagger-ui .parameter__in {
    font-size: 10px !important;
    text-transform: uppercase !important;
    letter-spacing: .06em !important;
    color: var(--ink-3, #a8a29e) !important;
    font-weight: 600 !important;
  }
  .swagger-ui .required { color: var(--brand, #ec4899) !important; }

  /* ── Models panel ───────────────────────────────────────────────────── */
  .swagger-ui section.models { display: none !important; }

  /* ── Scrollbar inside code panels ───────────────────────────────────── */
  .swagger-ui ::-webkit-scrollbar { width: 6px; height: 6px; }
  .swagger-ui ::-webkit-scrollbar-track { background: var(--bg-1, #f5f3f0); }
  .swagger-ui ::-webkit-scrollbar-thumb { background: var(--ink-4, #d6d3d1); border-radius: 3px; }

  /* ── Dark-mode overrides via data-theme="dark" on <html> ────────────── */
  html[data-theme="dark"] .swagger-ui,
  html[data-theme="dark"] .swagger-ui .wrapper { background: transparent !important; }
  html[data-theme="dark"] .swagger-ui .scheme-container {
    background: var(--bg-panel, #1a1816) !important;
    border-bottom-color: var(--hair-2, rgba(255,255,255,.10)) !important;
  }
  html[data-theme="dark"] .swagger-ui .servers select {
    background: var(--bg-2, #1d1b19) !important;
    border-color: var(--hair-2, rgba(255,255,255,.10)) !important;
    color: var(--ink-0, #f5f3f0) !important;
  }
  html[data-theme="dark"] .swagger-ui .opblock-tag {
    background: var(--bg-2, #1d1b19) !important;
    border-color: var(--hair-2, rgba(255,255,255,.10)) !important;
  }
  html[data-theme="dark"] .swagger-ui .opblock-tag:hover {
    background: var(--bg-3, #24211f) !important;
  }
  html[data-theme="dark"] .swagger-ui .opblock-tag h3 { color: var(--ink-0, #f5f3f0) !important; }
  html[data-theme="dark"] .swagger-ui .opblock.opblock-post {
    background: rgba(16,185,129,.07) !important;
    border-color: rgba(16,185,129,.22) !important;
  }
  html[data-theme="dark"] .swagger-ui .opblock.opblock-get {
    background: rgba(59,130,246,.07) !important;
    border-color: rgba(59,130,246,.22) !important;
  }
  html[data-theme="dark"] .swagger-ui .opblock.opblock-delete {
    background: rgba(239,68,68,.07) !important;
    border-color: rgba(239,68,68,.22) !important;
  }
  html[data-theme="dark"] .swagger-ui .opblock.opblock-put,
  html[data-theme="dark"] .swagger-ui .opblock.opblock-patch {
    background: rgba(245,158,11,.07) !important;
    border-color: rgba(245,158,11,.22) !important;
  }
  html[data-theme="dark"] .swagger-ui .opblock-summary-path { color: var(--ink-0, #f5f3f0) !important; }
  html[data-theme="dark"] .swagger-ui .opblock-summary:hover { background: rgba(255,255,255,.03) !important; }
  html[data-theme="dark"] .swagger-ui .opblock-body {
    background: var(--bg-panel, #1a1816) !important;
    border-top-color: var(--hair-2, rgba(255,255,255,.10)) !important;
  }
  html[data-theme="dark"] .swagger-ui .highlight-code,
  html[data-theme="dark"] .swagger-ui .microlight {
    background: var(--bg-2, #1d1b19) !important;
    color: var(--ink-0, #f5f3f0) !important;
  }
  html[data-theme="dark"] .swagger-ui input[type=text],
  html[data-theme="dark"] .swagger-ui textarea,
  html[data-theme="dark"] .swagger-ui select {
    background: var(--bg-2, #1d1b19) !important;
    border-color: var(--hair-2, rgba(255,255,255,.10)) !important;
    color: var(--ink-0, #f5f3f0) !important;
  }
  html[data-theme="dark"] .swagger-ui .responses-table td { color: var(--ink-1, #d6d3d1) !important; }
  html[data-theme="dark"] .swagger-ui table.parameters th {
    color: var(--ink-3, #78716c) !important;
    border-bottom-color: var(--hair-2, rgba(255,255,255,.10)) !important;
  }
  html[data-theme="dark"] .swagger-ui table.parameters td {
    border-bottom-color: var(--hair, rgba(255,255,255,.06)) !important;
  }
  html[data-theme="dark"] .swagger-ui .parameter__name { color: var(--ink-0, #f5f3f0) !important; }
  html[data-theme="dark"] .swagger-ui .filter-container {
    background: var(--bg-1, #161413) !important;
    border-bottom-color: var(--hair-2, rgba(255,255,255,.10)) !important;
  }
  html[data-theme="dark"] .swagger-ui .operation-filter-input {
    background: var(--bg-2, #1d1b19) !important;
    border-color: var(--hair-2, rgba(255,255,255,.10)) !important;
    color: var(--ink-0, #f5f3f0) !important;
  }
  html[data-theme="dark"] .swagger-ui ::-webkit-scrollbar-track { background: var(--bg-1, #161413); }
  html[data-theme="dark"] .swagger-ui ::-webkit-scrollbar-thumb { background: var(--ink-4, #44403c); }
`;

const ENDPOINT_GROUPS = [
  {
    tag: "Screening",
    color: "green",
    icon: "⬡",
    desc: "Real-time sanctions, PEP, and adverse-media screening against 12+ live lists",
    count: 3,
  },
  {
    tag: "Adverse Media",
    color: "amber",
    icon: "◈",
    desc: "Structured adverse-media search with sentiment scoring and source provenance",
    count: 1,
  },
  {
    tag: "Monitoring",
    color: "violet",
    icon: "◎",
    desc: "Ongoing name-screening triggers and watch-list delta subscriptions",
    count: 2,
  },
  {
    tag: "Learning",
    color: "blue",
    icon: "◇",
    desc: "Feedback loop — override dispositions to train the match-confidence model",
    count: 1,
  },
  {
    tag: "Records",
    color: "pink",
    icon: "▤",
    desc: "Case record retrieval and FDL Art.20-21 audit-trail access",
    count: 1,
  },
  {
    tag: "Compliance",
    color: "green",
    icon: "⊕",
    desc: "Deep-reasoning compliance review gate (P1–P10 charter enforcement)",
    count: 2,
  },
  {
    tag: "Auth",
    color: "amber",
    icon: "⬡",
    desc: "JWT issuance, key rotation, and role-based access control",
    count: 3,
  },
  {
    tag: "Analytics",
    color: "violet",
    icon: "◈",
    desc: "MLRO performance digest, budget utilisation, and KRI timeseries",
    count: 1,
  },
  {
    tag: "System",
    color: "blue",
    icon: "◇",
    desc: "Liveness, readiness, and OpenAPI schema introspection",
    count: 1,
  },
];

const COLOR_MAP: Record<string, { badge: string; bg: string; border: string }> = {
  green:  { badge: "bg-green/10 text-green border-green/20",   bg: "bg-green/5",  border: "border-green/15" },
  amber:  { badge: "bg-amber/10 text-amber border-amber/20",   bg: "bg-amber/5",  border: "border-amber/15" },
  violet: { badge: "bg-violet/10 text-violet border-violet/20",bg: "bg-violet/5", border: "border-violet/15" },
  blue:   { badge: "bg-blue/10 text-blue border-blue/20",      bg: "bg-blue/5",   border: "border-blue/15" },
  pink:   { badge: "bg-brand-dim text-brand border-brand-line",bg: "bg-brand-dim",border: "border-brand-line" },
};
const COLOR_DEFAULT: { badge: string; bg: string; border: string } = COLOR_MAP["blue"] ?? { badge: "bg-blue/10 text-blue border-blue/20", bg: "bg-blue/5", border: "border-blue/15" };

export default function ApiDocsPage() {

  return (
    <ModuleLayout asanaModule="api-docs" asanaLabel="API Documentation" engineLabel="API reference">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 flex-wrap mb-6">
        <div>
          <div className="font-mono text-10 font-semibold text-amber tracking-wide-4 uppercase mb-1">
            MODULE 47
          </div>
          <div className="font-mono text-[11px] tracking-widest uppercase text-ink-3 mb-2">
            REST · JSON · OpenAPI 3.1
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-0 leading-snug mb-1">
            Hawkeye Sterling API
          </h1>
          <p className="text-[13px] text-ink-2 max-w-lg leading-relaxed">
            Regulator-grade AML/CFT screening engine for UAE-licensed precious-metals
            businesses. Direct-source sanctions ingestion, full reasoning-chain
            transparency, and a content-frozen compliance charter (P1–P10).
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-10 font-semibold font-mono bg-green/10 text-green border border-green/20">
              v2.0 · stable
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-10 font-semibold font-mono bg-blue/10 text-blue border border-blue/20">
              OAS 3.1
            </span>
          </div>
          <a
            href="/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="text-10 font-mono text-ink-3 hover:text-brand transition-colors underline-offset-2 hover:underline"
          >
            openapi.json ↗
          </a>
        </div>
      </div>

      {/* ── Endpoint group cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
        {ENDPOINT_GROUPS.map((g) => {
          const c = COLOR_MAP[g.color] ?? COLOR_DEFAULT;
          return (
            <div
              key={g.tag}
              className={`rounded-lg border px-3 py-2.5 ${c.bg} ${c.border} transition-colors`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-10 font-semibold font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${c.badge}`}>
                  {g.tag}
                </span>
                <span className="text-10 font-mono text-ink-3">{g.count}</span>
              </div>
              <p className="text-10 text-ink-2 leading-snug">{g.desc}</p>
            </div>
          );
        })}
      </div>

      {/* ── Quick reference bar ───────────────────────────────────────── */}
      <div className="mb-6 pb-6 border-b border-hair flex flex-wrap items-center gap-x-6 gap-y-1 text-10 font-mono text-ink-3">
        <span>
          Base URL:{" "}
          <code className="text-ink-1 bg-bg-2 px-1 rounded">
            https://hawkeye-sterling.netlify.app
          </code>
        </span>
        <span>Auth: Bearer JWT</span>
        <span>Rate limit: 120 req / min</span>
        <span>Timeout: 60 s</span>
      </div>

      {/* ── Swagger UI mount ──────────────────────────────────────────── */}
      <style>{CUSTOM_STYLES}</style>
      <div id="swagger-root">
        <SwaggerUI
          url="/openapi.json"
          docExpansion="list"
          defaultModelsExpandDepth={-1}
          persistAuthorization={true}
          filter={true}
          tryItOutEnabled={false}
          displayRequestDuration={true}
        />
      </div>
    </ModuleLayout>
  );
}
