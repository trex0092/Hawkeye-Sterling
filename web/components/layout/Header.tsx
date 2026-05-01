"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RegulatoryTicker } from "./RegulatoryTicker";
import { LOCALES, STRINGS, t, type Locale } from "@/lib/server/i18n";
import {
  loadOperatorRole,
  saveOperatorRole,
  ROLE_LABEL,
  CARD_ROLES,
  type OperatorRole,
} from "@/lib/data/operator-role";

const NAV_TABS = [
  { key: "nav.screening", label: "Screening", href: "/screening" },
  { key: "nav.batch", label: "Batch", href: "/batch" },
  { key: "nav.intel", label: "Intel", href: "/intel" },
  { key: "nav.cases", label: "Cases", href: "/cases" },
  { key: "nav.tm", label: "Transaction monitor", href: "/transaction-monitor" },
  { key: "nav.str", label: "STR / SAR", href: "/str-cases" },
  { key: "nav.monitor", label: "Monitoring", href: "/ongoing-monitor" },
  { key: "nav.mlro", label: "MLRO Advisor", href: "/mlro-advisor" },
] as const;

// Secondary modules — rendered under a "More" dropdown so the top-row
// stays readable. Column order: Operations · Governance · Enrichment ·
// Intelligence (operator-first → analyst-last).
const MORE_GROUPS: Array<{ title: string; items: Array<{ label: string; href: string; hint: string }> }> = [
  {
    title: "Operations",
    items: [
      { label: "Client portal", href: "/client-portal", hint: "External KYC" },
      { label: "UBO declaration", href: "/ubo-declaration", hint: "Public UBO form" },
      { label: "Supplier DD", href: "/vendor-dd", hint: "Supplier onboarding" },
      { label: "Employees", href: "/employees", hint: "HR registry & doc expiry" },
      { label: "Training", href: "/training", hint: "Staff certification" },
      { label: "CDD Review", href: "/cdd-review", hint: "Periodic re-KYC tracker" },
      { label: "Corrections", href: "/corrections", hint: "Data-subject corrections" },
      { label: "Shipments", href: "/shipments", hint: "Bullion chain-of-custody" },
      { label: "Onboarding Wizard", href: "/operations/onboard", hint: "Guided new-customer flow" },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Audit", href: "/audit-trail", hint: "Immutable audit chain" },
      { label: "AM Lookback", href: "/adverse-media-lookback", hint: "10-year FDL Art.19 log" },
      { label: "Regulatory", href: "/regulatory", hint: "Searchable library" },
      { label: "Policies", href: "/policies", hint: "Charter / SOPs" },
      { label: "Playbook", href: "/playbook", hint: "Typology guides" },
      { label: "SAR QA", href: "/sar-qa", hint: "Four-eyes review" },
      { label: "Enforcement", href: "/enforcement", hint: "Regulatory deadlines" },
      { label: "EWRA / BWRA", href: "/ewra", hint: "Risk assessment dashboard" },
      { label: "Oversight", href: "/oversight", hint: "Management sign-off & minutes" },
      { label: "RMI / RMAP", href: "/rmi", hint: "Responsible Minerals Initiative" },
      { label: "EOCN", href: "/eocn", hint: "UAE TFS list & declarations" },
      // goAML export is now reachable from a row action on /str-cases
      // (the case register), so we drop it from the global nav. The
      // standalone /goaml-export page still exists for any saved
      // bookmarks but is no longer surfaced.
      { label: "Inspection Room", href: "/governance/inspection-room", hint: "Regulator-ready evidence pack" },
    ],
  },
  {
    title: "Enrichment",
    items: [
      { label: "GLEIF / LEI", href: "/gleif", hint: "Beneficial ownership chain" },
      { label: "Domain Intel", href: "/domain-intel", hint: "WHOIS · malware · email security" },
      { label: "Crypto Risk", href: "/crypto-risk", hint: "Wallet AML taint analysis" },
      { label: "Vessel Check", href: "/vessel-check", hint: "IMO sanctions & ownership" },
      { label: "Benford Analysis", href: "/benford", hint: "Forensic accounting digit test" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Workbench Brain", href: "/workbench", hint: "Screening · live reasoning · manifest" },
      { label: "Analytics", href: "/analytics", hint: "MLRO performance digest" },
      { label: "Investigation", href: "/investigation", hint: "Link-analysis canvas" },
      { label: "API Docs", href: "/api-docs", hint: "OpenAPI reference" },
      { label: "OSINT", href: "/osint", hint: "Subject enrichment & SpiderFoot" },
      { label: "Data quality", href: "/data-quality", hint: "Data-subject completeness" },
      { label: "Status", href: "/status", hint: "Live endpoint health" },
      { label: "Mode Telemetry", href: "/intel/telemetry", hint: "Brain · firing counts · drift" },
      { label: "Geographic Heatmap", href: "/intel/heatmap", hint: "Country exposure · FATF lists" },
      { label: "Red-Team Tests", href: "/intel/red-team", hint: "GenAI adversarial test catalogue" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const THEME_KEY = "hawkeye.theme";
const LOCALE_KEY = "hawkeye.locale";

function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

function applyDir(locale: Locale): void {
  if (typeof document === "undefined") return;
  const entry = LOCALES.find((l) => l.code === locale);
  document.documentElement.setAttribute("dir", entry?.dir ?? "ltr");
  document.documentElement.setAttribute("lang", locale);
}

export function Header() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [locale, setLocale] = useState<Locale>("en");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const storedTheme =
      (typeof localStorage !== "undefined" &&
        (localStorage.getItem(THEME_KEY) as "light" | "dark" | null)) ||
      "light";
    const storedLocale =
      (typeof localStorage !== "undefined" &&
        (localStorage.getItem(LOCALE_KEY) as Locale | null)) ||
      "en";
    setTheme(storedTheme);
    setLocale(storedLocale);
    applyTheme(storedTheme);
    applyDir(storedLocale);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, next);
  };

  const pickLocale = (code: Locale) => {
    setLocale(code);
    applyDir(code);
    if (typeof localStorage !== "undefined") localStorage.setItem(LOCALE_KEY, code);
  };

  return (
    <header className="sticky top-0 z-40 bg-bg-panel border-b border-hair-2 shadow-header">
      <nav className="flex items-center gap-2 h-[54px] px-4 md:px-6 overflow-x-auto">
        <a
          href="/"
          className="inline-flex items-center gap-2.5 text-ink-0 no-underline shrink-0"
        >
          <span className="w-[22px] h-[22px] border border-ink-0 flex items-center justify-center font-display text-[14px] font-semibold text-ink-0 leading-none">
            H
          </span>
          <span className="hidden sm:flex flex-col leading-none gap-[2px]">
            <span className="text-[13px] font-semibold tracking-tight text-ink-0">Hawkeye Sterling</span>
            <span className="text-[8.5px] font-mono uppercase tracking-[0.14em] text-ink-3">Precision Screening · UAE</span>
          </span>
        </a>

        <div className="flex gap-0.5 ml-2 md:ml-8">
          {NAV_TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            const label = STRINGS[tab.key] ? t(tab.key, locale) : tab.label;
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
                {label}
              </a>
            );
          })}
          <div className="relative" ref={moreButtonRef}>
            <button
              type="button"
              onClick={() => {
                if (!moreOpen && moreButtonRef.current) {
                  const rect = moreButtonRef.current.getBoundingClientRect();
                  setDropdownPos({ left: rect.left, top: rect.bottom + 4 });
                }
                setMoreOpen((v) => !v);
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-12.5 rounded font-medium transition-colors whitespace-nowrap ${
                MORE_GROUPS.some((g) => g.items.some((it) => isActive(pathname, it.href)))
                  ? "bg-bg-2 text-ink-0"
                  : "text-ink-2 hover:bg-bg-2 hover:text-ink-0"
              }`}
            >
              More
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
                  className="fixed z-50 w-[740px] bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-4 grid grid-cols-4 gap-4"
                  style={{ left: dropdownPos.left, top: dropdownPos.top }}
                >
                  {MORE_GROUPS.map((g) => (
                    <div key={g.title}>
                      <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-1.5 px-2">
                        {g.title}
                      </div>
                      <ul className="list-none p-0 m-0">
                        {g.items.map((it) => (
                          <li key={it.href}>
                            <a
                              href={it.href}
                              onClick={() => setMoreOpen(false)}
                              className={`block px-2 py-1.5 rounded no-underline transition-colors ${
                                isActive(pathname, it.href)
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
          <NotificationBell />
          <HeaderUserCard />
          <select
            value={locale}
            onChange={(e) => pickLocale(e.target.value as Locale)}
            className="bg-transparent border border-hair-2 rounded px-1.5 py-0.5 text-10.5 text-ink-1"
            title="Language"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
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

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const alerts = [
    { id: 1, text: "SLA breach — APV-2025-0081 awaiting second sign-off", time: "2m ago", read: false },
    { id: 2, text: "EWRA annual review due — FDL 10/2025 Art.4", time: "1h ago", read: false },
    { id: 3, text: "New FATF grey-list update — 3 jurisdictions affected", time: "3h ago", read: true },
    { id: 4, text: "goAML submission window closes in 12 days", time: "5h ago", read: true },
  ];
  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-1 rounded hover:bg-bg-2 transition-colors"
        aria-label="Notifications"
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff2d92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#ff2d92] flex items-center justify-center text-[8px] font-bold text-white leading-none">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-bg-panel border border-hair-2 rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-hair-2 flex items-center justify-between">
              <span className="text-11 font-semibold text-ink-0">Notifications</span>
              {unread > 0 && (
                <span className="text-10 font-mono text-[#ff2d92] font-semibold">{unread} unread</span>
              )}
            </div>
            <div className="divide-y divide-hair">
              {alerts.map((a) => (
                <div key={a.id} className={`px-3 py-2.5 ${a.read ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2">
                    {!a.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff2d92] shrink-0 mt-1.5" />
                    )}
                    {a.read && <span className="w-1.5 shrink-0" />}
                    <div>
                      <div className="text-11 text-ink-0 leading-snug">{a.text}</div>
                      <div className="text-10 text-ink-3 font-mono mt-0.5">{a.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-hair-2 bg-bg-1">
              <button type="button" onClick={() => setOpen(false)} className="text-10 text-ink-3 hover:text-brand underline">
                Mark all read
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HeaderUserCard() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<OperatorRole>("mlro");
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const n = localStorage.getItem("hawkeye.operator");
      if (n) setName(n);
    } catch { /* localStorage disabled */ }
    setRole(loadOperatorRole());
    const sync = () => {
      setRole(loadOperatorRole());
      try {
        const n = localStorage.getItem("hawkeye.operator");
        setName(n ?? "");
      } catch { /* ignore */ }
    };
    window.addEventListener("hawkeye:operator-role-updated", sync);
    window.addEventListener("hawkeye:operator-updated", sync);
    return () => {
      window.removeEventListener("hawkeye:operator-role-updated", sync);
      window.removeEventListener("hawkeye:operator-updated", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const saveName = () => {
    const n = draftName.trim();
    setName(n);
    try {
      n
        ? localStorage.setItem("hawkeye.operator", n)
        : localStorage.removeItem("hawkeye.operator");
      window.dispatchEvent(new CustomEvent("hawkeye:operator-updated"));
    } catch { /* localStorage disabled */ }
    setOpen(false);
  };

  const selectRole = (r: OperatorRole) => {
    saveOperatorRole(r);
    setRole(r);
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setDraftName(name);
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-hair-2 hover:border-hair text-ink-1 hover:text-ink-0 transition-colors"
        title="Edit profile"
      >
        <span className="hidden lg:flex flex-col leading-none gap-[1px] text-left">
          <span className="text-[11px] font-semibold text-ink-0">
            {ROLE_LABEL[role]}
          </span>
          <span className="text-[8.5px] font-mono uppercase tracking-[0.1em] text-ink-3">
            ✎ Edit profile
          </span>
        </span>
        <span className="lg:hidden text-10 font-mono">✎</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-3">
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
            Name
          </div>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Full name"
            className="w-full bg-bg-1 border border-hair-2 rounded px-2 py-1 text-12 text-ink-0 outline-none focus:border-brand mb-3"
          />
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
            Role
          </div>
          <div className="flex flex-col gap-1 mb-3">
            {CARD_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => selectRole(r)}
                className={`text-left px-2 py-1 rounded text-12 font-medium transition-colors ${
                  r === role
                    ? "bg-brand text-white"
                    : "hover:bg-bg-2 text-ink-1"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={saveName}
            className="w-full text-11 font-semibold bg-brand text-white px-2 py-1 rounded hover:bg-brand/90"
          >
            Save
          </button>
        </div>
      )}
    </div>
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
