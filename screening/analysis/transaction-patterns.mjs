/**
 * Transaction Pattern Analyzer — AI-powered detection of AML red flags.
 *
 * Detects:
 *   1. STRUCTURING — Multiple sub-threshold transactions (just-below AED 55K)
 *   2. LAYERING — Rapid sequential transfers between multiple entities
 *   3. ROUND-TRIPPING — Funds returning to originator via intermediaries
 *   4. SMURFING — Multiple small deposits by different parties to same account
 *   5. VELOCITY — Unusual transaction frequency spikes
 *   6. DORMANCY BREAK — Sudden activity after prolonged inactivity
 *   7. THRESHOLD EVASION — Cumulative amounts just below reporting threshold
 *   8. MISMATCH — Transaction amounts inconsistent with declared business profile
 *
 * Zero dependencies. Pure algorithmic detection — no ML model needed.
 * Each pattern returns a confidence score (0-1) and regulatory citation.
 */

const DPMS_THRESHOLD = 55000;
const CROSS_BORDER_THRESHOLD = 60000;
const STRUCTURING_WINDOW_DAYS = 7;
const STRUCTURING_PCT = 0.73; // Flag cumulative reaching 73%+ of threshold
const VELOCITY_LOOKBACK_DAYS = 30;
const DORMANCY_DAYS = 90;
const DORMANCY_REACTIVATION_MIN = 20000;
const LAYERING_MAX_HOURS = 48;
const ROUND_TRIP_WINDOW_DAYS = 30;

/**
 * Analyze a set of transactions for all AML patterns.
 *
 * @param {Array<Transaction>} transactions - All transactions to analyze.
 * @param {object} [opts] - Options.
 * @param {object} [opts.entityProfiles] - Map of entity name -> { expectedMonthlyVolume, businessType }.
 * @returns {{ alerts: Alert[], summary: Summary }}
 *
 * @typedef {object} Transaction
 * @property {string} id
 * @property {string} date        - ISO date or dd/mm/yyyy
 * @property {string} from        - Sender entity name
 * @property {string} to          - Receiver entity name
 * @property {number} amount      - Amount in AED
 * @property {string} [currency]  - Currency (default AED)
 * @property {string} [method]    - cash, wire, cheque, crypto
 * @property {string} [reference] - Transaction reference
 *
 * @typedef {object} Alert
 * @property {string} pattern     - Pattern name
 * @property {number} confidence  - 0-1
 * @property {string} severity    - CRITICAL, HIGH, MEDIUM, LOW
 * @property {string} description - Human-readable description
 * @property {string} regulation  - Regulatory citation
 * @property {string[]} entities  - Entities involved
 * @property {string[]} txIds     - Transaction IDs involved
 * @property {object} evidence    - Supporting data
 */
export function analyzeTransactions(transactions, opts = {}) {
  if (!transactions || transactions.length === 0) {
    return { alerts: [], summary: { total: 0, patterns: {} } };
  }

  // Normalize dates
  const txs = transactions.map(t => ({
    ...t,
    _date: parseDate(t.date),
    _amount: Number(t.amount) || 0,
  })).filter(t => t._date).sort((a, b) => a._date - b._date);

  const alerts = [];

  // Run all detectors
  alerts.push(...detectStructuring(txs));
  alerts.push(...detectLayering(txs));
  alerts.push(...detectRoundTripping(txs));
  alerts.push(...detectSmurfing(txs));
  alerts.push(...detectVelocityAnomalies(txs));
  alerts.push(...detectDormancyBreak(txs));
  alerts.push(...detectThresholdEvasion(txs));
  alerts.push(...detectMismatch(txs, opts.entityProfiles));

  // Deduplicate by pattern + entities
  const deduped = deduplicateAlerts(alerts);

  // Sort by confidence descending
  deduped.sort((a, b) => b.confidence - a.confidence);

  // Summary
  const patterns = {};
  for (const a of deduped) {
    patterns[a.pattern] = (patterns[a.pattern] || 0) + 1;
  }

  return {
    alerts: deduped,
    summary: {
      total: deduped.length,
      patterns,
      highestConfidence: deduped[0]?.confidence || 0,
      entitiesFlagged: [...new Set(deduped.flatMap(a => a.entities))],
    },
  };
}

// ── Pattern 1: STRUCTURING ──────────────────────────────────

function detectStructuring(txs) {
  const alerts = [];
  const byEntity = groupByEntity(txs);

  for (const [entity, entityTxs] of Object.entries(byEntity)) {
    // Sliding window: check 7-day periods for cumulative near-threshold
    for (let i = 0; i < entityTxs.length; i++) {
      const windowStart = entityTxs[i]._date;
      const windowEnd = new Date(windowStart.getTime() + STRUCTURING_WINDOW_DAYS * 86400000);

      const windowTxs = entityTxs.filter(t =>
        t._date >= windowStart && t._date <= windowEnd && t._amount < DPMS_THRESHOLD
      );

      if (windowTxs.length < 2) continue;

      const cumulative = windowTxs.reduce((s, t) => s + t._amount, 0);
      const allBelowThreshold = windowTxs.every(t => t._amount < DPMS_THRESHOLD);
      const anyNearThreshold = windowTxs.some(t => t._amount >= DPMS_THRESHOLD * 0.7);

      if (allBelowThreshold && cumulative >= DPMS_THRESHOLD * STRUCTURING_PCT) {
        const avgPct = (windowTxs.reduce((s, t) => s + t._amount, 0) / windowTxs.length) / DPMS_THRESHOLD;
        const confidence = Math.min(1,
          0.3 + // base
          (cumulative >= DPMS_THRESHOLD ? 0.3 : 0.15) + // exceeds threshold
          (anyNearThreshold ? 0.15 : 0) + // individual txs near threshold
          (windowTxs.length >= 3 ? 0.1 : 0) + // multiple transactions
          (avgPct > 0.4 ? 0.1 : 0) // consistent splitting
        );

        alerts.push({
          pattern: 'STRUCTURING',
          confidence,
          severity: confidence >= 0.7 ? 'HIGH' : 'MEDIUM',
          description: `${entity}: ${windowTxs.length} transactions totalling AED ${cumulative.toLocaleString()} within ${STRUCTURING_WINDOW_DAYS} days, all below AED ${DPMS_THRESHOLD.toLocaleString()} threshold`,
          regulation: 'FDL No.10/2025 Art.15-16 | MoE Circular 08/AML/2021 | FATF Red Flag Indicators',
          entities: [entity],
          txIds: windowTxs.map(t => t.id),
          evidence: {
            windowDays: STRUCTURING_WINDOW_DAYS,
            transactionCount: windowTxs.length,
            cumulative,
            threshold: DPMS_THRESHOLD,
            pctOfThreshold: Math.round((cumulative / DPMS_THRESHOLD) * 100),
            amounts: windowTxs.map(t => t._amount),
          },
        });
        break; // One alert per entity
      }
    }
  }

  return alerts;
}

// ── Pattern 2: LAYERING ─────────────────────────────────────

function detectLayering(txs) {
  const alerts = [];

  // Look for rapid A->B->C->D chains within 48 hours
  for (let i = 0; i < txs.length; i++) {
    const chain = [txs[i]];
    let current = txs[i];

    for (let j = i + 1; j < txs.length; j++) {
      const next = txs[j];
      const hoursDiff = (next._date - current._date) / 3600000;

      if (hoursDiff > LAYERING_MAX_HOURS) break;

      // Chain continues if receiver becomes sender
      if (next.from === current.to && next.from !== txs[i].from) {
        chain.push(next);
        current = next;
      }
    }

    if (chain.length >= 3 && chain[0]._date && chain[chain.length - 1]._date) {
      const entities = [...new Set(chain.flatMap(t => [t.from, t.to]))];
      const totalHours = (chain[chain.length - 1]._date - chain[0]._date) / 3600000;
      const amountConsistency = 1 - (stdDev(chain.map(t => t._amount)) / mean(chain.map(t => t._amount)) || 0);

      const confidence = Math.min(1,
        0.3 +
        (chain.length >= 4 ? 0.2 : 0.1) +
        (totalHours < 12 ? 0.2 : 0.1) +
        (amountConsistency > 0.8 ? 0.15 : 0) +
        (entities.length >= 4 ? 0.1 : 0)
      );

      alerts.push({
        pattern: 'LAYERING',
        confidence,
        severity: confidence >= 0.7 ? 'HIGH' : 'MEDIUM',
        description: `${chain.length}-hop chain: ${chain.map(t => t.from).join(' -> ')} -> ${chain[chain.length - 1].to} within ${Math.round(totalHours)}h`,
        regulation: 'FDL No.10/2025 Art.26-27 | FATF Typologies: Layering in Trade-Based ML',
        entities,
        txIds: chain.map(t => t.id),
        evidence: {
          hops: chain.length,
          totalHours: Math.round(totalHours),
          amounts: chain.map(t => t._amount),
          path: chain.map(t => `${t.from}->${t.to}`),
        },
      });
    }
  }

  return alerts;
}

// ── Pattern 3: ROUND-TRIPPING ───────────────────────────────

function detectRoundTripping(txs) {
  const alerts = [];

  // Find cases where funds return to the original sender
  const senders = [...new Set(txs.map(t => t.from))];

  for (const sender of senders) {
    const sent = txs.filter(t => t.from === sender);
    const received = txs.filter(t => t.to === sender);

    for (const s of sent) {
      for (const r of received) {
        if (r._date <= s._date) continue;
        const daysDiff = (r._date - s._date) / 86400000;
        if (daysDiff > ROUND_TRIP_WINDOW_DAYS) continue;

        // Amount similarity (within 20%)
        const amountRatio = Math.min(s._amount, r._amount) / Math.max(s._amount, r._amount);
        if (amountRatio < 0.8) continue;

        // Different intermediary
        if (s.to === r.from && s.to !== sender) {
          const confidence = Math.min(1,
            0.4 +
            (amountRatio > 0.95 ? 0.25 : amountRatio > 0.9 ? 0.15 : 0.05) +
            (daysDiff < 7 ? 0.2 : daysDiff < 14 ? 0.1 : 0)
          );

          alerts.push({
            pattern: 'ROUND_TRIPPING',
            confidence,
            severity: confidence >= 0.7 ? 'HIGH' : 'MEDIUM',
            description: `${sender} -> ${s.to} -> ${sender}: AED ${s._amount.toLocaleString()} sent, AED ${r._amount.toLocaleString()} returned within ${Math.round(daysDiff)} days`,
            regulation: 'FDL No.10/2025 Art.26-27 | FATF Typologies: Round-Tripping / Trade-Based ML',
            entities: [sender, s.to],
            txIds: [s.id, r.id],
            evidence: {
              sentAmount: s._amount,
              returnedAmount: r._amount,
              amountMatchPct: Math.round(amountRatio * 100),
              daysBetween: Math.round(daysDiff),
              intermediary: s.to,
            },
          });
        }
      }
    }
  }

  return alerts;
}

// ── Pattern 4: SMURFING ─────────────────────────────────────

function detectSmurfing(txs) {
  const alerts = [];

  // Multiple different senders depositing to the same receiver in short period
  const byReceiver = {};
  for (const t of txs) {
    if (!byReceiver[t.to]) byReceiver[t.to] = [];
    byReceiver[t.to].push(t);
  }

  for (const [receiver, receiverTxs] of Object.entries(byReceiver)) {
    // 7-day sliding window
    for (let i = 0; i < receiverTxs.length; i++) {
      const windowStart = receiverTxs[i]._date;
      const windowEnd = new Date(windowStart.getTime() + 7 * 86400000);
      const windowTxs = receiverTxs.filter(t => t._date >= windowStart && t._date <= windowEnd);

      const uniqueSenders = [...new Set(windowTxs.map(t => t.from))];
      if (uniqueSenders.length < 3) continue;

      const cumulative = windowTxs.reduce((s, t) => s + t._amount, 0);
      const allSmall = windowTxs.every(t => t._amount < DPMS_THRESHOLD * 0.5);

      if (allSmall && cumulative >= DPMS_THRESHOLD * 0.5) {
        const confidence = Math.min(1,
          0.3 +
          (uniqueSenders.length >= 5 ? 0.3 : uniqueSenders.length >= 3 ? 0.15 : 0) +
          (cumulative >= DPMS_THRESHOLD ? 0.2 : 0.1) +
          (allSmall ? 0.1 : 0)
        );

        alerts.push({
          pattern: 'SMURFING',
          confidence,
          severity: confidence >= 0.7 ? 'HIGH' : 'MEDIUM',
          description: `${receiver}: ${uniqueSenders.length} different senders, ${windowTxs.length} transactions totalling AED ${cumulative.toLocaleString()} within 7 days`,
          regulation: 'FDL No.10/2025 Art.15-16 | FATF Red Flag: Smurfing / Structuring via Third Parties',
          entities: [receiver, ...uniqueSenders],
          txIds: windowTxs.map(t => t.id),
          evidence: {
            receiver,
            senderCount: uniqueSenders.length,
            transactionCount: windowTxs.length,
            cumulative,
            senders: uniqueSenders,
          },
        });
        break;
      }
    }
  }

  return alerts;
}

// ── Pattern 5: VELOCITY ANOMALIES ───────────────────────────

function detectVelocityAnomalies(txs) {
  const alerts = [];
  const byEntity = groupByEntity(txs);

  for (const [entity, entityTxs] of Object.entries(byEntity)) {
    if (entityTxs.length < 5) continue;

    // Compare recent 7-day frequency to 30-day average
    const now = entityTxs[entityTxs.length - 1]._date;
    const recent7d = entityTxs.filter(t => (now - t._date) / 86400000 <= 7);
    const past30d = entityTxs.filter(t => {
      const age = (now - t._date) / 86400000;
      return age > 7 && age <= 37;
    });

    const recentRate = recent7d.length / 7;
    const historicalRate = past30d.length / 30;

    if (historicalRate > 0 && recentRate > historicalRate * 3) {
      const confidence = Math.min(1,
        0.3 +
        (recentRate > historicalRate * 5 ? 0.3 : 0.15) +
        (recent7d.reduce((s, t) => s + t._amount, 0) > DPMS_THRESHOLD ? 0.15 : 0)
      );

      alerts.push({
        pattern: 'VELOCITY_ANOMALY',
        confidence,
        severity: confidence >= 0.6 ? 'HIGH' : 'MEDIUM',
        description: `${entity}: ${recent7d.length} transactions in 7 days vs ${past30d.length} in prior 30 days (${Math.round(recentRate / historicalRate)}x normal rate)`,
        regulation: 'FDL No.10/2025 Art.26 | FATF Red Flag: Unusual Transaction Patterns',
        entities: [entity],
        txIds: recent7d.map(t => t.id),
        evidence: {
          recentCount: recent7d.length,
          historicalCount: past30d.length,
          rateMultiplier: Math.round((recentRate / historicalRate) * 10) / 10,
          recentVolume: recent7d.reduce((s, t) => s + t._amount, 0),
        },
      });
    }
  }

  return alerts;
}

// ── Pattern 6: DORMANCY BREAK ───────────────────────────────

function detectDormancyBreak(txs) {
  const alerts = [];
  const byEntity = groupByEntity(txs);

  for (const [entity, entityTxs] of Object.entries(byEntity)) {
    if (entityTxs.length < 2) continue;

    for (let i = 1; i < entityTxs.length; i++) {
      const gap = (entityTxs[i]._date - entityTxs[i - 1]._date) / 86400000;

      if (gap >= DORMANCY_DAYS && entityTxs[i]._amount >= DORMANCY_REACTIVATION_MIN) {
        const confidence = Math.min(1,
          0.3 +
          (gap >= 180 ? 0.25 : 0.1) +
          (entityTxs[i]._amount >= DPMS_THRESHOLD ? 0.2 : 0.1) +
          (entityTxs[i].method === 'cash' ? 0.15 : 0)
        );

        alerts.push({
          pattern: 'DORMANCY_BREAK',
          confidence,
          severity: confidence >= 0.6 ? 'HIGH' : 'MEDIUM',
          description: `${entity}: ${Math.round(gap)} days dormant then AED ${entityTxs[i]._amount.toLocaleString()} transaction`,
          regulation: 'FDL No.10/2025 Art.26 | Cabinet Resolution 134/2025 Art.7 | FATF Red Flag: Dormancy Reactivation',
          entities: [entity],
          txIds: [entityTxs[i].id],
          evidence: {
            dormancyDays: Math.round(gap),
            reactivationAmount: entityTxs[i]._amount,
            method: entityTxs[i].method,
          },
        });
        break;
      }
    }
  }

  return alerts;
}

// ── Pattern 7: THRESHOLD EVASION ────────────────────────────

function detectThresholdEvasion(txs) {
  const alerts = [];

  // Find transactions consistently at 90-99% of threshold
  const cashTxs = txs.filter(t => t.method === 'cash' || !t.method);
  const nearThreshold = cashTxs.filter(t =>
    t._amount >= DPMS_THRESHOLD * 0.9 && t._amount < DPMS_THRESHOLD
  );

  if (nearThreshold.length >= 2) {
    const byEntity = {};
    for (const t of nearThreshold) {
      const key = t.from || t.to;
      if (!byEntity[key]) byEntity[key] = [];
      byEntity[key].push(t);
    }

    for (const [entity, entityTxs] of Object.entries(byEntity)) {
      if (entityTxs.length < 2) continue;

      const avgPct = mean(entityTxs.map(t => t._amount / DPMS_THRESHOLD));
      const confidence = Math.min(1,
        0.4 +
        (entityTxs.length >= 3 ? 0.25 : 0.1) +
        (avgPct >= 0.95 ? 0.2 : 0.1)
      );

      alerts.push({
        pattern: 'THRESHOLD_EVASION',
        confidence,
        severity: 'HIGH',
        description: `${entity}: ${entityTxs.length} transactions at ${Math.round(avgPct * 100)}% of AED ${DPMS_THRESHOLD.toLocaleString()} threshold`,
        regulation: 'FDL No.10/2025 Art.15-16 | MoE Circular 08/AML/2021 | FATF Red Flag: Threshold Evasion',
        entities: [entity],
        txIds: entityTxs.map(t => t.id),
        evidence: {
          count: entityTxs.length,
          amounts: entityTxs.map(t => t._amount),
          avgPercentOfThreshold: Math.round(avgPct * 100),
          threshold: DPMS_THRESHOLD,
        },
      });
    }
  }

  return alerts;
}

// ── Pattern 8: PROFILE MISMATCH ─────────────────────────────

function detectMismatch(txs, profiles) {
  if (!profiles) return [];
  const alerts = [];
  const byEntity = groupByEntity(txs);

  for (const [entity, entityTxs] of Object.entries(byEntity)) {
    const profile = profiles[entity];
    if (!profile || !profile.expectedMonthlyVolume) continue;

    // Calculate actual monthly volume
    if (entityTxs.length < 2) continue;
    const span = (entityTxs[entityTxs.length - 1]._date - entityTxs[0]._date) / 86400000;
    const months = Math.max(1, span / 30);
    const actualMonthly = entityTxs.reduce((s, t) => s + t._amount, 0) / months;
    const ratio = actualMonthly / profile.expectedMonthlyVolume;

    if (ratio > 3 || ratio < 0.1) {
      const confidence = Math.min(1,
        0.3 +
        (ratio > 10 ? 0.35 : ratio > 5 ? 0.25 : ratio > 3 ? 0.15 : 0) +
        (ratio < 0.05 ? 0.2 : ratio < 0.1 ? 0.1 : 0)
      );

      alerts.push({
        pattern: 'PROFILE_MISMATCH',
        confidence,
        severity: ratio > 5 ? 'HIGH' : 'MEDIUM',
        description: `${entity}: Actual monthly volume AED ${Math.round(actualMonthly).toLocaleString()} vs declared AED ${profile.expectedMonthlyVolume.toLocaleString()} (${Math.round(ratio * 100)}%)`,
        regulation: 'Cabinet Resolution 134/2025 Art.7-10 | FATF Red Flag: Activity Inconsistent with Profile',
        entities: [entity],
        txIds: entityTxs.map(t => t.id),
        evidence: {
          actualMonthly: Math.round(actualMonthly),
          expectedMonthly: profile.expectedMonthlyVolume,
          ratio: Math.round(ratio * 100) / 100,
          businessType: profile.businessType,
        },
      });
    }
  }

  return alerts;
}

// ── Helpers ─────────────────────────────────────────────────

function groupByEntity(txs) {
  const groups = {};
  for (const t of txs) {
    const key = t.from || t.to;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
    // Also add to receiver group
    if (t.to && t.to !== t.from) {
      if (!groups[t.to]) groups[t.to] = [];
      groups[t.to].push(t);
    }
  }
  return groups;
}

function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  // dd/mm/yyyy
  if (typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [day, month, year] = d.split('/');
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function deduplicateAlerts(alerts) {
  const seen = new Set();
  return alerts.filter(a => {
    const key = `${a.pattern}:${[...a.entities].sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { DPMS_THRESHOLD, CROSS_BORDER_THRESHOLD };
