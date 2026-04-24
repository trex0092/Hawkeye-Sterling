"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LOCALES, STRINGS, t, type Locale } from "@/lib/server/i18n";

const NAV_TABS = [
  { key: "nav.workbench", label: "Workbench", href: "/workbench" },
  { key: "nav.screening", label: "Screening", href: "/screening" },
  { key: "nav.batch", label: "Batch", href: "/batch" },
  { key: "nav.cases", label: "Cases", href: "/cases" },
  { key: "nav.tm", label: "Transaction monitor", href: "/transaction-monitor" },
  { key: "nav.str", label: "STR / SAR", href: "/str-cases" },
  { key: "nav.monitor", label: "Monitoring", href: "/ongoing-monitor" },
  { key: "nav.analytics", label: "Analytics", href: "/analytics" },
  { key: "nav.status", label: "Status", href: "/status" },
] as const;

// Secondary modules — rendered under a "More" dropdown so the top-row
// stays readable. Grouped by domain for quick navigation.
const MORE_GROUPS: Array<{ title: string; items: Array<{ label: string; href: string; hint: string }> }> = [
  {
    title: "Intelligence",
    items: [
      { label: "Intel", href: "/intel", hint: "Adverse-media ticker" },
      { label: "Investigation", href: "/investigation", hint: "Link-analysis canvas" },
      { label: "AM Lookback", href: "/adverse-media-lookback", hint: "10-year FDL Art.19 log" },
      { label: "Brain", href: "/weaponized-brain", hint: "Reasoning manifest & cognition" },
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
      { label: "API Docs", href: "/api-docs", hint: "OpenAPI reference" },
      { label: "Pricing", href: "/pricing", hint: "Plans & API key signup" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Client portal", href: "/client-portal", hint: "External KYC" },
      { label: "UBO declaration", href: "/ubo-declaration", hint: "Public UBO form" },
      { label: "Supplier DD", href: "/vendor-dd", hint: "Supplier onboarding" },
      { label: "Training", href: "/training", hint: "Staff certification" },
      { label: "Data quality", href: "/data-quality", hint: "Per-case completeness" },
      { label: "CDD Review", href: "/cdd-review", hint: "Periodic re-KYC tracker" },
      { label: "Corrections", href: "/corrections", hint: "Data-subject corrections" },
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
          className="inline-flex items-center gap-2 text-ink-0 no-underline text-13 font-semibold shrink-0"
        >
          <span className="w-[18px] h-[18px] bg-ink-0 rounded-sm flex items-center justify-center text-white font-mono text-[10px] font-bold">
            H
          </span>
          <span className="hidden sm:inline">Hawkeye Sterling</span>
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
