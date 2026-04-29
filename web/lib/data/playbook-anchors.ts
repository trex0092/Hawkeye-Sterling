// Hawkeye Sterling — playbook ↔ regulatory-anchor inference.
//
// 169 mirror playbooks ship with `requiredAnchors: []` because the
// taxonomy↔playbook mapping is generated, not hand-authored. This module
// derives the regulatory anchors that each playbook discharges, by
// pattern-matching the playbook's name + summary against:
//   1. Explicit citations embedded in the name ("(FATF R.12)", "Art.20").
//   2. Topic keywords that map to a baseline anchor set.
//
// Anchors that don't exist in the catalogue are dropped silently — better
// to under-claim than to ship a dead reference. Output is pure (deterministic
// from input string) so coverage scoring is stable across renders.

import { ANCHORS, anchorIdForCitation, type RegulatoryAnchor } from "@/lib/data/anchors";
import type { Playbook } from "@/lib/data/playbooks";

// Citations that appear inline in playbook names (case-insensitive). The
// regex captures the canonical form expected by anchorIdForCitation.
const CITATION_REGEXES: ReadonlyArray<RegExp> = [
  /FATF\s*R\.?\s*(\d+)/gi,
  /FDL\s*10\/2025\s*Art\.?\s*(\d+)/gi,
  /FDL\s*45\/2021\s*Art\.?\s*(\d+)/gi,
  /Cabinet\s*Res\s*(\d+)\/(\d+)/gi,
  /UNSCR/gi,
  /OFAC\s*(SDN|50%)/gi,
  /goAML/gi,
  /OECD\s*DDG/gi,
  /LBMA\s*RGG\s*v9\s*Step\s*(\d)/gi,
  /VARA/gi,
  /CBUAE/gi,
];

// Topic → baseline anchor citations. Multi-citation entries discharge a
// playbook's full obligation set, not just the first match.
const TOPIC_RULES: ReadonlyArray<{
  match: RegExp;
  citations: string[];
}> = [
  // Sanctions / TFS
  { match: /\bsanctions?\b|\bSDN\b|\bTFS\b|\bfreeze\b|\bdesignat/i, citations: [
    "OFAC SDN List", "OFAC 50% Rule", "UNSC 1267 (Consolidated)", "EU CFSP Consolidated",
    "Cabinet Res 74/2020 Art.4-7",
  ]},
  // PEP
  { match: /\bPEP\b|politically exposed/i, citations: ["FATF R.12", "FDL 10/2025 Art.13"] },
  // Correspondent banking
  { match: /correspondent|nested/i, citations: ["FATF R.13"] },
  // Wire / travel rule
  { match: /\bwire\b|travel rule|EFT\b/i, citations: ["FATF R.16"] },
  // VASP / virtual / crypto / digital assets / NFT
  { match: /VASP|virtual asset|\bcrypto\b|NFT|digital asset/i, citations: ["FATF R.15", "VARA VASP Rulebook 2024"] },
  // STR / SAR / suspicion
  { match: /\bSTR\b|\bSAR\b|suspicio|tipping/i, citations: ["FATF R.20", "FATF R.21", "FDL 10/2025 Art.15", "FDL 10/2025 Art.16", "goAML XML Schema v4.0"] },
  // CDD / KYC / onboarding
  { match: /\bCDD\b|\bKYC\b|onboard|periodic review/i, citations: ["FATF R.10", "FDL 10/2025 Art.13"] },
  // UBO / beneficial owner / shell / complex structure
  { match: /UBO|beneficial owner|shell company|complex structure|legal arrangement|trust/i, citations: ["FATF R.24", "FATF R.25", "Cabinet Res 16/2021"] },
  // DPMS / precious metals / gold / refinery
  { match: /\bDPMS\b|precious metal|gold|refinery|smelter|bullion/i, citations: [
    "FATF R.22", "Cabinet Res 134/2025 Art.12-14", "MoE Circular 3/2025",
    "LBMA RGG v9 Step 1", "LBMA RGG v9 Step 2", "OECD DDG Annex II",
  ]},
  // CAHRA / conflict minerals
  { match: /CAHRA|conflict mineral|RMI|RMAP|3TG/i, citations: ["OECD DDG Annex II", "LBMA RGG v9 Step 2", "LBMA RGG v9 Step 3"] },
  // Real estate
  { match: /real estate|property/i, citations: ["FATF R.22", "FATF R.10"] },
  // NPO / charity
  { match: /\bNPO\b|charity|charit|non-profit|NGO/i, citations: ["FATF R.8"] },
  // TBML / trade finance
  { match: /TBML|trade-based|trade finance|letters? of credit|misinvoicing|over-?invoic/i, citations: ["FATF R.10", "FATF R.16"] },
  // Proliferation
  { match: /proliferation|dual-?use|WMD|chemical|nuclear/i, citations: ["FATF R.7", "Cabinet Res 74/2020 Art.4-7"] },
  // Transaction monitoring / structuring / cash threshold
  { match: /structuring|smurfing|cash threshold|transaction monit/i, citations: ["FATF R.10", "FDL 10/2025 Art.20"] },
  // Adverse media / lookback
  { match: /adverse media|lookback/i, citations: ["FDL 10/2025 Art.20", "FDL 10/2025 Art.24"] },
  // Record-keeping / audit
  { match: /record[- ]?keeping|retention|audit chain|tamper|evidence pack/i, citations: ["FDL 10/2025 Art.20", "FDL 10/2025 Art.24", "FATF R.11"] },
  // Four-eyes / dual approval / MLRO sign-off
  { match: /four-?eyes|dual approval|MLRO sign-?off|deputy MLRO/i, citations: ["FDL 10/2025 Art.46"] },
  // Data privacy / PDPL / breach
  { match: /PDPL|data protection|privacy|data breach/i, citations: ["FDL 45/2021 Art.6", "FDL 45/2021 Art.13"] },
  // Hawala / MSB
  { match: /hawala|MSB|money service|remittance|money transfer/i, citations: ["FATF R.16", "FATF R.10"] },
  // Tax / FCPA / bribery
  { match: /tax evasion|FCPA|bribery|corruption/i, citations: ["FATF R.10", "FATF R.20"] },
  // Insider / fraud / account takeover
  { match: /insider threat|internal fraud|account takeover|social engineering/i, citations: ["FATF R.20", "FDL 10/2025 Art.15"] },
  // Environmental crime
  { match: /environmental|illegal extraction|wildlife|illegal logging/i, citations: ["FATF R.20"] },
  // Insurance / private banking
  { match: /private banking|wealth management|insurance|life assurance/i, citations: ["FATF R.10", "FATF R.12"] },
  // Risk-based approach
  { match: /risk-?based|risk assessment|EWRA|BWRA/i, citations: ["FATF R.1"] },
];

// FATF baseline that every meaningful playbook should cite.
const BASELINE_CITATIONS: ReadonlyArray<string> = [
  "FATF R.1",          // RBA — universal
  "FATF R.10",         // CDD — universal
  "FDL 10/2025 Art.13", // UAE CDD — UAE primary law
];

export function inferAnchorIds(p: Pick<Playbook, "name" | "summary" | "triggers">): string[] {
  const haystack = [p.name, p.summary, ...(p.triggers ?? [])].join(" \n ");
  const citations = new Set<string>();

  // 1. Inline citations
  for (const rx of CITATION_REGEXES) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(haystack)) !== null) {
      const raw = m[0]!;
      const norm = normaliseCitation(raw);
      if (norm) citations.add(norm);
    }
  }

  // 2. Topic-based baselines
  for (const rule of TOPIC_RULES) {
    if (rule.match.test(haystack)) {
      for (const c of rule.citations) citations.add(c);
    }
  }

  // 3. Universal baseline if anything was matched at all
  if (citations.size > 0) {
    for (const c of BASELINE_CITATIONS) citations.add(c);
  }

  // Resolve to anchor IDs; drop unknowns.
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const c of citations) {
    const id = anchorIdForCitation(c);
    if (id && !seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
  }
  return ids.sort();
}

function normaliseCitation(raw: string): string | undefined {
  const r = raw.replace(/\s+/g, " ").trim();
  // FATF R.X → "FATF R.X"
  const fatf = /^FATF\s*R\.?\s*(\d+)$/i.exec(r);
  if (fatf) return `FATF R.${fatf[1]}`;
  const fdl1 = /^FDL\s*10\/2025\s*Art\.?\s*(\d+)$/i.exec(r);
  if (fdl1) return `FDL 10/2025 Art.${fdl1[1]}`;
  const fdl2 = /^FDL\s*45\/2021\s*Art\.?\s*(\d+)$/i.exec(r);
  if (fdl2) return `FDL 45/2021 Art.${fdl2[1]}`;
  const cab = /^Cabinet\s*Res\s*(\d+)\/(\d+)$/i.exec(r);
  if (cab) {
    // Try the most specific known forms first.
    const candidates = [
      `Cabinet Res ${cab[1]}/${cab[2]} Art.4-7`,
      `Cabinet Res ${cab[1]}/${cab[2]} Art.12-14`,
      `Cabinet Res ${cab[1]}/${cab[2]}`,
    ];
    for (const c of candidates) if (anchorIdForCitation(c)) return c;
    return undefined;
  }
  const ofac = /^OFAC\s*(SDN|50%)$/i.exec(r);
  if (ofac) return ofac[1] === "SDN" ? "OFAC SDN List" : "OFAC 50% Rule";
  const lbma = /^LBMA\s*RGG\s*v9\s*Step\s*(\d)$/i.exec(r);
  if (lbma) return `LBMA RGG v9 Step ${lbma[1]}`;
  if (/^UNSCR$/i.test(r)) return "UNSC 1267 (Consolidated)";
  if (/^goAML$/i.test(r)) return "goAML XML Schema v4.0";
  if (/^OECD\s*DDG$/i.test(r)) return "OECD DDG Annex II";
  if (/^VARA$/i.test(r)) return "VARA VASP Rulebook 2024";
  if (/^CBUAE$/i.test(r)) return "CBUAE AML Guidance 2023";
  return undefined;
}

/** Public helper: hydrate a playbook with its inferred required-anchor list. */
export function withInferredAnchors<P extends Pick<Playbook, "name" | "summary" | "triggers" | "requiredAnchors">>(p: P): P {
  if (p.requiredAnchors && p.requiredAnchors.length > 0) return p;
  return { ...p, requiredAnchors: inferAnchorIds(p) };
}

export function inferAnchorsForPlaybooks<P extends Pick<Playbook, "name" | "summary" | "triggers" | "requiredAnchors">>(
  list: readonly P[],
): P[] {
  return list.map((p) => withInferredAnchors(p));
}

/** Resolve anchor objects from a list of IDs, dropping unknowns. */
export function resolveAnchors(ids: readonly string[]): RegulatoryAnchor[] {
  const set = new Set(ids);
  return ANCHORS.filter((a) => set.has(a.id));
}
