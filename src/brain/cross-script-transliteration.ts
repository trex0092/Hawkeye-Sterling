// Hawkeye Sterling — cross-script transliteration (audit follow-up #15).
//
// Maps names across the four scripts most relevant to UAE / GCC / Russia
// / China sanctions exposure: Latin, Arabic, Cyrillic, CJK (Chinese).
// Used by the matching engine to catch evasion patterns where a
// sanctioned subject's name appears in one script in source data and a
// different script on a watchlist.
//
// Coverage:
//   - Arabic ↔ Latin via BGN/PCGN-ish phonetic rules
//   - Cyrillic ↔ Latin via ALA-LC romanisation
//   - CJK → Latin via Hanyu Pinyin (Mandarin) initials/finals
//   - Phonetic-agreement scoring across scripts
//
// Pure function; no IO. Tables are intentionally compact — production
// should swap for ICU's transliterator or a curated rule set.

const ARABIC_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h',
  'أ': 'a', 'إ': 'i', 'آ': 'a', 'ؤ': 'w', 'ئ': 'y', 'ء': '',
  // Arabic-Indic digits
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Ukrainian
  'ї': 'i', 'є': 'ye', 'і': 'i', 'ґ': 'g',
};

// Mandarin Pinyin — a representative subset of high-frequency surnames /
// given names commonly seen in sanctions / PEP contexts. Production
// must use a real Pinyin library (e.g. pinyin-pro).
const CJK_PINYIN: Record<string, string> = {
  '王': 'wang', '李': 'li', '张': 'zhang', '刘': 'liu', '陈': 'chen',
  '杨': 'yang', '黄': 'huang', '赵': 'zhao', '周': 'zhou', '吴': 'wu',
  '徐': 'xu', '孙': 'sun', '马': 'ma', '朱': 'zhu', '胡': 'hu',
  '郭': 'guo', '何': 'he', '高': 'gao', '林': 'lin', '罗': 'luo',
  '郑': 'zheng', '梁': 'liang', '谢': 'xie', '宋': 'song', '唐': 'tang',
  '许': 'xu', '韩': 'han', '冯': 'feng', '邓': 'deng', '曹': 'cao',
  '彭': 'peng', '曾': 'zeng', '萧': 'xiao', '田': 'tian', '董': 'dong',
  '袁': 'yuan', '潘': 'pan', '于': 'yu', '蒋': 'jiang', '蔡': 'cai',
  '余': 'yu', '杜': 'du', '叶': 'ye', '程': 'cheng', '苏': 'su',
  '魏': 'wei', '吕': 'lu', '丁': 'ding', '任': 'ren', '沈': 'shen',
};

export type Script = 'latin' | 'arabic' | 'cyrillic' | 'cjk' | 'mixed' | 'unknown';

/** Detect the dominant script of an input string. */
export function detectScript(input: string): Script {
  if (!input) return 'unknown';
  let arabic = 0, cyrillic = 0, cjk = 0, latin = 0;
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0600 && cp <= 0x06ff) arabic++;
    else if (cp >= 0x0400 && cp <= 0x04ff) cyrillic++;
    else if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
    else if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) latin++;
  }
  const max = Math.max(arabic, cyrillic, cjk, latin);
  if (max === 0) return 'unknown';
  const total = arabic + cyrillic + cjk + latin;
  if (max / total < 0.6) return 'mixed';
  if (max === arabic) return 'arabic';
  if (max === cyrillic) return 'cyrillic';
  if (max === cjk) return 'cjk';
  return 'latin';
}

/** Transliterate a string from its detected script to Latin. */
export function toLatin(input: string): string {
  if (!input) return '';
  const script = detectScript(input);
  if (script === 'latin') return input.toLowerCase();
  let out = '';
  for (const ch of input) {
    const lower = ch.toLowerCase();
    if (script === 'arabic') {
      out += ARABIC_TO_LATIN[lower] ?? (isPunctOrSpace(lower) ? lower : '');
    } else if (script === 'cyrillic') {
      out += CYRILLIC_TO_LATIN[lower] ?? (isPunctOrSpace(lower) ? lower : '');
    } else if (script === 'cjk') {
      out += (CJK_PINYIN[lower] ? CJK_PINYIN[lower] + ' ' : (isPunctOrSpace(lower) ? lower : ''));
    } else {
      out += lower;
    }
  }
  return out.trim().replace(/\s+/g, ' ');
}

function isPunctOrSpace(ch: string): boolean {
  return /\s|[.,'\-_/\\():;]/.test(ch);
}

/** Compute phonetic-agreement score across two cross-script names in [0,1]. */
export function crossScriptAgreement(a: string, b: string): { score: number; aLatin: string; bLatin: string; sameScript: boolean } {
  const aScript = detectScript(a);
  const bScript = detectScript(b);
  const aLatin = toLatin(a).replace(/\s+/g, '');
  const bLatin = toLatin(b).replace(/\s+/g, '');
  const sameScript = aScript === bScript;
  if (aLatin.length === 0 || bLatin.length === 0) return { score: 0, aLatin, bLatin, sameScript };
  // Damerau-Levenshtein-lite + length normalisation.
  const distance = lev(aLatin, bLatin);
  const norm = 1 - distance / Math.max(aLatin.length, bLatin.length);
  return { score: Math.max(0, Math.min(1, norm)), aLatin, bLatin, sameScript };
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n] ?? Math.max(m, n);
}
