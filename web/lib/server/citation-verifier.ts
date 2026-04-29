// Citation verifier — post-pass over the MLRO Advisor's narrative.
//
// The advisor is system-prompted to cite primary regulatory sources
// inline (e.g. "FATF R.10", "FDL 10/2025 Art.16"). Models occasionally
// hallucinate plausible-sounding citations that don't exist. This
// verifier extracts every citation it can recognise and bucketises
// them into:
//
//   verified   — matched against the bundled reference catalogue
//   unknown    — looks like a citation but doesn't match any known
//                regulation / article / FATF rec
//
// "Unknown" is surfaced to the operator as a warning chip so they
// know to double-check the cite before relying on it. We deliberately
// do NOT auto-correct or remove unknown citations — the model may have
// found a real obscure citation our catalogue doesn't list. The
// operator decides.

export interface CitationCheck {
  raw: string;
  category:
    | "fatf_recommendation"
    | "uae_fdl"
    | "uae_cabinet_resolution"
    | "uae_moe_circular"
    | "eu_amld"
    | "uk_mlr"
    | "us_bsa"
    | "wolfsberg"
    | "lbma"
    | "oecd"
    | "basel"
    | "unscr"
    | "unknown";
  verified: boolean;
  note?: string;
}

export interface CitationReport {
  citations: CitationCheck[];
  verifiedCount: number;
  unknownCount: number;
  /** True when every recognised citation passed verification. False
   *  iff at least one citation looks regulatory but didn't match the
   *  catalogue — the UI should surface a warning chip. */
  allVerified: boolean;
}

// FATF Recommendations 1-40 are valid; anything 41+ is hallucinated.
const VALID_FATF_RECS = new Set(
  Array.from({ length: 40 }, (_, i) => i + 1),
);

// UAE Federal Decree-Law 10/2025 (and predecessor 20/2018) articles.
// Bundle the article numbers we know exist; an article number outside
// this set is flagged as unknown.
const VALID_FDL_10_2025_ARTS = new Set([
  // Definitions / scope
  1, 2, 3, 4, 5,
  // CDD / record-keeping
  16, 17, 18, 19, 20, 21,
  // STR / SAR / FFR / tipping-off
  22, 23, 24, 25, 26, 27, 28, 29,
  // FIU / sanctions / freezing
  30, 31, 32, 33, 34, 35,
  // Penalties
  36, 37, 38, 39, 40, 41, 42,
]);

// FDL 20/2018 was repealed by FDL 10/2025. We still recognise its
// shape so the verifier can SAY it's a real law that's been
// superseded — citing it in 2026+ is incorrect and the chip should
// flag it. The corresponding FDL 10/2025 article is usually 1:1
// equivalent (the UAE legislator preserved numbering for most CDD /
// STR / retention obligations) so the operator can usually just
// swap "20/2018" for "10/2025" in the model's answer.
const SUPERSEDED_FDL_20_2018_ARTS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26,
]);

const VALID_CABINET_RESOLUTIONS = new Set([
  // year-resolution pairs that exist
  "2025-134", "2025-156", "2024-58", "2020-74",
]);

const VALID_MOE_CIRCULARS = new Set([
  "2025-3", "2025-6", "2024-2",
]);

const VALID_AMLD = new Set([
  // Refers to the directive number (e.g. 5AMLD = 2018/843)
  "4AMLD", "5AMLD", "6AMLD",
]);

const VALID_UNSC = new Set([
  // UN Security Council resolutions commonly cited in AML/CFT
  "1267", "1373", "1452", "1456", "1540", "1718", "1737", "1988",
  "2231", "2253", "2270", "2356", "2371", "2375", "2397", "2462",
]);

interface Pattern {
  rx: RegExp;
  category: CitationCheck["category"];
  verify: (m: RegExpMatchArray) => { verified: boolean; note?: string };
}

const PATTERNS: Pattern[] = [
  // FATF Recommendation X — accepts "FATF R.10", "FATF Rec.10",
  // "FATF Recommendation 10". Captures the integer.
  {
    rx: /\bFATF\s+(?:Recommendation\s+|Rec\.?\s*|R\.?\s*)(\d+)\b/gi,
    category: "fatf_recommendation",
    verify: (m): { verified: boolean; note?: string } => {
      const n = Number(m[1]);
      const ok = VALID_FATF_RECS.has(n);
      return ok ? { verified: true } : { verified: false, note: `FATF only has Recs 1-40; cited R.${n}` };
    },
  },
  // FDL 10/2025 Art.X — "FDL 10/2025 Art.16", "Federal Decree-Law
  // No. (10) of 2025 Art. 16", etc.
  {
    rx: /\b(?:FDL|Federal\s+Decree[- ]Law)\s*(?:No\.?\s*\(?\s*)?(\d+)\)?\s*(?:\/|\s+of\s+)\s*(\d{4})(?:\s*Art\.?\s*(\d+))?/gi,
    category: "uae_fdl",
    verify: (m): { verified: boolean; note?: string } => {
      const law = m[1];
      const year = m[2];
      const art = m[3] ? Number(m[3]) : null;
      if (law === "10" && year === "2025") {
        if (art == null) return { verified: true };
        return VALID_FDL_10_2025_ARTS.has(art)
          ? { verified: true }
          : { verified: false, note: `FDL 10/2025 Art.${art} not in bundled article catalogue` };
      }
      if (law === "20" && year === "2018") {
        const recognised = art == null || SUPERSEDED_FDL_20_2018_ARTS.has(art);
        if (recognised) {
          return {
            verified: false,
            note: `FDL 20/2018 was repealed by FDL 10/2025 — cite the new law${art != null ? ` (likely FDL 10/2025 Art.${art})` : ""}`,
          };
        }
        return { verified: false, note: `FDL 20/2018 Art.${art} unknown (and the law has been repealed; cite FDL 10/2025)` };
      }
      return { verified: false, note: `FDL ${law}/${year} not in catalogue` };
    },
  },
  // UAE Cabinet Resolution N of YYYY
  {
    rx: /\bCabinet\s+(?:Resolution|Decision)\s+(?:No\.?\s*)?\(?\s*(\d+)\s*\)?\s*(?:of|\/)\s*(\d{4})/gi,
    category: "uae_cabinet_resolution",
    verify: (m): { verified: boolean; note?: string } => {
      const key = `${m[2]}-${m[1]}`;
      // Cabinet Resolution 10/2019 was the implementing regulation
      // for the now-repealed FDL 20/2018; it has been superseded by
      // Cabinet Resolution 134/2025. Flag it the same way as the
      // parent law so the chip alerts the operator.
      if (key === "2019-10") {
        return {
          verified: false,
          note: "Cabinet Resolution 10/2019 was the FDL 20/2018 implementing regulation — superseded by Cabinet Resolution 134/2025",
        };
      }
      return VALID_CABINET_RESOLUTIONS.has(key)
        ? { verified: true }
        : { verified: false, note: `Cabinet ${m[1]}/${m[2]} not in catalogue` };
    },
  },
  // MoE Circular N of YYYY
  {
    rx: /\bMoE\s+Circular\s+(?:No\.?\s*)?\(?\s*(\d+)\s*\)?\s*(?:of|\/)\s*(\d{4})/gi,
    category: "uae_moe_circular",
    verify: (m): { verified: boolean; note?: string } => {
      const key = `${m[2]}-${m[1]}`;
      return VALID_MOE_CIRCULARS.has(key)
        ? { verified: true }
        : { verified: false, note: `MoE Circular ${m[1]}/${m[2]} not in catalogue` };
    },
  },
  // EU AMLDs
  {
    rx: /\b([456])AMLD\b/gi,
    category: "eu_amld",
    verify: (m): { verified: boolean; note?: string } => {
      const tag = `${m[1]}AMLD`;
      return VALID_AMLD.has(tag) ? { verified: true } : { verified: false, note: `${tag} unknown` };
    },
  },
  // UK MLR 2017
  {
    rx: /\bMLR\s*2017\b/gi,
    category: "uk_mlr",
    verify: (): { verified: boolean } => ({ verified: true }),
  },
  // US BSA / Patriot Act
  {
    rx: /\b(?:Bank\s+Secrecy\s+Act|BSA|USA\s+PATRIOT\s+Act)\b/gi,
    category: "us_bsa",
    verify: (): { verified: boolean } => ({ verified: true }),
  },
  // Wolfsberg
  {
    rx: /\bWolfsberg\s+(?:Group\s+)?(?:Principles|Guidance|FAQ|Standards)\b/gi,
    category: "wolfsberg",
    verify: (): { verified: boolean } => ({ verified: true }),
  },
  // LBMA Responsible Gold Guidance
  {
    rx: /\bLBMA\s+(?:Responsible\s+Gold\s+Guidance|Step\s+\d|RGG)\b/gi,
    category: "lbma",
    verify: (): { verified: boolean } => ({ verified: true }),
  },
  // OECD Due Diligence Guidance
  {
    rx: /\bOECD\s+Due\s+Diligence\s+Guidance\b/gi,
    category: "oecd",
    verify: (): { verified: boolean } => ({ verified: true }),
  },
  // Basel Committee
  {
    rx: /\bBasel\s+(?:Committee|III|II)\b/gi,
    category: "basel",
    verify: (): { verified: boolean } => ({ verified: true }),
  },
  // UNSCR 1267 / 1373 / 1988 / 2231 etc.
  {
    rx: /\bUNSCR?\s*(?:Resolution\s+)?(\d{3,4})\b/gi,
    category: "unscr",
    verify: (m): { verified: boolean; note?: string } => {
      const num = m[1] ?? "";
      return VALID_UNSC.has(num)
        ? { verified: true }
        : { verified: false, note: `UNSCR ${num} not in catalogue` };
    },
  },
];

export function verifyCitations(text: string): CitationReport {
  const citations: CitationCheck[] = [];
  for (const p of PATTERNS) {
    p.rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.rx.exec(text)) !== null) {
      const v = p.verify(m);
      const check: CitationCheck = {
        raw: m[0],
        category: p.category,
        verified: v.verified,
        ...(v.note ? { note: v.note } : {}),
      };
      citations.push(check);
    }
  }
  // Dedupe by raw text — the same cite appearing twice still counts once.
  const seen = new Set<string>();
  const deduped = citations.filter((c) => {
    const key = `${c.category}::${c.raw.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const unknownCount = deduped.filter((c) => !c.verified).length;
  return {
    citations: deduped,
    verifiedCount: deduped.length - unknownCount,
    unknownCount,
    allVerified: unknownCount === 0,
  };
}
