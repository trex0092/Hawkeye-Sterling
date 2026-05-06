// Hawkeye Sterling — i18n locale registry.
//
// Three locales bundled at build:
//   - en (English, default)
//   - ar (Arabic — RTL)
//   - zh (Chinese, simplified)
//
// Adding a fourth locale is just adding a new entry to LOCALES below.

export type Locale = "en" | "ar" | "zh";

export interface LocaleStrings {
  // Top-bar nav
  screening: string;
  liveIntel: string;
  cases: string;
  transactionMonitor: string;
  strCases: string;
  ongoingMonitor: string;
  mlroAdvisor: string;
  more: string;

  // Common buttons / labels
  refresh: string;
  refreshing: string;
  resolve: string;
  cancel: string;
  save: string;
  search: string;
  loading: string;
  retry: string;

  // Hit resolution
  resolveThisHit: string;
  reasonCategory: string;
  reasonDetermination: string;
  positive: string;
  possible: string;
  falsePositive: string;
  unspecified: string;
  high: string;
  medium: string;
  low: string;
  unknown: string;
  riskLevel: string;
  noMatch: string;
  partialMatch: string;
  fullMatch: string;
  monitoringActive: string;

  // Status counters
  unresolved: string;
  all: string;

  // Footer
  contactUs: string;
  privacy: string;
}

const en: LocaleStrings = {
  screening: "Screening",
  liveIntel: "Live Intel",
  cases: "Cases",
  transactionMonitor: "Transaction Monitor",
  strCases: "STR Cases",
  ongoingMonitor: "Ongoing Monitor",
  mlroAdvisor: "MLRO Advisor",
  more: "More",
  refresh: "Refresh",
  refreshing: "Refreshing…",
  resolve: "Resolve",
  cancel: "Cancel",
  save: "Save",
  search: "Search",
  loading: "Loading…",
  retry: "Retry",
  resolveThisHit: "Resolve This Hit",
  reasonCategory: "Reason category",
  reasonDetermination: "Reason / basis for determination",
  positive: "Positive",
  possible: "Possible",
  falsePositive: "False",
  unspecified: "Unspecified",
  high: "High",
  medium: "Medium",
  low: "Low",
  unknown: "Unknown",
  riskLevel: "Risk Level",
  noMatch: "No match",
  partialMatch: "Partial match",
  fullMatch: "Full match",
  monitoringActive: "Monitoring active",
  unresolved: "Unresolved",
  all: "All",
  contactUs: "Contact Us",
  privacy: "Privacy",
};

const ar: LocaleStrings = {
  screening: "الفحص",
  liveIntel: "الاستخبارات الحية",
  cases: "الحالات",
  transactionMonitor: "مراقبة المعاملات",
  strCases: "تقارير المعاملات المشبوهة",
  ongoingMonitor: "المراقبة المستمرة",
  mlroAdvisor: "مستشار مسؤول الإبلاغ",
  more: "المزيد",
  refresh: "تحديث",
  refreshing: "جارٍ التحديث…",
  resolve: "حل",
  cancel: "إلغاء",
  save: "حفظ",
  search: "بحث",
  loading: "جارٍ التحميل…",
  retry: "إعادة المحاولة",
  resolveThisHit: "حل هذه النتيجة",
  reasonCategory: "تصنيف السبب",
  reasonDetermination: "السبب / أساس التحديد",
  positive: "إيجابي",
  possible: "محتمل",
  falsePositive: "خطأ",
  unspecified: "غير محدد",
  high: "عالي",
  medium: "متوسط",
  low: "منخفض",
  unknown: "غير معروف",
  riskLevel: "مستوى المخاطر",
  noMatch: "لا توجد مطابقة",
  partialMatch: "مطابقة جزئية",
  fullMatch: "مطابقة كاملة",
  monitoringActive: "المراقبة نشطة",
  unresolved: "غير محلولة",
  all: "الكل",
  contactUs: "اتصل بنا",
  privacy: "الخصوصية",
};

const zh: LocaleStrings = {
  screening: "筛查",
  liveIntel: "实时情报",
  cases: "案件",
  transactionMonitor: "交易监控",
  strCases: "可疑交易报告",
  ongoingMonitor: "持续监控",
  mlroAdvisor: "MLRO 顾问",
  more: "更多",
  refresh: "刷新",
  refreshing: "刷新中…",
  resolve: "解决",
  cancel: "取消",
  save: "保存",
  search: "搜索",
  loading: "加载中…",
  retry: "重试",
  resolveThisHit: "解决此命中",
  reasonCategory: "原因类别",
  reasonDetermination: "判定理由",
  positive: "确认",
  possible: "可能",
  falsePositive: "误报",
  unspecified: "未指定",
  high: "高",
  medium: "中",
  low: "低",
  unknown: "未知",
  riskLevel: "风险等级",
  noMatch: "无匹配",
  partialMatch: "部分匹配",
  fullMatch: "完全匹配",
  monitoringActive: "监控中",
  unresolved: "未解决",
  all: "全部",
  contactUs: "联系我们",
  privacy: "隐私",
};

export const LOCALES: Record<Locale, { name: string; nativeName: string; dir: "ltr" | "rtl"; strings: LocaleStrings }> = {
  en: { name: "English", nativeName: "English", dir: "ltr", strings: en },
  ar: { name: "Arabic", nativeName: "العربية", dir: "rtl", strings: ar },
  zh: { name: "Chinese", nativeName: "中文", dir: "ltr", strings: zh },
};

export function detectLocaleFromBrowser(): Locale {
  if (typeof navigator === "undefined") return "en";
  const langs = navigator.languages ?? [navigator.language ?? "en"];
  for (const lang of langs) {
    const code = lang.toLowerCase().slice(0, 2);
    if (code === "ar") return "ar";
    if (code === "zh") return "zh";
  }
  return "en";
}

export function loadStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const v = window.localStorage.getItem("hawkeye.locale");
    if (v === "en" || v === "ar" || v === "zh") return v;
  } catch { /* ignore */ }
  return detectLocaleFromBrowser();
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem("hawkeye.locale", locale); } catch { /* ignore */ }
}
