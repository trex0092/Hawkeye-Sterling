/**
 * Arabic translation support for compliance output.
 *
 * Provides bilingual (English/Arabic) wrapDocument() wrapper and
 * Arabic header generation for regulatory submissions that require
 * Arabic language output per UAE administrative requirements.
 *
 * Arabic text is written right-to-left. The plain-text format preserves
 * directionality through Unicode RTL markers where needed.
 *
 * Usage:
 *   import { wrapBilingualDocument, ARABIC_HEADERS } from "./lib/arabic-support.mjs";
 */

export const ARABIC_HEADERS = Object.freeze({
  documentReference: "مرجع الوثيقة",
  classification: "التصنيف",
  confidential: "سري. للمراجعة من قبل مسؤول الإبلاغ عن غسل الأموال فقط",
  version: "الإصدار",
  preparedBy: "إعداد",
  complianceFunction: "وظيفة الامتثال",
  addressee: "المرسل إليه",
  mlro: "مسؤول الإبلاغ عن غسل الأموال",
  retentionPeriod: "فترة الاحتفاظ",
  tenYears: "10 سنوات، وفقاً للحكم المعمول به من المرسوم بقانون اتحادي رقم 10 لسنة 2025",
  regulatoryAlignment: "التوافق التنظيمي",
  fatf: "مجموعة العمل المالي (فاتف)",
  primaryLaw: "المرسوم بقانون اتحادي رقم 10 لسنة 2025 بشأن مواجهة غسل الأموال ومكافحة تمويل الإرهاب",
  moe: "وزارة الاقتصاد",
  fiu: "وحدة المعلومات المالية",
  eocn: "المكتب التنفيذي للرقابة ومكافحة غسل الأموال",
  goAML: "منصة goAML",
  reportTypes: {
    STR: "تقرير معاملة مشبوهة",
    SAR: "تقرير نشاط مشبوه",
    DPMSR: "تقرير تجار المعادن الثمينة والأحجار الكريمة",
    PNMR: "تقرير تطابق جزئي للأسماء",
    FFR: "تقرير تجميد أموال",
  },
  sections: {
    purpose: "الغرض",
    scope: "النطاق",
    headline: "العنوان الرئيسي",
    filingsSummary: "ملخص الإيداعات",
    recommendations: "التوصيات",
    signOff: "التوقيع",
    nextActions: "الإجراءات التالية",
  },
  forReviewByMlro: "للمراجعة من قبل مسؤول الإبلاغ عن غسل الأموال",
});

/**
 * Wraps an English compliance document with a bilingual header that
 * includes Arabic metadata fields. The body remains in English (the
 * working language of the compliance function) but the header satisfies
 * the Arabic administrative requirement.
 */
export function wrapBilingualDocument({ reference, title, titleAr, body }) {
  const lines = [];
  lines.push("=============================================================================");
  lines.push(`[Reporting Entity]`);
  lines.push(title);
  if (titleAr) lines.push(titleAr);
  lines.push("=============================================================================");
  lines.push("");
  lines.push(`${ARABIC_HEADERS.documentReference} / Document reference:   ${reference}`);
  lines.push(`${ARABIC_HEADERS.classification} / Classification:       ${ARABIC_HEADERS.confidential}`);
  lines.push(`${ARABIC_HEADERS.version} / Version:              1.0`);
  lines.push(`${ARABIC_HEADERS.preparedBy} / Prepared by:          ${ARABIC_HEADERS.complianceFunction}`);
  lines.push(`${ARABIC_HEADERS.addressee} / Addressee:            ${ARABIC_HEADERS.mlro}`);
  lines.push(`${ARABIC_HEADERS.retentionPeriod} / Retention period:     ${ARABIC_HEADERS.tenYears}`);
  lines.push(`${ARABIC_HEADERS.regulatoryAlignment} / Regulatory alignment: ${ARABIC_HEADERS.fatf}`);
  lines.push("");
  lines.push(body);
  lines.push("");
  lines.push(`${ARABIC_HEADERS.forReviewByMlro}`);
  lines.push("For review by the MLRO.");
  lines.push("");
  lines.push("=============================================================================");
  return lines.join("\n");
}
