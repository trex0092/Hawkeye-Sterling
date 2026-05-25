"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RegulatoryTicker } from "./RegulatoryTicker";
import { useLocale } from "@/lib/i18n/LocaleProvider";


// Secondary modules — rendered under a "More" dropdown so the top-row
// stays readable.
// Groups: Onboarding & CDD · Risk & AML Ops · Governance & Audit · Enrichment · Intelligence
const MORE_GROUPS: Array<{ title: string; items: Array<{ label: string; href: string; hint: string }> }> = [
  {
    // Client lifecycle: intake → KYC → ongoing CDD → data quality
    title: "Onboarding & CDD",
    items: [
      { label: "🔄 pKYC Monitor", href: "/pkyc", hint: "Perpetual KYC — continuous CDD lifecycle management" },
      { label: "🪄 Onboarding Wizard", href: "/operations/onboard", hint: "Guided new-customer flow" },
      { label: "🪪 Client Portal", href: "/client-portal", hint: "Entity KYC + AI risk assessment" },
      { label: "👥 UBO Declaration", href: "/ubo-declaration", hint: "Beneficial ownership form + AI risk" },
      { label: "👤 PEP Profiles", href: "/pep-profile", hint: "PEP tier · SOW · network map · EDD measures" },
      { label: "🌱 ESG Risk", href: "/esg-risk", hint: "ESG scoring · ML risk overlay · regulatory exposure" },
      { label: "🤝 Supplier DD", href: "/vendor-dd", hint: "Third-party due diligence + AI risk" },
      { label: "📋 CDD Review", href: "/cdd-review", hint: "Periodic re-KYC + AI adequacy check" },
      { label: "✅ Data Quality", href: "/data-quality", hint: "CDD completeness + AI remediation plan" },
      { label: "🏢 Ownership Explorer", href: "/ownership", hint: "UBO mapping · shell risk · jurisdiction layering" },
      { label: "🧑‍💼 Employees", href: "/employees", hint: "HR registry · doc expiry · AI risk scan" },
      { label: "🎓 Training", href: "/training", hint: "Staff AML certification tracker" },
    ],
  },
  {
    // AML/CFT operational modules: risk assessment, STR workflow, supply chain, oversight
    title: "Risk & AML Ops",
    items: [
      { label: "📊 EWRA / BWRA", href: "/ewra", hint: "Enterprise-wide risk assessment + AI board report" },
      { label: "📋 STR/SAR Filing Suite", href: "/sar-qa", hint: "Four-eyes quality review + goAML XML export wizard" },
      { label: "🔗 Supply Chain & Responsible Sourcing", href: "/supply-chain", hint: "Geographic risk · CSDDD · UFLPA · RMI/RMAP · OECD 5-step DDG · MD 68/2024" },
      { label: "📋 Reg Changes", href: "/reg-change", hint: "Regulatory change roadmap · AI implementation calendar" },
      { label: "📦 Shipments", href: "/shipments", hint: "Bullion chain-of-custody + AI TBML scan" },
      { label: "🇦🇪 EOCN", href: "/eocn", hint: "UAE targeted financial sanctions + NAS/ARS registration + control list" },
      { label: "🚨 Sanctions Alerts & Name Match", href: "/tfs-alerts", hint: "EOCN subscription alerts · CNMR filing · Gmail monitor · Asana compliance tasks" },
      { label: "💵 DPMSR", href: "/dpmsr", hint: "DPMS cash reporting ≥ AED 55,000 · CR134/2025 Art.3" },
      { label: "📋 MoE Survey", href: "/moe-survey", hint: "Mandatory AML/CFT survey MOET/AML/001/2026 · all DNFBPs" },
      { label: "👮 Enforcement", href: "/enforcement", hint: "Regulatory deadlines & action tracker" },
      { label: "⚖️ Oversight", href: "/oversight", hint: "Board & management sign-off · minutes" },
    ],
  },
  {
    // Regulatory record-keeping, audit trail, reference library
    title: "Governance & Audit",
    items: [
      { label: "📋 System Card", href: "/system-card", hint: "AI system disclosure · capabilities · safeguards · regulatory basis" },
      { label: "🤖 Responsible AI", href: "/responsible-ai", hint: "UNESCO AI ethics compliance · human oversight" },
      { label: "🔒 Audit Trail & Operator Console", href: "/audit-trail", hint: "Immutable HMAC audit chain + AI anomaly scan · MCP activity log · kill switch" },
      { label: "🏛️ Inspection Room", href: "/governance/inspection-room", hint: "Regulator-ready evidence pack" },
      { label: "📜 Regulatory Library", href: "/regulatory", hint: "Searchable UAE/FATF regulatory library" },
      { label: "📑 Policies & SOPs", href: "/policies", hint: "AML programme charter & procedures" },
      { label: "📚 Typology Library & Playbook", href: "/typology-library", hint: "500+ ML typologies · AI search · step-by-step compliance playbooks" },
      { label: "🚫 Sanctions Evasion", href: "/sanctions-evasion", hint: "AI evasion pattern detector · FATF typologies" },
      { label: "🧪 Intelligence Tools", href: "/governance/intelligence-tools", hint: "OFAC 50% walker · Crypto exposure · Synthetic-identity cluster" },
      { label: "🛰️ Live Intelligence Feed", href: "/intel", hint: "Intelligence & regulatory feed · live triage · 7-language adverse media · GDELT real-time news" },
      { label: "✏️ Corrections", href: "/corrections", hint: "Data-subject access & correction requests" },
      { label: "🔐 Access Control", href: "/access-control", hint: "User management · permission matrix · session monitor · audit log" },
      { label: "🛡️ Security Scan", href: "/security-scan", hint: "Platform security posture · authentication · UEBA · audit integrity · score 0–100" },
    ],
  },
  {
    // Subject & entity enrichment: external data lookups, forensic tools, OSINT
    title: "Enrichment",
    items: [
      { label: "🌐 OSINT", href: "/osint", hint: "Subject enrichment · SpiderFoot · AI threat synthesis" },
      { label: "🆔 GLEIF / LEI", href: "/gleif", hint: "Global LEI · beneficial ownership chain" },
      { label: "🕸️ Entity Graph", href: "/entity-graph", hint: "UBO · officers · OpenCorporates" },
      { label: "🌍 Domain Intel", href: "/domain-intel", hint: "WHOIS · malware · email security analysis" },
      { label: "₿ Crypto Risk", href: "/crypto-risk", hint: "Wallet AML taint + AI blockchain threat" },
      { label: "🚢 Vessel Check", href: "/vessel-check", hint: "IMO · flag · sanctions · ownership" },
      { label: "🔢 Benford Analysis", href: "/benford", hint: "Forensic digit distribution + AI interpretation" },
    ],
  },
  {
    // Employee-facing approval tracker
    title: "Approvals",
    items: [
      { label: "✅ Approvals", href: "/approvals", hint: "Entity approval tracker — status, risk score, country destinations" },
    ],
  },
  {
    // Leadership: board-level posture, KRI tracking, incident response
    title: "Leadership & Risk Posture",
    items: [
      { label: "📊 KRI Dashboard", href: "/kri-dashboard", hint: "14 key risk indicators · live green/amber/red bands · board-pack export" },
      { label: "🏛️ Board Dashboard", href: "/board-dashboard", hint: "Executive posture view — case backlog · KRI summary · AI health · compliance calendar" },
      { label: "🕵️ Analyst UEBA", href: "/analyst-behavior", hint: "User & Entity Behavior Analytics — insider-threat signals · export spikes · off-hours access · override rates" },
    ],
  },
  {
    // Analytics, AI brain internals, investigation tools, system health
    title: "Intelligence",
    items: [
      { label: "📈 Analytics & KPI Dashboard", href: "/analytics", hint: "MLRO KPI digest + AI board insights · ML model evaluation · KPI metrics" },
      { label: "🕵️ Investigation", href: "/investigation", hint: "Link-analysis canvas · network mapping" },
      { label: "🌍 Country & Geopolitical Risk", href: "/country-risk", hint: "Basel AML · FATF · sanctions · political risk · live risk events · portfolio impact" },
      { label: "🎯 FP Optimizer", href: "/fp-optimizer", hint: "ML false positive pattern analysis · threshold tuning" },
      { label: "🔧 AI Reasoning Workbench", href: "/workbench", hint: "Multi-mode AI reasoning · counterfactual · steelman · brain manifest" },
      { label: "📡 Mode Telemetry", href: "/intel/telemetry", hint: "Brain firing counts · mode drift" },
      { label: "🥷 Red-Team Tests", href: "/intel/red-team", hint: "GenAI adversarial test catalogue" },
      { label: "💚 Status", href: "/status", hint: "Live endpoint & watchlist health" },
      { label: "📘 API Docs", href: "/api-docs", hint: "OpenAPI reference" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const THEME_KEY = "hawkeye.theme";

function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function Header() {
  const pathname = usePathname();
  const { strings } = useLocale();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number } | null>(null);

  // Top-nav labels resolved per active locale. Emoji prefixes are
  // language-neutral so they stay across all locales.
  const NAV_TABS_I18N = [
    { label: `🔎 ${strings.screening}`, href: "/screening" },
    { label: `🗂️ ${strings.cases}`, href: "/cases" },
    { label: `💸 ${strings.transactionMonitor}`, href: "/transaction-monitor" },
    { label: `📁 ${strings.strCases}`, href: "/str-cases" },
    { label: `👁️ ${strings.ongoingMonitor}`, href: "/ongoing-monitor" },
    { label: `🧠 ${strings.mlroAdvisor}`, href: "/mlro-advisor" },
    { label: "🛡️ Grievances", href: "/governance/grievances-whistleblowing" },
  ];

  useEffect(() => {
    const storedTheme =
      (typeof localStorage !== "undefined" &&
        (localStorage.getItem(THEME_KEY) as "light" | "dark" | null)) ||
      "light";
    setTheme(storedTheme);
    applyTheme(storedTheme);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    try { if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, next); } catch { /* private mode or quota */ }
  };

  return (
    <header className="sticky top-0 z-40 bg-bg-panel border-b border-hair-2 shadow-header">
      <nav className="flex items-center gap-2 h-[54px] px-4 md:px-6 overflow-x-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-ink-0 no-underline shrink-0"
        >
          <span className="w-[22px] h-[22px] border border-ink-0 flex items-center justify-center font-display text-[14px] font-semibold text-ink-0 leading-none">
            H
          </span>
          <span className="hidden sm:flex flex-col leading-none gap-[2px]">
            <span className="text-[13px] font-semibold tracking-tight text-ink-0">Hawkeye Sterling</span>
          </span>
        </Link>

        <div className="flex gap-0.5 ml-2 md:ml-8">
          {NAV_TABS_I18N.map((tab) => {
            const active = isActive(pathname ?? "", tab.href);
            return (
              <a
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 text-12.5 rounded no-underline font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-bg-2 text-ink-0"
                    : "text-ink-2 hover:bg-bg-2 hover:text-ink-0"
                }`}
              >
                {tab.label}
              </a>
            );
          })}
          <div className="relative" ref={moreButtonRef}>
            <button
              type="button"
              onClick={() => {
                if (!moreOpen && moreButtonRef.current) {
                  const rect = moreButtonRef.current.getBoundingClientRect();
                  // On mobile (<768px), anchor to left edge of viewport so
                  // the dropdown never overflows off-screen.
                  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
                  setDropdownPos({
                    left: isMobile ? 8 : rect.left,
                    top: rect.bottom + 4,
                  });
                }
                setMoreOpen((v) => !v);
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-12.5 rounded font-medium transition-colors whitespace-nowrap ${
                MORE_GROUPS.some((g) => g.items.some((it) => isActive(pathname ?? "", it.href)))
                  ? "bg-bg-2 text-ink-0"
                  : "text-ink-2 hover:bg-bg-2 hover:text-ink-0"
              }`}
            >
              {strings.more}
              <span className="text-10 text-ink-3">▾</span>
            </button>
            {moreOpen && dropdownPos && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMoreOpen(false)}
                  aria-hidden="true"
                />
                <div
                  className="fixed z-50 w-[calc(100vw-16px)] md:w-[900px] max-h-[calc(100vh-80px)] overflow-y-auto bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-3 md:p-4 grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4"
                  style={{ left: dropdownPos.left, top: dropdownPos.top }}
                >
                  {MORE_GROUPS.map((g) => (
                    <div key={g.title}>
                      <div className="text-10 uppercase tracking-wide-3 text-brand font-semibold mb-1.5 px-2">
                        {g.title}
                      </div>
                      <ul className="list-none p-0 m-0">
                        {g.items.map((it) => (
                          <li key={it.href}>
                            <a
                              href={it.href}
                              onClick={() => setMoreOpen(false)}
                              className={`block px-2 py-1.5 rounded no-underline transition-colors ${
                                isActive(pathname ?? "", it.href)
                                  ? "bg-brand-dim text-brand-deep"
                                  : "text-ink-0 hover:bg-bg-1"
                              }`}
                            >
                              <div className="text-12 font-medium">{it.label}</div>
                              <div className="text-10 text-ink-3">{it.hint}</div>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-4 font-mono text-10.5 text-ink-2 shrink-0">
          <a
            href="/profile"
            title="My profile & password"
            className="border border-hair-2 rounded px-2 py-0.5 text-10.5 text-ink-1 hover:text-ink-0 transition-colors no-underline"
          >
            👤 Profile
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            className="border border-hair-2 rounded px-2 py-0.5 text-10.5 text-ink-1 hover:text-ink-0 transition-colors"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? "☾ Dark" : "☀ Light"}
          </button>
          <LiveBadge />
        </div>
      </nav>
      <RegulatoryTicker />
    </header>
  );
}


function LiveBadge() {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-GB", {
          timeZone: "Asia/Dubai",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-dim text-green font-mono text-10.5 font-semibold border border-green/20">
      <span
        className="w-1.5 h-1.5 rounded-full bg-green shrink-0"
        style={{ animation: "live-pulse 2s ease-in-out infinite" }}
      />
      live
      <span className="text-green/70 font-normal tracking-tight">{time}</span>
    </span>
  );
}
