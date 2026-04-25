// Hawkeye Sterling — Cyrillic + CJK transliteration helpers.
// Pragmatic mappings (not exhaustive). Extend at run-time with library-quality
// transliterators for Phase 3.

// Cyrillic → Latin (ISO 9 + Passport-style; includes Ukrainian, Belarusian,
// Kazakh, Uzbek, Tajik, Serbian, Bulgarian extension characters).
const CYRILLIC_MAP: Record<string, string> = {
  // ── Russian (standard) ───────────────────────────────────────────────────
  'А': 'A',  'Б': 'B',    'В': 'V',    'Г': 'G',    'Д': 'D',    'Е': 'E',
  'Ж': 'Zh', 'З': 'Z',    'И': 'I',    'Й': 'Y',    'К': 'K',    'Л': 'L',
  'М': 'M',  'Н': 'N',    'О': 'O',    'П': 'P',    'Р': 'R',    'С': 'S',
  'Т': 'T',  'У': 'U',    'Ф': 'F',    'Х': 'Kh',   'Ц': 'Ts',   'Ч': 'Ch',
  'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '',     'Ы': 'Y',    'Ь': '',     'Э': 'E',
  'Ю': 'Yu', 'Я': 'Ya',   'Ё': 'Yo',
  'а': 'a',  'б': 'b',    'в': 'v',    'г': 'g',    'д': 'd',    'е': 'e',
  'ж': 'zh', 'з': 'z',    'и': 'i',    'й': 'y',    'к': 'k',    'л': 'l',
  'м': 'm',  'н': 'n',    'о': 'o',    'п': 'p',    'р': 'r',    'с': 's',
  'т': 't',  'у': 'u',    'ф': 'f',    'х': 'kh',   'ц': 'ts',   'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '',     'ы': 'y',    'ь': '',     'э': 'e',
  'ю': 'yu', 'я': 'ya',   'ё': 'yo',
  // ── Ukrainian ────────────────────────────────────────────────────────────
  'І': 'I',  'і': 'i',    // dotted i (distinct from и in Ukrainian)
  'Ї': 'Yi', 'ї': 'yi',   // yi / ji digraph
  'Є': 'Ye', 'є': 'ye',   // ye (≠ е)
  'Ґ': 'G',  'ґ': 'g',    // hard g (not kh)
  // ── Belarusian ───────────────────────────────────────────────────────────
  'Ў': 'U',  'ў': 'u',    // short u (non-syllabic)
  // ── Kazakh (Cyrillic script) ──────────────────────────────────────────────
  'Ң': 'Ng', 'ң': 'ng',   // velar nasal
  'Ғ': 'Gh', 'ғ': 'gh',   // voiced velar fricative
  'Қ': 'Q',  'қ': 'q',    // voiceless uvular stop
  'Ұ': 'U',  'ұ': 'u',    // back unrounded vowel
  'Ү': 'U',  'ү': 'u',    // front rounded vowel
  'Ә': 'Ae', 'ә': 'ae',   // open front vowel
  'Ө': 'O',  'ө': 'o',    // rounded mid-front vowel
  'Һ': 'H',  'һ': 'h',    // voiced glottal fricative
  // ── Tajik / Uzbek ─────────────────────────────────────────────────────────
  'Ҳ': 'H',  'ҳ': 'h',    // pharyngeal h (≈ Arabic ح)
  'Ҷ': 'J',  'ҷ': 'j',    // affricate j (≈ Arabic ج)
  'Ҕ': 'G',  'ҕ': 'g',
  // ── Serbian / Macedonian ──────────────────────────────────────────────────
  'Ђ': 'Dj', 'ђ': 'dj',   // Serbian đ
  'Ћ': 'Ch', 'ћ': 'ch',   // Serbian ć variant
  'Љ': 'Lj', 'љ': 'lj',
  'Њ': 'Nj', 'њ': 'nj',
  'Џ': 'Dz', 'џ': 'dz',
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
  // ── Additional Chinese surnames (top 200) ─────────────────────────────────
  '金': 'Jin', '陆': 'Lu', '柳': 'Liu', '史': 'Shi', '方': 'Fang',
  '孔': 'Kong', '毛': 'Mao', '申': 'Shen', '侯': 'Hou', '邵': 'Shao',
  '熊': 'Xiong', '孟': 'Meng', '秦': 'Qin', '白': 'Bai', '江': 'Jiang',
  '阳': 'Yang', '燕': 'Yan', '段': 'Duan', '雷': 'Lei', '龙': 'Long',
  '石': 'Shi', '武': 'Wu', '钱': 'Qian', '汤': 'Tang', '姜': 'Jiang',
  '范': 'Fan', '傅': 'Fu', '尹': 'Yin', '崔': 'Cui', '邹': 'Zou',
  '龚': 'Gong', '覃': 'Tan', '韦': 'Wei', '蒙': 'Meng', '涂': 'Tu',
  '殷': 'Yin', '仲': 'Zhong', '施': 'Shi', '廖': 'Liao', '柴': 'Chai',
  // ── CJK given-name morphemes (high-frequency) ────────────────────────────
  '国': 'Guo', '大': 'Da', '华': 'Hua', '建': 'Jian', '志': 'Zhi',
  '家': 'Jia', '平': 'Ping', '东': 'Dong', '海': 'Hai', '新': 'Xin',
  '云': 'Yun', '峰': 'Feng', '春': 'Chun', '成': 'Cheng', '红': 'Hong',
  '花': 'Hua', '青': 'Qing', '雪': 'Xue', '梅': 'Mei', '宝': 'Bao',
  '玉': 'Yu', '英': 'Ying', '凤': 'Feng', '兰': 'Lan', '萍': 'Ping',
  '博': 'Bo', '晨': 'Chen', '晓': 'Xiao', '宇': 'Yu', '天': 'Tian',
  '浩': 'Hao', '飞': 'Fei', '鹏': 'Peng', '辉': 'Hui', '俊': 'Jun',
  '斌': 'Bin', '凯': 'Kai', '亮': 'Liang', '坚': 'Jian', '刚': 'Gang',
  // ── Japanese surnames (Kanji shared with Chinese) ─────────────────────────
  '山': 'Yama', '田': 'Ta', '川': 'Kawa', '木': 'Ki', '森': 'Mori',
  '上': 'Kami', '下': 'Shimo', '中': 'Naka', '村': 'Mura', '島': 'Shima',
  '橋': 'Hashi', '藤': 'Fuji', '原': 'Hara', '野': 'No', '本': 'Moto',
  '松': 'Matsu', '竹': 'Take', '葉': 'Ha', '花': 'Hana', '水': 'Mizu',
  // ── Korean surnames (Hanja) ───────────────────────────────────────────────
  '金': 'Kim', '박': 'Park', '이': 'Lee', '최': 'Choi', '정': 'Jung',
  '강': 'Kang', '조': 'Cho', '윤': 'Yoon', '장': 'Jang', '임': 'Lim',
  '한': 'Han', '오': 'Oh', '서': 'Seo', '신': 'Shin', '권': 'Kwon',
  '황': 'Hwang', '안': 'Ahn', '송': 'Song', '류': 'Ryu', '전': 'Jeon',
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
