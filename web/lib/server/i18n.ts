// Hawkeye Sterling — minimal UI i18n.
//
// Shipped as a dependency-free dictionary so it builds in a Netlify
// Function without pulling in i18next. Every user-visible string below
// has translations for the six locales the platform commits to.

export type Locale = "en" | "es" | "fr" | "de" | "ar" | "zh";

export const LOCALES: Array<{ code: Locale; label: string; dir: "ltr" | "rtl" }> = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "zh", label: "中文", dir: "ltr" },
];

type Catalog = Record<string, Record<Locale, string>>;

export const STRINGS: Catalog = {
  "nav.workbench": {
    en: "Workbench",
    es: "Mesa de trabajo",
    fr: "Poste de travail",
    de: "Arbeitsplatz",
    ar: "منضدة العمل",
    zh: "工作台",
  },
  "nav.screening": {
    en: "Screening",
    es: "Selección",
    fr: "Filtrage",
    de: "Screening",
    ar: "الفرز",
    zh: "筛查",
  },
  "nav.batch": {
    en: "Batch",
    es: "Lote",
    fr: "Lot",
    de: "Stapel",
    ar: "دفعة",
    zh: "批量",
  },
  "nav.cases": {
    en: "Cases",
    es: "Casos",
    fr: "Dossiers",
    de: "Fälle",
    ar: "الحالات",
    zh: "案件",
  },
  "nav.tm": {
    en: "Transaction monitor",
    es: "Monitor de transacciones",
    fr: "Surveillance des transactions",
    de: "Transaktionsüberwachung",
    ar: "مراقبة المعاملات",
    zh: "交易监控",
  },
  "nav.str": {
    en: "STR / SAR",
    es: "STR / SAR",
    fr: "STR / SAR",
    de: "STR / SAR",
    ar: "STR / SAR",
    zh: "STR / SAR",
  },
  "nav.audit": {
    en: "Audit",
    es: "Auditoría",
    fr: "Audit",
    de: "Audit",
    ar: "التدقيق",
    zh: "审计",
  },
  "nav.status": {
    en: "Status",
    es: "Estado",
    fr: "État",
    de: "Status",
    ar: "الحالة",
    zh: "状态",
  },
  "nav.analytics": {
    en: "Analytics",
    es: "Analítica",
    fr: "Analyses",
    de: "Analytik",
    ar: "التحليلات",
    zh: "分析",
  },
  "common.theme.dark": {
    en: "Dark",
    es: "Oscuro",
    fr: "Sombre",
    de: "Dunkel",
    ar: "داكن",
    zh: "深色",
  },
  "common.theme.light": {
    en: "Light",
    es: "Claro",
    fr: "Clair",
    de: "Hell",
    ar: "فاتح",
    zh: "浅色",
  },
};

export function t(key: string, locale: Locale): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[locale] ?? entry.en ?? key;
}

export function detectLocale(header: string | null): Locale {
  if (!header) return "en";
  const prefs = header
    .split(",")
    .map((p) => p.trim().toLowerCase().split(";")[0] ?? "");
  for (const p of prefs) {
    const base = p.split("-")[0];
    if (!base) continue;
    if ((LOCALES.map((l) => l.code) as string[]).includes(base)) {
      return base as Locale;
    }
  }
  return "en";
}
