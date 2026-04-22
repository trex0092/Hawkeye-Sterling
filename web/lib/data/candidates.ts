import type { QuickScreenCandidate } from "@/lib/api/quickScreen.types";

// Seeded corpus — a tiny reproducible cross-section of the six sanctions/watchlists
// Hawkeye Sterling screens against. Replace with live DB/ingest once the watchlist
// adapters in src/brain/watchlist-adapters.ts are wired to real feeds.
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
    listId: "OFAC-SDN",
    listRef: "OFAC-SDN-44102",
    name: "Crescent Refineries Jordan JSC",
    aliases: ["Crescent Refineries", "CRJ Holdings"],
    entityType: "organisation",
    jurisdiction: "JO",
    programs: ["NARCOTICS"],
  },
  {
    listId: "UN-1267",
    listRef: "UN-QDi.012",
    name: "Istanbul Altin Rafinesi A.S.",
    entityType: "organisation",
    jurisdiction: "TR",
    programs: ["ISIL-AQ"],
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
  {
    listId: "AE-EOCN",
    listRef: "EOCN-2024-041",
    name: "Kwame Asante-Boateng",
    aliases: ["K. Asante"],
    entityType: "individual",
    jurisdiction: "GH",
    programs: ["EOCN-DOMESTIC"],
  },
  {
    listId: "OFAC-SDN",
    listRef: "OFAC-SDN-55891",
    name: "Gramaltin A.S.",
    aliases: ["Gramaltin Refinery"],
    entityType: "organisation",
    jurisdiction: "TR",
    programs: ["SECONDARY-SANCTIONS"],
  },
  {
    listId: "UN-1267",
    listRef: "UN-QDe.145",
    name: "Fine Gold LLC",
    entityType: "organisation",
    jurisdiction: "AE",
    programs: ["GOLD-TRADE"],
  },
  {
    listId: "UK-OFSI",
    listRef: "UK-OFSI-OIL-1022",
    name: "Fortescue LLP",
    entityType: "organisation",
    jurisdiction: "IM",
    programs: ["UBO-OPAQUE"],
  },
];
