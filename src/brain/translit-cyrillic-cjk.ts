// Hawkeye Sterling — Cyrillic + CJK transliteration helpers.
// Pragmatic mappings (not exhaustive). Extend at run-time with library-quality
// transliterators for Phase 3.

// Cyrillic → Latin (ISO 9 + Passport-style soft; favouring passport-style).
const CYRILLIC_MAP: Record<string, string> = {
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ж': 'Zh', 'З': 'Z',
  'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P',
  'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch',
  'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  'Ё': 'Yo',
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z',
  'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
  'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'ё': 'yo',
};

export function cyrillicToLatin(input: string): string {
  let out = '';
  for (const ch of input) out += CYRILLIC_MAP[ch] ?? ch;
  return out;
}

// Chinese → Pinyin (SUBSET): common surnames and given-name morphemes only.
// For real coverage, Phase 3 should wire a full pinyin library.
const CHINESE_SUBSET: Record<string, string> = {
  '王': 'Wang', '李': 'Li', '张': 'Zhang', '刘': 'Liu', '陈': 'Chen', '杨': 'Yang',
  '赵': 'Zhao', '黄': 'Huang', '周': 'Zhou', '吴': 'Wu', '徐': 'Xu', '孙': 'Sun',
  '胡': 'Hu', '朱': 'Zhu', '高': 'Gao', '林': 'Lin', '何': 'He', '郭': 'Guo',
  '马': 'Ma', '罗': 'Luo', '梁': 'Liang', '宋': 'Song', '郑': 'Zheng', '谢': 'Xie',
  '韩': 'Han', '唐': 'Tang', '冯': 'Feng', '于': 'Yu', '董': 'Dong', '萧': 'Xiao',
  '程': 'Cheng', '曹': 'Cao', '袁': 'Yuan', '邓': 'Deng', '许': 'Xu', '傅': 'Fu',
  '沈': 'Shen', '曾': 'Zeng', '彭': 'Peng', '吕': 'Lu', '苏': 'Su', '卢': 'Lu',
  '蒋': 'Jiang', '蔡': 'Cai', '贾': 'Jia', '丁': 'Ding', '魏': 'Wei', '薛': 'Xue',
  '叶': 'Ye', '阎': 'Yan', '余': 'Yu', '潘': 'Pan', '杜': 'Du', '戴': 'Dai',
  '夏': 'Xia', '钟': 'Zhong', '汪': 'Wang', '田': 'Tian', '任': 'Ren',
  '伟': 'Wei', '芳': 'Fang', '娜': 'Na', '秀': 'Xiu', '敏': 'Min', '静': 'Jing',
  '丽': 'Li', '强': 'Qiang', '磊': 'Lei', '军': 'Jun', '洋': 'Yang', '勇': 'Yong',
  '艳': 'Yan', '杰': 'Jie', '娟': 'Juan', '涛': 'Tao', '明': 'Ming', '超': 'Chao',
  '秀英': 'Xiuying', '小': 'Xiao', '文': 'Wen',
};

export function chineseToPinyinSubset(input: string): string {
  let out = '';
  for (const ch of input) out += (CHINESE_SUBSET[ch] ?? ch) + ' ';
  return out.trim().replace(/\s+/g, ' ');
}

// Thin unifying entry-point.
export function transliterateAny(input: string): string {
  return chineseToPinyinSubset(cyrillicToLatin(input));
}
