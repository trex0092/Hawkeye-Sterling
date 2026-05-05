// Hawkeye Sterling — transaction pattern detectors (Layers #24-27).
//
// Pure-function detectors for the canonical FATF transaction-monitoring
// patterns: smurfing/structuring, layering, round-tripping, and
// common-address / common-director shell-network clustering.

export interface TransactionRecord {
  id: string;
  at: string;             // ISO timestamp
  amountUsd: number;
  fromParty?: string;
  toParty?: string;
  fromIso2?: string;
  toIso2?: string;
}

export interface PatternFinding {
  id: string;
  pattern: "smurfing" | "layering" | "round_tripping" | "shell_network";
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;     // 0..1
  evidence: string[];
  affectedTransactionIds: string[];
}

// ── Smurfing / structuring detection ─────────────────────────────────────
// Pattern: multiple deposits just below a reporting threshold, by or to
// the same counterparty in a short window.
export function detectSmurfing(
  txs: TransactionRecord[],
  thresholdUsd = 10_000,
  windowDays = 7,
): PatternFinding[] {
  const findings: PatternFinding[] = [];
  // Bucket near-threshold transactions by counterparty.
  const lo = thresholdUsd * 0.7;
  const nearThreshold = txs.filter((t) => t.amountUsd >= lo && t.amountUsd < thresholdUsd);
  const byCp = new Map<string, TransactionRecord[]>();
  for (const t of nearThreshold) {
    const key = t.fromParty ?? t.toParty ?? "unknown";
    const arr = byCp.get(key) ?? [];
    arr.push(t);
    byCp.set(key, arr);
  }
  for (const [cp, arr] of byCp.entries()) {
    if (arr.length < 3) continue;
    arr.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    // Sliding window across the bucket.
    for (let i = 0; i < arr.length; i += 1) {
      const start = arr[i]!;
      const cluster = [start];
      for (let j = i + 1; j < arr.length; j += 1) {
        const cur = arr[j]!;
        if ((Date.parse(cur.at) - Date.parse(start.at)) <= windowDays * 86400000) {
          cluster.push(cur);
        } else break;
      }
      if (cluster.length >= 3) {
        findings.push({
          id: `smurfing-${cp}-${i}`,
          pattern: "smurfing",
          severity: "high",
          confidence: Math.min(1, 0.5 + cluster.length * 0.1),
          evidence: [
            `${cluster.length} transactions just below USD ${thresholdUsd.toLocaleString()} threshold via "${cp}" within ${windowDays} days`,
            `Total USD ${cluster.reduce((s, t) => s + t.amountUsd, 0).toLocaleString()}`,
          ],
          affectedTransactionIds: cluster.map((c) => c.id),
        });
        break;
      }
    }
  }
  return findings;
}

// ── Layering detection ────────────────────────────────────────────────────
// Pattern: same value moves through 3+ intermediaries within a short window
// with little or no commercial purpose (round-trip economics).
export function detectLayering(
  txs: TransactionRecord[],
  minHops = 3,
  windowDays = 14,
  toleranceUsd = 500,
): PatternFinding[] {
  if (txs.length < minHops) return [];
  const findings: PatternFinding[] = [];
  // Crude: order by time, look for chains where each tx's amount is
  // within tolerance of the previous and the recipient becomes the
  // sender of the next.
  const sorted = [...txs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (let i = 0; i < sorted.length; i += 1) {
    const chain: TransactionRecord[] = [sorted[i]!];
    let last = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const nxt = sorted[j]!;
      if (Date.parse(nxt.at) - Date.parse(last.at) > windowDays * 86400000) break;
      if (last.toParty && nxt.fromParty === last.toParty &&
          Math.abs(nxt.amountUsd - last.amountUsd) <= toleranceUsd) {
        chain.push(nxt);
        last = nxt;
      }
    }
    if (chain.length >= minHops) {
      findings.push({
        id: `layering-${i}`,
        pattern: "layering",
        severity: "high",
        confidence: 0.6 + Math.min(0.3, chain.length * 0.05),
        evidence: [
          `Same value (~USD ${chain[0]!.amountUsd.toLocaleString()}) routed through ${chain.length} intermediaries within ${windowDays} days`,
          `Path: ${chain.map((c) => c.fromParty).join(" → ")} → ${chain[chain.length - 1]!.toParty}`,
        ],
        affectedTransactionIds: chain.map((c) => c.id),
      });
      i += chain.length - 1;
    }
  }
  return findings;
}

// ── Round-tripping detection ──────────────────────────────────────────────
// Money sent out comes back to the originator (potentially via different
// counterparties / jurisdictions) within a short period.
export function detectRoundTripping(
  txs: TransactionRecord[],
  windowDays = 30,
  toleranceUsd = 5_000,
): PatternFinding[] {
  if (txs.length < 2) return [];
  const findings: PatternFinding[] = [];
  for (let i = 0; i < txs.length; i += 1) {
    const out = txs[i]!;
    if (!out.fromParty) continue;
    for (let j = i + 1; j < txs.length; j += 1) {
      const back = txs[j]!;
      if (!back.toParty) continue;
      if (back.toParty !== out.fromParty) continue;
      if (Math.abs(back.amountUsd - out.amountUsd) > toleranceUsd) continue;
      const dt = Math.abs(Date.parse(back.at) - Date.parse(out.at));
      if (dt > windowDays * 86400000) continue;
      findings.push({
        id: `roundtrip-${out.id}-${back.id}`,
        pattern: "round_tripping",
        severity: "high",
        confidence: 0.7,
        evidence: [
          `USD ${out.amountUsd.toLocaleString()} sent ${out.at} returned ${back.at} (within ${windowDays} days)`,
          `Outbound to ${out.toParty}; returned from ${back.fromParty}`,
        ],
        affectedTransactionIds: [out.id, back.id],
      });
    }
  }
  return findings;
}

// ── Shell-network clustering ──────────────────────────────────────────────
// Detect a cluster of entities sharing a common registered address or
// common director — typical professional-shell pattern.
export interface EntityProfile {
  id: string;
  name: string;
  registeredAddress?: string | null;
  directors?: string[];
}

export function clusterShellNetwork(profiles: EntityProfile[], minClusterSize = 5): PatternFinding[] {
  const findings: PatternFinding[] = [];
  const byAddress = new Map<string, EntityProfile[]>();
  const byDirector = new Map<string, EntityProfile[]>();
  for (const p of profiles) {
    if (p.registeredAddress) {
      const k = p.registeredAddress.trim().toLowerCase();
      const arr = byAddress.get(k) ?? [];
      arr.push(p);
      byAddress.set(k, arr);
    }
    for (const d of p.directors ?? []) {
      const k = d.trim().toLowerCase();
      const arr = byDirector.get(k) ?? [];
      arr.push(p);
      byDirector.set(k, arr);
    }
  }
  for (const [k, arr] of byAddress.entries()) {
    if (arr.length >= minClusterSize) {
      findings.push({
        id: `shell-addr-${k.slice(0, 24)}`,
        pattern: "shell_network",
        severity: "high",
        confidence: 0.75,
        evidence: [`${arr.length} entities share registered address: "${k.slice(0, 80)}"`],
        affectedTransactionIds: arr.map((p) => p.id),
      });
    }
  }
  for (const [k, arr] of byDirector.entries()) {
    if (arr.length >= minClusterSize) {
      findings.push({
        id: `shell-dir-${k}`,
        pattern: "shell_network",
        severity: "medium",
        confidence: 0.6,
        evidence: [`${arr.length} entities share director: "${k}"`],
        affectedTransactionIds: arr.map((p) => p.id),
      });
    }
  }
  return findings;
}
