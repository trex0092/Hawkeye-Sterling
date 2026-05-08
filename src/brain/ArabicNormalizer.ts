// Hawkeye Sterling — Arabic text normalizer.
// Resolves the orthographic variations that appear in sanctioned-entity
// databases: diacritics, tatweel, hamza forms, taa-marbutah, Arabic
// punctuation, ال/ال variants, ibn/bin/bint, abd forms, and Unicode
// compatibility decompositions.
//
// Produces canonical clusters — two spellings in the same cluster are
// treated as definitionally equivalent for screening purposes.
//
// Mappings also provided for Russian (Cyrillic), Chinese (Pinyin subset),
// Urdu (Nastaliq script), and Farsi (Persian) for cross-script equivalence.

// ── Arabic normalization ──────────────────────────────────────────────────────

// Arabic diacritics (harakat) — strip entirely.
const ARABIC_DIACRITICS = /[ً-ٰٟ]/gu;

// Tatweel (kashida) — decorative elongation, strip.
const TATWEEL = /ـ/gu;

// Arabic punctuation — replace with space.
const ARABIC_PUNCTUATION = /[،؛؟۔]/gu;

// Hamza and alef variants → canonical alef ا (0627)
const ALEF_VARIANTS: Record<number, string> = {
  0x0622: 'ا', // آ → ا
  0x0623: 'ا', // أ → ا
  0x0625: 'ا', // إ → ا
  0x0671: 'ا', // ٱ → ا (wasla)
  0x0672: 'ا', // ٲ → ا
  0x0673: 'ا', // ٳ → ا
};

// Taa-marbutah (ة) → haa (ه)  — common in proper nouns (Fatima/Fatimah)
const TAA_MARBUTAH = /ة/gu;

// Waw with hamza variants
const WAW_VARIANTS: Record<number, string> = {
  0x0624: 'و', // ؤ → و
};

// Yaa variants
const YAA_VARIANTS: Record<number, string> = {
  0x0626: 'ي', // ئ → ي
  0x0649: 'ي', // ى → ي (alef maqsura)
  0x06CC: 'ي', // ی → ي (Farsi yeh)
};

// Kaf variants (Persian kaf → Arabic kaf)
const KAF_VARIANTS: Record<number, string> = {
  0x06A9: 'ك', // ک → ك
};

// Arabic definite article: ال and its variants
const DEFINITE_ARTICLE = /^ال\s*|[\s]ال\s*/gu;

// Patronymic particles and prefixes (case-insensitive, Arabic script)
const PATRONYMIC_AR: Record<string, string> = {
  'بن': 'بن',    // bin — canonical
  'ابن': 'بن',   // ibn → bin
  'بنت': 'بنت',  // bint
  'ابنة': 'بنت', // ibnat → bint
  'ام': 'ام',    // umm
  'ابو': 'ابو',  // abu
};

// ── Latin/Romanisation equivalence clusters ───────────────────────────────────

// Abd cluster: عبد — all romanisations collapse to "abd"
const LATIN_ABD_CLUSTER: Record<string, string> = {
  'abdal': 'abd al', 'abdel': 'abd al', 'abdoul': 'abd',
  'abdull': 'abd allah', 'abdulla': 'abd allah', 'abdallah': 'abd allah',
  'abduallah': 'abd allah',
};

// Al/El prefix cluster
const LATIN_ARTICLE_CLUSTER = /\b(al|el|ul)-\s*/gi;

// Bin/Ibn/Ben cluster
const LATIN_BIN_CLUSTER = /\b(ibn|ben|bin|bint)\b/gi;

// Muhammad cluster
const LATIN_MUHAMMAD_CLUSTER = /\b(mohammed?|mohamad?|muhamm?ad|muhamm?ed|mohamd|mahomed|mehmed|muhd|mohd)\b/gi;

// Ahmad cluster
const LATIN_AHMAD_CLUSTER = /\b(ahmed?|ahmet)\b/gi;

// Umar cluster
const LATIN_UMAR_CLUSTER = /\b(omer|omar)\b/gi;

// Yusuf cluster
const LATIN_YUSUF_CLUSTER = /\b(yousef|youssef|yosef|yousuf|josef)\b/gi;

// Khalid cluster
const LATIN_KHALID_CLUSTER = /\b(khaled|khaleed|khald)\b/gi;

// Husain cluster
const LATIN_HUSAIN_CLUSTER = /\b(husain|hussain|hussayn|husayn|hosain)\b/gi;

// ── Cyrillic → Latin mappings ─────────────────────────────────────────────────

export const CYRILLIC_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Uppercase
  'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
  'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'j', 'К': 'k', 'Л': 'l', 'М': 'm',
  'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
  'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
  'Ъ': '', 'Ы': 'y', 'Ь': '', 'Э': 'e', 'Ю': 'yu', 'Я': 'ya',
};

// ── Chinese Pinyin subset ─────────────────────────────────────────────────────
// Covers the most common surnames/given names in sanctions lists.
export const CHINESE_PINYIN_COMMON: Record<string, string> = {
  '王': 'wang', '李': 'li', '张': 'zhang', '刘': 'liu', '陈': 'chen',
  '杨': 'yang', '黄': 'huang', '吴': 'wu', '赵': 'zhao', '周': 'zhou',
  '徐': 'xu', '孙': 'sun', '马': 'ma', '胡': 'hu', '朱': 'zhu',
  '林': 'lin', '郭': 'guo', '何': 'he', '高': 'gao', '罗': 'luo',
  '郑': 'zheng', '梁': 'liang', '谢': 'xie', '宋': 'song', '唐': 'tang',
  '许': 'xu', '韩': 'han', '冯': 'feng', '邓': 'deng', '曹': 'cao',
  '彭': 'peng', '曾': 'zeng', '肖': 'xiao', '田': 'tian', '董': 'dong',
  '袁': 'yuan', '潘': 'pan', '于': 'yu', '蒋': 'jiang', '蔡': 'cai',
  '余': 'yu', '杜': 'du', '叶': 'ye', '程': 'cheng', '苏': 'su',
  '魏': 'wei', '吕': 'lv', '丁': 'ding', '任': 'ren', '卢': 'lu',
  '姚': 'yao', '沈': 'shen', '钟': 'zhong', '姜': 'jiang', '崔': 'cui',
  '谭': 'tan', '陆': 'lu', '范': 'fan', '汪': 'wang', '廖': 'liao',
  '石': 'shi', '金': 'jin', '韦': 'wei', '贾': 'jia', '夏': 'xia',
  '傅': 'fu', '方': 'fang', '侯': 'hou', '邹': 'zou', '熊': 'xiong',
};

// ── Urdu/Nastaliq additions ───────────────────────────────────────────────────
// Urdu uses extended Arabic Unicode block — the shared normalizer handles most.
// Extra Urdu-specific codepoints:
const URDU_EXTRA: Record<number, string> = {
  0x06BE: 'h',  // ھ (do-chashmi he) → h
  0x06C1: 'h',  // ہ (gol he) → h
  0x06BA: 'n',  // ں (noon ghunna) → n
  0x06C3: 't',  // ۃ (Urdu taa-marbutah) → t
  0x0679: 't',  // ٹ (tte) → t
  0x0688: 'd',  // ڈ (ddal) → d
  0x0691: 'r',  // ڑ (rra) → r
  0x06BE: 'h',  // duplicate intentional for clarity
  0x0698: 'zh', // ژ → zh
  0x06A9: 'k',  // ک (keheh) → k
  0x06AF: 'g',  // گ (gaf) → g
  0x06CC: 'y',  // ی (Farsi yeh) → y
};

// ── Core Arabic normalizer ────────────────────────────────────────────────────

export function normalizeArabic(input: string): string {
  if (!input) return '';
  let s = input;

  // 1. Unicode canonical decomposition
  s = s.normalize('NFC');

  // 2. Strip diacritics and tatweel
  s = s.replace(ARABIC_DIACRITICS, '');
  s = s.replace(TATWEEL, '');

  // 3. Replace Arabic punctuation with space
  s = s.replace(ARABIC_PUNCTUATION, ' ');

  // 4. Normalize character variants
  s = s.replace(/./gu, (ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    if (ALEF_VARIANTS[cp]) return ALEF_VARIANTS[cp]!;
    if (WAW_VARIANTS[cp]) return WAW_VARIANTS[cp]!;
    if (YAA_VARIANTS[cp]) return YAA_VARIANTS[cp]!;
    if (KAF_VARIANTS[cp]) return KAF_VARIANTS[cp]!;
    if (URDU_EXTRA[cp]) return URDU_EXTRA[cp]!;
    return ch;
  });

  // 5. Taa-marbutah → haa
  s = s.replace(TAA_MARBUTAH, 'ه');

  // 6. Normalize whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// ── Latin romanisation normalizer ─────────────────────────────────────────────

export function normalizeArabicRomanisation(input: string): string {
  if (!input) return '';
  let s = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Strip definite article prefixes
  s = s.replace(LATIN_ARTICLE_CLUSTER, '');

  // Normalize patronymics
  s = s.replace(LATIN_BIN_CLUSTER, 'bin');

  // Name clusters
  s = s.replace(LATIN_MUHAMMAD_CLUSTER, 'muhammad');
  s = s.replace(LATIN_AHMAD_CLUSTER, 'ahmad');
  s = s.replace(LATIN_UMAR_CLUSTER, 'umar');
  s = s.replace(LATIN_YUSUF_CLUSTER, 'yusuf');
  s = s.replace(LATIN_KHALID_CLUSTER, 'khalid');
  s = s.replace(LATIN_HUSAIN_CLUSTER, 'husain');

  // Abd prefix clusters
  for (const [variant, canonical] of Object.entries(LATIN_ABD_CLUSTER)) {
    const re = new RegExp(`\\b${variant}\\b`, 'gi');
    s = s.replace(re, canonical);
  }

  // Collapse whitespace
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// ── Cyrillic → Latin transliteration ─────────────────────────────────────────

export function cyrillicToLatin(input: string): string {
  return input.replace(/./gu, (ch) => CYRILLIC_LATIN[ch] ?? ch);
}

// ── Chinese → Pinyin subset ───────────────────────────────────────────────────

export function chineseToPinyin(input: string): string {
  return input.replace(/./gu, (ch) => {
    const pinyin = CHINESE_PINYIN_COMMON[ch];
    return pinyin ? ` ${pinyin} ` : ch;
  }).replace(/\s+/g, ' ').trim();
}

// ── Canonical cluster resolution ──────────────────────────────────────────────
// Given any input (any script), produce a canonical Latin cluster key.
// Two names with the same cluster key are definitionally equivalent.

export function canonicalCluster(input: string): string {
  if (!input) return '';
  let s = input;

  // Check if Arabic script
  const hasArabic = /[؀-ۿ]/.test(s);
  const hasCyrillic = /[Ѐ-ӿ]/.test(s);
  const hasCJK = /[一-鿿]/.test(s);

  if (hasArabic) {
    s = normalizeArabic(s);
    // After Arabic normalization, the string may still be in Arabic.
    // We need a Latin representation — use the normalised Arabic as-is for
    // clustering (two Arabic names that normalise identically are the same cluster).
    // For cross-script matching, the calling layer handles transliteration.
  }

  if (hasCyrillic) {
    s = cyrillicToLatin(s);
  }

  if (hasCJK) {
    s = chineseToPinyin(s);
  }

  if (!hasArabic) {
    // Latin: apply romanisation normalisation
    s = normalizeArabicRomanisation(s);
  }

  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Script-aware comparison ───────────────────────────────────────────────────

export function arabicNamesEquivalent(a: string, b: string): boolean {
  return canonicalCluster(a) === canonicalCluster(b);
}
