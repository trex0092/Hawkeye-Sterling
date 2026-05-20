// Hawkeye Sterling — multi-language adverse-media catalogues + tokenizers.
//
// English keyword matching with `indexOf` works for Latin-script languages
// because word boundaries are explicit. It silently fails on Chinese (no
// spaces) and produces noisy substring matches in Arabic where prefixed
// articles fuse onto roots. This module ships per-language catalogues and
// script-aware tokenizers so multi-script news corpora can be classified
// with the same precision as English.
//
// Languages covered (ISO-639-1):
//   ar — Arabic         (Arabic script; RTL)
//   de — German         (Latin; ä ö ü ß)
//   el — Greek          (Greek script)
//   es — Spanish        (Latin; ñ)
//   fa — Persian/Farsi  (Arabic script; پ چ ژ گ)
//   fr — French         (Latin; diacritics)
//   he — Hebrew         (Hebrew script; RTL)
//   hi — Hindi          (Devanagari script)
//   id — Indonesian     (Latin; no diacritics)
//   it — Italian        (Latin; à è ì ò ù)
//   ja — Japanese       (Hiragana + Katakana + CJK kanji)
//   ko — Korean         (Hangul)
//   nl — Dutch          (Latin; similar to English/German)
//   pl — Polish         (Latin; ą ę ó ś ź ż ć ń)
//   pt — Portuguese     (Latin; ã õ â ç)
//   ru — Russian        (Cyrillic)
//   sw — Swahili        (Latin; no special chars)
//   th — Thai           (Thai script; no word spaces)
//   tr — Turkish        (Latin; İ ı Ğ ğ Ş ş)
//   uk — Ukrainian      (Cyrillic; ї і є)
//   vi — Vietnamese     (Latin; tone marks)
//   zh — Chinese        (CJK Unified; no whitespace tokens)

export type SupportedLang =
  | "ar" | "de" | "el" | "es" | "fa" | "fr" | "he" | "hi"
  | "id" | "it" | "ja" | "ko" | "nl" | "pl" | "pt" | "ru"
  | "sw" | "th" | "tr" | "uk" | "vi" | "zh";

export interface LangKeywordPack {
  lang: SupportedLang;
  /** ISO 639-2 / common name for UI display */
  displayName: string;
  /** Keywords are stored already lower-cased / normalised. */
  keywords: string[];
  /** Token-yielding split for this language. */
  tokenize: (text: string) => Set<string>;
}

// ─────────────────────────────────────────────────────────────────────────
// Catalogues — ~50-60 terms per language covering: ML, TF, sanctions,
// bribery, fraud, drug trafficking, human trafficking, arrest/conviction.
// ─────────────────────────────────────────────────────────────────────────

// ── Arabic (ar) ───────────────────────────────────────────────────────────
const AR_KEYWORDS = [
  "غسل الأموال", "تبييض الأموال", "غسيل أموال", "تمويل الإرهاب",
  "احتيال", "اختلاس", "تزوير", "تهرب ضريبي", "تهريب", "رشوة",
  "فساد", "إفساد", "اتجار", "اتجار بالبشر", "اتجار بالمخدرات",
  "مخدرات", "إرهاب", "تمويل إرهاب", "عقوبات", "خرق العقوبات",
  "اعتقال", "اعتُقل", "أُدين", "محكوم", "متهم", "ملاحق قضائياً",
  "حكم بالسجن", "تجميد الأصول", "إدراج", "تجميد أموال",
  "عقوبات أمريكية", "قائمة المخالفين", "قائمة الحظر", "قائمة الإرهاب",
  "هجوم سيبراني", "برامج فدية", "أسلحة الدمار الشامل", "أسلحة نووية",
  "تحقيق جنائي", "منظمة إجرامية", "غسيل", "مصادرة",
  "ابتزاز", "جريمة مالية", "حظر", "تجميد", "ملاحقة قضائية",
];

// ── German (de) ───────────────────────────────────────────────────────────
const DE_KEYWORDS = [
  "geldwäsche", "geldwäscherei", "terrorismusfinanzierung", "betrug",
  "bestechung", "bestechlichkeit", "korruption", "steuerhinterziehung",
  "drogenhandel", "menschenhandel", "schmuggel", "sanktionen",
  "festnahme", "verhaftet", "verurteilt", "angeklagt", "beschuldigt",
  "ermittlung", "strafverfolgung", "haftbefehl", "untersuchungshaft",
  "hausdurchsuchung", "durchsuchung", "beschlagnahme", "einziehung",
  "geldbuße", "strafanzeige", "unterschlagung", "veruntreuung",
  "fälschung", "urkundenfälschung", "embargo", "vermögenssperre",
  "einfrierung von vermögenswerten", "organisierte kriminalität",
  "terrorismus", "terrorverdacht", "finanzierung von terrorismus",
  "proliferation", "waffenhandel", "erpressung", "betrugsfall",
  "wirtschaftskriminalität", "insiderhandel", "marktmanipulation",
  "geldwäscheverdacht", "schwarzgeld", "geheimkonten",
];

// ── Greek (el) ───────────────────────────────────────────────────────────
const EL_KEYWORDS = [
  "ξέπλυμα χρήματος", "ξέπλυμα", "χρηματοδότηση τρομοκρατίας",
  "απάτη", "δωροδοκία", "διαφθορά", "φοροδιαφυγή",
  "εμπόριο ναρκωτικών", "εμπόριο ανθρώπων", "λαθρεμπόριο",
  "κυρώσεις", "οικονομικές κυρώσεις", "δέσμευση περιουσιακών στοιχείων",
  "εμπάργκο", "τρομοκρατία", "τρομοκρατική",
  "συνελήφθη", "συλλήψη", "κρατούμενος", "κράτηση",
  "καταδικάστηκε", "καταδίκη", "ένταλμα σύλληψης",
  "κατηγορούμενος", "κατηγορία", "ανάκριση", "έρευνα",
  "δίωξη", "παρασκευή ναρκωτικών", "υπεξαίρεση",
  "κατάσχεση", "δήμευση", "εκβιασμός", "οργανωμένο έγκλημα",
  "νομιμοποίηση εσόδων", "παράνομα κέρδη",
];

// ── Spanish (es) ─────────────────────────────────────────────────────────
const ES_KEYWORDS = [
  "lavado de dinero", "lavado de activos", "blanqueo de capitales",
  "blanqueo de dinero", "financiamiento del terrorismo", "financiación del terrorismo",
  "fraude", "corrupción", "soborno", "cohecho", "malversación",
  "defraudación", "evasión fiscal", "tráfico de drogas", "narcotráfico",
  "trata de personas", "tráfico de personas", "tráfico de seres humanos",
  "contrabando", "sanciones", "sanciones económicas", "embargo",
  "congelación de activos", "terrorismo", "financiación terrorista",
  "detenido", "arrestado", "imputado", "acusado", "procesado",
  "condenado", "sentenciado", "orden de arresto", "orden judicial",
  "investigación", "operación policial", "allanamiento", "incautación",
  "decomiso", "extorsión", "crimen organizado", "cartel",
  "organización criminal", "tráfico de armas", "encarcelado",
];

// ── Persian/Farsi (fa) ────────────────────────────────────────────────────
const FA_KEYWORDS = [
  "پولشویی", "تامین مالی تروریسم", "کلاهبرداری", "رشوه", "فساد",
  "قاچاق مواد مخدر", "قاچاق انسان", "تحریم", "تحریم‌های اقتصادی",
  "دستگیر شد", "دستگیری", "بازداشت", "زندانی", "محکوم",
  "تحقیق", "پرونده", "کیفر", "اتهام", "متهم",
  "حکم بازداشت", "اخاذی", "جرم سازمان یافته", "مسدود کردن دارایی",
  "تروریسم", "گروه تروریستی", "فرار مالیاتی", "اختلاس",
  "ضبط اموال", "قاچاق", "جعل", "کلاهبرداری مالی",
  "نقض تحریم", "دور زدن تحریم", "فهرست تحریم",
];

// ── French (fr) ──────────────────────────────────────────────────────────
const FR_KEYWORDS = [
  "blanchiment", "blanchiment d'argent", "blanchiment de capitaux",
  "financement du terrorisme", "financement terroriste",
  "fraude", "fraude fiscale", "évasion fiscale", "évasion de capitaux",
  "détournement", "détournement de fonds", "escroquerie", "abus de biens sociaux",
  "corruption", "pot-de-vin", "pots-de-vin", "trafic d'influence",
  "condamné", "condamnée", "condamnation", "arrêté", "arrêtée",
  "soupçonné", "inculpé", "mis en examen", "mise en examen",
  "interpellé", "écroué", "écrouée",
  "perquisition", "blanchiment aggravé",
  "sanctions", "sanctions économiques", "gel des avoirs", "gel d'avoirs",
  "embargo", "violation des sanctions", "contournement des sanctions",
  "trafic de drogue", "trafic d'êtres humains", "traite des êtres humains",
  "esclavage moderne", "travail forcé", "criminalité organisée", "mafia",
  "armes de destruction massive", "prolifération nucléaire",
  "rançongiciel", "cyberattaque", "fraude informatique",
];

// ── Hebrew (he) ───────────────────────────────────────────────────────────
const HE_KEYWORDS = [
  "הלבנת הון", "מימון טרור", "הונאה", "שוחד", "שחיתות",
  "סחר בסמים", "סחר בבני אדם", "סנקציות", "סנקציות כלכליות",
  "הקפאת נכסים", "אמברגו", "טרור", "ארגון טרור",
  "נעצר", "נאסר", "מעצר", "כלא", "מאסר",
  "הורשע", "הרשעה", "כתב אישום", "אישום", "נאשם",
  "חקירה", "הליכים משפטיים", "חדירה לפשע", "הברחה",
  "העלמת מס", "מעילה", "תפיסה", "סחיטה", "פשע מאורגן",
  "מימון פשע", "כספים בלתי חוקיים",
];

// ── Hindi (hi) ───────────────────────────────────────────────────────────
const HI_KEYWORDS = [
  "मनी लॉन्ड्रिंग", "काले धन को वैध बनाना", "आतंकी वित्तपोषण",
  "धोखाधड़ी", "रिश्वत", "रिश्वतखोरी", "भ्रष्टाचार",
  "नशीले पदार्थों की तस्करी", "मादक पदार्थ तस्करी",
  "मानव तस्करी", "मानव व्यापार",
  "प्रतिबंध", "आर्थिक प्रतिबंध", "संपत्ति जब्ती",
  "आतंकवाद", "आतंकी संगठन",
  "गिरफ्तार", "गिरफ्तारी", "हिरासत", "न्यायिक हिरासत",
  "दोषी ठहराया", "सजा", "आरोपी", "अभियुक्त",
  "जांच", "पूछताछ", "छापेमारी", "तलाशी",
  "जब्त", "जब्ती", "जबरन वसूली", "संगठित अपराध",
  "कर चोरी", "गबन", "धोखा", "वित्तीय अपराध",
];

// ── Indonesian (id) ───────────────────────────────────────────────────────
const ID_KEYWORDS = [
  "pencucian uang", "pendanaan terorisme", "penipuan",
  "suap", "korupsi", "penyuapan", "gratifikasi",
  "penggelapan pajak", "penghindaran pajak",
  "perdagangan narkoba", "narkotika", "perdagangan manusia",
  "penyelundupan", "sanksi", "embargo",
  "pembekuan aset", "perampasan aset",
  "terorisme", "organisasi teroris",
  "ditangkap", "penangkapan", "ditahan", "penahanan",
  "dihukum", "vonis", "terdakwa", "tersangka",
  "penuntutan", "penyelidikan", "penyidikan",
  "penggeledahan", "penyitaan", "pemerasan",
  "kejahatan terorganisir", "sindikat", "kartel",
];

// ── Italian (it) ─────────────────────────────────────────────────────────
const IT_KEYWORDS = [
  "riciclaggio di denaro", "riciclaggio", "finanziamento del terrorismo",
  "frode", "corruzione", "tangente", "concussione", "peculato",
  "evasione fiscale", "frode fiscale",
  "traffico di droga", "spaccio", "tratta di esseri umani",
  "tratta di persone", "contrabbando", "sanzioni", "embargo",
  "congelamento dei beni", "sequestro di beni",
  "terrorismo", "organizzazione terroristica",
  "arrestato", "fermato", "detenuto", "in custodia",
  "condannato", "imputato", "indagato", "sotto processo",
  "rinviato a giudizio", "mandato d'arresto",
  "indagine", "operazione di polizia", "perquisizione",
  "sequestro", "confisca", "estorsione", "criminalità organizzata",
  "mafia", "camorra", "ndrangheta", "cosa nostra",
];

// ── Japanese (ja) ─────────────────────────────────────────────────────────
const JA_KEYWORDS = [
  "マネーロンダリング", "資金洗浄", "不正資金", "テロ資金供与",
  "詐欺", "横領", "贈収賄", "汚職", "脱税", "租税回避",
  "麻薬密売", "違法薬物", "人身売買", "人身取引",
  "制裁", "経済制裁", "資産凍結", "禁輸",
  "テロリズム", "テロ組織",
  "逮捕", "逮捕状", "拘留", "拘束", "勾留",
  "有罪判決", "起訴", "被告", "容疑者",
  "捜査", "家宅捜索", "押収", "没収",
  "恐喝", "組織犯罪", "暴力団", "密輸",
  "不正行為", "金融犯罪", "証券詐欺",
  "サイバー攻撃", "ランサムウェア", "インサイダー取引",
];

// ── Korean (ko) ──────────────────────────────────────────────────────────
const KO_KEYWORDS = [
  "자금세탁", "불법자금", "테러자금조달",
  "사기", "횡령", "뇌물", "부패", "탈세",
  "마약밀수", "마약거래", "인신매매",
  "밀수", "제재", "경제제재", "자산동결", "금수",
  "테러리즘", "테러조직",
  "체포", "구속", "구금", "수감",
  "유죄판결", "기소", "피고인", "피의자",
  "수사", "압수수색", "압수", "몰수",
  "공갈", "조직범죄", "범죄조직",
  "금융범죄", "주가조작", "내부자거래",
  "사이버공격", "랜섬웨어",
];

// ── Dutch (nl) ───────────────────────────────────────────────────────────
const NL_KEYWORDS = [
  "witwassen", "witwassing", "terrorismefinanciering",
  "fraude", "belastingfraude", "belastingontduiking",
  "omkoping", "corruptie", "verduistering",
  "drugshandel", "mensenhandel", "smokkel",
  "sancties", "economische sancties", "bevriezing van tegoeden",
  "embargo", "terrorisme", "terroristische organisatie",
  "gearresteerd", "aangehouden", "in hechtenis", "gedetineerd",
  "veroordeeld", "verdachte", "beschuldigd",
  "inbeslagname", "verbeurdverklaring",
  "afpersing", "georganiseerde misdaad",
  "opsporingsonderzoek", "politie-inval", "huiszoeking",
  "financieel misdrijf", "oplichting",
];

// ── Polish (pl) ──────────────────────────────────────────────────────────
const PL_KEYWORDS = [
  "pranie pieniędzy", "pranie brudnych pieniędzy",
  "finansowanie terroryzmu", "oszustwo", "łapówkarstwo",
  "korupcja", "przekupstwo", "defraudacja",
  "uchylanie się od podatków", "przestępstwo podatkowe",
  "handel narkotykami", "handel ludźmi", "przemyt",
  "sankcje", "sankcje gospodarcze", "zamrożenie aktywów",
  "embargo", "terroryzm", "organizacja terrorystyczna",
  "aresztowany", "zatrzymany", "tymczasowe aresztowanie",
  "skazany", "oskarżony", "podejrzany",
  "śledztwo", "dochodzenie", "przeszukanie",
  "zajęcie mienia", "konfiskata", "wymuszenie",
  "przestępczość zorganizowana", "gangsterstwo",
];

// ── Portuguese (pt) ───────────────────────────────────────────────────────
const PT_KEYWORDS = [
  "lavagem de dinheiro", "lavagem de capitais", "branqueamento de capitais",
  "financiamento do terrorismo", "fraude", "suborno", "corrupção",
  "peculato", "desvio de verbas", "evasão fiscal",
  "tráfico de drogas", "narcotráfico", "tráfico de pessoas",
  "tráfico de seres humanos", "contrabando",
  "sanções", "embargo", "congelamento de ativos", "bloqueio de ativos",
  "terrorismo", "organização terrorista",
  "preso", "detido", "em prisão preventiva",
  "condenado", "réu", "acusado", "suspeito",
  "investigação", "inquérito", "operação policial",
  "busca e apreensão", "apreensão", "confisco",
  "extorsão", "crime organizado", "organização criminosa",
];

// ── Russian (ru) ─────────────────────────────────────────────────────────
const RU_KEYWORDS = [
  "отмывание денег", "отмывание", "финансирование терроризма",
  "финансирование экстремизма", "мошенничество", "хищение", "растрата",
  "уклонение от налогов", "налоговое мошенничество",
  "взятка", "взяточничество", "коррупция", "злоупотребление полномочиями",
  "арестован", "арестована", "задержан", "задержана",
  "обвиняемый", "обвиняемая", "осужден", "осуждена",
  "приговорен", "приговорена", "уголовное дело", "уголовная статья",
  "обвинительное заключение", "обыск",
  "санкции", "финансовые санкции", "санкционный список",
  "обход санкций", "нарушение санкций", "заморозка активов",
  "арест активов", "OFAC", "СДН",
  "наркоторговля", "торговля наркотиками", "контрабанда",
  "торговля людьми", "принудительный труд", "организованная преступность",
  "оружие массового поражения", "ядерная программа",
  "кибератака", "вымогательское программное обеспечение",
];

// ── Swahili (sw) ─────────────────────────────────────────────────────────
const SW_KEYWORDS = [
  "utakatishaji fedha", "utakatishaji wa fedha", "ufadhili wa ugaidi",
  "udanganyifu", "rushwa", "ufisadi",
  "biashara ya madawa ya kulevya", "biashara ya binadamu",
  "usafirishaji haramu", "vikwazo", "mzigo haramu",
  "ugaidi", "shirika la kigaidi",
  "alikamatwa", "kukamatwa", "kufungwa", "kizuizini",
  "kuhukumiwa", "hukumu", "mshtakiwa", "mshuhuliwa",
  "uchunguzi", "upelelezi", "ukaguzi wa polisi",
  "ubadhirifu", "kukamata mali", "unyang'anyi",
  "uhalifu uliohipangwa", "genge la wahalifu",
];

// ── Thai (th) ─────────────────────────────────────────────────────────────
const TH_KEYWORDS = [
  "ฟอกเงิน", "การฟอกเงิน", "เงินสกปรก",
  "การสนับสนุนทางการเงินแก่ผู้ก่อการร้าย", "ระดมทุนก่อการร้าย",
  "การฉ้อโกง", "ฉ้อโกง", "การรับสินบน", "สินบน",
  "การทุจริต", "ทุจริต", "คอร์รัปชัน",
  "การค้ายาเสพติด", "ยาเสพติด", "การค้ามนุษย์",
  "การลักลอบขน", "การลักลอบนำเข้า",
  "มาตรการคว่ำบาตร", "การคว่ำบาตร", "การอายัดทรัพย์",
  "การก่อการร้าย", "ผู้ก่อการร้าย",
  "ถูกจับกุม", "จับกุม", "ถูกควบคุมตัว", "ควบคุมตัว",
  "ถูกตัดสินลงโทษ", "ตัดสินลงโทษ", "ผู้ต้องหา", "จำเลย",
  "การสอบสวน", "ค้นบ้าน", "ยึดทรัพย์",
  "อาชญากรรมที่จัดตั้ง", "แก๊งอาชญากร",
];

// ── Turkish (tr) ─────────────────────────────────────────────────────────
const TR_KEYWORDS = [
  "tutuklandı", "tutuklandığı", "tutuklama", "tutuklu", "gözaltı",
  "gözaltına alındı", "gözaltına alındığı", "gözaltında",
  "ifade verdi", "sorgulandı",
  "soruşturma", "kovuşturma", "dava açıldı", "dava",
  "yargılama", "mahkeme", "suçlama", "iddianame",
  "iddianamesinde", "beraat", "mahkumiyet", "mahkum edildi",
  "hapis cezası", "cezaevine gönderildi",
  "polis operasyonu", "operasyon", "baskın", "el konuldu",
  "el koydu", "müsadere", "müsadere edildi",
  "kara para aklama", "kara para", "karapara aklama",
  "rüşvet", "yolsuzluk", "zimmet", "zimmet suçu",
  "dolandırıcılık", "sahtecilik", "vergi kaçakçılığı",
  "vergi kaçırma", "mali suç", "usulsüzlük",
  "kaçakçılık", "insan ticareti", "uyuşturucu kaçakçılığı",
  "uyuşturucu", "silah kaçakçılığı",
  "terör", "terörüzm", "terör finansmanı", "terör örgütü",
  "yaptırım", "yaptırımlar", "ambargo", "kara liste",
  "rüşvet verdi", "rüşvet aldı", "ihaleye fesat",
];

// ── Ukrainian (uk) ───────────────────────────────────────────────────────
const UK_KEYWORDS = [
  "відмивання грошей", "відмивання коштів", "фінансування тероризму",
  "шахрайство", "хабарництво", "хабар", "корупція",
  "ухилення від сплати податків", "податкове шахрайство",
  "торгівля наркотиками", "торгівля людьми", "контрабанда",
  "санкції", "економічні санкції", "заморожування активів",
  "ембарго", "тероризм", "терористична організація",
  "заарештований", "заарештовано", "затриманий", "затримано",
  "засуджений", "обвинувачений", "підозрюваний",
  "розслідування", "обшук", "обвинувачення",
  "ордер на арешт", "вилучення", "конфіскація",
  "вимагання", "організована злочинність",
  "зброя масового знищення", "кіберзлочинність",
];

// ── Vietnamese (vi) ──────────────────────────────────────────────────────
const VI_KEYWORDS = [
  "rửa tiền", "rửa tiền bẩn", "tài trợ khủng bố",
  "gian lận", "lừa đảo", "hối lộ", "tham nhũng", "trốn thuế",
  "buôn bán ma túy", "ma túy", "buôn người", "mua bán người",
  "buôn lậu", "lệnh trừng phạt", "cấm vận",
  "phong tỏa tài sản", "tịch thu tài sản",
  "khủng bố", "tổ chức khủng bố",
  "bị bắt giữ", "bắt giam", "bị tạm giam", "giam giữ",
  "bị kết án", "kết tội", "bị cáo", "nghi can",
  "điều tra", "khám xét", "khởi tố",
  "tịch thu", "tống tiền", "tội phạm có tổ chức",
];

// ── Chinese (zh) ─────────────────────────────────────────────────────────
const ZH_KEYWORDS = [
  "洗钱", "反洗钱", "可疑交易",
  "恐怖融资", "资助恐怖主义", "恐怖主义",
  "欺诈", "诈骗", "金融欺诈", "电信诈骗",
  "贪污", "腐败", "贿赂", "受贿", "行贿", "回扣",
  "挪用公款", "侵占", "经济犯罪",
  "被捕", "被拘留", "被起诉", "被定罪", "判刑",
  "立案", "调查", "通缉", "潜逃",
  "刑事案件", "经济案件",
  "制裁", "经济制裁", "金融制裁", "资产冻结", "禁运",
  "违反制裁", "规避制裁", "美国制裁",
  "毒品走私", "贩毒", "毒品交易",
  "人口贩卖", "人口走私", "强迫劳动", "现代奴役",
  "有组织犯罪", "黑社会", "黑帮",
  "大规模杀伤性武器", "核扩散",
  "勒索软件", "网络攻击", "黑客攻击", "数据泄露",
];

// ─────────────────────────────────────────────────────────────────────────
// Tokenisers
// ─────────────────────────────────────────────────────────────────────────

/** Latin/Cyrillic/Devanagari/Hebrew — split on whitespace + punctuation,
 *  produce single tokens plus bigrams and trigrams for phrase matching. */
function whitespaceTokenize(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/['']/g, " ");
  const words = norm
    .split(/[\s.,;:!?"«»\(\)\[\]\/\\<>\-—–]+/u)
    .filter((w) => w.length > 0);
  const out = new Set<string>(words);
  for (let i = 0; i < words.length - 1; i++) {
    out.add(`${words[i]} ${words[i + 1]}`);
    if (i < words.length - 2) {
      out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }
  return out;
}

/** Arabic/Persian — strip diacritics, normalise letter forms, then
 *  whitespace-tokenise + bigrams. */
function arabicTokenize(text: string): Set<string> {
  const stripped = text
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[،؛؟]/g, " ");
  return whitespaceTokenize(stripped);
}

/** CJK/Japanese/Korean — character n-grams (2-4 chars) for languages
 *  with no reliable whitespace word boundaries. Also retains whitespace
 *  tokens for languages like Korean that do use spaces. */
function cjkTokenize(text: string): Set<string> {
  const out = new Set<string>();
  // Whitespace tokens for any spaced words
  const wsTokens = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  for (const t of wsTokens) out.add(t);
  // Character n-grams over the full text (stripped of spaces)
  const compact = text.replace(/\s+/g, "");
  for (let i = 0; i < compact.length; i++) {
    for (let n = 2; n <= 4; n++) {
      if (i + n <= compact.length) out.add(compact.slice(i, i + n));
    }
  }
  return out;
}

/** Thai — no whitespace word boundaries; character n-grams only. */
function thaiTokenize(text: string): Set<string> {
  const compact = text.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < compact.length; i++) {
    for (let n = 2; n <= 5; n++) {
      if (i + n <= compact.length) out.add(compact.slice(i, i + n));
    }
  }
  return out;
}

// Pre-normalise catalogues once so classify calls are cheap.
const AR_KEYWORDS_NORM = AR_KEYWORDS.map((k) =>
  k.replace(/[ً-ٰٟـ]/g, "").replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase(),
);
const DE_KEYWORDS_NORM = DE_KEYWORDS.map((k) => k.toLowerCase());
const EL_KEYWORDS_NORM = EL_KEYWORDS.map((k) => k.toLowerCase());
const ES_KEYWORDS_NORM = ES_KEYWORDS.map((k) => k.toLowerCase());
const FA_KEYWORDS_NORM = FA_KEYWORDS.map((k) =>
  k.replace(/[ً-ٰٟـ]/g, "").replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase(),
);
const FR_KEYWORDS_NORM = FR_KEYWORDS.map((k) => k.toLowerCase().replace(/['']/g, " ").replace(/\s+/g, " "));
const HE_KEYWORDS_NORM = HE_KEYWORDS.map((k) => k.toLowerCase());
const HI_KEYWORDS_NORM = HI_KEYWORDS.map((k) => k.toLowerCase());
const ID_KEYWORDS_NORM = ID_KEYWORDS.map((k) => k.toLowerCase());
const IT_KEYWORDS_NORM = IT_KEYWORDS.map((k) => k.toLowerCase());
const JA_KEYWORDS_NORM = JA_KEYWORDS; // Japanese already case-neutral
const KO_KEYWORDS_NORM = KO_KEYWORDS; // Korean already case-neutral
const NL_KEYWORDS_NORM = NL_KEYWORDS.map((k) => k.toLowerCase());
const PL_KEYWORDS_NORM = PL_KEYWORDS.map((k) => k.toLowerCase());
const PT_KEYWORDS_NORM = PT_KEYWORDS.map((k) => k.toLowerCase());
const RU_KEYWORDS_NORM = RU_KEYWORDS.map((k) => k.toLowerCase());
const SW_KEYWORDS_NORM = SW_KEYWORDS.map((k) => k.toLowerCase());
const TH_KEYWORDS_NORM = TH_KEYWORDS; // Thai already case-neutral
const TR_KEYWORDS_NORM = TR_KEYWORDS.map((k) => k.toLowerCase());
const UK_KEYWORDS_NORM = UK_KEYWORDS.map((k) => k.toLowerCase());
const VI_KEYWORDS_NORM = VI_KEYWORDS.map((k) => k.toLowerCase());
const ZH_KEYWORDS_NORM = ZH_KEYWORDS; // CJK already case-insensitive

export const I18N_PACKS: Record<SupportedLang, LangKeywordPack> = {
  ar: { lang: "ar", displayName: "Arabic",     keywords: AR_KEYWORDS_NORM, tokenize: arabicTokenize },
  de: { lang: "de", displayName: "German",     keywords: DE_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  el: { lang: "el", displayName: "Greek",      keywords: EL_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  es: { lang: "es", displayName: "Spanish",    keywords: ES_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  fa: { lang: "fa", displayName: "Persian",    keywords: FA_KEYWORDS_NORM, tokenize: arabicTokenize },
  fr: { lang: "fr", displayName: "French",     keywords: FR_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  he: { lang: "he", displayName: "Hebrew",     keywords: HE_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  hi: { lang: "hi", displayName: "Hindi",      keywords: HI_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  id: { lang: "id", displayName: "Indonesian", keywords: ID_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  it: { lang: "it", displayName: "Italian",    keywords: IT_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  ja: { lang: "ja", displayName: "Japanese",   keywords: JA_KEYWORDS_NORM, tokenize: cjkTokenize },
  ko: { lang: "ko", displayName: "Korean",     keywords: KO_KEYWORDS_NORM, tokenize: cjkTokenize },
  nl: { lang: "nl", displayName: "Dutch",      keywords: NL_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  pl: { lang: "pl", displayName: "Polish",     keywords: PL_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  pt: { lang: "pt", displayName: "Portuguese", keywords: PT_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  ru: { lang: "ru", displayName: "Russian",    keywords: RU_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  sw: { lang: "sw", displayName: "Swahili",    keywords: SW_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  th: { lang: "th", displayName: "Thai",       keywords: TH_KEYWORDS_NORM, tokenize: thaiTokenize },
  tr: { lang: "tr", displayName: "Turkish",    keywords: TR_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  uk: { lang: "uk", displayName: "Ukrainian",  keywords: UK_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  vi: { lang: "vi", displayName: "Vietnamese", keywords: VI_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  zh: { lang: "zh", displayName: "Chinese",    keywords: ZH_KEYWORDS_NORM, tokenize: cjkTokenize },
};

// ─────────────────────────────────────────────────────────────────────────
// Script detection — identifies dominant script to route to the right pack.
// ─────────────────────────────────────────────────────────────────────────

interface ScriptCounts {
  arabic: number;
  cyrillic: number;
  cjk: number;
  devanagari: number;
  greek: number;
  hangul: number;
  hebrew: number;
  hiragana: number;
  katakana: number;
  thai: number;
  latin: number;
  other: number;
}

function countScripts(text: string): ScriptCounts {
  const c: ScriptCounts = {
    arabic: 0, cyrillic: 0, cjk: 0, devanagari: 0, greek: 0,
    hangul: 0, hebrew: 0, hiragana: 0, katakana: 0, thai: 0,
    latin: 0, other: 0,
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0600 && cp <= 0x06FF) c.arabic++;
    else if (cp >= 0x0400 && cp <= 0x04FF) c.cyrillic++;
    else if (cp >= 0x4E00 && cp <= 0x9FFF) c.cjk++;
    else if (cp >= 0x0900 && cp <= 0x097F) c.devanagari++;
    else if (cp >= 0x0370 && cp <= 0x03FF) c.greek++;
    else if (cp >= 0xAC00 && cp <= 0xD7AF) c.hangul++;
    else if (cp >= 0x0590 && cp <= 0x05FF) c.hebrew++;
    else if (cp >= 0x3040 && cp <= 0x309F) c.hiragana++;
    else if (cp >= 0x30A0 && cp <= 0x30FF) c.katakana++;
    else if (cp >= 0x0E00 && cp <= 0x0E7F) c.thai++;
    else if ((cp >= 0x0041 && cp <= 0x007A) || (cp >= 0x00C0 && cp <= 0x024F)) c.latin++;
    else c.other++;
  }
  return c;
}

/** Persian-specific characters not present in Arabic: پ چ ژ گ */
const PERSIAN_RE = /[پچژگ]/u;

/** Detect dominant language/script. Returns ISO-639-1 code, "en", or "unknown". */
export function detectLanguage(text: string): SupportedLang | "en" | "unknown" {
  const c = countScripts(text);
  const total = c.arabic + c.cyrillic + c.cjk + c.devanagari + c.greek +
    c.hangul + c.hebrew + c.hiragana + c.katakana + c.thai + c.latin;
  if (total === 0) return "unknown";

  // Non-Latin unique scripts — high confidence at 30% threshold.
  if (c.arabic / total > 0.30)     return PERSIAN_RE.test(text) ? "fa" : "ar";
  if (c.hangul / total > 0.30)     return "ko";
  if ((c.hiragana + c.katakana) / total > 0.10) return "ja"; // Japanese kana at 10%
  if (c.cjk / total > 0.30)        return "zh";
  if (c.cyrillic / total > 0.30) {
    // Ukrainian has characters not in Russian: ї і є
    return /[їіє]/u.test(text) ? "uk" : "ru";
  }
  if (c.devanagari / total > 0.30) return "hi";
  if (c.greek / total > 0.30)      return "el";
  if (c.hebrew / total > 0.30)     return "he";
  if (c.thai / total > 0.30)       return "th";

  // Latin-script: disambiguate via distinctive diacritics.
  if (c.latin / total > 0.50) {
    // Turkish: İ (U+0130) ı (U+0131) Ğ/ğ (U+011E/F) are essentially unique.
    if (/[İıĞğ]/u.test(text)) return "tr";
    // German: ß is unique; ä ö ü also strongly indicative.
    if (/ß/u.test(text) || (/[äöü]/iu.test(text) && !/[ñãõàâçéèêëîïôûùü]/iu.test(text))) return "de";
    // Spanish: ñ or inverted punctuation ¡¿ are strong signals.
    if (/[ñ¡¿]/u.test(text)) return "es";
    // Polish: ą ę ś ź ż ć ń ó (combined — individual chars shared with others).
    if (/[ąęśźżćń]/u.test(text)) return "pl";
    // French: accent characters not shared with Portuguese/Spanish.
    if (/[àâçéèêëîïôûùüÿœæ]/i.test(text) && !/[ãõ]/u.test(text)) return "fr";
    // Portuguese: ã õ are distinctive.
    if (/[ãõ]/u.test(text)) return "pt";
    // Italian: common accented endings à è ì ò ù without ñ or ã.
    if (/[àèìòù]/u.test(text)) return "it";
    // Vietnamese: tone marks (combining diacritics on vowels).
    if (/[ắặằẩẫấầảẹẽếềệễể]/u.test(text)) return "vi";
    return "en";
  }
  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-language classifier
// ─────────────────────────────────────────────────────────────────────────

export interface I18nHit {
  lang: SupportedLang;
  keyword: string;
}

const ALL_LANGS: SupportedLang[] = [
  "ar", "de", "el", "es", "fa", "fr", "he", "hi",
  "id", "it", "ja", "ko", "nl", "pl", "pt", "ru",
  "sw", "th", "tr", "uk", "vi", "zh",
];

/** Classify an item against all i18n catalogues. Tries detected language
 *  first; if no hit scans every pack (cross-lingual articles do exist). */
export function classifyI18n(text: string): I18nHit[] {
  const detected = detectLanguage(text);
  const order: SupportedLang[] =
    (ALL_LANGS as string[]).includes(detected)
      ? [detected as SupportedLang, ...ALL_LANGS.filter((l) => l !== detected)]
      : ALL_LANGS;

  const hits: I18nHit[] = [];
  for (const lang of order) {
    const pack = I18N_PACKS[lang];
    const tokens = pack.tokenize(text);
    for (const k of pack.keywords) {
      if (tokens.has(k)) hits.push({ lang, keyword: k });
    }
    if (hits.length > 0 && lang === detected) break;
  }
  return hits;
}

/** All keywords across every i18n pack. Useful for seeding news-API queries. */
export function allI18nKeywords(): Array<{ lang: SupportedLang; keyword: string }> {
  const out: Array<{ lang: SupportedLang; keyword: string }> = [];
  for (const lang of ALL_LANGS) {
    for (const k of I18N_PACKS[lang].keywords) out.push({ lang, keyword: k });
  }
  return out;
}
