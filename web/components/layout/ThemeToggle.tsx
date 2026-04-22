"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "hawkeye.theme";

type Theme = "light" | "dark";

function readStored(): Theme | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Respect saved preference first; fall back to OS prefers-color-scheme.
    const stored = readStored();
    const next: Theme =
      stored ??
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    setTheme(next);
    apply(next);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  // Keep the hydrated label stable between SSR and client by rendering a
  // neutral button until `mounted`.
  const label = mounted
    ? theme === "dark"
      ? "☀ day"
      : "☾ night"
    : "☾ night";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle night mode"
      className="inline-flex items-center gap-1 font-mono text-10.5 text-ink-2 hover:text-ink-0 px-1.5 py-0.5 rounded hover:bg-bg-2 transition-colors cursor-pointer"
    >
      <span>{label}</span>
    </button>
  );
}
