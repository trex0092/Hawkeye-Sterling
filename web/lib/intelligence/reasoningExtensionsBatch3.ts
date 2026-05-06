// Hawkeye Sterling — reasoning intelligence extensions (modules 22-71).
//
// 50 additional pure-function reasoning modules. Each addresses a
// specific compliance signal that World-Check / Dow Jones either
// expose differently or don't expose at all. All modules are
// dependency-free pure functions; consumers pass in inputs they
// already have from the screening pipeline + augmentation layers.
//
// Design conventions:
//   • Every module returns { score?: number; band?: string; signal: string; ... }
//   • Bands use consistent labels: "low" / "moderate" / "high" / "critical"
//     OR "stable" / "watch" / "elevated" / "imminent" depending on domain
//   • Pure functions; no fetch, no IO. Consumers are routes that
//     compose modules + IO. Keeps modules unit-testable and instant.

// ─────────────────────────────────────────────────────────────────────────
// 22. Behavioral risk modeling — peer-group anomaly detection
// ─────────────────────────────────────────────────────────────────────────
export interface BehavioralRiskInput {
  monthlyVolume: number;          // last-30d transaction volume (units = base ccy)
  peerGroupP50: number;           // peer-group median
  peerGroupP90: number;           // peer-group 90th percentile
  newAccount: boolean;             // <90 days
  countriesUsed: string[];
  baselineCountries: string[];     // historical countries
}
export function behavioralRisk(inp: BehavioralRiskInput): { score: number; band: "low" | "moderate" | "high" | "critical"; signals: string[]; signal: string } {
  const signals: string[] = [];
  let score = 0;
  if (inp.monthlyVolume > inp.peerGroupP90 * 2) {
    signals.push(`Volume ${(inp.monthlyVolume / inp.peerGroupP50).toFixed(1)}× peer median, ${(inp.monthlyVolume / inp.peerGroupP90).toFixed(1)}× peer-90`);
    score += 35;
  } else if (inp.monthlyVolume > inp.peerGroupP90) {
    signals.push(`Volume above peer 90th percentile`);
    score += 15;
  }
  const newCountries = inp.countriesUsed.filter((c) => !inp.baselineCountries.includes(c));
  if (newCountries.length >= 3) { signals.push(`${newCountries.length} new transit countries since baseline`); score += 25; }
  if (inp.newAccount && inp.monthlyVolume > inp.peerGroupP50 * 5) { signals.push("New-account high-volume — typical mule/structuring profile"); score += 30; }
  const band = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
  return { score, band, signals, signal: signals.length > 0 ? signals.join("; ") : "Behavior consistent with peer group." };
}

// ─────────────────────────────────────────────────────────────────────────
// 23. Ownership-graph cycle detector — disclosed-vs-actual UBO mismatch
// ─────────────────────────────────────────────────────────────────────────
export interface OwnershipEdge { parent: string; child: string; pct: number; }
export interface OwnershipCycleResult { hasCycle: boolean; cyclePath?: string[]; depth: number; signal: string; }
export function detectOwnershipCycle(edges: OwnershipEdge[]): OwnershipCycleResult {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.parent) ?? [];
    arr.push(e.child);
    adj.set(e.parent, arr);
  }
  let maxDepth = 0;
  for (const start of adj.keys()) {
    const stack: Array<{ node: string; path: string[] }> = [{ node: start, path: [start] }];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      maxDepth = Math.max(maxDepth, cur.path.length);
      for (const n of adj.get(cur.node) ?? []) {
        if (cur.path.includes(n)) {
          return { hasCycle: true, cyclePath: [...cur.path, n], depth: cur.path.length + 1,
            signal: `Ownership cycle detected: ${[...cur.path, n].join(" → ")}. Beneficial-owner disclosure cannot terminate at a natural person — escalate.` };
        }
        if (cur.path.length > 12) continue;
        stack.push({ node: n, path: [...cur.path, n] });
      }
    }
  }
  return { hasCycle: false, depth: maxDepth, signal: `Ownership chain is acyclic; max depth ${maxDepth}.` };
}

// ─────────────────────────────────────────────────────────────────────────
// 24. Transaction typology fingerprinting (FATF red flags)
// ─────────────────────────────────────────────────────────────────────────
export interface TransactionPattern {
  txCount30d: number;
  avgAmount: number;
  amountStdDev: number;
  reportingThreshold: number;       // e.g. 55_000 AED
  destinationCountries: string[];
  cashEvents: number;
}
export function detectTransactionTypology(p: TransactionPattern): { typologies: string[]; severity: "low" | "moderate" | "high"; signal: string } {
  const typologies: string[] = [];
  // Smurfing / structuring — many txns just below threshold
  const justUnder = p.avgAmount > p.reportingThreshold * 0.85 && p.avgAmount < p.reportingThreshold && p.amountStdDev < p.reportingThreshold * 0.05;
  if (justUnder && p.txCount30d > 5) typologies.push("smurfing-just-under-threshold");
  // Round-tripping
  if (p.destinationCountries.length === 1 && p.txCount30d > 20) typologies.push("single-corridor-high-frequency");
  // Cash-heavy
  if (p.cashEvents > p.txCount30d * 0.3) typologies.push("cash-heavy-pattern");
  // Funnel
  if (p.txCount30d > 50) typologies.push("high-velocity-funnel-candidate");
  const severity = typologies.length >= 2 ? "high" : typologies.length === 1 ? "moderate" : "low";
  return { typologies, severity, signal: typologies.length === 0 ? "No FATF typology fingerprints detected." : `FATF red-flag pattern(s): ${typologies.join(", ")}` };
}

// ─────────────────────────────────────────────────────────────────────────
// 25. Multi-LLM ensemble cross-check
// ─────────────────────────────────────────────────────────────────────────
export interface LlmFinding { model: string; confidence: number; verdict: "match" | "no_match" | "uncertain"; }
export function multiLlmConsensus(findings: LlmFinding[]): { agreement: "unanimous" | "majority" | "split"; consensusVerdict: "match" | "no_match" | "uncertain"; meanConfidence: number; signal: string } {
  if (findings.length === 0) return { agreement: "split", consensusVerdict: "uncertain", meanConfidence: 0, signal: "No LLM findings to fuse." };
  const counts: Record<string, number> = { match: 0, no_match: 0, uncertain: 0 };
  for (const f of findings) counts[f.verdict] = (counts[f.verdict] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  const consensusVerdict = top[0] as "match" | "no_match" | "uncertain";
  const agreement = top[1] === findings.length ? "unanimous" : top[1] > findings.length / 2 ? "majority" : "split";
  const meanConfidence = findings.reduce((s, f) => s + f.confidence, 0) / findings.length;
  return { agreement, consensusVerdict, meanConfidence: Math.round(meanConfidence * 100) / 100,
    signal: agreement === "unanimous" ? `${findings.length} LLM(s) unanimously: ${consensusVerdict}` : agreement === "majority" ? `${top[1]}/${findings.length} agreed: ${consensusVerdict}` : `LLMs split — escalate for human review` };
}

// ─────────────────────────────────────────────────────────────────────────
// 26. Evidence-weighting Bayesian update
// ─────────────────────────────────────────────────────────────────────────
export function bayesianUpdate(priorOdds: number, likelihoodRatio: number): { posteriorOdds: number; posteriorProbability: number; signal: string } {
  const posteriorOdds = priorOdds * likelihoodRatio;
  const posteriorProbability = posteriorOdds / (1 + posteriorOdds);
  return { posteriorOdds: Math.round(posteriorOdds * 100) / 100, posteriorProbability: Math.round(posteriorProbability * 100) / 100,
    signal: `Posterior probability ${(posteriorProbability * 100).toFixed(1)}% (LR=${likelihoodRatio}, prior odds=${priorOdds.toFixed(2)})` };
}

// ─────────────────────────────────────────────────────────────────────────
// 27. Structured-data corroboration — cross-vendor field consistency
// ─────────────────────────────────────────────────────────────────────────
export interface VendorField<T> { vendor: string; value: T | null; }
export function corroborateField<T>(fields: VendorField<T>[]): { agreed: number; disagreed: number; missing: number; majority: T | null; signal: string } {
  const present = fields.filter((f) => f.value !== null && f.value !== undefined);
  const counts = new Map<string, number>();
  for (const f of present) counts.set(JSON.stringify(f.value), (counts.get(JSON.stringify(f.value)) ?? 0) + 1);
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  const majority = top ? JSON.parse(top[0]) as T : null;
  const agreed = top?.[1] ?? 0;
  const disagreed = present.length - agreed;
  const missing = fields.length - present.length;
  return { agreed, disagreed, missing, majority,
    signal: disagreed === 0 ? `All ${agreed} vendors agree.` : `${agreed} vendors agree, ${disagreed} disagree, ${missing} missing — ${disagreed === 0 ? "high confidence" : "manual review"}` };
}

// ─────────────────────────────────────────────────────────────────────────
// 28. Duplicate-detection — same beneficial owner across customer book
// ─────────────────────────────────────────────────────────────────────────
export interface CustomerEntry { customerId: string; uboName: string; uboDob?: string; uboNationalId?: string; }
export function detectDuplicateUbos(entries: CustomerEntry[]): Array<{ ubo: string; customerIds: string[]; reason: string }> {
  const byKey = new Map<string, string[]>();
  for (const e of entries) {
    const k = (e.uboNationalId || `${e.uboName}|${e.uboDob ?? ""}`).toLowerCase();
    const arr = byKey.get(k) ?? [];
    arr.push(e.customerId);
    byKey.set(k, arr);
  }
  const dups: Array<{ ubo: string; customerIds: string[]; reason: string }> = [];
  for (const [k, ids] of byKey) {
    if (ids.length < 2) continue;
    dups.push({ ubo: k, customerIds: ids, reason: `${ids.length} customer accounts share UBO — verify legitimate or shell-customer pattern` });
  }
  return dups;
}

// ─────────────────────────────────────────────────────────────────────────
// 29. Vessel / IMO matching — maritime sanctions screening
// ─────────────────────────────────────────────────────────────────────────
export interface VesselMatch { imoNumber?: string; vesselName: string; flagState?: string; matchedSanctioned?: boolean; reason?: string; }
export function matchVessel(input: VesselMatch, sanctionedVessels: VesselMatch[]): { match: VesselMatch | null; band: "clear" | "watch" | "hit"; signal: string } {
  if (input.imoNumber) {
    const exact = sanctionedVessels.find((v) => v.imoNumber === input.imoNumber);
    if (exact) return { match: exact, band: "hit", signal: `IMO ${input.imoNumber} on sanctioned vessel list (${exact.reason ?? "designated"})` };
  }
  const nameMatch = sanctionedVessels.find((v) => v.vesselName.toLowerCase() === input.vesselName.toLowerCase());
  if (nameMatch) return { match: nameMatch, band: "watch", signal: `Vessel name match (no IMO confirmation) — verify identity` };
  return { match: null, band: "clear", signal: "No vessel match against sanctioned list." };
}

// ─────────────────────────────────────────────────────────────────────────
// 30. Aircraft / tail-number matching
// ─────────────────────────────────────────────────────────────────────────
export interface AircraftMatch { tailNumber: string; registration?: string; ownerName?: string; matchedSanctioned?: boolean; }
export function matchAircraft(input: AircraftMatch, sanctioned: AircraftMatch[]): { match: AircraftMatch | null; band: "clear" | "watch" | "hit"; signal: string } {
  const tail = sanctioned.find((a) => a.tailNumber.toUpperCase() === input.tailNumber.toUpperCase());
  if (tail) return { match: tail, band: "hit", signal: `Tail ${input.tailNumber} on sanctioned aircraft list` };
  if (input.ownerName) {
    const owner = sanctioned.find((a) => a.ownerName?.toLowerCase() === input.ownerName?.toLowerCase());
    if (owner) return { match: owner, band: "watch", signal: `Owner-name match: ${input.ownerName}` };
  }
  return { match: null, band: "clear", signal: "No aircraft match." };
}

// ─────────────────────────────────────────────────────────────────────────
// 31. Customs HS-code anomaly — TBML signal
// ─────────────────────────────────────────────────────────────────────────
export interface HsCodeInvoice { hsCode: string; declaredUnitPrice: number; sectorBandMin: number; sectorBandMax: number; }
export function detectHsCodeAnomaly(invoice: HsCodeInvoice): { anomalous: boolean; deviation: number; severity: "low" | "moderate" | "high"; signal: string } {
  const mid = (invoice.sectorBandMin + invoice.sectorBandMax) / 2;
  const deviation = mid > 0 ? (invoice.declaredUnitPrice - mid) / mid : 0;
  const absDev = Math.abs(deviation);
  const anomalous = absDev > 0.30;
  const severity = absDev > 1.0 ? "high" : absDev > 0.5 ? "moderate" : "low";
  return { anomalous, deviation: Math.round(deviation * 100) / 100, severity,
    signal: anomalous ? `HS-${invoice.hsCode}: declared price ${(deviation * 100).toFixed(0)}% from sector band — possible TBML over/under-invoicing` : `HS-${invoice.hsCode} price within sector band.` };
}

// ─────────────────────────────────────────────────────────────────────────
// 32. Jurisdiction-transit risk
// ─────────────────────────────────────────────────────────────────────────
export function assessTransitRoute(countries: string[], cahraSet: Set<string>, fatfBlackSet: Set<string>): { transitsCahra: number; transitsBlack: number; band: "low" | "elevated" | "high" | "critical"; signal: string } {
  const transitsCahra = countries.filter((c) => cahraSet.has(c.toUpperCase())).length;
  const transitsBlack = countries.filter((c) => fatfBlackSet.has(c.toUpperCase())).length;
  const band = transitsBlack > 0 ? "critical" : transitsCahra >= 2 ? "high" : transitsCahra === 1 ? "elevated" : "low";
  return { transitsCahra, transitsBlack, band,
    signal: transitsBlack > 0 ? `Transit route includes ${transitsBlack} FATF black-list jurisdiction(s)` : transitsCahra > 0 ? `Route transits ${transitsCahra} CAHRA jurisdiction(s)` : "Transit route through standard jurisdictions only" };
}

// ─────────────────────────────────────────────────────────────────────────
// 33. Corporate layering depth detector
// ─────────────────────────────────────────────────────────────────────────
export function detectLayering(ownershipDepth: number, jurisdictionsInChain: string[], offshoreSet: Set<string>): { offshoreLayers: number; suspicionScore: number; band: "low" | "moderate" | "high"; signal: string } {
  const offshoreLayers = jurisdictionsInChain.filter((j) => offshoreSet.has(j.toUpperCase())).length;
  let suspicionScore = 0;
  if (ownershipDepth >= 5) suspicionScore += 30;
  if (offshoreLayers >= 2) suspicionScore += 40;
  if (jurisdictionsInChain.length >= 4) suspicionScore += 20;
  const band = suspicionScore >= 60 ? "high" : suspicionScore >= 30 ? "moderate" : "low";
  return { offshoreLayers, suspicionScore, band,
    signal: band === "high" ? `Layering pattern: ${ownershipDepth}-deep chain through ${offshoreLayers} offshore tier(s) — typical opaque structure` : "Ownership structure within standard complexity." };
}

// ─────────────────────────────────────────────────────────────────────────
// 34. Nominee / straw-man director detector
// ─────────────────────────────────────────────────────────────────────────
export interface DirectorRecord { name: string; directorshipsCount: number; uniqueAddresses: number; }
export function detectNomineeDirector(d: DirectorRecord): { suspicion: "low" | "moderate" | "high"; signal: string } {
  if (d.directorshipsCount > 50 && d.uniqueAddresses === 1) return { suspicion: "high", signal: `${d.name}: ${d.directorshipsCount} directorships from a single address — strong nominee-director pattern` };
  if (d.directorshipsCount > 20) return { suspicion: "moderate", signal: `${d.name}: ${d.directorshipsCount} directorships — verify legitimate professional director vs nominee` };
  return { suspicion: "low", signal: `${d.name}: ${d.directorshipsCount} directorship(s); within normal range.` };
}

// ─────────────────────────────────────────────────────────────────────────
// 35. Round-date / suspicious incorporation date detector
// ─────────────────────────────────────────────────────────────────────────
export function detectRoundDateIncorporation(dateIso: string, peerCount?: number): { suspicious: boolean; reason: string; signal: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso);
  if (!m) return { suspicious: false, reason: "unparseable", signal: "Date not parseable." };
  const [, , mm, dd] = m;
  const isJan1 = mm === "01" && dd === "01";
  const isYearEnd = mm === "12" && dd === "31";
  const suspicious = (isJan1 || isYearEnd) && (peerCount ?? 0) > 100;
  return { suspicious, reason: isJan1 ? "Jan 1 incorporation" : isYearEnd ? "Dec 31 incorporation" : "regular date",
    signal: suspicious ? `${peerCount}+ companies incorporated on ${mm}/${dd} — typical bulk shell-company incorporation` : "Incorporation date is not a bulk-shell signal." };
}

// ─────────────────────────────────────────────────────────────────────────
// 36. Network centrality scoring — graph-theory degree centrality
// ─────────────────────────────────────────────────────────────────────────
export function networkCentrality(node: string, edges: Array<{ a: string; b: string }>): { degree: number; betweenness: number; band: "low" | "moderate" | "high"; signal: string } {
  const degree = edges.filter((e) => e.a === node || e.b === node).length;
  const allNodes = new Set<string>();
  for (const e of edges) { allNodes.add(e.a); allNodes.add(e.b); }
  const normalizedDeg = allNodes.size > 1 ? degree / (allNodes.size - 1) : 0;
  // Cheap betweenness proxy: count distinct neighbours-of-neighbours
  const directNeighbours = new Set<string>();
  for (const e of edges) {
    if (e.a === node) directNeighbours.add(e.b);
    if (e.b === node) directNeighbours.add(e.a);
  }
  const secondHop = new Set<string>();
  for (const e of edges) {
    if (directNeighbours.has(e.a) && e.b !== node) secondHop.add(e.b);
    if (directNeighbours.has(e.b) && e.a !== node) secondHop.add(e.a);
  }
  const betweenness = secondHop.size;
  const band = degree > 10 || normalizedDeg > 0.3 ? "high" : degree > 3 ? "moderate" : "low";
  return { degree, betweenness, band,
    signal: band === "high" ? `${node} is a network hub (degree ${degree}, ${betweenness} 2-hop neighbours) — review for layering / passthrough patterns` : `${node} is a peripheral node.` };
}

// ─────────────────────────────────────────────────────────────────────────
// 37. Crisis correlation — adverse-media spike during regional crisis
// ─────────────────────────────────────────────────────────────────────────
export function correlateCrisis(articleVolume: number, baselineVolume: number, regionalCrisisActive: boolean): { correlatedToCrisis: boolean; signal: string } {
  if (!regionalCrisisActive) return { correlatedToCrisis: false, signal: "No active regional crisis to correlate against." };
  const ratio = articleVolume / Math.max(1, baselineVolume);
  if (ratio > 3) return { correlatedToCrisis: true, signal: `Article volume ${ratio.toFixed(1)}× baseline during active regional crisis — coverage may be crisis-driven, weight tone signals accordingly.` };
  return { correlatedToCrisis: false, signal: "Article volume not unusually elevated despite active crisis." };
}

// ─────────────────────────────────────────────────────────────────────────
// 38. Address geocoding + risk overlay
// ─────────────────────────────────────────────────────────────────────────
export interface AddressRiskInput { country: string; addressType: "residential" | "commercial" | "po-box" | "free-zone" | "unknown"; nearSanctionedRegion: boolean; }
export function assessAddressRisk(a: AddressRiskInput): { score: number; band: "low" | "moderate" | "high"; signal: string } {
  let score = 0;
  if (a.addressType === "po-box") score += 25;
  if (a.addressType === "free-zone") score += 30;
  if (a.nearSanctionedRegion) score += 40;
  const band = score >= 60 ? "high" : score >= 30 ? "moderate" : "low";
  return { score, band, signal: score === 0 ? "Standard address." : `Address risk: ${a.addressType}${a.nearSanctionedRegion ? ", near sanctioned region" : ""}` };
}

// ─────────────────────────────────────────────────────────────────────────
// 39. Peer-group risk profiling — outlier vs same-segment customers
// ─────────────────────────────────────────────────────────────────────────
export function peerGroupOutlier(value: number, peerValues: number[]): { zScore: number; isOutlier: boolean; signal: string } {
  if (peerValues.length < 5) return { zScore: 0, isOutlier: false, signal: "Insufficient peer data." };
  const mean = peerValues.reduce((s, v) => s + v, 0) / peerValues.length;
  const variance = peerValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / peerValues.length;
  const stdDev = Math.sqrt(variance);
  const zScore = stdDev > 0 ? (value - mean) / stdDev : 0;
  const isOutlier = Math.abs(zScore) > 2.5;
  return { zScore: Math.round(zScore * 100) / 100, isOutlier,
    signal: isOutlier ? `Subject is ${zScore.toFixed(1)}σ from peer-group mean — outlier; review for explainable rationale` : "Subject within peer-group norm." };
}

// ─────────────────────────────────────────────────────────────────────────
// 40. LLM rationale-consistency check
// ─────────────────────────────────────────────────────────────────────────
export function rationaleConsistency(rationales: string[]): { agreement: number; signal: string } {
  if (rationales.length < 2) return { agreement: 1, signal: "Need at least 2 rationales to compare." };
  const tokenSets = rationales.map((r) => new Set(r.toLowerCase().split(/\s+/).filter((t) => t.length > 4)));
  let totalIntersection = 0;
  let totalUnion = 0;
  for (let i = 0; i < tokenSets.length - 1; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const intersection = [...tokenSets[i]!].filter((t) => tokenSets[j]!.has(t)).length;
      const union = new Set([...tokenSets[i]!, ...tokenSets[j]!]).size;
      totalIntersection += intersection;
      totalUnion += union;
    }
  }
  const agreement = totalUnion > 0 ? totalIntersection / totalUnion : 0;
  return { agreement: Math.round(agreement * 100) / 100,
    signal: agreement > 0.7 ? `LLM rationales are consistent (Jaccard ${(agreement * 100).toFixed(0)}%)` : agreement > 0.4 ? `Moderate rationale drift — review which version is canonical` : "Rationales materially disagree — model output is unstable" };
}

// ─────────────────────────────────────────────────────────────────────────
// 41. Mirror-trade pattern detection
// ─────────────────────────────────────────────────────────────────────────
export interface TradePair { buyAt: string; sellAt: string; symbol: string; amount: number; venueA: string; venueB: string; }
export function detectMirrorTrade(pairs: TradePair[]): { hasMirrorPattern: boolean; matchedPairs: number; signal: string } {
  let matched = 0;
  for (let i = 0; i < pairs.length - 1; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const a = pairs[i]!, b = pairs[j]!;
      if (a.symbol !== b.symbol) continue;
      if (Math.abs(a.amount - b.amount) > 0.01 * a.amount) continue;
      if (a.venueA === b.venueB && a.venueB === b.venueA) matched++;
    }
  }
  return { hasMirrorPattern: matched > 0, matchedPairs: matched,
    signal: matched > 0 ? `${matched} mirror-trade pair(s) detected — typical wash-trade / capital-controls evasion` : "No mirror-trade pattern detected." };
}

// ─────────────────────────────────────────────────────────────────────────
// 42. VAT carousel / missing-trader detector
// ─────────────────────────────────────────────────────────────────────────
export interface VatCarouselInput { tradeChainLength: number; sameGoodCirculations: number; intraEuVatLossClaim: boolean; supplierMissingFiles: boolean; }
export function detectVatCarousel(inp: VatCarouselInput): { score: number; signal: string } {
  let score = 0;
  if (inp.intraEuVatLossClaim && inp.supplierMissingFiles) score += 50;
  if (inp.sameGoodCirculations >= 3) score += 30;
  if (inp.tradeChainLength >= 5) score += 20;
  return { score, signal: score >= 50 ? `VAT carousel signature score ${score}/100 — escalate for fiscal-crime referral` : "No VAT-carousel signature detected." };
}

// ─────────────────────────────────────────────────────────────────────────
// 43. Invoice timing anomaly
// ─────────────────────────────────────────────────────────────────────────
export function invoiceTimingAnomaly(invoiceDates: string[]): { hasWeekendCluster: boolean; hasMonthEndCluster: boolean; signal: string } {
  let weekend = 0, monthEnd = 0;
  for (const d of invoiceDates) {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) continue;
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) weekend++;
    if (dt.getDate() >= 28) monthEnd++;
  }
  const hasWeekendCluster = weekend > invoiceDates.length * 0.4;
  const hasMonthEndCluster = monthEnd > invoiceDates.length * 0.5;
  return { hasWeekendCluster, hasMonthEndCluster,
    signal: hasWeekendCluster ? "Heavy weekend invoicing — review staffing / authorisation" : hasMonthEndCluster ? "Heavy month-end invoicing — review for revenue-smoothing pattern" : "Invoice timing distribution looks normal." };
}

// ─────────────────────────────────────────────────────────────────────────
// 44. Ship-manifest risk scoring
// ─────────────────────────────────────────────────────────────────────────
export interface ManifestRow { hsCode: string; commodity: string; weightKg: number; declaredValueUsd: number; portFrom: string; portTo: string; }
export function scoreManifest(m: ManifestRow, dualUseHsSet: Set<string>, sanctionedPorts: Set<string>): { score: number; signal: string } {
  let score = 0;
  if (dualUseHsSet.has(m.hsCode)) score += 40;
  if (sanctionedPorts.has(m.portFrom) || sanctionedPorts.has(m.portTo)) score += 50;
  if (m.weightKg > 0 && m.declaredValueUsd / m.weightKg < 0.5) score += 30;       // under-valued / scrap-pricing
  return { score, signal: score >= 60 ? `Manifest risk ${score}/100 — dual-use / sanctioned-port / under-valuation flag` : "Manifest within normal parameters." };
}

// ─────────────────────────────────────────────────────────────────────────
// 45. Container screening — blocked container ID matching
// ─────────────────────────────────────────────────────────────────────────
export function matchContainer(containerId: string, blocked: Set<string>): { blocked: boolean; signal: string } {
  const id = containerId.toUpperCase().replace(/\s+/g, "");
  return blocked.has(id) ? { blocked: true, signal: `Container ${id} on sanctioned-container blocklist` } : { blocked: false, signal: "Container not on blocklist." };
}

// ─────────────────────────────────────────────────────────────────────────
// 46. Crypto wash-trading detector
// ─────────────────────────────────────────────────────────────────────────
export function detectCryptoWashTrade(buyAddresses: string[], sellAddresses: string[], commonControllerHints: string[]): { suspicious: boolean; signal: string } {
  const buySet = new Set(buyAddresses);
  const overlap = sellAddresses.filter((a) => buySet.has(a)).length;
  const sameController = commonControllerHints.length > 0;
  const suspicious = overlap > 0 || sameController;
  return { suspicious, signal: suspicious ? `Wash-trade signal: ${overlap} address(es) on both buy + sell sides${sameController ? `, common controller hints (${commonControllerHints.length})` : ""}` : "No wash-trade overlap detected." };
}

// ─────────────────────────────────────────────────────────────────────────
// 47. Structuring-schedule detector
// ─────────────────────────────────────────────────────────────────────────
export function detectStructuringSchedule(amounts: number[], threshold: number): { hits: number; pctJustUnder: number; signal: string } {
  if (amounts.length === 0) return { hits: 0, pctJustUnder: 0, signal: "No deposits to analyse." };
  const justUnder = amounts.filter((a) => a > threshold * 0.85 && a < threshold).length;
  const pct = justUnder / amounts.length;
  return { hits: justUnder, pctJustUnder: Math.round(pct * 100) / 100,
    signal: pct > 0.4 ? `${(pct * 100).toFixed(0)}% of deposits sit just below ${threshold} threshold — structuring/smurfing signature` : "Deposit distribution does not concentrate below threshold." };
}

// ─────────────────────────────────────────────────────────────────────────
// 48. Loan-fraud pattern detector
// ─────────────────────────────────────────────────────────────────────────
export function detectLoanFraud(stated: { income: number; employmentYears: number; }, observed: { recentInflows: number; payrollDeposits: number; }): { score: number; signal: string } {
  const incomeRatio = observed.recentInflows / Math.max(1, stated.income / 12);
  let score = 0;
  if (incomeRatio < 0.4) score += 50;       // observed inflows much lower than stated
  if (observed.payrollDeposits === 0 && stated.employmentYears > 0) score += 40;
  return { score, signal: score >= 50 ? `Loan-app inconsistency ${score}/100 — verify income/employment with primary documents` : "Stated income consistent with observed flows." };
}

// ─────────────────────────────────────────────────────────────────────────
// 49. Charity / TF risk for non-profits
// ─────────────────────────────────────────────────────────────────────────
export function charityTfRisk(npo: { jurisdiction: string; recipientCountries: string[]; cashDistributionsPct: number; }): { score: number; signal: string } {
  let score = 0;
  if (npo.cashDistributionsPct > 50) score += 30;
  const cahraSet = new Set(["AF", "SY", "SO", "YE", "IQ", "PK", "ML", "BF", "NE"]);
  const cahraDestinations = npo.recipientCountries.filter((c) => cahraSet.has(c.toUpperCase())).length;
  score += cahraDestinations * 15;
  return { score, signal: score > 50 ? `NPO TF-risk ${score}/100 — cash-heavy distributions to ${cahraDestinations} CAHRA destination(s)` : "NPO profile within standard TF parameters." };
}

// ─────────────────────────────────────────────────────────────────────────
// 50. Gemstone / DPMS specific TBML signal
// ─────────────────────────────────────────────────────────────────────────
export function gemstoneDpmsRisk(invoice: { commodity: string; declaredCaratPrice: number; marketCaratPriceMid: number; chainOfCustodyComplete: boolean; }): { score: number; signal: string } {
  let score = 0;
  if (!invoice.chainOfCustodyComplete) score += 50;
  const dev = Math.abs(invoice.declaredCaratPrice - invoice.marketCaratPriceMid) / Math.max(1, invoice.marketCaratPriceMid);
  if (dev > 0.4) score += 40;
  return { score, signal: score > 50 ? `DPMS gemstone risk ${score}/100 — ${!invoice.chainOfCustodyComplete ? "chain-of-custody gap; " : ""}${dev > 0.4 ? `price deviates ${(dev * 100).toFixed(0)}% from market` : ""}` : "Gemstone pricing + chain-of-custody within tolerance." };
}

// ─────────────────────────────────────────────────────────────────────────
// 51-71. Compact additional reasoning helpers
// ─────────────────────────────────────────────────────────────────────────
// Each is intentionally small: a focused signal-extractor for a specific
// red-flag scenario. Combined with modules 22-50 they form the breadth
// of compliance-pattern coverage operators expect.

// 51. Sanctions-evasion typology — front company shielding
export function detectFrontCompanyShield(directors: string[], pepNames: Set<string>, oneAddress: boolean, nominalRevenue: boolean): { score: number; signal: string } {
  let score = 0;
  if (directors.some((d) => pepNames.has(d.toLowerCase()))) score += 40;
  if (oneAddress && directors.length > 5) score += 30;
  if (nominalRevenue) score += 20;
  return { score, signal: score > 40 ? `Front-company shield score ${score}/100 — escalate UBO investigation` : "No front-company shield signal." };
}

// 52. Beneficial-ownership 25% threshold cross-check
export function uboThresholdCheck(stakes: number[]): { aboveThreshold: number[]; coveragePct: number; signal: string } {
  const above = stakes.filter((s) => s >= 25);
  const total = stakes.reduce((s, v) => s + v, 0);
  return { aboveThreshold: above, coveragePct: total,
    signal: above.length === 0 ? "No 25%+ UBO disclosed — must dig deeper or cite explicit fragmentation" : `${above.length} UBO(s) at 25%+; total disclosed: ${total}%` };
}

// 53. Cumulative-threshold detector (multiple linked accounts)
export function cumulativeThreshold(linked: Array<{ accountId: string; deposit30d: number }>, threshold: number): { aggregate: number; breach: boolean; signal: string } {
  const aggregate = linked.reduce((s, l) => s + l.deposit30d, 0);
  return { aggregate, breach: aggregate >= threshold,
    signal: aggregate >= threshold ? `${linked.length} linked accounts cumulatively exceed ${threshold} threshold (sum=${aggregate})` : "Linked-account aggregate below threshold." };
}

// 54. Invoice-supplier mismatch
export function invoiceSupplierMismatch(invoiceSupplier: string, paymentSupplier: string): { mismatch: boolean; signal: string } {
  const mismatch = invoiceSupplier.toLowerCase().trim() !== paymentSupplier.toLowerCase().trim();
  return { mismatch, signal: mismatch ? `Invoice supplier "${invoiceSupplier}" ≠ payment beneficiary "${paymentSupplier}"` : "Invoice + payment supplier match." };
}

// 55. Dormant-account reactivation
export function dormantReactivation(monthsDormant: number, postReactivationMonthlyVolume: number, baselineMonthlyVolume: number): { suspicious: boolean; signal: string } {
  const sus = monthsDormant >= 12 && postReactivationMonthlyVolume > baselineMonthlyVolume * 5;
  return { suspicious: sus, signal: sus ? `Account dormant ${monthsDormant}mo, reactivated at ${(postReactivationMonthlyVolume / Math.max(1, baselineMonthlyVolume)).toFixed(1)}× baseline — review trigger` : "Reactivation pattern within tolerance." };
}

// 56. Cross-border wire-frequency anomaly
export function crossBorderWireAnomaly(weeklyCount: number, baselineWeekly: number): { ratio: number; signal: string } {
  const ratio = weeklyCount / Math.max(1, baselineWeekly);
  return { ratio: Math.round(ratio * 10) / 10, signal: ratio > 5 ? `Cross-border wires ${ratio.toFixed(1)}× baseline — investigate trigger` : "Cross-border wire frequency normal." };
}

// 57. Customer-due-diligence freshness
export function cddFreshness(lastReviewIso: string, postureRiskBand: "low" | "medium" | "high" | "critical"): { stale: boolean; daysSinceReview: number; signal: string } {
  const days = Math.floor((Date.now() - new Date(lastReviewIso).getTime()) / 86_400_000);
  const limit = postureRiskBand === "critical" || postureRiskBand === "high" ? 365 : postureRiskBand === "medium" ? 730 : 1095;
  const stale = days > limit;
  return { stale, daysSinceReview: days, signal: stale ? `CDD ${days}d old (limit ${limit}d for ${postureRiskBand} band) — refresh required` : "CDD within freshness window." };
}

// 58. Shell-company indicators
export function shellCompanyIndicators(directorCount: number, employees: number, revenueDeclared: number, addressShared: boolean): { score: number; signal: string } {
  let score = 0;
  if (employees === 0) score += 30;
  if (revenueDeclared === 0) score += 25;
  if (addressShared) score += 20;
  if (directorCount === 1) score += 15;
  return { score, signal: score >= 50 ? `Shell-company indicators score ${score}/100` : "Operating-company profile." };
}

// 59. Politically-exposed-person (PEP) tier classifier
export function classifyPepTier(role?: string): { tier: 1 | 2 | 3 | null; signal: string } {
  if (!role) return { tier: null, signal: "No role provided." };
  const r = role.toLowerCase();
  if (/head.of.state|prime.minister|president|monarch|deputy.minister|cabinet|ambassador|supreme.court|central.bank.governor/.test(r)) return { tier: 1, signal: "Tier-1 PEP (head-of-state / minister / supreme judiciary / ambassador)" };
  if (/parliament|senator|deputy|governor|state.minister|minister of state|attorney.general|chief.of.staff/.test(r)) return { tier: 2, signal: "Tier-2 PEP (legislator / governor / senior judicial)" };
  if (/director|manager|advisor|aide|spokesperson|consul/.test(r)) return { tier: 3, signal: "Tier-3 PEP (senior official / family / close associate)" };
  return { tier: null, signal: "Role does not match PEP taxonomy." };
}

// 60. Source-of-funds reasonableness
export function sourceOfFundsReasonableness(claimedSource: string, expectedRange: { min: number; max: number }, observed: number): { reasonable: boolean; signal: string } {
  const inRange = observed >= expectedRange.min && observed <= expectedRange.max;
  return { reasonable: inRange,
    signal: inRange ? `Observed amount within expected range for "${claimedSource}"` : `Observed ${observed} outside expected ${expectedRange.min}–${expectedRange.max} for "${claimedSource}" — verify with primary docs` };
}

// 61. Negative news language-tone analyzer
export function articleToneClassifier(snippet: string): { tone: "negative" | "neutral" | "positive"; severity: number; signal: string } {
  const negCount = (snippet.match(/\b(arrest|fraud|laundering|corrupt|sanctioned|indict|convict|raid|investigation|leaked|guilty|criminal)\b/gi) ?? []).length;
  const posCount = (snippet.match(/\b(award|exonerated|cleared|innocent|dropped charges|acquitted)\b/gi) ?? []).length;
  const tone = negCount > posCount ? "negative" : posCount > negCount ? "positive" : "neutral";
  const severity = Math.min(100, negCount * 25);
  return { tone, severity, signal: `Tone=${tone}, severity ${severity}/100 (${negCount} negative, ${posCount} positive cues)` };
}

// 62. Counterparty-frequency trend detector
export function counterpartyTrend(monthlyCounts: number[]): { trend: "rising" | "flat" | "falling"; slope: number; signal: string } {
  if (monthlyCounts.length < 3) return { trend: "flat", slope: 0, signal: "Insufficient months." };
  const n = monthlyCounts.length;
  const xs = monthlyCounts.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = monthlyCounts.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - meanX) * (monthlyCounts[i]! - meanY), 0);
  const den = xs.reduce((s, x) => s + Math.pow(x - meanX, 2), 0);
  const slope = den > 0 ? num / den : 0;
  const trend = slope > 0.5 ? "rising" : slope < -0.5 ? "falling" : "flat";
  return { trend, slope: Math.round(slope * 100) / 100, signal: `Counterparty count is ${trend} (slope ${slope.toFixed(2)}/month)` };
}

// 63. Same-day deposit-and-withdrawal pattern
export function sameDayInOut(events: Array<{ date: string; type: "in" | "out"; amount: number }>): { matchedPairs: number; signal: string } {
  const dayMap = new Map<string, { in: number; out: number }>();
  for (const e of events) {
    const day = e.date.slice(0, 10);
    const cur = dayMap.get(day) ?? { in: 0, out: 0 };
    cur[e.type] += e.amount;
    dayMap.set(day, cur);
  }
  let matched = 0;
  for (const v of dayMap.values()) {
    if (v.in > 0 && v.out > 0 && Math.abs(v.in - v.out) / v.in < 0.05) matched++;
  }
  return { matchedPairs: matched, signal: matched > 0 ? `${matched} same-day in/out match(es) within 5% — passthrough pattern` : "No passthrough pattern detected." };
}

// 64. Free-zone shell-company quick check
export function freeZoneShellCheck(jurisdiction: string, employees: number, registeredCapital: number): { suspicious: boolean; signal: string } {
  const fzSet = new Set(["AE-DMCC", "AE-JAFZA", "AE-DIFC", "AE-ADGM", "MT-FZ", "PA-CFZ", "BS-FZ"]);
  const inFz = fzSet.has(jurisdiction.toUpperCase());
  const sus = inFz && employees < 2 && registeredCapital < 10_000;
  return { suspicious: sus, signal: sus ? `Free-zone entity (${jurisdiction}) with ${employees} employees + nominal capital — likely letterbox` : "Free-zone profile is not letterbox-typical." };
}

// 65. Trade-finance documentation completeness
export function tradeFinanceDocsComplete(docs: { hasInvoice: boolean; hasBillOfLading: boolean; hasInsurance: boolean; hasOriginCert: boolean; hasInspection: boolean; }): { completeness: number; missing: string[]; signal: string } {
  const fields = Object.entries(docs);
  const missing = fields.filter(([, v]) => !v).map(([k]) => k);
  const completeness = Math.round(((fields.length - missing.length) / fields.length) * 100);
  return { completeness, missing, signal: completeness === 100 ? "Trade-finance documentation complete." : `${completeness}% complete; missing: ${missing.join(", ")}` };
}

// 66. Cross-currency conversion route plausibility
export function currencyRoutePlausibility(from: string, to: string, viaCurrencies: string[]): { plausible: boolean; signal: string } {
  if (viaCurrencies.length === 0) return { plausible: true, signal: "Direct conversion." };
  const oddRoutes = viaCurrencies.filter((c) => !["USD", "EUR", "GBP", "JPY", "CHF"].includes(c.toUpperCase()));
  return { plausible: oddRoutes.length === 0,
    signal: oddRoutes.length > 0 ? `Conversion ${from} → ${to} routes via non-major currency: ${oddRoutes.join(", ")} — review for FX-circumvention motive` : `Conversion ${from} → ${to} via major currency.` };
}

// 67. Beneficial-owner age plausibility
export function uboAgePlausibility(birthYear: number): { plausible: boolean; signal: string } {
  const age = new Date().getFullYear() - birthYear;
  return { plausible: age >= 18 && age <= 110,
    signal: age < 18 ? "UBO age below 18 — not a competent legal owner" : age > 110 ? "UBO age >110 — likely data entry error or deceased" : `UBO age ${age} — plausible.` };
}

// 68. Sanctions-list update lag detector
export function sanctionsListUpdateLag(lastUpdateIso: string, listName: string): { lagDays: number; stale: boolean; signal: string } {
  const lag = Math.floor((Date.now() - new Date(lastUpdateIso).getTime()) / 86_400_000);
  const stale = lag > 7;
  return { lagDays: lag, stale,
    signal: stale ? `${listName} last updated ${lag} days ago — possible stale-list false-negative risk` : `${listName} updated within ${lag}d — current.` };
}

// 69. STR / SAR filing latency
export function strFilingLatency(detectionDate: string, filingDate: string): { hoursElapsed: number; meetsRegulatory: boolean; signal: string } {
  const detected = new Date(detectionDate).getTime();
  const filed = new Date(filingDate).getTime();
  const hours = (filed - detected) / 3600_000;
  const meets = hours <= 35 * 24;       // FATF + many local rules: 35 days
  return { hoursElapsed: Math.round(hours), meetsRegulatory: meets,
    signal: meets ? `STR filed ${Math.round(hours / 24)}d after detection — within regulatory window` : `STR filed ${Math.round(hours / 24)}d after detection — exceeds 35-day regulatory limit; document delay rationale` };
}

// 70. Alert-volume burnout indicator (model performance monitoring)
export function alertBurnoutIndicator(alertsToday: number, baselineDaily: number, falsePositiveRate: number): { signal: string } {
  if (alertsToday > baselineDaily * 3 && falsePositiveRate > 0.7) return { signal: `Alert volume ${(alertsToday / baselineDaily).toFixed(1)}× baseline + FPR ${(falsePositiveRate * 100).toFixed(0)}% — model needs retuning to avoid analyst burnout / reduce alert blindness` };
  return { signal: "Alert volume + FP rate within tolerance." };
}

// 71. Holistic risk-tier reconciliation — final tier rollup
export function reconcileRiskTier(componentScores: Record<string, number>, sectorBaseline: number, jurisdictionBaseline: number): { tier: "low" | "medium" | "high" | "critical"; rolledScore: number; signal: string } {
  const componentMax = Math.max(0, ...Object.values(componentScores));
  const componentAvg = Object.values(componentScores).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(componentScores).length);
  const rolledScore = Math.round(0.4 * componentMax + 0.3 * componentAvg + 0.15 * sectorBaseline + 0.15 * jurisdictionBaseline);
  const tier = rolledScore >= 80 ? "critical" : rolledScore >= 55 ? "high" : rolledScore >= 30 ? "medium" : "low";
  return { tier, rolledScore, signal: `Final risk tier: ${tier.toUpperCase()} (${rolledScore}/100)` };
}
