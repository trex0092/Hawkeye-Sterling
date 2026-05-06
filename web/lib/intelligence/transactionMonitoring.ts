// Hawkeye Sterling — transaction monitoring rule pack (Layers 71-85).

export interface Tx {
  id: string;
  at: string;             // ISO
  amountUsd: number;
  ccy?: string;
  fromParty?: string;
  toParty?: string;
  fromIso2?: string;
  toIso2?: string;
  channel?: "wire" | "swift" | "card" | "cash" | "crypto" | "internal";
  description?: string;
}

export interface Alert {
  id: string;
  rule: string;
  severity: "critical" | "high" | "medium" | "low";
  txIds: string[];
  rationale: string;
}

const HIGH_RISK_ISO2 = new Set(["IR","KP","SY","CU","RU","VE","MM","BY","AF","YE","SO"]);

// 71. Velocity rule (count/period)
export function velocityRule(txs: Tx[], maxCount: number, periodHours: number): Alert[] {
  const alerts: Alert[] = [];
  const sorted = [...txs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (let i = 0; i < sorted.length; i += 1) {
    const window = [sorted[i]!];
    for (let j = i + 1; j < sorted.length; j += 1) {
      if ((Date.parse(sorted[j]!.at) - Date.parse(sorted[i]!.at)) <= periodHours * 3600000) window.push(sorted[j]!);
      else break;
    }
    if (window.length > maxCount) {
      alerts.push({
        id: `vel-${i}`, rule: "velocity_count", severity: "medium",
        txIds: window.map((t) => t.id),
        rationale: `${window.length} transactions in ${periodHours}h (max ${maxCount}).`,
      });
      i += window.length - 1;
    }
  }
  return alerts;
}

// 72. Aggregate-threshold rule
export function aggregateThreshold(txs: Tx[], thresholdUsd: number, periodHours: number): Alert[] {
  const sorted = [...txs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const alerts: Alert[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let sum = 0;
    const win: Tx[] = [];
    for (let j = i; j < sorted.length; j += 1) {
      if ((Date.parse(sorted[j]!.at) - Date.parse(sorted[i]!.at)) > periodHours * 3600000) break;
      sum += sorted[j]!.amountUsd;
      win.push(sorted[j]!);
      if (sum >= thresholdUsd) {
        alerts.push({
          id: `agg-${i}`, rule: "aggregate_threshold", severity: "high",
          txIds: win.map((t) => t.id),
          rationale: `Aggregate USD ${sum.toLocaleString()} in ${periodHours}h exceeds threshold USD ${thresholdUsd.toLocaleString()}.`,
        });
        break;
      }
    }
  }
  return alerts;
}

// 73. Unusual-amount rule (vs customer profile)
export function unusualAmount(tx: Tx, expectedAvgUsd: number, sigmaUsd: number): Alert | null {
  if (sigmaUsd <= 0) return null;
  const z = (tx.amountUsd - expectedAvgUsd) / sigmaUsd;
  if (Math.abs(z) >= 3) {
    return {
      id: `unusual-${tx.id}`, rule: "unusual_amount", severity: Math.abs(z) >= 5 ? "high" : "medium",
      txIds: [tx.id],
      rationale: `Transaction USD ${tx.amountUsd.toLocaleString()} is ${z.toFixed(1)}σ from baseline (avg USD ${expectedAvgUsd.toLocaleString()}).`,
    };
  }
  return null;
}

// 74. Off-hours activity (outside 06:00-22:00 customer-jurisdiction local)
export function offHoursActivity(tx: Tx, jurisdictionUtcOffsetHours: number): Alert | null {
  const utc = new Date(tx.at);
  const local = new Date(utc.getTime() + jurisdictionUtcOffsetHours * 3600000);
  const h = local.getUTCHours();
  if (h < 6 || h >= 22) {
    return {
      id: `offhour-${tx.id}`, rule: "off_hours", severity: "low",
      txIds: [tx.id],
      rationale: `Local time ${h}:00 outside 06:00-22:00 envelope.`,
    };
  }
  return null;
}

// 75. Same-amount duplicate detector
export function duplicateAmounts(txs: Tx[], windowMin = 60): Alert[] {
  const sorted = [...txs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const alerts: Alert[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const dups = [sorted[i]!];
    for (let j = i + 1; j < sorted.length; j += 1) {
      if ((Date.parse(sorted[j]!.at) - Date.parse(sorted[i]!.at)) > windowMin * 60000) break;
      if (sorted[j]!.amountUsd === sorted[i]!.amountUsd) dups.push(sorted[j]!);
    }
    if (dups.length >= 3) {
      alerts.push({
        id: `dup-${i}`, rule: "duplicate_amount", severity: "medium",
        txIds: dups.map((t) => t.id),
        rationale: `${dups.length} transactions of identical amount USD ${sorted[i]!.amountUsd.toLocaleString()} within ${windowMin}min.`,
      });
      i += dups.length - 1;
    }
  }
  return alerts;
}

// 76. Round-amount detector
export function roundAmount(tx: Tx): Alert | null {
  if (tx.amountUsd >= 1000 && tx.amountUsd % 1000 === 0) {
    return { id: `round-${tx.id}`, rule: "round_amount", severity: "low", txIds: [tx.id], rationale: `Round USD ${tx.amountUsd.toLocaleString()} — possible structuring.` };
  }
  return null;
}

// 77. Cash threshold detector (CTR — UAE AED 55,000 / USD 15,000)
export function cashThreshold(tx: Tx, thresholdUsd = 15_000): Alert | null {
  if (tx.channel !== "cash") return null;
  if (tx.amountUsd >= thresholdUsd) {
    return { id: `ctr-${tx.id}`, rule: "ctr_threshold", severity: "high", txIds: [tx.id], rationale: `Cash transaction USD ${tx.amountUsd.toLocaleString()} ≥ CTR threshold USD ${thresholdUsd.toLocaleString()}.` };
  }
  return null;
}

// 78. Cross-border high-risk
export function crossBorderHighRisk(tx: Tx): Alert | null {
  if (tx.fromIso2 && tx.toIso2 && tx.fromIso2 !== tx.toIso2) {
    if (HIGH_RISK_ISO2.has(tx.fromIso2.toUpperCase()) || HIGH_RISK_ISO2.has(tx.toIso2.toUpperCase())) {
      return { id: `xb-${tx.id}`, rule: "cross_border_hr", severity: "high", txIds: [tx.id], rationale: `Cross-border ${tx.fromIso2} → ${tx.toIso2} touches high-risk jurisdiction.` };
    }
  }
  return null;
}

// 79. Counterparty-country risk (single-leg)
export function counterpartyCountryRisk(tx: Tx): Alert | null {
  const cp = tx.toIso2 ?? tx.fromIso2;
  if (!cp) return null;
  if (HIGH_RISK_ISO2.has(cp.toUpperCase())) {
    return { id: `cp-${tx.id}`, rule: "cp_country_hr", severity: "medium", txIds: [tx.id], rationale: `Counterparty in high-risk jurisdiction (${cp}).` };
  }
  return null;
}

// 80. New-counterparty velocity
export function newCounterpartyVelocity(txs: Tx[], windowDays = 7, threshold = 5): Alert[] {
  const counterparties = new Map<string, Tx[]>();
  const cutoff = Date.now() - windowDays * 86400000;
  for (const t of txs) {
    if (Date.parse(t.at) < cutoff) continue;
    const cp = t.toParty ?? "";
    const arr = counterparties.get(cp) ?? [];
    arr.push(t);
    counterparties.set(cp, arr);
  }
  if (counterparties.size >= threshold) {
    return [{
      id: "new-cp-vel", rule: "new_cp_velocity", severity: "medium",
      txIds: Array.from(counterparties.values()).flat().map((t) => t.id),
      rationale: `${counterparties.size} distinct counterparties within ${windowDays}d (threshold ${threshold}).`,
    }];
  }
  return [];
}

// 81. Dormancy-then-burst
export function dormancyBurst(txs: Tx[], dormantDays = 90): Alert | null {
  if (txs.length < 2) return null;
  const sorted = [...txs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let lastAt = Date.parse(sorted[0]!.at);
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = Date.parse(sorted[i]!.at);
    if ((cur - lastAt) > dormantDays * 86400000) {
      const burst = sorted.slice(i, i + 5);
      return { id: `dormancy-${i}`, rule: "dormancy_burst", severity: "high", txIds: burst.map((t) => t.id), rationale: `Account dormant >${dormantDays}d then burst of ${burst.length} transactions.` };
    }
    lastAt = cur;
  }
  return null;
}

// 82. Nostro/Vostro pair anomaly (placeholder logic)
export function nostroVostroPair(tx: Tx): Alert | null {
  if (!tx.description) return null;
  if (/\bnostro\b.*\bvostro\b|\bvostro\b.*\bnostro\b/i.test(tx.description)) {
    return { id: `nv-${tx.id}`, rule: "nostro_vostro", severity: "medium", txIds: [tx.id], rationale: "Both nostro and vostro references in single description — investigate." };
  }
  return null;
}

// 83. Currency-mix anomaly
export function currencyMixAnomaly(txs: Tx[]): Alert | null {
  const ccys = new Set(txs.map((t) => (t.ccy ?? "").toUpperCase()).filter((c) => c));
  if (ccys.size >= 5) {
    return { id: "ccy-mix", rule: "currency_mix", severity: "medium", txIds: txs.map((t) => t.id), rationale: `${ccys.size} distinct currencies (${[...ccys].join(", ")}) — unusual portfolio.` };
  }
  return null;
}

// 84. Trade-cycle anomaly (back-to-back same parties)
export function backToBack(txs: Tx[], windowMin = 120): Alert | null {
  const sorted = [...txs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const a = sorted[i]!, b = sorted[i + 1]!;
    if (a.toParty && a.toParty === b.fromParty && b.toParty === a.fromParty) {
      if ((Date.parse(b.at) - Date.parse(a.at)) <= windowMin * 60000) {
        return { id: `b2b-${i}`, rule: "back_to_back", severity: "high", txIds: [a.id, b.id], rationale: "Back-to-back round-trip between same two parties." };
      }
    }
  }
  return null;
}

// 85. Wire-stripping detector (description contains stripping keywords)
export function wireStripping(tx: Tx): Alert | null {
  if (!tx.description) return null;
  if (/\b(?:re-?routed|stripped|cleared via|original beneficiary unknown)\b/i.test(tx.description)) {
    return { id: `strip-${tx.id}`, rule: "wire_stripping", severity: "critical", txIds: [tx.id], rationale: "Description contains wire-stripping vocabulary." };
  }
  return null;
}
