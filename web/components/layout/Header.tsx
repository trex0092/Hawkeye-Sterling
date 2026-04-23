"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LOCALES, STRINGS, t, type Locale } from "@/lib/server/i18n";

const NAV_TABS = [
  { key: "nav.workbench", href: "/workbench" },
  { key: "nav.screening", href: "/screening" },
  { key: "nav.batch", href: "/batch" },
  { key: "nav.cases", href: "/cases" },
  { key: "nav.tm", href: "/transaction-monitor" },
  { key: "nav.str", href: "/str-cases" },
  { key: "nav.audit", href: "/audit-trail" },
  { key: "nav.analytics", href: "/analytics" },
  { key: "nav.status", href: "/status" },
] as const;

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
    <header className="sticky top-0 z-40 bg-white border-b border-hair-2 shadow-header">
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
            const label = STRINGS[tab.key] ? t(tab.key, locale) : tab.key;
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
            className="border border-hair-2 rounded px-2 py-0.5 text-10.5 text-ink-1 hover:text-ink-0"
            title="Toggle theme"
          >
            {theme === "light"
              ? t("common.theme.dark", locale)
              : t("common.theme.light", locale)}
          </button>
          <span className="hidden md:flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            <span className="font-medium">live</span>
          </span>
        </div>
      </nav>
    </header>
  );
}
