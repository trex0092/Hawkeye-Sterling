"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RegulatoryTicker } from "./RegulatoryTicker";

const THEME_KEY = "hawkeye.theme";

function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function Header({ onMenuOpen }: { onMenuOpen?: () => void } = {}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

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
    <header className="print-hide sticky top-0 z-40 bg-bg-panel border-b border-hair-2 shadow-header">
      <nav className="flex items-center gap-2 h-[54px] px-4 md:px-6 overflow-x-auto">
        {/* Hamburger — mobile only */}
        {onMenuOpen && (
          <button
            type="button"
            onClick={onMenuOpen}
            aria-label="Open navigation menu"
            className="md:hidden flex items-center justify-center w-[44px] h-[44px] rounded border border-hair-2 text-ink-1 hover:text-ink-0 hover:bg-bg-2 transition-colors shrink-0 mr-1"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
              <path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
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

        <div className="ml-auto flex items-center gap-2 md:gap-4 font-mono text-10.5 text-ink-2 shrink-0">
          <a
            href="/profile"
            title="My profile & password"
            className="border border-hair-2 rounded px-3 py-1.5 min-h-[36px] inline-flex items-center text-10.5 text-ink-1 hover:text-ink-0 transition-colors no-underline"
          >
            👤 Profile
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            className="border border-hair-2 rounded px-2.5 py-1 min-h-[36px] text-10.5 text-ink-1 hover:text-ink-0 transition-colors"
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
