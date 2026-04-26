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
] as const;

// Secondary modules — rendered under a "More" dropdown so the top-row
// stays readable. Grouped by domain for quick navigation.
const MORE_GROUPS: Array<{ title: string; items: Array<{ label: string; href: string; hint: string }> }> = [
  {
    title: "Intelligence",
    items: [
      { label: "Workbench", href: "/workbench", hint: "MLRO advisor & deep reasoning" },
      { label: "Analytics", href: "/analytics", hint: "MLRO performance digest" },
      { label: "Investigation", href: "/investigation", hint: "Link-analysis canvas" },
      { label: "AM Lookback", href: "/adverse-media-lookback", hint: "10-year FDL Art.19 log" },
      { label: "Brain", href: "/weaponized-brain", hint: "Reasoning manifest & cognition" },
      { label: "API Docs", href: "/api-docs", hint: "OpenAPI reference" },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Audit", href: "/audit-trail", hint: "Immutable audit chain" },
      { label: "Regulatory", href: "/regulatory", hint: "Searchable library" },
      { label: "Policies", href: "/policies", hint: "Charter / SOPs" },
      { label: "Playbook", href: "/playbook", hint: "Typology guides" },
      { label: "SAR QA", href: "/sar-qa", hint: "Four-eyes review" },
      { label: "Enforcement", href: "/enforcement", hint: "Regulatory deadlines" },
      { label: "EWRA / BWRA", href: "/ewra", hint: "Risk assessment dashboard" },
      { label: "Shipments", href: "/shipments", hint: "Bullion chain-of-custody" },
      { label: "Oversight", href: "/oversight", hint: "Management sign-off & minutes" },
      { label: "RMI / RMAP", href: "/rmi", hint: "Responsible Minerals Initiative" },
      { label: "EOCN", href: "/eocn", hint: "UAE TFS list & declarations" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Client portal", href: "/client-portal", hint: "External KYC" },
      { label: "UBO declaration", href: "/ubo-declaration", hint: "Public UBO form" },
      { label: "Supplier DD", href: "/vendor-dd", hint: "Supplier onboarding" },
      { label: "Employees", href: "/employees", hint: "HR registry & doc expiry" },
      { label: "Training", href: "/training", hint: "Staff certification" },
      { label: "Data quality", href: "/data-quality", hint: "Data-subject completeness" },
      { label: "CDD Review", href: "/cdd-review", hint: "Periodic re-KYC tracker" },
      { label: "Corrections", href: "/corrections", hint: "Data-subject corrections" },
      { label: "Status", href: "/status", hint: "Live endpoint health" },
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
                  className="fixed z-50 w-[560px] bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-4 grid grid-cols-3 gap-4"
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

  const initial = name ? name.charAt(0).toUpperCase() : "·";

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setDraftName(name);
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-hair-2 hover:border-hair text-ink-1 hover:text-ink-0 transition-colors"
        title="User profile"
      >
        <span className="w-[18px] h-[18px] border border-ink-2 flex items-center justify-center font-display text-[10px] font-semibold text-ink-1 leading-none shrink-0">
          {initial}
        </span>
        <span className="hidden lg:flex flex-col leading-none gap-[1px] text-left">
          <span className="text-[11px] font-semibold text-ink-0 truncate max-w-[90px]">
            {name || "Set name"}
          </span>
          <span className="text-[8.5px] font-mono uppercase tracking-[0.1em] text-ink-3">
            {ROLE_LABEL[role]} · 09:00–18:00
          </span>
        </span>
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
