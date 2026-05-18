import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  classifyAdverseKeywords,
  adverseKeywordGroupCounts,
  type AdverseKeywordGroup,
} from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";
import { searchAllNewsWithStatus } from "@/lib/intelligence/newsAdapters";
// Dynamic imports from dist/ to prevent hard module-load failures when the
// brain compilation hasn't run yet (cold Lambda, partial build). Falls back
// to no-op implementations that return minimal scores so the route degrades
// gracefully instead of returning 500.
// EnsembleMatch mirrors src/brain/matching.ts EnsembleMatch interface so the
// stub and the real function share the same shape. The call site accesses
// `m.best.score` — the old stub returned `{score, method}` which meant
// `m.best` was always undefined when dist/ was not loaded, silently zeroing
// all fuzzy scores and falling through to the token-presence fallback only.
type MatchScore = { method: string; score: number; threshold: number; pass: boolean };
type EnsembleMatch = { subject: string; candidate: string; scores: MatchScore[]; best: MatchScore; phoneticAgreement: boolean };
type MatchEnsembleFn = (a: string, b: string) => EnsembleMatch;
type VariantsOfFn = (name: string) => string[];
let matchEnsemble: MatchEnsembleFn = (a, b) => {
  const exact = a.toLowerCase() === b.toLowerCase();
  const score: MatchScore = { method: "exact_fallback", score: exact ? 1 : 0, threshold: 1, pass: exact };
  return { subject: a, candidate: b, scores: [score], best: score, phoneticAgreement: false };
};
let variantsOf: VariantsOfFn = (name) => [name];
// Best-effort async load — if dist is present these replace the stubs.
(async () => {
  try {
    const [m, t] = await Promise.all([
      import("../../../../dist/src/brain/matching.js"),
      import("../../../../dist/src/brain/translit.js"),
    ]);
    if (typeof (m as { matchEnsemble?: unknown }).matchEnsemble === "function")
      matchEnsemble = (m as { matchEnsemble: MatchEnsembleFn }).matchEnsemble;
    if (typeof (t as { variantsOf?: unknown }).variantsOf === "function")
      variantsOf = (t as { variantsOf: VariantsOfFn }).variantsOf;
  } catch {
    // dist not built yet — stubs remain active
  }
})();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Module-level safety net — see /api/compliance-qa for rationale.
const REJECTION_GUARD_KEY = "__hsNewsSearchRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) return;
    console.error("[news-search] unhandled rejection", msg);
  });
}

// Free, no-key news crawl via Google News RSS.
// Optional upgrade path: set NEWSAPI_KEY for higher-quality coverage.

interface Article {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
  keywordGroups: string[];
  esgCategories: string[];
  severity: "clear" | "low" | "medium" | "high" | "critical";
  fuzzyScore: number;        // 0..100 — brain matchEnsemble against subject
  fuzzyMethod: string;       // levenshtein | jaro_winkler | soundex | token_set | ...
  matchedVariant?: string;   // variant that produced the top score
  lang: string;              // locale the article was fetched from (en, es, fr, ru, zh, ar, pt)
}

// Locales we poll Google News from. Adverse-media coverage for the same
// subject shows up in the local press of where events occur — English-only
// coverage misses 70%+ of regional reporting.
const LOCALES: Array<{ code: string; hl: string; gl: string; ceid: string }> = [
  { code: "en", hl: "en", gl: "US", ceid: "US:en" },
  { code: "es", hl: "es", gl: "ES", ceid: "ES:es" },
  { code: "fr", hl: "fr", gl: "FR", ceid: "FR:fr" },
  { code: "ru", hl: "ru", gl: "RU", ceid: "RU:ru" },
  { code: "zh", hl: "zh-Hans", gl: "CN", ceid: "CN:zh-Hans" },
  { code: "ar", hl: "ar", gl: "AE", ceid: "AE:ar" },
  { code: "pt", hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" },
  // Extended coverage — critical for subjects from these jurisdictions
  { code: "tr", hl: "tr", gl: "TR", ceid: "TR:tr" },
  { code: "de", hl: "de", gl: "DE", ceid: "DE:de" },
  { code: "it", hl: "it", gl: "IT", ceid: "IT:it" },
  { code: "ja", hl: "ja", gl: "JP", ceid: "JP:ja" },
  { code: "ko", hl: "ko", gl: "KR", ceid: "KR:ko" },
  { code: "nl", hl: "nl", gl: "NL", ceid: "NL:nl" },
  { code: "pl", hl: "pl", gl: "PL", ceid: "PL:pl" },
  { code: "uk", hl: "uk", gl: "UA", ceid: "UA:uk" },
  // Tier-2 jurisdictions — high-value for global AML coverage
  { code: "sv", hl: "sv", gl: "SE", ceid: "SE:sv" },
  { code: "el", hl: "el", gl: "GR", ceid: "GR:el" },
  { code: "hi", hl: "hi", gl: "IN", ceid: "IN:hi" },
  { code: "id", hl: "id", gl: "ID", ceid: "ID:id" },
  { code: "vi", hl: "vi", gl: "VN", ceid: "VN:vi" },
  { code: "ms", hl: "ms", gl: "MY", ceid: "MY:ms" },
  { code: "he", hl: "iw", gl: "IL", ceid: "IL:iw" },
  { code: "ro", hl: "ro", gl: "RO", ceid: "RO:ro" },
  { code: "hu", hl: "hu", gl: "HU", ceid: "HU:hu" },
  { code: "cs", hl: "cs", gl: "CZ", ceid: "CZ:cs" },
  { code: "bg", hl: "bg", gl: "BG", ceid: "BG:bg" },
  { code: "sr", hl: "sr", gl: "RS", ceid: "RS:sr" },
  { code: "hr", hl: "hr", gl: "HR", ceid: "HR:hr" },
  { code: "sk", hl: "sk", gl: "SK", ceid: "SK:sk" },
  { code: "th", hl: "th", gl: "TH", ceid: "TH:th" },
  { code: "ur", hl: "ur", gl: "PK", ceid: "PK:ur" },
  // Tier-3 — Baltic, Nordic, Caucasus, Africa, MENA extended
  { code: "lt", hl: "lt", gl: "LT", ceid: "LT:lt" },
  { code: "lv", hl: "lv", gl: "LV", ceid: "LV:lv" },
  { code: "et", hl: "et", gl: "EE", ceid: "EE:et" },
  { code: "fi", hl: "fi", gl: "FI", ceid: "FI:fi" },
  { code: "da", hl: "da", gl: "DK", ceid: "DK:da" },
  { code: "nb", hl: "no", gl: "NO", ceid: "NO:no" },
  { code: "az", hl: "az", gl: "AZ", ceid: "AZ:az" },
  { code: "ka", hl: "ka", gl: "GE", ceid: "GE:ka" },
  { code: "hy", hl: "hy", gl: "AM", ceid: "AM:hy" },
  { code: "kk", hl: "kk", gl: "KZ", ceid: "KZ:kk" },
  { code: "uz", hl: "uz", gl: "UZ", ceid: "UZ:uz" },
  { code: "mk", hl: "mk", gl: "MK", ceid: "MK:mk" },
  { code: "sq", hl: "sq", gl: "AL", ceid: "AL:sq" },
  { code: "sl", hl: "sl", gl: "SI", ceid: "SI:sl" },
  { code: "af", hl: "af", gl: "ZA", ceid: "ZA:af" },
  { code: "sw", hl: "sw", gl: "KE", ceid: "KE:sw" },
  { code: "bn", hl: "bn", gl: "BD", ceid: "BD:bn" },
  { code: "fa", hl: "fa", gl: "IR", ceid: "IR:fa" },
  // Tier-4 — remaining jurisdictions
  { code: "tl", hl: "tl", gl: "PH", ceid: "PH:tl" },
  { code: "is", hl: "is", gl: "IS", ceid: "IS:is" },
  { code: "mt", hl: "mt", gl: "MT", ceid: "MT:mt" },
  { code: "be", hl: "be", gl: "BY", ceid: "BY:be" },
  { code: "bs", hl: "bs", gl: "BA", ceid: "BA:bs" },
  { code: "ne", hl: "ne", gl: "NP", ceid: "NP:ne" },
  { code: "si", hl: "si", gl: "LK", ceid: "LK:si" },
  { code: "mn", hl: "mn", gl: "MN", ceid: "MN:mn" },
  { code: "my", hl: "my", gl: "MM", ceid: "MM:my" },
  { code: "km", hl: "km", gl: "KH", ceid: "KH:km" },
  // Tier-5 — remaining world languages
  { code: "lo", hl: "lo", gl: "LA", ceid: "LA:lo" },
  { code: "tg", hl: "tg", gl: "TJ", ceid: "TJ:tg" },
  { code: "am", hl: "am", gl: "ET", ceid: "ET:am" },
  { code: "so", hl: "so", gl: "SO", ceid: "SO:so" },
  { code: "ta", hl: "ta", gl: "IN", ceid: "IN:ta" },
  { code: "te", hl: "te", gl: "IN", ceid: "IN:te" },
  { code: "ml", hl: "ml", gl: "IN", ceid: "IN:ml" },
  { code: "gu", hl: "gu", gl: "IN", ceid: "IN:gu" },
  { code: "mr", hl: "mr", gl: "IN", ceid: "IN:mr" },
  { code: "pa", hl: "pa", gl: "IN", ceid: "IN:pa" },
  { code: "cy", hl: "cy", gl: "GB", ceid: "GB:cy" },
  { code: "ga", hl: "ga", gl: "IE", ceid: "IE:ga" },
  { code: "eu", hl: "eu", gl: "ES", ceid: "ES:eu" },
  { code: "ca", hl: "ca", gl: "ES", ceid: "ES:ca" },
  { code: "gl", hl: "gl", gl: "ES", ceid: "ES:gl" },
  { code: "zu", hl: "zu", gl: "ZA", ceid: "ZA:zu" },
  { code: "ky", hl: "ky", gl: "KG", ceid: "KG:ky" },
  { code: "tk", hl: "tk", gl: "TM", ceid: "TM:tk" },
  // Tier-6 — Indian regional + African languages + remaining
  { code: "or", hl: "or", gl: "IN", ceid: "IN:or" },
  { code: "kn", hl: "kn", gl: "IN", ceid: "IN:kn" },
  { code: "as", hl: "as", gl: "IN", ceid: "IN:as" },
  { code: "rw", hl: "rw", gl: "RW", ceid: "RW:rw" },
  { code: "yo", hl: "yo", gl: "NG", ceid: "NG:yo" },
  { code: "ha", hl: "ha", gl: "NG", ceid: "NG:ha" },
  { code: "ps", hl: "ps", gl: "AF", ceid: "AF:ps" },
  { code: "zh-TW", hl: "zh-TW", gl: "TW", ceid: "TW:zh-TW" },
  { code: "jv", hl: "jv", gl: "ID", ceid: "ID:jv" },
  { code: "ceb", hl: "ceb", gl: "PH", ceid: "PH:ceb" },
  { code: "ig", hl: "ig", gl: "NG", ceid: "NG:ig" },
  { code: "ny", hl: "ny", gl: "MW", ceid: "MW:ny" },
];

// Multi-language adverse-media modifiers so each locale returns relevant
// adverse articles. Expanded from the English AML keyword floor.
const LOCALE_MODIFIERS: Record<string, string> = {
  en: "sanctions OR fraud OR corruption OR bribery OR arrest OR laundering OR trafficking OR terrorism",
  es: "sanciones OR fraude OR corrupción OR soborno OR arresto OR blanqueo OR narcotráfico OR terrorismo",
  fr: "sanctions OR fraude OR corruption OR pot-de-vin OR arrestation OR blanchiment OR trafic OR terrorisme",
  ru: "санкции OR мошенничество OR коррупция OR взятка OR арест OR отмывание OR терроризм",
  zh: "制裁 OR 欺诈 OR 腐败 OR 贿赂 OR 逮捕 OR 洗钱 OR 贩运 OR 恐怖主义",
  ar: "عقوبات OR احتيال OR فساد OR رشوة OR اعتقال OR غسل OR تهريب OR إرهاب",
  pt: "sanções OR fraude OR corrupção OR suborno OR prisão OR lavagem OR tráfico OR terrorismo",
  tr: "yaptırım OR dolandırıcılık OR yolsuzluk OR rüşvet OR tutuklama OR kara para OR kaçakçılık OR terör",
  de: "Sanktionen OR Betrug OR Korruption OR Bestechung OR Verhaftung OR Geldwäsche OR Schmuggel OR Terrorismus",
  it: "sanzioni OR frode OR corruzione OR arresto OR riciclaggio OR traffico OR terrorismo",
  ja: "制裁 OR 詐欺 OR 汚職 OR 賄賂 OR 逮捕 OR マネーロンダリング OR 密輸 OR テロ",
  ko: "제재 OR 사기 OR 부패 OR 뇌물 OR 체포 OR 자금세탁 OR 밀수 OR 테러",
  nl: "sancties OR fraude OR corruptie OR omkoping OR arrestatie OR witwassen OR smokkel OR terrorisme",
  pl: "sankcje OR oszustwo OR korupcja OR łapówka OR aresztowanie OR pranie pieniędzy OR przemyt OR terroryzm",
  uk: "санкції OR шахрайство OR корупція OR хабар OR арешт OR відмивання OR тероризм",
  sv: "sanktioner OR bedrägeri OR korruption OR mutor OR gripna OR penningtvätt OR smuggling OR terrorism",
  el: "κυρώσεις OR απάτη OR διαφθορά OR δωροδοκία OR σύλληψη OR ξέπλυμα OR λαθρεμπόριο OR τρομοκρατία",
  hi: "प्रतिबंध OR धोखाधड़ी OR भ्रष्टाचार OR रिश्वत OR गिरफ्तारी OR मनी लॉन्ड्रिंग OR तस्करी OR आतंकवाद",
  id: "sanksi OR penipuan OR korupsi OR suap OR penangkapan OR pencucian uang OR penyelundupan OR terorisme",
  vi: "trừng phạt OR gian lận OR tham nhũng OR hối lộ OR bắt giữ OR rửa tiền OR buôn lậu OR khủng bố",
  ms: "sekatan OR penipuan OR rasuah OR rasuah OR tangkapan OR pengubahan wang haram OR penyeludupan OR keganasan",
  he: "סנקציות OR הונאה OR שחיתות OR שוחד OR מעצר OR הלבנת הון OR סחר OR טרור",
  ro: "sancțiuni OR fraudă OR corupție OR mită OR arest OR spălare de bani OR trafic OR terorism",
  hu: "szankciók OR csalás OR korrupció OR vesztegetés OR letartóztatás OR pénzmosás OR csempészet OR terrorizmus",
  cs: "sankce OR podvod OR korupce OR úplatek OR zatčení OR praní peněz OR pašování OR terorismus",
  bg: "санкции OR измама OR корупция OR подкуп OR арест OR изпиране на пари OR тероризъм",
  sr: "санкције OR превара OR корупција OR мито OR хапшење OR прање новца OR тероризам",
  hr: "sankcije OR prijevara OR korupcija OR mito OR uhićenje OR pranje novca OR terorizam",
  sk: "sankcie OR podvod OR korupcia OR úplatok OR zatýkanie OR pranie peňazí OR terorizmus",
  th: "มาตรการคว่ำบาตร OR การฉ้อโกง OR การทุจริต OR สินบน OR การจับกุม OR การฟอกเงิน OR การก่อการร้าย",
  ur: "پابندیاں OR دھوکہ دہی OR بدعنوانی OR رشوت OR گرفتاری OR منی لانڈرنگ OR اسمگلنگ OR دہشت گردی",
  lt: "sankcijos OR sukčiavimas OR korupcija OR kyšininkavimas OR suėmimas OR pinigų plovimas OR terorizmas",
  lv: "sankcijas OR krāpšana OR korupcija OR kukuļošana OR arests OR naudas atmazgāšana OR terorisms",
  et: "sanktsioonid OR pettus OR korruptsioon OR altkäemaks OR arreteerimine OR rahapesu OR terrorism",
  fi: "pakotteet OR petos OR korruptio OR lahjonta OR pidätys OR rahanpesu OR terrorismi",
  da: "sanktioner OR svig OR korruption OR bestikkelse OR anholdelse OR hvidvask OR terrorisme",
  nb: "sanksjoner OR svindel OR korrupsjon OR bestikkelse OR pågripelse OR hvitvasking OR terrorisme",
  az: "sanksiyalar OR dələduzluq OR korrupsiya OR rüşvətxorluq OR həbs OR pul yuyulması OR terrorizm",
  ka: "სანქციები OR თაღლითობა OR კორუფცია OR ქრთამი OR დაკავება OR ფულის გათეთრება OR ტერორიზმი",
  hy: "պատժամիջոցներ OR խարդախություն OR կոռուպցիա OR կաշառք OR ձերբակալություն OR փողերի լվացում OR ահաբեկչություն",
  kk: "санкциялар OR алдау OR сыбайластық OR пара алу OR тұтқындау OR ақша жуу OR терроризм",
  uz: "sanksiyalar OR firibgarlik OR korrupsiya OR pora OR hibsga olish OR pul yuvish OR terrorizm",
  mk: "санкции OR измама OR корупција OR поткуп OR апсење OR перење пари OR тероризам",
  sq: "sanksione OR mashtrim OR korrupsion OR ryshfet OR arrest OR pastrim parash OR terrorizëm",
  sl: "sankcije OR goljufija OR korupcija OR podkupovanje OR aretacija OR pranje denarja OR terorizem",
  af: "sanksies OR bedrog OR korrupsie OR omkopery OR arrestasie OR geldwassery OR terrorisme",
  sw: "vikwazo OR ulaghai OR ufisadi OR rushwa OR kukamatwa OR utakatishaji wa pesa OR ugaidi",
  bn: "নিষেধাজ্ঞা OR জালিয়াতি OR দুর্নীতি OR ঘুষ OR গ্রেফতার OR অর্থ পাচার OR সন্ত্রাসবাদ",
  fa: "تحریم OR تقلب OR فساد OR رشوه OR دستگیری OR پولشویی OR تروریسم",
  tl: "parusa OR pandaraya OR korapsyon OR suhol OR pagkakahuli OR paglalaba ng pera OR terorismo",
  is: "refsingar OR svik OR spillingur OR mútur OR handtaka OR peningaþvætti OR hryðjuverk",
  mt: "sanzjonijiet OR frodi OR korruzzjoni OR ħlas ta' flus OR arrest OR ħasil tal-flus OR terroriżmu",
  be: "санкцыі OR махлярства OR карупцыя OR хабар OR затрыманне OR адмыванне грошай OR тэрарызм",
  bs: "sankcije OR prijevara OR korupcija OR mito OR uhićenje OR pranje novca OR terorizam",
  ne: "प्रतिबन्ध OR ठगी OR भ्रष्टाचार OR घुस OR पक्राउ OR हराम धन OR आतंकवाद",
  si: "සිරකිරීම OR වංචාව OR දූෂණය OR අල්ලස OR අත්අඩංගුවට OR මුදල් විශුද්ධිකරණය OR ත්‍රස්තවාදය",
  mn: "хоригийн арга хэмжээ OR луйвар OR авлига OR хахуул OR баривчлах OR мөнгө угаах OR терроризм",
  my: "အပြစ်ပေးမှု OR လိမ်ညာမှု OR အဂတိ OR လာဘ်ငွေ OR ဖမ်းဆီး OR ငွေကြေးဖောက်ပြန်မှု OR အကြမ်းဖက်",
  km: "ទណ្ឌកម្ម OR ការបន្លំ OR អំពើពុករលួយ OR សំណូក OR ចាប់ខ្លួន OR ការលាងប្រាក់ OR អំពើភេរវកម្ម",
  lo: "ການລົງໂທດ OR ການສໍ້ໂກງ OR ການສໍ້ລາດບັງຫຼວງ OR ສິນບົນ OR ການຈັບກຸມ OR ການຟອກເງິນ OR ການກໍ່ການຮ້າຍ",
  tg: "таҳримҳо OR фиреб OR фасод OR ришва OR боздошт OR пулшӯӣ OR терроризм",
  am: "ማዕቀቦች OR ማጭበርበር OR ሙስና OR ጉቦ OR እስር OR የገንዘብ ማጠቢያ OR ሽብርተኝነት",
  so: "cunaqabataynta OR khiyaano OR musuqmaasuq OR la wareejin OR xarigga OR maylaynta lacagta OR argagixisada",
  ta: "தடைகள் OR மோசடி OR ஊழல் OR லஞ்சம் OR கைது OR பணமோசடி OR பயங்கரவாதம்",
  te: "ఆంక్షలు OR మోసం OR అవినీతి OR లంచం OR అరెస్ట్ OR మనీ లాండరింగ్ OR ఉగ్రవాదం",
  ml: "ഉപരോധങ്ങൾ OR തട്ടിപ്പ് OR അഴിമതി OR കൈക്കൂലി OR അറസ്റ്റ് OR മണി ലോണ്ടറിംഗ് OR തീവ്രവാദം",
  gu: "પ્રતિબંધો OR છેતરપિંડી OR ભ્રષ્ટાચાર OR લાંચ OR ધરપકડ OR મની લોન્ડરિંગ OR આતંકવાદ",
  mr: "निर्बंध OR फसवणूक OR भ्रष्टाचार OR लाच OR अटक OR मनी लॉन्ड्रिंग OR दहशतवाद",
  pa: "ਪਾਬੰਦੀਆਂ OR ਧੋਖਾਧੜੀ OR ਭ੍ਰਿਸ਼ਟਾਚਾਰ OR ਰਿਸ਼ਵਤ OR ਗ੍ਰਿਫ਼ਤਾਰੀ OR ਮਨੀ ਲਾਂਡਰਿੰਗ OR ਅੱਤਵਾਦ",
  cy: "sancsiynau OR twyll OR llygredd OR llwgrwobr OR arestio OR gwyngalchu arian OR terfysgaeth",
  ga: "smachtbhannaí OR calaois OR éilliú OR breabadóireacht OR gabhála OR sciúradh airgid OR sceimhlitheoireacht",
  eu: "zigorrak OR iruzurra OR ustelkeria OR eroskeria OR atxilotzea OR dirua zuritzea OR terrorismoa",
  ca: "sancions OR frau OR corrupció OR suborn OR detenció OR blanqueig de diners OR terrorisme",
  gl: "sancións OR fraude OR corrupción OR suborno OR detención OR branqueo de diñeiro OR terrorismo",
  zu: "izijeziso OR inkohliso OR ukuxhashazwa OR ukugweba OR ukuboshwa OR ukuhlanza imali OR ubugqilikazi",
  ky: "санкциялар OR алдамчылык OR коррупция OR пара алуу OR камоо алуу OR акча жуу OR терроризм",
  tk: "sanksiýalar OR aldamak OR korrupsiýa OR para almak OR tussag etmek OR pul ýuwmak OR terrorçylyk",
  or: "ନିଷେଧ OR ଜାଲିଆତି OR ଦୁର୍ନୀତି OR ଘୁଷ OR ଗ୍ରେଫ୍ତାର OR ଅର୍ଥ ଶୋଧ OR ଭୟଙ୍କରବାଦ",
  kn: "ನಿರ್ಬಂಧಗಳು OR ವಂಚನೆ OR ಭ್ರಷ್ಟಾಚಾರ OR ಲಂಚ OR ಬಂಧನ OR ಹಣ ಅಕ್ರಮಸಾಗಣೆ OR ಭಯೋತ್ಪಾದನೆ",
  as: "নিষেধাজ্ঞা OR প্ৰতাৰণা OR দুৰ্নীতি OR ঘুষ OR গ্ৰেপ্তাৰ OR ধন শোধন OR সন্ত্ৰাসবাদ",
  rw: "ibihano OR uburiganya OR ruswa OR ruswa OR gufungwa OR gukaraba amafaranga OR iterabwoba",
  yo: "ijiya OR ẹtan OR ibajẹ OR ẹṣẹ OR imuni OR fifọ owo OR ipanilaya",
  ha: "hukunci OR yaudara OR cin hanci OR cin hancin karfi OR kamawa OR wankan kudi OR ta'addanci",
  ps: "بندیزونه OR درغلي OR فساد OR رشوه OR نیول OR د پیسو وینځل OR ترهګري",
  "zh-TW": "制裁 OR 欺詐 OR 腐敗 OR 賄賂 OR 逮捕 OR 洗錢 OR 販運 OR 恐怖主義",
  jv: "sanksi OR penipuan OR korupsi OR suap OR penangkapan OR pencucian uang OR terorisme",
  ceb: "silot OR panlimbong OR korapsyon OR suhol OR pagdakop OR paglaba og kwarta OR terorismo",
  ig: "ntaramahụ OR aghụghọ OR ọ̀rụ ojii OR apaghị ala OR jide OR ịsa ego OR igbu ọchụ",
  ny: "chilango OR chinyengo OR chinyengo chachikulu OR chiphuphu OR kugwidwa OR kusamba ndalama OR uchifundo",
};

interface NewsResponse {
  ok: true;
  subject: string;
  articleCount: number;
  topSeverity: Article["severity"];
  keywordGroupCounts: Array<{ group: string; label: string; count: number }>;
  esgDomains: string[];
  articles: Article[];
  source: "google-news-rss" | "newsapi";
  languages: string[];
  fetchMode: "live" | "cached" | "static_fallback";
  fetchedAt: string;
  latencyMs: number;
}

function severityOrder(s: Article["severity"]): number {
  return { clear: 0, low: 1, medium: 2, high: 3, critical: 4 }[s];
}

function classifyArticleSeverity(
  hits: ReturnType<typeof classifyAdverseKeywords>,
): Article["severity"] {
  if (hits.length === 0) return "clear";
  // Critical groups → critical severity
  // Severity tiers mirror KEYWORD_GROUP_WEIGHT in super-brain/route.ts so
  // news-severity and composite score stay aligned. Weight ≥14 (and its
  // critical-regime neighbours) → critical/high; weight ≥10 → medium;
  // lower-weight informational groups (law-enforcement, political-exposure)
  // fall through to "low".
  const critical = new Set([
    "terrorism-financing",
    "proliferation-wmd",
    "regulatory-action",
  ]);
  const high = new Set([
    "money-laundering",
    "bribery-corruption",
    "organised-crime",
    "human-trafficking",
    "fraud-forgery",
    "environmental-crime",
  ]);
  const medium = new Set([
    "market-abuse",
    "tax-crime",
    "cybercrime",
    "insider-threat",
    "ai-misuse",
  ]);
  if (hits.some((h) => critical.has(h.group))) return "critical";
  if (hits.some((h) => high.has(h.group))) return "high";
  if (hits.some((h) => medium.has(h.group))) return "medium";
  return "low";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

// Sanitize RSS link fields: only allow https/http URLs — block javascript:,
// data: and other dangerous schemes that could execute as href values.
function sanitizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}

function parseRss(xml: string, subject: string, variants: string[], lang: string): Article[] {
  const items = xml.split(/<item>/i).slice(1);
  const out: Article[] = [];
  for (const raw of items) {
    const body = raw.split(/<\/item>/i)[0] ?? "";
    const pick = (tag: string): string => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m || !m[1]) return "";
      let v = m[1].trim();
      v = v.replace(/^<!\[CDATA\[|\]\]>$/g, "");
      return stripHtml(v);
    };
    const title = pick("title");
    const link = sanitizeLink(pick("link"));
    const pubDate = pick("pubDate");
    const source = pick("source") || pick("dc:creator") || "";
    const description = pick("description");
    if (!title && !description) continue;
    const snippet = description.slice(0, 300);
    const fullText = `${title} ${snippet}`;
    const kwHits = classifyAdverseKeywords(fullText);
    const esgHits = classifyEsg(fullText);

    // Fuzzy-match the article title against the subject + all name variants
    // using the brain's matchEnsemble (exact / levenshtein / jaro-winkler /
    // soundex / double-metaphone / token-set / trigram / partial-token-set).
    // Keep the best score so we can filter out false-positive hits.
    let fuzzyScore = 0;
    let fuzzyMethod = "—";
    let matchedVariant: string | undefined;
    const fullTextLower = fullText.toLowerCase();
    for (const v of variants) {
      try {
        const m = matchEnsemble(v, title);
        if (m?.best && m.best.score > fuzzyScore) {
          fuzzyScore = m.best.score;
          fuzzyMethod = m.best.method;
          matchedVariant = v === subject ? undefined : v;
        }
      } catch (err) {
        console.warn("[news-search] name-variant match failed:", err instanceof Error ? err.message : err);
      }
    }
    // Supplement: token presence in full text (title + snippet) catches
    // articles where the person's name appears in the body but not the
    // headline. Cap at 0.72 so a genuine title match always outranks it.
    if (fuzzyScore < 0.72) {
      for (const v of variants) {
        const vTokens = v.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
        if (vTokens.length === 0) continue;
        const hits = vTokens.filter((t) => fullTextLower.includes(t)).length;
        const tokenScore = (hits / vTokens.length) * 0.72;
        if (tokenScore > fuzzyScore) {
          fuzzyScore = tokenScore;
          fuzzyMethod = "token_presence";
          matchedVariant = v === subject ? undefined : v;
        }
      }
    }

    const article: Article = {
      title,
      link,
      pubDate,
      source,
      snippet,
      keywordGroups: Array.from(new Set(kwHits.map((h) => h.group))),
      esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
      severity: classifyArticleSeverity(kwHits),
      fuzzyScore: Math.round(fuzzyScore * 100),
      fuzzyMethod,
      lang,
    };
    if (matchedVariant) article.matchedVariant = matchedVariant;
    out.push(article);
  }
  return out;
}

// Per-locale RSS timeout. With 7 locales fanning out in parallel, any single
// stalled feed would otherwise hold up the whole response. A 2-second
// AbortSignal bounds each feed so the slowest locale is skipped rather than
// blocking the others.
const FEED_TIMEOUT_MS = 2_000;

// Overall timebox for the whole fan-out. We return with whatever articles
// have arrived by this deadline so a slow Google News cluster never burns
// the full 30s maxDuration budget.
const OVERALL_TIMEBOX_MS = 7_500;

async function fetchLocaleFeed(
  q: string,
  locale: (typeof LOCALES)[number],
  variants: string[],
): Promise<Article[]> {
  // Post-fetch fuzzy scoring (fuzzyScore ≥ 75, or ≥ 55 + adverse keywords)
  // is the relevance gate. Do not quote the query — exact-phrase quoting
  // causes zero results when a subject’s name has common spelling variants
  // (e.g. GIANUZZI vs GIANNUZZI). Google’s token matching handles near-miss
  // spellings; the post-fetch filter handles precision.
  const queryParam = q;
  const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(queryParam)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(feed, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; HawkeyeSterling/0.2; +https://hawkeye-sterling.netlify.app)",
        accept: "application/rss+xml,application/xml,text/xml,*/*;q=0.8",
      },
      signal: controller.signal,
    } as RequestInit);
    if (!res.ok) {
      console.warn(`[hawkeye] news-search/fetchLocaleFeed ${locale.code} HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseRss(xml, q, variants, locale.code);
  } catch (err) {
    console.warn(`[hawkeye] news-search/fetchLocaleFeed ${locale.code} threw:`, err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

function clusterArticles(articles: Article[]): Article[] {
  const clusters: Array<{ rep: Article; tokens: Set<string>; sources: Set<string> }> = [];
  for (const a of articles) {
    const toks = tokens(a.title);
    let absorbed = false;
    for (const c of clusters) {
      if (jaccard(toks, c.tokens) >= 0.7) {
        // Same event — keep the rep but record the source + escalate
        // severity if the absorbed article is higher-severity than the
        // representative. This avoids losing a "critical"-severity
        // Reuters wire under a "medium" Le Figaro restatement of the
        // same facts.
        if (severityOrder(a.severity) > severityOrder(c.rep.severity)) {
          c.rep.severity = a.severity;
        }
        if (a.source) c.sources.add(a.source);
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      clusters.push({ rep: a, tokens: toks, sources: new Set(a.source ? [a.source] : []) });
    }
  }
  return clusters.map((c) => {
    const extras = Array.from(c.sources).filter((s) => s && s !== c.rep.source);
    if (extras.length === 0) return c.rep;
    return {
      ...c.rep,
      source: c.rep.source
        ? `${c.rep.source} + ${extras.length} more`
        : extras.join(", "),
    };
  });
}

function emptyResponse(q: string, fetchMode: NewsResponse["fetchMode"] = "live", latencyMs = 0): NewsResponse {
  return {
    ok: true,
    subject: q,
    articleCount: 0,
    topSeverity: "clear",
    keywordGroupCounts: [],
    esgDomains: [],
    articles: [],
    source: "google-news-rss",
    languages: [],
    fetchMode,
    fetchedAt: new Date().toISOString(),
    latencyMs,
  };
}

const MAX_Q_LENGTH = 500;

export async function GET(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  // Gate the 7-locale RSS fan-out behind the per-key rate limiter.
  // Anonymous callers still get the free-tier burst window; without
  // this, a single user could trivially pin a Netlify Function into a
  // quota-exhaustion loop.
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { ok: false, error: "query `q` required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (q.length > MAX_Q_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "query `q` too long" },
      { status: 400, headers: gateHeaders },
    );
  }

  // From here down, any internal failure returns a well-formed empty
  // dossier with `ok: true` and HTTP 200. Adverse-media is a regulator-
  // facing panel — surfacing "server 502" / "news fetch failed" to an
  // MLRO is worse than surfacing zero articles with the neutral
  // "No articles found" empty state.

  // GOOGLE_NEWS_RSS_ENABLED can be set to "false" to disable live RSS fetches
  // (e.g. during testing or when rate-limited). Defaults to enabled.
  const rssEnabled = process.env["GOOGLE_NEWS_RSS_ENABLED"] !== "false";
  const fetchedAt = new Date().toISOString();

  if (!rssEnabled) {
    return NextResponse.json(
      { ...emptyResponse(q, "static_fallback", Date.now() - t0), fetchedAt },
      { headers: gateHeaders },
    );
  }

  try {
    // Build a variant set (transliterated, phonetic, corp-suffix-stripped)
    // so foreign-script and alias mentions still match.
    const rawVariants: string[] = [q];
    try {
      const v = variantsOf(q);
      for (const x of v) if (x && x !== q) rawVariants.push(x);
    } catch (err) {
      console.warn("[hawkeye] news-search/variantsOf failed — using base query only:", err);
    }
    // Turkish diacritic expansion: terminal 'c'→'ç' and 'öz' prefix are the two
    // most reliable heuristics for Turkish Latin names. Google News Turkish locale
    // normalises queries anyway, but explicit variants improve post-fetch fuzzy scoring.
    const turkishVariant = q
      .toLowerCase()
      .replace(/\boz/g, "öz")
      .replace(/c\b/g, "ç")
      .replace(/\bgul/g, "gül")
      .replace(/\bgun/g, "gün");
    if (turkishVariant !== q.toLowerCase()) rawVariants.push(turkishVariant);
    const variants = Array.from(new Set(rawVariants)).slice(0, 10);

    // Fan out to all locales + all configured news API adapters in parallel.
    // allSettled + per-feed AbortSignal + overall timebox ensures the function
    // always returns within ~7.5s, well inside the 30s maxDuration budget.
    const fanOut = Promise.allSettled(
      LOCALES.map((loc) => fetchLocaleFeed(q, loc, variants)),
    );
    const timebox = new Promise<PromiseSettledResult<Article[]>[]>((resolve) => {
      setTimeout(() => resolve(LOCALES.map(() => ({ status: "fulfilled", value: [] }))), OVERALL_TIMEBOX_MS);
    });
    // Run news API adapters (NewsAPI, GNews, Mediastack, OCCRP, etc.) in parallel
    // with the Google News RSS fan-out. Falls back to empty if no keys configured.
    const adapterSearch = searchAllNewsWithStatus(q, { limit: 30 }).catch(() => ({
      articles: [],
      sourcesSucceeded: [] as string[],
      sourcesFailed: [] as Array<{ name: string; error: string }>,
    }));
    const [settled, adapterResult] = await Promise.all([
      Promise.race([fanOut, timebox]),
      adapterSearch,
    ]);
    const perLocale: Article[][] = settled.map((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    const merged = new Map<string, Article>();
    for (const bucket of perLocale) {
      for (const a of bucket) {
        const key = a.link || a.title;
        if (!merged.has(key)) merged.set(key, a);
      }
    }
    // Convert NewsArticle (adapter shape) → Article (internal shape) and merge.
    for (const na of adapterResult.articles) {
      const key = na.url || na.title;
      if (merged.has(key)) continue;
      const fullText = `${na.title} ${na.snippet ?? ""}`;
      const kwHits = classifyAdverseKeywords(fullText);
      const esgHits = classifyEsg(fullText);
      const fullTextLower = fullText.toLowerCase();
      let fuzzyScore = 0;
      let fuzzyMethod = "token_presence";
      for (const v of variants) {
        const m = matchEnsemble(v, na.title);
        if (m?.best && m.best.score > fuzzyScore) {
          fuzzyScore = m.best.score;
          fuzzyMethod = m.best.method;
        }
        if (fuzzyScore < 0.72) {
          const vTokens = v.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
          if (vTokens.length > 0) {
            const hits = vTokens.filter((t) => fullTextLower.includes(t)).length;
            const ts = (hits / vTokens.length) * 0.72;
            if (ts > fuzzyScore) { fuzzyScore = ts; fuzzyMethod = "token_presence"; }
          }
        }
      }
      merged.set(key, {
        title: na.title,
        link: na.url,
        pubDate: na.publishedAt,
        source: `${na.source}/${na.outlet}`,
        snippet: na.snippet ?? "",
        keywordGroups: kwHits.map((k) => k.group),
        esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
        severity: classifyArticleSeverity(kwHits),
        fuzzyScore: Math.round(fuzzyScore * 100),
        fuzzyMethod,
        lang: na.language ?? "en",
      });
    }
    const filtered = Array.from(merged.values())
      // Fuzzy gate: require either a strong name match (≥75) OR a weak name
      // match (≥55) combined with at least one adverse keyword group. The OR-only
      // form (fuzzyScore≥55 OR keywords>0) was too permissive: generic gold-market
      // articles with no name match passed via keywords alone, polluting the
      // dossier with unrelated content and causing false-positive composite scores.
      .filter((a) => a.fuzzyScore >= 75 || (a.fuzzyScore >= 55 && a.keywordGroups.length > 0))
      .sort((a, b) => b.fuzzyScore - a.fuzzyScore);
    // Cluster near-duplicate articles into events. Two articles belong
    // to the same event when their normalised titles share ≥ 70% of
    // their token set — this collapses the same Reuters story syndicated
    // across Le Monde, RT and Reuters Arabic into a single dossier row.
    const parsed = clusterArticles(filtered).slice(0, 20);
    const topSeverity: Article["severity"] =
      parsed.reduce(
        (acc, a) => (severityOrder(a.severity) > severityOrder(acc) ? a.severity : acc),
        "clear" as Article["severity"],
      );
    const allKw = parsed.flatMap((a) =>
      a.keywordGroups.map((g) => ({ group: g as AdverseKeywordGroup, groupLabel: g, term: "", offset: 0 })),
    );
    const groupCounts = adverseKeywordGroupCounts(allKw);
    const esgDomains = Array.from(new Set(parsed.flatMap((a) => a.esgCategories)));
    const langCoverage = Array.from(new Set(parsed.map((a) => a.lang))).sort();
    const payload: NewsResponse = {
      ok: true,
      subject: q,
      articleCount: parsed.length,
      topSeverity,
      keywordGroupCounts: groupCounts.map((g) => ({
        group: g.group,
        label: g.label,
        count: g.count,
      })),
      esgDomains,
      articles: parsed,
      source: adapterResult.sourcesSucceeded.length > 0 ? "newsapi" : "google-news-rss",
      languages: langCoverage,
      fetchMode: "live",
      fetchedAt,
      latencyMs: Date.now() - t0,
    };
    return NextResponse.json(payload, { headers: gateHeaders });
  } catch (err) {
    // Last-resort safety net. The fan-out already uses allSettled +
    // per-feed timeouts so this branch should be unreachable, but if
    // variantsOf() or keyword classification ever throws we still return
    // a clean empty dossier rather than a 5xx that paints the panel red.
    console.error(
      "[hawkeye] news-search: top-level catch fired (was supposed to be unreachable). " +
      "Returning empty dossier; investigate variantsOf / keyword classification.",
      err,
    );
    return NextResponse.json({ ...emptyResponse(q, "static_fallback", Date.now() - t0), fetchedAt, degraded: true }, { headers: gateHeaders });
  }
}

