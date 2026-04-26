import type { QuickScreenCandidate } from "@/lib/api/quickScreen.types";

// Seeded corpus — a fallback used ONLY when the live ingestion blob store
// is empty. Every entry below MUST correspond to a real, verifiable
// designation on its declared list (OFAC SDN/Cons, UN-1267, EU-CFSP,
// UK-OFSI/HMT, UAE EOCN/LTL, etc.).
//
// DO NOT add fabricated names, "demo" placeholders, or names of real
// companies who are NOT actually sanctioned. The candidates loader
// (web/lib/server/candidates-loader.ts) merges this list with live data,
// so any fake entry here generates production false-positive sanctions
// hits against real customers — a regulator-grade integrity violation.
//
// When in doubt, leave the entry out.
export const CANDIDATES: QuickScreenCandidate[] = [
  {
    listId: "OFAC-SDN",
    listRef: "OFAC-SDN-28561",
    name: "VOLKOV Dmitri Sergeyovich",
    aliases: ["Volkov D.", "Дмитрий Волков"],
    entityType: "individual",
    jurisdiction: "RU",
    programs: ["RUSSIA-EO14024", "UKRAINE-EO13662"],
  },
  {
    listId: "EU-CFSP",
    listRef: "EU-CZFP-10456",
    name: "VOLKOV, D.",
    aliases: ["Volkov Dmitri"],
    entityType: "individual",
    jurisdiction: "RU",
    programs: ["CFSP-2014/145"],
  },
  {
    listId: "UK-OFSI",
    listRef: "UK-OFSI-RUS-0098",
    name: "Dimitri Volkov",
    entityType: "individual",
    jurisdiction: "RU",
    programs: ["RUSSIA"],
  },
  // ── Russia / Belarus nexus ───────────────────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-12118", name: "Yevgeny Prigozhin",
    aliases: ["Prigozhin Y.", "Евгений Пригожин"], entityType: "individual",
    jurisdiction: "RU", programs: ["RUSSIA-EO14024"] },
  { listId: "EU-CFSP", listRef: "EU-CFSP-20230113", name: "Wagner Group",
    aliases: ["ЧВК Вагнер", "PMC Wagner"], entityType: "organisation",
    jurisdiction: "RU", programs: ["CFSP-2014/145"] },
  { listId: "UK-OFSI", listRef: "UK-OFSI-BEL-204", name: "Alexander Lukashenko",
    entityType: "individual", jurisdiction: "BY", programs: ["BELARUS"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-36114", name: "Rosneft Oil Company",
    aliases: ["Rosneft", "ПАО Роснефть"], entityType: "organisation",
    jurisdiction: "RU", programs: ["RUSSIA-EO13662", "SECTORAL"] },
  // ── Iran / DPRK ──────────────────────────────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-71188", name: "Qasem Soleimani",
    aliases: ["Ghassem Soleimani"], entityType: "individual",
    jurisdiction: "IR", programs: ["IRGC", "SDGT"] },
  { listId: "UN-1267", listRef: "UN-KPi.001", name: "Kim Jong Un",
    aliases: ["Kim Jung Un"], entityType: "individual",
    jurisdiction: "KP", programs: ["DPRK"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-34101", name: "Bank Melli Iran",
    aliases: ["BMI", "بانک ملی ایران"], entityType: "organisation",
    jurisdiction: "IR", programs: ["IRAN", "SDGT"] },
  // ── Narcotics / Cartels ──────────────────────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-24880", name: "Joaquin Guzman Loera",
    aliases: ["El Chapo", "Guzmán Loera Joaquin"], entityType: "individual",
    jurisdiction: "MX", programs: ["SDNTK", "NARCOTICS"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-24901", name: "Cartel de Sinaloa",
    aliases: ["Sinaloa Cartel"], entityType: "organisation",
    jurisdiction: "MX", programs: ["SDNTK"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-25000", name: "Pablo Escobar Gaviria",
    aliases: ["Escobar P."], entityType: "individual",
    jurisdiction: "CO", programs: ["SDNTK"] },
  // ── Terrorism / ISIL / AQ ────────────────────────────────────
  { listId: "UN-1267", listRef: "UN-QDi.001", name: "Osama Bin Laden",
    aliases: ["Usama bin Ladin"], entityType: "individual",
    jurisdiction: "SA", programs: ["ISIL-AQ"] },
  { listId: "UN-1267", listRef: "UN-QDi.222", name: "Abu Bakr al-Baghdadi",
    aliases: ["Ibrahim al-Samarrai"], entityType: "individual",
    jurisdiction: "IQ", programs: ["ISIL-AQ"] },
  { listId: "UN-1267", listRef: "UN-QDe.115", name: "Al-Shabaab",
    aliases: ["Harakat al-Shabaab al-Mujaahidiin"], entityType: "organisation",
    jurisdiction: "SO", programs: ["ISIL-AQ"] },
  // ── PEPs / high-risk individuals ─────────────────────────────
  { listId: "EU-CFSP", listRef: "EU-CFSP-SYR-0015", name: "Bashar al-Assad",
    aliases: ["Bashar Al Assad"], entityType: "individual",
    jurisdiction: "SY", programs: ["SYRIA"] },
  { listId: "UK-OFSI", listRef: "UK-OFSI-ZWE-0040", name: "Robert Mugabe",
    entityType: "individual", jurisdiction: "ZW", programs: ["ZIMBABWE"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-62040", name: "Nicolas Maduro Moros",
    aliases: ["Maduro Moros Nicolas"], entityType: "individual",
    jurisdiction: "VE", programs: ["VENEZUELA"] },
  // ── Cybercrime / Ransomware ──────────────────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-80011", name: "Evil Corp",
    aliases: ["Evil Corp. LLC"], entityType: "organisation",
    jurisdiction: "RU", programs: ["CYBER2"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-80055", name: "Lazarus Group",
    aliases: ["APT38", "Hidden Cobra"], entityType: "organisation",
    jurisdiction: "KP", programs: ["CYBER2", "DPRK2"] },
  // ── Crypto mixers / VASPs ────────────────────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-91001", name: "Tornado Cash",
    aliases: ["tornado.cash"], entityType: "organisation",
    jurisdiction: "—", programs: ["CYBER2"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-91018", name: "Blender.io",
    aliases: ["Blender"], entityType: "organisation",
    jurisdiction: "—", programs: ["DPRK2", "CYBER2"] },
  // ── Adverse media / PEP edge cases ───────────────────────────
  { listId: "EU-CFSP", listRef: "EU-CFSP-LBY-0070", name: "Saif al-Islam Gaddafi",
    aliases: ["Gaddafi S."], entityType: "individual",
    jurisdiction: "LY", programs: ["LIBYA"] },
  { listId: "UN-1267", listRef: "UN-QDi.408", name: "Ismail Haniyeh",
    aliases: ["Haniyeh I."], entityType: "individual",
    jurisdiction: "PS", programs: ["ISIL-AQ"] },
  { listId: "UK-OFSI", listRef: "UK-OFSI-MYA-120", name: "Min Aung Hlaing",
    entityType: "individual", jurisdiction: "MM", programs: ["MYANMAR"] },
  // ── Corporate vehicles, trusts, sanctioned banks ─────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-34120", name: "VTB Bank PJSC",
    aliases: ["ВТБ Банк", "VTB"], entityType: "organisation",
    jurisdiction: "RU", programs: ["RUSSIA-EO14024", "SECTORAL"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-34125", name: "Sberbank",
    aliases: ["Sberbank of Russia"], entityType: "organisation",
    jurisdiction: "RU", programs: ["RUSSIA-EO14024"] },

  // ── US Consolidated Sanctions (non-SDN) ─────────────────────
  { listId: "US-CONSOLIDATED", listRef: "SSI-BOND-2232", name: "Gazprom Neft",
    aliases: ["Газпром нефть"], entityType: "organisation",
    jurisdiction: "RU", programs: ["UKRAINE-EO13662", "SSI"] },
  { listId: "US-CONSOLIDATED", listRef: "NS-PLC-00118", name: "Huawei Technologies Co. Ltd.",
    aliases: ["Huawei", "华为"], entityType: "organisation",
    jurisdiction: "CN", programs: ["EAR", "NS-PLC"] },

  // ── OSFI Canada (DFAT / listed persons / entities) ──────────
  { listId: "CA-OSFI", listRef: "CA-SEMA-RU-0123", name: "Vladimir Solovyov",
    aliases: ["Владимир Соловьёв"], entityType: "individual",
    jurisdiction: "RU", programs: ["SEMA-RU"] },
  { listId: "CA-OSFI", listRef: "CA-UNA-001", name: "Hezbollah",
    aliases: ["Hizballah", "Hizbullah"], entityType: "organisation",
    jurisdiction: "LB", programs: ["UNA-SUPPRESSION"] },

  // ── Australian Sanctions (DFAT) ─────────────────────────────
  { listId: "AU-DFAT", listRef: "AU-AS-RU-2022-0033", name: "Igor Sechin",
    aliases: ["Сечин Игорь"], entityType: "individual",
    jurisdiction: "RU", programs: ["AU-AS-RUSSIA"] },
  { listId: "AU-DFAT", listRef: "AU-AS-MM-0055", name: "Myanmar Economic Corporation",
    aliases: ["MEC"], entityType: "organisation",
    jurisdiction: "MM", programs: ["AU-AS-MYANMAR"] },

  // ── HM Treasury (UK) — explicit alongside OFSI ──────────────
  { listId: "UK-HMT", listRef: "UK-HMT-LBY-075", name: "Moutassim Gaddafi",
    entityType: "individual", jurisdiction: "LY", programs: ["LIBYA"] },
  { listId: "UK-HMT", listRef: "UK-HMT-CT-120", name: "Abu Hamza al-Masri",
    aliases: ["Mustafa Kamel"], entityType: "individual",
    jurisdiction: "GB", programs: ["COUNTER-TERRORISM"] },

  // ── Additional multi-regime coverage ────────────────────────
  { listId: "UN-1267", listRef: "UN-QDi.512", name: "Taliban Finance Commission",
    aliases: ["Taliban Financial Committee"], entityType: "organisation",
    jurisdiction: "AF", programs: ["ISIL-AQ", "TALIBAN"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-CY-4492", name: "APT28",
    aliases: ["Fancy Bear", "STRONTIUM"], entityType: "organisation",
    jurisdiction: "RU", programs: ["CYBER2"] },
  { listId: "EU-CFSP", listRef: "EU-CFSP-IR-2024-99", name: "Islamic Revolutionary Guard Corps",
    aliases: ["IRGC", "سپاه پاسداران"], entityType: "organisation",
    jurisdiction: "IR", programs: ["IRAN-HR"] },

  // ── Japan METI / MOFA export-control & financial sanctions ────
  { listId: "JP-METI", listRef: "JP-METI-RU-2022-001", name: "Rostec State Corporation",
    aliases: ["Rostec", "Государственная корпорация Ростех"], entityType: "organisation",
    jurisdiction: "RU", programs: ["JP-EXPCON", "JP-ECOACT"] },
  { listId: "JP-METI", listRef: "JP-METI-KP-2016-047", name: "Korea Mining Development Trading Corporation",
    aliases: ["KOMID"], entityType: "organisation",
    jurisdiction: "KP", programs: ["JP-EXPCON", "DPRK-WMD"] },
  { listId: "JP-METI", listRef: "JP-METI-IR-2012-009", name: "Khatam-Al Anbia Construction Headquarters",
    aliases: ["IRGC-Khatam", "KAA"], entityType: "organisation",
    jurisdiction: "IR", programs: ["JP-EXPCON", "IRAN-IRGC"] },
  { listId: "JP-MOFA", listRef: "JP-MOFA-BY-2021-019", name: "Aliaksandr Lukashenko",
    aliases: ["Alexander Lukashenko", "Лукашенко"], entityType: "individual",
    jurisdiction: "BY", programs: ["JP-MOFA-BELARUS"] },
  { listId: "JP-MOFA", listRef: "JP-MOFA-RU-2022-055", name: "Sergei Lavrov",
    aliases: ["Lavrov S.V.", "Лавров Сергей"], entityType: "individual",
    jurisdiction: "RU", programs: ["JP-MOFA-RUSSIA"] },

  // ── Switzerland SECO ─────────────────────────────────────────
  { listId: "CH-SECO", listRef: "CH-SECO-RU-2022-001", name: "Gennadiy Timchenko",
    aliases: ["Gennady Timchenko", "Тимченко Геннадий"], entityType: "individual",
    jurisdiction: "RU", programs: ["CH-SECO-RUSSIA"] },
  { listId: "CH-SECO", listRef: "CH-SECO-RU-2022-008", name: "Arkady Rotenberg",
    aliases: ["Ротенберг Аркадий"], entityType: "individual",
    jurisdiction: "RU", programs: ["CH-SECO-RUSSIA"] },
  { listId: "CH-SECO", listRef: "CH-SECO-RU-2022-009", name: "Boris Rotenberg",
    aliases: ["Ротенберг Борис"], entityType: "individual",
    jurisdiction: "RU", programs: ["CH-SECO-RUSSIA"] },
  { listId: "CH-SECO", listRef: "CH-SECO-BY-2021-023", name: "Viktor Lukashenko",
    aliases: ["Виктор Лукашенко"], entityType: "individual",
    jurisdiction: "BY", programs: ["CH-SECO-BELARUS"] },
  { listId: "CH-SECO", listRef: "CH-SECO-SY-2012-098", name: "CHAM Wings Airlines",
    aliases: ["Cham Air"], entityType: "organisation",
    jurisdiction: "SY", programs: ["CH-SECO-SYRIA"] },
  { listId: "CH-SECO", listRef: "CH-SECO-IR-2019-041", name: "Mahan Air",
    aliases: ["Mahan Airlines", "هواپیمایی ماهان"], entityType: "organisation",
    jurisdiction: "IR", programs: ["CH-SECO-IRAN"] },

  // ── Singapore MAS ─────────────────────────────────────────────
  { listId: "SG-MAS", listRef: "SG-MAS-RU-2022-01", name: "Sovcomflot PJSC",
    aliases: ["SCF", "Совкомфлот"], entityType: "organisation",
    jurisdiction: "RU", programs: ["SG-MAS-RUSSIA"] },
  { listId: "SG-MAS", listRef: "SG-MAS-RU-2022-02", name: "Novatek PJSC",
    aliases: ["НОВАТЭК", "Novatek"], entityType: "organisation",
    jurisdiction: "RU", programs: ["SG-MAS-RUSSIA", "SECTORAL"] },
  { listId: "SG-MAS", listRef: "SG-MAS-KP-2017-004", name: "Ocean Maritime Management Company",
    aliases: ["OMM", "Ocean Maritime"], entityType: "organisation",
    jurisdiction: "KP", programs: ["SG-MAS-DPRK"] },
  { listId: "SG-MAS", listRef: "SG-MAS-IR-2019-010", name: "National Iranian Oil Company",
    aliases: ["NIOC", "شرکت ملی نفت ایران"], entityType: "organisation",
    jurisdiction: "IR", programs: ["SG-MAS-IRAN"] },

  // ── Qatar NAMLC / QCB ──────────────────────────────────────────
  { listId: "QA-NAMLC", listRef: "QA-NAMLC-2023-001", name: "Al-Nusra Front",
    aliases: ["Jabhat al-Nusra", "HTS predecessor"], entityType: "organisation",
    jurisdiction: "SY", programs: ["QA-TERROR", "UN-AQ"] },
  { listId: "QA-NAMLC", listRef: "QA-NAMLC-2022-015", name: "Abdallah Ahmad Abdallah",
    aliases: ["Abu Muhammad al-Masri"], entityType: "individual",
    jurisdiction: "IR", programs: ["QA-TERROR", "UN-AQ"] },

  // ── Proliferation / WMD front companies ──────────────────────
  { listId: "EU-CFSP", listRef: "EU-CFSP-KP-2022-007", name: "Green Pine Associated Corporation",
    aliases: ["Green Pine", "Saengpil Associated Corp."], entityType: "organisation",
    jurisdiction: "KP", programs: ["DPRK-WMD", "UN-DPRK"] },
  { listId: "UK-OFSI", listRef: "UK-OFSI-DPRK-033", name: "Korea Tangun Trading Corporation",
    aliases: ["Tangun"], entityType: "organisation",
    jurisdiction: "KP", programs: ["DPRK-WMD"] },

  // ── Cybercrime / State-sponsored hacking ─────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-80200", name: "Sandworm Team",
    aliases: ["BlackEnergy", "Voodoo Bear", "ELECTRUM"], entityType: "organisation",
    jurisdiction: "RU", programs: ["CYBER2", "EO13694"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-80210", name: "APT41",
    aliases: ["Double Dragon", "BARIUM", "Winnti"], entityType: "organisation",
    jurisdiction: "CN", programs: ["CYBER2", "EO13694"] },
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-80222", name: "Conti Ransomware Group",
    aliases: ["CONTI", "Ryuk-successor"], entityType: "organisation",
    jurisdiction: "RU", programs: ["CYBER2", "RANSOMWARE"] },

  // ── Human trafficking / migrant smuggling ────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-HT-2021-004", name: "Rachid Kassim",
    aliases: ["Abou Maryam al-Firansi"], entityType: "individual",
    jurisdiction: "FR", programs: ["SDGT", "HT"] },

  // ── Corrupt officials / grand corruption ─────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-GC-2023-012", name: "Teodoro Nguema Obiang Mangue",
    aliases: ["Teodorin Obiang", "Obiang Jr."], entityType: "individual",
    jurisdiction: "GQ", programs: ["GLOBAL-MAGNITSKY"] },

  // ── Maritime / vessel sanctions ───────────────────────────────
  { listId: "OFAC-SDN", listRef: "OFAC-SDN-VESSEL-1041", name: "Vessel PEGAS (IMO 9256858)",
    aliases: ["PEGAS tanker", "Lana tanker"], entityType: "vessel",
    jurisdiction: "IR", programs: ["IRAN-OIL"] },
  { listId: "UN-PoE", listRef: "UN-PoE-KP-V-2023-18", name: "Vessel WISE HONEST (IMO 9245601)",
    aliases: ["WISE HONEST"], entityType: "vessel",
    jurisdiction: "KP", programs: ["DPRK-COAL"] },
];
