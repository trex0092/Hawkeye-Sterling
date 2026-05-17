"use client";

// Hawkeye Sterling — i18n LocaleProvider.
//
// Wraps the app in a context that exposes the active locale + its strings.
// Persists to localStorage so the choice survives page reloads. Sets
// `dir="rtl"` on <html> when Arabic is active.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, loadStoredLocale, persistLocale, type Locale, type LocaleStrings } from "./locales";

interface LocaleCtx {
  locale: Locale;
  strings: LocaleStrings;
  dir: "ltr" | "rtl";
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<LocaleCtx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(loadStoredLocale());
  }, []);

  // Reflect dir on <html> when locale changes.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = LOCALES[locale as Locale].dir;
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo<LocaleCtx>(
    () => ({
      locale,
      strings: LOCALES[locale as Locale].strings,
      dir: LOCALES[locale as Locale].dir,
      setLocale: (l: Locale) => {
        setLocaleState(l);
        persistLocale(l);
      },
    }),
    [locale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback when used outside the provider — return English.
    return {
      locale: "en",
      strings: LOCALES.en.strings,
      dir: "ltr",
      setLocale: () => { /* noop */ },
    };
  }
  return ctx;
}
