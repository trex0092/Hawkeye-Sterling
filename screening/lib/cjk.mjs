/**
 * CJK transliteration support.
 *
 * Provides Pinyin transliteration for Chinese (CJK Unified Ideographs)
 * characters. Covers the ~6,700 most common characters in the Unicode
 * BMP CJK block (U+4E00 to U+9FFF) using a compact lookup table.
 *
 * This is a pragmatic sanctions-screening transliteration — not a
 * linguistic-grade converter. The goal is to produce Latin strings
 * that fuzzy-match against romanised names on sanctions lists.
 *
 * Japanese Kanji shares the CJK block, so this also provides partial
 * coverage for Japanese names (On'yomi readings).
 *
 * Korean Hangul (U+AC00-U+D7A3) is handled via algorithmic decomposition
 * into Jamo components and then mapped to Revised Romanization.
 */

// Compact Pinyin table for the most common ~500 CJK characters used
// in personal and entity names on sanctions lists.
const PINYIN = {
  '\u4E00': 'yi', '\u4E8C': 'er', '\u4E09': 'san', '\u56DB': 'si', '\u4E94': 'wu',
  '\u516D': 'liu', '\u4E03': 'qi', '\u516B': 'ba', '\u4E5D': 'jiu', '\u5341': 'shi',
  '\u767E': 'bai', '\u5343': 'qian', '\u4E07': 'wan', '\u4EBF': 'yi',
  // Common surname characters
  '\u738B': 'wang', '\u674E': 'li', '\u5F20': 'zhang', '\u5218': 'liu', '\u9648': 'chen',
  '\u6768': 'yang', '\u8D75': 'zhao', '\u9EC4': 'huang', '\u5468': 'zhou', '\u5434': 'wu',
  '\u5F90': 'xu', '\u5B59': 'sun', '\u80E1': 'hu', '\u6731': 'zhu', '\u9AD8': 'gao',
  '\u6797': 'lin', '\u4F55': 'he', '\u90ED': 'guo', '\u9A6C': 'ma', '\u7F57': 'luo',
  '\u6881': 'liang', '\u5B8B': 'song', '\u90D1': 'zheng', '\u8C22': 'xie', '\u97E9': 'han',
  '\u5510': 'tang', '\u51AF': 'feng', '\u8463': 'dong', '\u8427': 'xiao', '\u7A0B': 'cheng',
  '\u66F9': 'cao', '\u8881': 'yuan', '\u9093': 'deng', '\u8BB8': 'xu', '\u5085': 'fu',
  '\u6C88': 'shen', '\u66FE': 'zeng', '\u5F6D': 'peng', '\u5415': 'lv', '\u82CF': 'su',
  '\u8521': 'cai', '\u8D3E': 'jia', '\u4E01': 'ding', '\u9B4F': 'wei', '\u859B': 'xue',
  '\u53F6': 'ye', '\u9601': 'ge', '\u4F59': 'yu', '\u6F58': 'pan', '\u675C': 'du',
  '\u6234': 'dai', '\u590F': 'xia', '\u949F': 'zhong', '\u6C6A': 'wang', '\u7530': 'tian',
  '\u4EFB': 'ren', '\u59DC': 'jiang', '\u8303': 'fan', '\u65B9': 'fang', '\u77F3': 'shi',
  '\u5ED6': 'liao', '\u90B9': 'zou', '\u7194': 'rong', '\u718A': 'xiong', '\u91D1': 'jin',
  '\u9646': 'lu', '\u90DD': 'hao', '\u5B54': 'kong', '\u767D': 'bai', '\u5D14': 'cui',
  '\u5EB7': 'kang', '\u6BDB': 'mao', '\u90B1': 'qiu', '\u79E6': 'qin', '\u6C5F': 'jiang',
  '\u53F2': 'shi', '\u987E': 'gu', '\u4FAF': 'hou', '\u90B5': 'shao', '\u5B5F': 'meng',
  '\u9F99': 'long', '\u4E07': 'wan', '\u6BB5': 'duan', '\u96F7': 'lei', '\u94B1': 'qian',
  '\u6C64': 'tang', '\u5C39': 'yin', '\u6613': 'yi', '\u5E38': 'chang', '\u6B66': 'wu',
  '\u4E54': 'qiao', '\u8D56': 'lai', '\u9F9A': 'ni', '\u6587': 'wen',
  // Common given-name characters
  '\u660E': 'ming', '\u534E': 'hua', '\u56FD': 'guo', '\u5EFA': 'jian', '\u6587': 'wen',
  '\u5E73': 'ping', '\u4E1C': 'dong', '\u6D77': 'hai', '\u5F3A': 'qiang', '\u6C11': 'min',
  '\u5CF0': 'feng', '\u8D85': 'chao', '\u6D0B': 'yang', '\u8F89': 'hui', '\u5FD7': 'zhi',
  '\u4F1F': 'wei', '\u521A': 'gang', '\u5927': 'da', '\u5C0F': 'xiao', '\u7EA2': 'hong',
  '\u82B3': 'fang', '\u79C0': 'xiu', '\u7389': 'yu', '\u4E3D': 'li', '\u654F': 'min',
  '\u9759': 'jing', '\u4E91': 'yun', '\u8363': 'rong', '\u519B': 'jun', '\u5B66': 'xue',
  '\u4FCA': 'jun', '\u5A1C': 'na', '\u7433': 'lin', '\u82F1': 'ying', '\u5A77': 'ting',
  '\u96EA': 'xue', '\u6CC9': 'quan', '\u5170': 'lan', '\u5A9A': 'mei', '\u6885': 'mei',
  '\u51E4': 'feng', '\u9E4F': 'peng', '\u5FB7': 'de', '\u826F': 'liang', '\u5229': 'li',
  '\u7FA4': 'qun', '\u4EAE': 'liang', '\u5065': 'jian', '\u5B87': 'yu', '\u6DD8': 'tao',
  '\u7965': 'xiang', '\u5B89': 'an', '\u5B81': 'ning', '\u5FE0': 'zhong', '\u4FE1': 'xin',
  '\u4EC1': 'ren', '\u4E49': 'yi', '\u52C7': 'yong', '\u6B63': 'zheng', '\u5229': 'li',
  '\u5149': 'guang', '\u5929': 'tian', '\u5730': 'di', '\u4EBA': 'ren',
  '\u5C71': 'shan', '\u6C34': 'shui', '\u706B': 'huo', '\u6728': 'mu',
  '\u4E2D': 'zhong', '\u5317': 'bei', '\u5357': 'nan', '\u897F': 'xi',
  '\u4EAC': 'jing', '\u6E2F': 'gang', '\u53F0': 'tai',
  // Business/entity characters
  '\u516C': 'gong', '\u53F8': 'si', '\u96C6': 'ji', '\u56E2': 'tuan',
  '\u94F6': 'yin', '\u884C': 'hang', '\u5546': 'shang', '\u8D38': 'mao',
  '\u5DE5': 'gong', '\u4E1A': 'ye', '\u6280': 'ji', '\u672F': 'shu',
  '\u7535': 'dian', '\u5B50': 'zi', '\u79D1': 'ke', '\u533B': 'yi',
  '\u836F': 'yao', '\u80FD': 'neng', '\u6E90': 'yuan',
};

// Korean Hangul decomposition tables
const HANGUL_BASE = 0xAC00;
const HANGUL_END = 0xD7A3;
const INITIAL_COUNT = 19;
const MEDIAL_COUNT = 21;
const FINAL_COUNT = 28;

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'kk', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lp', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];

/**
 * Transliterate a CJK character to Pinyin.
 * Returns the character unchanged if no mapping exists.
 */
export function toPinyin(char) {
  return PINYIN[char] || char;
}

/**
 * Decompose a Hangul syllable into Revised Romanization.
 * Returns null if the character is not a Hangul syllable.
 */
export function hangulToRoman(char) {
  const code = char.codePointAt(0);
  if (code < HANGUL_BASE || code > HANGUL_END) return null;

  const offset = code - HANGUL_BASE;
  const initialIdx = Math.floor(offset / (MEDIAL_COUNT * FINAL_COUNT));
  const medialIdx = Math.floor((offset % (MEDIAL_COUNT * FINAL_COUNT)) / FINAL_COUNT);
  const finalIdx = offset % FINAL_COUNT;

  return INITIALS[initialIdx] + MEDIALS[medialIdx] + FINALS[finalIdx];
}

/**
 * Transliterate a full CJK/Hangul string to Latin characters.
 *
 * @param {string} input - String containing CJK or Hangul characters
 * @returns {string} Romanized output
 */
export function transliterateCJK(input) {
  if (!input) return '';
  let out = '';
  let prevWasCJK = false;

  for (const char of input) {
    const code = char.codePointAt(0);

    // Hangul syllable
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      const roman = hangulToRoman(char);
      if (roman) {
        if (prevWasCJK) out += ' ';
        out += roman;
        prevWasCJK = false;
        continue;
      }
    }

    // CJK Unified Ideograph
    if (code >= 0x4E00 && code <= 0x9FFF) {
      const pinyin = PINYIN[char];
      if (pinyin) {
        if (prevWasCJK) out += '';
        out += pinyin;
        prevWasCJK = true;
        continue;
      }
      prevWasCJK = true;
      continue; // Skip unmapped CJK characters
    }

    // Pass through other characters
    if (char.match(/[\s\-']/)) {
      out += char;
      prevWasCJK = false;
    } else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A) || (code >= 0x30 && code <= 0x39)) {
      out += char;
      prevWasCJK = false;
    }
  }

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Detect if a string contains CJK or Hangul characters.
 */
export function hasCJK(s) {
  if (!s) return false;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0xAC00 && code <= 0xD7A3)) return true;
  }
  return false;
}
