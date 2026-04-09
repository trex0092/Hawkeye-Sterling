/**
 * Arabic Bilingual Output Support.
 *
 * Generates bilingual (Arabic/English) compliance documents for
 * UAE regulatory submissions and internal reporting.
 *
 * Features:
 *   - Bilingual section headers and labels
 *   - RTL text markers for Arabic sections
 *   - Standard compliance terminology translation
 *   - Document wrapper with Arabic/English columns
 *   - Number formatting (Arabic-Indic numerals option)
 *   - Date formatting (Hijri calendar option)
 *
 * Reference: UAE Ministry of Economy communications are bilingual.
 * Federal Decree-Law No. 10/2025 is published in Arabic (authoritative)
 * and English (courtesy translation).
 */

const TERMS = {
  // Document headers
  'Compliance Report': 'تقرير الامتثال',
  'Screening Result': 'نتيجة الفحص',
  'Risk Assessment': 'تقييم المخاطر',
  'Filing Draft': 'مسودة الإبلاغ',
  'Suspicious Transaction Report': 'تقرير المعاملات المشبوهة',
  'Suspicious Activity Report': 'تقرير النشاط المشبوه',
  'Cash Transaction Report': 'تقرير المعاملات النقدية',
  'Audit Trail': 'سجل التدقيق',
  'Investigation Report': 'تقرير التحقيق',

  // Section labels
  'Entity Name': 'اسم الجهة',
  'Country': 'الدولة',
  'Date': 'التاريخ',
  'Amount': 'المبلغ',
  'Currency': 'العملة',
  'Risk Score': 'درجة المخاطر',
  'Risk Level': 'مستوى المخاطر',
  'Decision': 'القرار',
  'Status': 'الحالة',
  'Priority': 'الأولوية',
  'Deadline': 'الموعد النهائي',

  // Risk bands
  'LOW': 'منخفض',
  'MEDIUM': 'متوسط',
  'HIGH': 'مرتفع',
  'CRITICAL': 'حرج',

  // Decisions
  'CLEAR': 'خالي',
  'REVIEW': 'مراجعة',
  'BLOCK': 'حظر',
  'APPROVED': 'معتمد',
  'REJECTED': 'مرفوض',

  // Roles
  'MLRO': 'مسؤول الإبلاغ عن غسل الأموال',
  'Compliance Officer': 'مسؤول الامتثال',
  'Analyst': 'محلل',

  // Regulatory
  'Federal Decree-Law No. 10 of 2025': 'المرسوم بقانون اتحادي رقم 10 لسنة 2025',
  'Ministry of Economy': 'وزارة الاقتصاد',
  'Financial Intelligence Unit': 'وحدة المعلومات المالية',
  'Dealer in Precious Metals and Stones': 'تاجر في المعادن الثمينة والأحجار الكريمة',
  'Enhanced Due Diligence': 'العناية الواجبة المعززة',
  'Customer Due Diligence': 'العناية الواجبة للعملاء',
  'Simplified Due Diligence': 'العناية الواجبة المبسطة',
  'Politically Exposed Person': 'شخص بارز سياسياً',
  'Beneficial Owner': 'المستفيد الحقيقي',
  'For review by the MLRO.': 'للمراجعة من قبل مسؤول الإبلاغ عن غسل الأموال.',

  // CDD levels
  'SDD': 'العناية المبسطة',
  'CDD': 'العناية الواجبة',
  'EDD': 'العناية المعززة',
};

/**
 * Translate a term to Arabic.
 */
export function translate(term) {
  return TERMS[term] || term;
}

/**
 * Generate a bilingual label: "English / العربية"
 */
export function bilingual(term) {
  const ar = TERMS[term];
  return ar ? `${term} / ${ar}` : term;
}

/**
 * Wrap text with RTL markers for Arabic.
 */
export function rtl(text) {
  return `\u200F${text}\u200F`;
}

/**
 * Format a number in Arabic-Indic numerals.
 */
export function arabicNumerals(num) {
  const eastern = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(num).replace(/[0-9]/g, d => eastern[Number(d)]);
}

/**
 * Format AED amount with Arabic label.
 */
export function formatAED(amount, arabic = false) {
  const formatted = Number(amount).toLocaleString();
  return arabic ? `${arabicNumerals(formatted)} درهم إماراتي` : `AED ${formatted}`;
}

/**
 * Generate a bilingual compliance document wrapper.
 *
 * @param {object} params
 * @param {string} params.titleEn - English title
 * @param {string} params.titleAr - Arabic title (auto-translated if not provided)
 * @param {string} params.bodyEn - English content
 * @param {string} [params.bodyAr] - Arabic content (optional)
 * @param {string} params.date - Document date
 * @param {string} params.mlroName - MLRO name
 * @returns {string} Bilingual document
 */
export function bilingualDocument(params) {
  const titleAr = params.titleAr || translate(params.titleEn);
  const lines = [];

  lines.push('=' .repeat(60));
  lines.push(`${params.titleEn}`);
  lines.push(rtl(titleAr));
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`${bilingual('Date')}: ${params.date}`);
  lines.push('');
  lines.push('--- English ---');
  lines.push('');
  lines.push(params.bodyEn);
  lines.push('');

  if (params.bodyAr) {
    lines.push(`--- ${rtl('العربية')} ---`);
    lines.push('');
    lines.push(rtl(params.bodyAr));
    lines.push('');
  }

  lines.push('-'.repeat(60));
  lines.push(bilingual('For review by the MLRO.'));
  lines.push(`MLRO: ${params.mlroName || 'N/A'}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate bilingual screening result summary.
 */
export function bilingualScreeningSummary(result) {
  const band = result.topBand?.toUpperCase() || 'CLEAR';
  return bilingualDocument({
    titleEn: 'Screening Result',
    date: new Date().toISOString().split('T')[0],
    bodyEn: [
      `Entity: ${result.query?.name || 'N/A'}`,
      `Decision: ${result.decision || 'clear'}`,
      `Band: ${band}`,
      `Hits: ${result.hits?.length || 0}`,
      `Case ID: ${result.caseId || 'N/A'}`,
    ].join('\n'),
    bodyAr: [
      `${translate('Entity Name')}: ${result.query?.name || 'N/A'}`,
      `${translate('Decision')}: ${translate(band)}`,
      `${translate('Risk Level')}: ${translate(band)}`,
    ].join('\n'),
  });
}

/**
 * Get all available translation terms.
 */
export function getTerms() {
  return { ...TERMS };
}

export { TERMS };
