// Hawkeye Sterling — wave-4 batch-B (36 modes).
// Categories: forensic (15) · cognitive_science (7) · graph_analysis (6) · esg (4) · statistical (4)
// Anchors: FATF · Benford 1938/Nigrini 1999 · IFRS 15 · Basel III · BCBS · ISO 37001 · ILO conventions

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof (ctx.evidence as Record<string, unknown>).freeText === 'string')
    parts.push((ctx.evidence as Record<string, unknown>).freeText as string);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hit(score: number): Verdict {
  return score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
}

function build(
  modeId: string,
  cat: ReasoningCategory,
  facs: FacultyId[],
  score: number,
  conf: number,
  rationale: string,
  evidence: string[],
): Finding {
  return {
    modeId,
    category: cat,
    faculties: facs,
    score: clamp(score, 0, 1),
    confidence: clamp(conf, 0, 1),
    verdict: hit(score),
    rationale,
    evidence,
    producedAt: Date.now(),
  };
}

function evArr<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// ════════════════════════════════════════════════════════════════════════════
// FORENSIC (15)
// ════════════════════════════════════════════════════════════════════════════

// ── benford_law ─────────────────────────────────────────────────────────────
// Benford's law (1938) / Nigrini (1999): first-digit distribution of naturally
// occurring financial data follows log10(1+1/d). Deviation signals fabrication.
interface BenfordTx { txId?: string; amount?: number; }
const benfordLawApply = async (ctx: BrainContext): Promise<Finding> => {
  const txs = evArr<BenfordTx>(ctx, 'benfordTxns');
  const fallback = evArr<{ amount?: number; txId?: string }>(ctx, 'transactions');
  const items = txs.length > 0 ? txs : fallback;

  if (items.length < 30) {
    const ft = freeTextOf(ctx);
    const kwHit = ft.includes('benford') || ft.includes('fabricat') || ft.includes('first digit');
    return build('benford_law', 'forensic', ['forensic_accounting', 'data_analysis'],
      kwHit ? 0.35 : 0.05, 0.3,
      `Benford's law: n=${items.length} < 30 minimum for reliable digit analysis. ${kwHit ? 'Free-text references fabrication/Benford concerns.' : 'Insufficient data.'}`,
      []);
  }

  // Expected Benford probabilities for digits 1-9
  const expected = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  const observed = new Array(10).fill(0) as number[];
  let counted = 0;

  for (const item of items) {
    const amt = Math.abs(item.amount ?? 0);
    if (amt < 1) continue;
    const firstDigit = parseInt(String(amt).replace(/^0+\.?0*/, '')[0] ?? '0', 10);
    if (firstDigit >= 1 && firstDigit <= 9) { observed[firstDigit]!++; counted++; }
  }

  if (counted < 10) {
    return build('benford_law', 'forensic', ['forensic_accounting', 'data_analysis'],
      0.05, 0.3, `Benford's law: only ${counted} valid non-zero amounts after filtering.`, []);
  }

  // Chi-square statistic vs Benford expected
  let chi2 = 0;
  const digitNotes: string[] = [];
  for (let d = 1; d <= 9; d++) {
    const exp = (expected[d] ?? 0) * counted;
    const obs = observed[d] ?? 0;
    chi2 += exp > 0 ? Math.pow(obs - exp, 2) / exp : 0;
    const dev = exp > 0 ? (obs - exp) / exp : 0;
    if (Math.abs(dev) > 0.3) digitNotes.push(`d${d}:obs=${obs},exp=${exp.toFixed(1)},dev=${(dev * 100).toFixed(0)}%`);
  }

  // Chi-square critical values (df=8): 15.51 @ p=0.05, 20.09 @ p=0.01, 26.12 @ p=0.001
  const score = chi2 > 26 ? 0.85 : chi2 > 20 ? 0.65 : chi2 > 15.5 ? 0.45 : 0.1;
  const conf = clamp(0.5 + counted / 500, 0.5, 0.92);
  const deviatingDigits = digitNotes.slice(0, 4).join('; ');

  return build('benford_law', 'forensic', ['forensic_accounting', 'data_analysis'],
    score, conf,
    `Benford's law (Nigrini 1999): χ²=${chi2.toFixed(2)} over n=${counted} amounts (df=8; critical 15.51@p=0.05, 26.12@p=0.001). ${chi2 > 15.5 ? `Significant digit-distribution anomaly — likely data fabrication or selective round-number entry. Deviating: ${deviatingDigits}.` : 'First-digit distribution consistent with Benford expectation.'}`,
    digitNotes.slice(0, 5));
};

// ── split_payment_detection ──────────────────────────────────────────────────
// Structuring / smurfing: multiple payments below reporting threshold that in
// aggregate exceed it. FATF R.10 / US BSA 31 USC §5324 / UAE FDL Art.14.
interface SplitPayment { groupId?: string; paymentCount?: number; totalAed?: number; thresholdAed?: number; maxSingleAed?: number; spanHours?: number; }
const splitPaymentDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const groups = evArr<SplitPayment>(ctx, 'splitPayments');
  if (groups.length === 0) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('structur') || ft.includes('smurfing') || ft.includes('split payment') || ft.includes('below threshold');
    return build('split_payment_detection', 'forensic', ['forensic_accounting', 'data_analysis'],
      kw ? 0.4 : 0.05, kw ? 0.45 : 0.25,
      `Split payment detection: no structured splitPayments evidence supplied. ${kw ? 'Free-text indicates structuring/smurfing language.' : ''}`,
      []);
  }

  const REPORT_THRESHOLD = 55_000; // AED equivalent (CBUAE threshold)
  const signals: string[] = [];
  let maxScore = 0;

  for (const g of groups) {
    const total = g.totalAed ?? 0;
    const count = g.paymentCount ?? 1;
    const threshold = g.thresholdAed ?? REPORT_THRESHOLD;
    const maxSingle = g.maxSingleAed ?? total;
    const span = g.spanHours ?? 24;

    let gScore = 0;
    // Total exceeds threshold but each individual payment is below it
    if (total >= threshold && maxSingle < threshold * 0.95) {
      gScore += 0.45;
      signals.push(`${g.groupId ?? 'grp'}: total AED ${total.toLocaleString()} in ${count} payments each below AED ${threshold.toLocaleString()}`);
    }
    // Many payments in a short window
    if (count >= 5 && span <= 48) { gScore += 0.2; signals.push(`${g.groupId ?? 'grp'}: ${count} payments in ${span}h`); }
    // Near-threshold clustering (90-99% of threshold)
    if (maxSingle >= threshold * 0.9 && maxSingle < threshold) { gScore += 0.25; signals.push(`${g.groupId ?? 'grp'}: max single AED ${maxSingle} near threshold`); }

    maxScore = Math.max(maxScore, clamp(gScore, 0, 1));
  }

  return build('split_payment_detection', 'forensic', ['forensic_accounting', 'data_analysis'],
    maxScore, clamp(0.55 + signals.length * 0.05, 0.55, 0.92),
    `Split payment / structuring (FATF R.10, UAE FDL Art.14, US BSA 31 USC §5324): ${groups.length} group(s) analysed. ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'No structuring pattern detected.'}`,
    signals.slice(0, 6));
};

// ── round_trip_transaction ───────────────────────────────────────────────────
// Funds leave an entity and return via a different route (net ≈ 0 or slight fee).
// Classic layering technique. FATF Typologies 2020 · IMF Working Paper 20/195.
interface RoundTrip { tripId?: string; outflowAed?: number; inflowAed?: number; spanDays?: number; intermediaryCount?: number; netAed?: number; }
const roundTripTransactionApply = async (ctx: BrainContext): Promise<Finding> => {
  const trips = evArr<RoundTrip>(ctx, 'roundTrips');
  if (trips.length === 0) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('round trip') || ft.includes('round-trip') || ft.includes('back-to-back') || ft.includes('net zero');
    return build('round_trip_transaction', 'forensic', ['forensic_accounting', 'data_analysis'],
      kw ? 0.38 : 0.05, kw ? 0.4 : 0.25,
      `Round-trip transaction: no roundTrips evidence supplied. ${kw ? 'Free-text suggests round-trip pattern.' : ''}`, []);
  }

  const signals: string[] = [];
  let maxScore = 0;

  for (const t of trips) {
    const out = t.outflowAed ?? 0;
    const inflow = t.inflowAed ?? 0;
    const span = t.spanDays ?? 999;
    const inters = t.intermediaryCount ?? 0;
    const net = t.netAed ?? Math.abs(out - inflow);
    if (out === 0) continue;

    const returnRatio = out > 0 ? inflow / out : 0;
    let gScore = 0;

    // Return ratio 0.85–1.15 = funds returned with small fee/markup
    if (returnRatio >= 0.85 && returnRatio <= 1.15) { gScore += 0.4; signals.push(`${t.tripId ?? 'trip'}: return ratio ${returnRatio.toFixed(2)}, net AED ${net.toLocaleString()}`); }
    if (span <= 30) { gScore += 0.2; signals.push(`${t.tripId ?? 'trip'}: completed in ${span} days`); }
    if (inters >= 2) { gScore += 0.2; signals.push(`${t.tripId ?? 'trip'}: ${inters} intermediaries`); }

    maxScore = Math.max(maxScore, clamp(gScore, 0, 1));
  }

  return build('round_trip_transaction', 'forensic', ['forensic_accounting', 'data_analysis'],
    maxScore, clamp(0.5 + trips.length * 0.05, 0.5, 0.9),
    `Round-trip transaction (FATF Typologies 2020, IMF WP 20/195): ${trips.length} candidate(s). ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'No confirmed round-trip pattern.'}`,
    signals.slice(0, 6));
};

// ── shell_triangulation ──────────────────────────────────────────────────────
// Three or more shell companies used in a triangle to obscure beneficial flow.
// FATF Guidance on Beneficial Ownership 2023 · OECD BEPS Action 6.
interface ShellTriangle { triangleId?: string; nodeCount?: number; allShells?: boolean; jurisdictionCount?: number; netFlowAed?: number; }
const shellTriangulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const triangles = evArr<ShellTriangle>(ctx, 'shellTriangles');
  if (triangles.length === 0) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('shell') && (ft.includes('triangl') || ft.includes('triangle') || ft.includes('three compan'));
    return build('shell_triangulation', 'forensic', ['forensic_accounting', 'intelligence'],
      kw ? 0.4 : 0.05, kw ? 0.4 : 0.25,
      `Shell triangulation: no shellTriangles evidence. ${kw ? 'Free-text implies shell triangle structure.' : ''}`, []);
  }

  const signals: string[] = [];
  let maxScore = 0;

  for (const t of triangles) {
    const nodes = t.nodeCount ?? 0;
    const shells = t.allShells ?? false;
    const jurs = t.jurisdictionCount ?? 1;
    let gScore = 0;

    if (nodes >= 3 && shells) { gScore += 0.45; signals.push(`${t.triangleId ?? 'tri'}: ${nodes}-node all-shell triangle`); }
    if (jurs >= 2) { gScore += 0.2; signals.push(`${t.triangleId ?? 'tri'}: ${jurs} jurisdictions`); }
    if (nodes >= 5) { gScore += 0.15; signals.push(`${t.triangleId ?? 'tri'}: extended chain (${nodes} nodes)`); }

    maxScore = Math.max(maxScore, clamp(gScore, 0, 1));
  }

  return build('shell_triangulation', 'forensic', ['forensic_accounting', 'intelligence'],
    maxScore, clamp(0.55 + signals.length * 0.04, 0.55, 0.9),
    `Shell triangulation (FATF BO Guidance 2023, OECD BEPS Action 6): ${triangles.length} structure(s) evaluated. ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'No shell-triangle pattern confirmed.'}`,
    signals.slice(0, 6));
};

// ── po_fraud_pattern ─────────────────────────────────────────────────────────
// Purchase-order fraud: PO created after goods delivered, inflated PO values,
// split POs below approval thresholds. ACFE 2022 Report to the Nations.
interface PORecord { poId?: string; poDateMs?: number; goodsReceivedDateMs?: number; poValueAed?: number; approvalThresholdAed?: number; priorPoCount?: number; priorPoSpanDays?: number; }
const poPraudPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const pos = evArr<PORecord>(ctx, 'purchaseOrders');
  if (pos.length === 0) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('purchase order') || ft.includes(' po ') || ft.includes('invoice fraud') || ft.includes('procurement fraud');
    return build('po_fraud_pattern', 'forensic', ['forensic_accounting', 'data_analysis'],
      kw ? 0.35 : 0.05, kw ? 0.4 : 0.25,
      `PO fraud: no purchaseOrders evidence. ${kw ? 'Free-text references PO/procurement fraud.' : ''}`, []);
  }

  const signals: string[] = [];
  let scoreSum = 0;

  for (const po of pos) {
    const poDate = po.poDateMs ?? 0;
    const grDate = po.goodsReceivedDateMs ?? 0;
    const val = po.poValueAed ?? 0;
    const threshold = po.approvalThresholdAed ?? 0;
    let gScore = 0;

    // PO dated after goods received = retrospective/fraudulent PO
    if (grDate > 0 && poDate > grDate) { gScore += 0.45; signals.push(`${po.poId ?? 'PO'}: PO post-dates goods receipt by ${((poDate - grDate) / 86400000).toFixed(0)}d`); }
    // PO value just below approval threshold (90-99%)
    if (threshold > 0 && val >= threshold * 0.9 && val < threshold) { gScore += 0.3; signals.push(`${po.poId ?? 'PO'}: AED ${val.toLocaleString()} just below threshold AED ${threshold.toLocaleString()}`); }
    // Many POs to same vendor in short period (splitting)
    if ((po.priorPoCount ?? 0) >= 3 && (po.priorPoSpanDays ?? 999) <= 30) { gScore += 0.25; signals.push(`${po.poId ?? 'PO'}: ${po.priorPoCount} prior POs in ${po.priorPoSpanDays}d`); }

    scoreSum += clamp(gScore, 0, 1);
  }

  const score = pos.length > 0 ? clamp(scoreSum / pos.length, 0, 1) : 0;
  return build('po_fraud_pattern', 'forensic', ['forensic_accounting', 'data_analysis'],
    score, clamp(0.5 + pos.length * 0.03, 0.5, 0.88),
    `PO fraud pattern (ACFE 2022 RTTN, COSO Internal Control Framework): ${pos.length} PO(s) reviewed. ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'No PO fraud indicators.'}`,
    signals.slice(0, 6));
};

// ── vendor_master_anomaly ────────────────────────────────────────────────────
// Ghost vendors, duplicate vendors, vendor-employee relationships.
// ACFE 2022 · ISO 37001:2016 anti-bribery management.
interface VendorRecord { vendorId?: string; nameMatchScore?: number; bankAccountSharedWithEmployee?: boolean; addressMatchesEmployee?: boolean; registrationDateMs?: number; firstPaymentDateMs?: number; noPhysicalPresence?: boolean; }
const vendorMasterAnomalyApply = async (ctx: BrainContext): Promise<Finding> => {
  const vendors = evArr<VendorRecord>(ctx, 'vendors');
  if (vendors.length === 0) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('ghost vendor') || ft.includes('vendor fraud') || ft.includes('fictitious vendor');
    return build('vendor_master_anomaly', 'forensic', ['forensic_accounting', 'data_analysis'],
      kw ? 0.38 : 0.05, kw ? 0.42 : 0.25,
      `Vendor master anomaly: no vendors evidence. ${kw ? 'Free-text references ghost/fictitious vendor.' : ''}`, []);
  }

  const signals: string[] = [];
  let scoreSum = 0;

  for (const v of vendors) {
    let gScore = 0;
    if (v.bankAccountSharedWithEmployee === true) { gScore += 0.5; signals.push(`${v.vendorId ?? 'vendor'}: bank account shared with employee`); }
    if (v.addressMatchesEmployee === true) { gScore += 0.35; signals.push(`${v.vendorId ?? 'vendor'}: address matches employee`); }
    if (v.noPhysicalPresence === true) { gScore += 0.25; signals.push(`${v.vendorId ?? 'vendor'}: no verifiable physical presence`); }
    // Registration date after first payment = impossible/backdated vendor
    if ((v.registrationDateMs ?? 0) > 0 && (v.firstPaymentDateMs ?? 0) > 0 && v.firstPaymentDateMs! < v.registrationDateMs!) {
      gScore += 0.4; signals.push(`${v.vendorId ?? 'vendor'}: paid before registration`);
    }
    if ((v.nameMatchScore ?? 1) < 0.5) { gScore += 0.2; signals.push(`${v.vendorId ?? 'vendor'}: name similarity to another vendor ${((v.nameMatchScore ?? 0) * 100).toFixed(0)}%`); }
    scoreSum += clamp(gScore, 0, 1);
  }

  const score = vendors.length > 0 ? clamp(scoreSum / vendors.length, 0, 1) : 0;
  return build('vendor_master_anomaly', 'forensic', ['forensic_accounting', 'data_analysis'],
    score, clamp(0.5 + vendors.length * 0.04, 0.5, 0.9),
    `Vendor master anomaly (ACFE 2022 RTTN, ISO 37001:2016): ${vendors.length} vendor(s) screened. ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'No vendor-master anomalies detected.'}`,
    signals.slice(0, 6));
};

// ── journal_entry_anomaly ────────────────────────────────────────────────────
// Journal entries made outside business hours, by unusual users, or with
// round numbers / missing descriptions. PCAOB AS 2401 / IAS 8.
interface JournalEntry { jeId?: string; postedHourLocal?: number; postedByRoleLevel?: string; amountAed?: number; hasDescription?: boolean; approvedBy?: string; weekendPost?: boolean; }
const journalEntryAnomalyApply = async (ctx: BrainContext): Promise<Finding> => {
  const entries = evArr<JournalEntry>(ctx, 'journalEntries');
  if (entries.length === 0) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('journal entry') || ft.includes('je fraud') || ft.includes('general ledger') || ft.includes('top-side');
    return build('journal_entry_anomaly', 'forensic', ['forensic_accounting', 'data_analysis'],
      kw ? 0.35 : 0.05, kw ? 0.4 : 0.25,
      `Journal entry anomaly: no journalEntries evidence. ${kw ? 'Free-text references JE/ledger manipulation.' : ''}`, []);
  }

  const signals: string[] = [];
  let flagCount = 0;

  for (const je of entries) {
    const hour = je.postedHourLocal ?? 12;
    let gScore = 0;
    if (hour < 6 || hour >= 22) { gScore += 0.3; signals.push(`${je.jeId ?? 'JE'}: posted at ${hour}:00 (off-hours)`); }
    if (je.weekendPost === true) { gScore += 0.2; signals.push(`${je.jeId ?? 'JE'}: weekend post`); }
    if (je.hasDescription === false) { gScore += 0.25; signals.push(`${je.jeId ?? 'JE'}: no description`); }
    if (!je.approvedBy) { gScore += 0.2; signals.push(`${je.jeId ?? 'JE'}: unapproved`); }
    const amt = je.amountAed ?? 0;
    if (amt >= 1000 && amt % 1000 === 0) { gScore += 0.1; signals.push(`${je.jeId ?? 'JE'}: round AED ${amt.toLocaleString()}`); }
    if (gScore >= 0.3) flagCount++;
  }

  const score = entries.length > 0 ? clamp(flagCount / entries.length * 0.9 + (signals.length > 0 ? 0.1 : 0), 0, 1) : 0;
  return build('journal_entry_anomaly', 'forensic', ['forensic_accounting', 'data_analysis'],
    score, clamp(0.5 + entries.length * 0.02, 0.5, 0.88),
    `Journal entry anomaly (PCAOB AS 2401, IAS 8): ${entries.length} JE(s) reviewed, ${flagCount} flagged. ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'No JE anomalies.'}`,
    signals.slice(0, 6));
};

// ── revenue_recognition_stretch ──────────────────────────────────────────────
// Premature/overstated revenue recognition to hit targets.
// IFRS 15 / ASC 606 / SEC SAB 104.
interface RevenueEntry { contractId?: string; recognitionDateMs?: number; deliveryDateMs?: number; recognitionBasisStated?: string; percentageComplete?: number; totalContractAed?: number; }
const revenueRecognitionStretchApply = async (ctx: BrainContext): Promise<Finding> => {
  const entries = evArr<RevenueEntry>(ctx, 'revenueEntries');
  if (entries.length === 0) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('revenue recogni') || ft.includes('channel stuffing') || ft.includes('bill and hold') || ft.includes('premature revenue');
    return build('revenue_recognition_stretch', 'forensic', ['forensic_accounting', 'data_analysis'],
      kw ? 0.4 : 0.05, kw ? 0.45 : 0.25,
      `Revenue recognition: no revenueEntries evidence. ${kw ? 'Free-text references revenue manipulation.' : ''}`, []);
  }

  const signals: string[] = [];
  let scoreSum = 0;

  for (const e of entries) {
    const recDate = e.recognitionDateMs ?? 0;
    const delDate = e.deliveryDateMs ?? 0;
    const pct = e.percentageComplete ?? 100;
    let gScore = 0;

    // Revenue recognised before delivery
    if (recDate > 0 && delDate > 0 && recDate < delDate) {
      const daysEarly = (delDate - recDate) / 86400000;
      gScore += Math.min(0.5, 0.1 * Math.log2(daysEarly + 1));
      signals.push(`${e.contractId ?? 'contract'}: revenue recognised ${daysEarly.toFixed(0)}d before delivery`);
    }
    // Percentage-of-completion overstated relative to basis stated
    if (pct >= 95 && (e.recognitionBasisStated ?? '').toLowerCase().includes('milestone') &&
        (e.deliveryDateMs ?? 0) === 0) {
      gScore += 0.35; signals.push(`${e.contractId ?? 'contract'}: 95%+ PoC claimed but no delivery milestone recorded`);
    }

    scoreSum += clamp(gScore, 0, 1);
  }

  const score = entries.length > 0 ? clamp(scoreSum / entries.length, 0, 1) : 0;
  return build('revenue_recognition_stretch', 'forensic', ['forensic_accounting', 'data_analysis'],
    score, clamp(0.5 + entries.length * 0.03, 0.5, 0.88),
    `Revenue recognition stretch (IFRS 15, ASC 606, SEC SAB 104): ${entries.length} contract(s). ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'Revenue recognition timings are consistent with delivery.'}`,
    signals.slice(0, 5));
};

// ── stylometry ───────────────────────────────────────────────────────────────
// Authorship analysis: sudden shift in writing style in documents/communications
// may indicate ghostwriting, fabrication, or impersonation.
// Koppel et al. (2009) Computational authorship verification.
const stylometryApply = async (ctx: BrainContext): Promise<Finding> => {
  const docs = evArr<{ docId?: string; text?: string; avgWordLength?: number; typeTokenRatio?: number; sentenceLengthMean?: number; authorId?: string }>(ctx, 'documents');
  const ft = freeTextOf(ctx);

  if (docs.length < 2) {
    const kw = ft.includes('ghost') || ft.includes('impersonat') || ft.includes('stylometr') || ft.includes('authorship');
    return build('stylometry', 'forensic', ['intelligence', 'data_analysis'],
      kw ? 0.35 : 0.05, kw ? 0.4 : 0.25,
      `Stylometry: need ≥2 documents to compare style. ${kw ? 'Free-text suggests authorship concern.' : ''}`, []);
  }

  // Compare stylometric features across docs grouped by stated author
  const byAuthor = new Map<string, Array<{ avgWordLength?: number; typeTokenRatio?: number; sentenceLengthMean?: number }>>();
  for (const d of docs) {
    const auth = d.authorId ?? 'unknown';
    if (!byAuthor.has(auth)) byAuthor.set(auth, []);
    byAuthor.get(auth)!.push(d);
  }

  const signals: string[] = [];
  let maxDeviation = 0;

  for (const [auth, authDocs] of byAuthor.entries()) {
    if (authDocs.length < 2) continue;
    const wls = authDocs.map(d => d.avgWordLength ?? 0).filter(x => x > 0);
    if (wls.length < 2) continue;
    const meanWl = wls.reduce((a, b) => a + b, 0) / wls.length;
    const maxDev = Math.max(...wls.map(w => Math.abs(w - meanWl) / meanWl));
    if (maxDev > 0.2) {
      signals.push(`${auth}: word-length deviation ${(maxDev * 100).toFixed(0)}% across ${authDocs.length} docs — possible authorship change`);
      maxDeviation = Math.max(maxDeviation, maxDev);
    }
  }

  const score = clamp(maxDeviation * 2, 0, 0.8);
  return build('stylometry', 'forensic', ['intelligence', 'data_analysis'],
    score, clamp(0.4 + docs.length * 0.04, 0.4, 0.82),
    `Stylometry (Koppel et al. 2009, Mosteller & Wallace 1964): ${docs.length} doc(s) across ${byAuthor.size} stated author(s). ${signals.length > 0 ? signals.join(' | ') : 'No significant stylometric deviation detected.'}`,
    signals.slice(0, 5));
};

// ── gaslighting_detection ────────────────────────────────────────────────────
// Customer/counterparty disputes clear evidence, claims system errors, denies
// documented facts. Psychological manipulation tactic. FATF Egmont 2021 EDD guidance.
const gaslightingDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const comms = evArr<{ commId?: string; text?: string; sentiment?: string }>(ctx, 'communications');

  const gaslightTerms = [
    'never happened', 'system error', 'your mistake', 'you are wrong', 'that is not what i said',
    'i never said', 'you misunderstood', 'prove it', 'fabricated', 'your records are wrong',
    'stop lying', 'you are confused', 'that is impossible', 'i was never informed',
    'denies all', 'no such transaction', 'never authorized',
  ];

  const hits: string[] = [];
  for (const term of gaslightTerms) {
    if (ft.includes(term)) hits.push(term);
  }

  for (const c of comms) {
    const text = (c.text ?? '').toLowerCase();
    for (const term of gaslightTerms) {
      if (text.includes(term)) hits.push(`${c.commId ?? 'comm'}: "${term}"`);
    }
  }

  const deduplicated = [...new Set(hits)];
  const score = clamp(deduplicated.length * 0.12, 0, 0.75);

  return build('gaslighting_detection', 'forensic', ['intelligence', 'reasoning'],
    score, clamp(0.4 + deduplicated.length * 0.06, 0.4, 0.85),
    `Gaslighting / evidence denial (FATF Egmont EDD 2021, FinCEN Guidance FIN-2014-A007): ${deduplicated.length} denial/manipulation signal(s). ${deduplicated.length > 0 ? 'Subject disputes documented evidence — heightened EDD warranted. Signals: ' + deduplicated.slice(0, 4).join('; ') : 'No evidence-denial pattern detected.'}`,
    deduplicated.slice(0, 6));
};

// ── obfuscation_pattern ──────────────────────────────────────────────────────
// Deliberate complexity: nominee directors, layered structures, complex contracts
// that serve no evident commercial purpose. FATF Guidance on Complexity 2018.
const obfuscationPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const ev = ctx.evidence as Record<string, unknown>;

  const signals: string[] = [];
  let score = 0;

  const uboChain = Array.isArray(ev.uboChain) ? ev.uboChain : [];
  if (uboChain.length >= 5) { score += 0.25; signals.push(`UBO chain depth ${uboChain.length}`); }

  // Nominee signals in free text
  const nomineeTerms = ['nominee', 'bearer share', 'no beneficial owner', 'no ubo identified', 'opaque structure', 'complex structure', 'layered ownership', 'trust overlay'];
  for (const t of nomineeTerms) {
    if (ft.includes(t)) { score += 0.12; signals.push(`keyword: "${t}"`); }
  }

  const sanctionsHits = Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0;
  const pepHits = Array.isArray(ev.pepHits) ? ev.pepHits.length : 0;
  if (sanctionsHits > 0 || pepHits > 0) score += 0.1;

  // Jurisdictions used in UBO chain
  const jurisdictions = new Set<string>();
  for (const node of uboChain) {
    const n = node as Record<string, unknown>;
    if (typeof n.jurisdiction === 'string') jurisdictions.add(n.jurisdiction);
  }
  if (jurisdictions.size >= 4) { score += 0.2; signals.push(`${jurisdictions.size} distinct UBO jurisdictions`); }

  return build('obfuscation_pattern', 'forensic', ['intelligence', 'forensic_accounting'],
    clamp(score, 0, 0.9), clamp(0.4 + signals.length * 0.06, 0.4, 0.88),
    `Obfuscation pattern (FATF Guidance on Complex Structures 2018, OECD GloBE): ${signals.length} indicator(s). ${signals.length > 0 ? signals.join(' | ') : 'No deliberate complexity detected.'}`,
    signals.slice(0, 6));
};

// ── code_word_detection ──────────────────────────────────────────────────────
// Euphemistic or coded language in transaction memos/communications that may
// signal narcotics, weapons, or other illicit trade. DEA/FATF narco typologies.
const codeWordDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const comms = evArr<{ commId?: string; text?: string }>(ctx, 'communications');
  const txs = evArr<{ txId?: string; memo?: string; description?: string }>(ctx, 'transactions');

  // Coded/euphemistic terms associated with illicit activity
  const codeWordSets: { label: string; terms: string[] }[] = [
    { label: 'narcotics', terms: ['snow', 'powder', 'white', 'merchandise', 'product', 'stuff', 'material', 'commodity', 'sugar', 'candy', 'tickets', 'flowers'] },
    { label: 'weapons', terms: ['hardware', 'tools', 'items', 'goods', 'pieces', 'units', 'packages', 'equipment'] },
    { label: 'laundering', terms: ['clean', 'wash', 'service fee', 'consulting fee', 'commission', 'donation', 'gift', 'loan repayment'] },
    { label: 'tf', terms: ['project', 'cause', 'brothers', 'organisation', 'the work', 'the mission'] },
  ];

  const allText: string[] = [ft];
  for (const c of comms) allText.push((c.text ?? '').toLowerCase());
  for (const t of txs) allText.push(((t.memo ?? '') + ' ' + (t.description ?? '')).toLowerCase());
  const blob = allText.join(' ');

  const matched: string[] = [];
  for (const ws of codeWordSets) {
    for (const term of ws.terms) {
      // Require word boundaries to reduce false positives
      const re = new RegExp(`\\b${term}\\b`, 'i'); // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
      if (re.test(blob)) matched.push(`${ws.label}:"${term}"`);
    }
  }

  const score = clamp(matched.length * 0.08, 0, 0.65);
  const conf = matched.length > 0 ? clamp(0.35 + matched.length * 0.05, 0.35, 0.72) : 0.25;

  return build('code_word_detection', 'forensic', ['intelligence', 'reasoning'],
    score, conf,
    `Code word detection (DEA narco typologies, FATF TF indicators, FinCEN Advisory FIN-2014-A007): ${matched.length} potential code term(s) in communications/memos. ${matched.length > 0 ? 'Matched: ' + matched.slice(0, 6).join(', ') + '. Recommend human review — false-positive risk is elevated without context.' : 'No coded language detected.'}`,
    matched.slice(0, 6));
};

// ── hedging_language ─────────────────────────────────────────────────────────
// Excessive hedging in customer explanations may mask intentional deception.
// Vrij (2008) Detecting Lies · PEACE model / cognitive interview research.
const hedgingLanguageApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const comms = evArr<{ commId?: string; text?: string }>(ctx, 'communications');

  const hedgeTerms = [
    'i think', 'maybe', 'possibly', 'i believe', 'sort of', 'kind of', 'more or less',
    'approximately', 'roughly', 'i suppose', 'might have', 'could have', 'not sure',
    'i cannot recall', 'i do not remember', 'to the best of my recollection',
    'as far as i know', 'if i recall correctly', 'i am not certain',
  ];

  const allText = [ft, ...comms.map(c => (c.text ?? '').toLowerCase())];
  const blob = allText.join(' ');

  let hedgeCount = 0;
  const matchedTerms: string[] = [];
  for (const term of hedgeTerms) {
    const count = (blob.match(new RegExp(term, 'gi')) ?? []).length; // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
    if (count > 0) { hedgeCount += count; matchedTerms.push(`"${term}"×${count}`); }
  }

  const wordCount = blob.split(/\s+/).length;
  const hedgeDensity = wordCount > 0 ? hedgeCount / wordCount * 100 : 0;

  // Normal conversation: ~1-2%. >5% is suspicious. >10% is very high.
  const score = hedgeDensity > 10 ? 0.65 : hedgeDensity > 5 ? 0.45 : hedgeDensity > 2 ? 0.25 : 0.05;

  return build('hedging_language', 'forensic', ['intelligence', 'reasoning'],
    score, clamp(0.4 + Math.min(hedgeCount, 20) * 0.02, 0.4, 0.78),
    `Hedging language (Vrij 2008 Detecting Lies, PEACE cognitive interview model): hedge density ${hedgeDensity.toFixed(1)}% (${hedgeCount} occurrences / ${wordCount} words). ${hedgeDensity > 5 ? 'Elevated hedging may indicate deception — cross-reference with verifiable documentary evidence. Top terms: ' + matchedTerms.slice(0, 4).join(', ') : 'Hedging within normal conversational range.'}`,
    matchedTerms.slice(0, 5));
};

// ── minimisation_pattern ─────────────────────────────────────────────────────
// Downplaying the significance of transactions, relationships, or activities.
// Reality monitoring / deception research (Johnson & Raye 1981, Vrij 2008).
const minimisationPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);

  const minTerms = [
    'just a small', 'only a minor', 'insignificant', 'nothing serious', 'routine transaction',
    'standard practice', 'everyone does it', 'it is normal', 'not a big deal', 'barely',
    'trivial', 'negligible', 'harmless', 'simple loan', 'just a gift', 'minor adjustment',
    'small favour', 'no big deal',
  ];

  const matched: string[] = [];
  for (const t of minTerms) {
    if (ft.includes(t)) matched.push(`"${t}"`);
  }

  const score = clamp(matched.length * 0.15, 0, 0.65);

  return build('minimisation_pattern', 'forensic', ['intelligence', 'reasoning'],
    score, clamp(0.35 + matched.length * 0.06, 0.35, 0.78),
    `Minimisation pattern (Johnson & Raye 1981 reality monitoring, Vrij 2008, PEACE model): ${matched.length} minimising term(s) detected. ${matched.length > 0 ? 'Subject language minimises severity/significance: ' + matched.slice(0, 4).join(', ') + '. Cross-check against objective transaction data.' : 'No minimisation language detected.'}`,
    matched.slice(0, 5));
};

// ── chain_of_custody_reasoning ───────────────────────────────────────────────
// Verifies documentary chain of custody for evidence — gaps may indicate
// tampering or incomplete disclosure. ISO/IEC 27037, ACPO Digital Evidence Guide.
interface CustodyRecord { docId?: string; receivedMs?: number; examinedMs?: number; handledBy?: string[]; hashVerified?: boolean; gapDays?: number; }
const chainOfCustodyReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const records = evArr<CustodyRecord>(ctx, 'custodyRecords');
  const ft = freeTextOf(ctx);

  if (records.length === 0) {
    const kw = ft.includes('chain of custody') || ft.includes('evidence tamper') || ft.includes('document integrity');
    return build('chain_of_custody_reasoning', 'forensic', ['intelligence', 'forensic_accounting'],
      kw ? 0.35 : 0.05, kw ? 0.4 : 0.25,
      `Chain of custody: no custodyRecords supplied. ${kw ? 'Free-text raises custody/integrity concerns.' : ''}`, []);
  }

  const signals: string[] = [];
  let issueCount = 0;

  for (const r of records) {
    let gScore = 0;
    if (r.hashVerified === false) { gScore += 0.4; signals.push(`${r.docId ?? 'doc'}: hash verification failed`); }
    if ((r.gapDays ?? 0) > 7) { gScore += 0.25; signals.push(`${r.docId ?? 'doc'}: ${r.gapDays}d custody gap`); }
    if ((r.handledBy ?? []).length === 0) { gScore += 0.2; signals.push(`${r.docId ?? 'doc'}: no handler recorded`); }
    if (gScore >= 0.3) issueCount++;
  }

  const score = records.length > 0 ? clamp(issueCount / records.length * 0.85, 0, 1) : 0;
  return build('chain_of_custody_reasoning', 'forensic', ['intelligence', 'forensic_accounting'],
    score, clamp(0.5 + records.length * 0.03, 0.5, 0.9),
    `Chain of custody (ISO/IEC 27037, ACPO Digital Evidence Guide 2012): ${records.length} record(s), ${issueCount} with custody issues. ${signals.length > 0 ? signals.slice(0, 4).join(' | ') : 'Chain of custody intact.'}`,
    signals.slice(0, 6));
};

// ════════════════════════════════════════════════════════════════════════════
// COGNITIVE SCIENCE (7)
// ════════════════════════════════════════════════════════════════════════════

// ── prospect_theory ──────────────────────────────────────────────────────────
// Kahneman & Tversky (1979): people overweight losses vs equivalent gains.
// In AML context: subjects may accept higher legal risk to avoid perceived loss.
const prospectTheoryApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const priors = ctx.priorFindings;

  // Signals: subject under financial pressure (loss domain), taking unusual risks
  const lossDomainTerms = ['loss', 'debt', 'insolvency', 'bankruptcy', 'foreclosure', 'margin call', 'underwater', 'negative equity', 'financial difficulty', 'desperate'];
  const riskSignals = priors.filter(f => f.score >= 0.5).map(f => f.modeId);
  const lossMatches = lossDomainTerms.filter(t => ft.includes(t));

  // When in loss domain AND high-risk behaviours present → prospect theory explains risk-taking
  const inLossDomain = lossMatches.length >= 2;
  const highRiskBehaviour = riskSignals.length >= 2;

  let score = 0;
  if (inLossDomain && highRiskBehaviour) { score = 0.65; }
  else if (inLossDomain || highRiskBehaviour) { score = 0.35; }

  return build('prospect_theory', 'cognitive_science', ['reasoning', 'deep_thinking'],
    score, clamp(0.45 + (lossMatches.length + riskSignals.length) * 0.04, 0.45, 0.82),
    `Prospect theory (Kahneman & Tversky 1979): ${lossMatches.length} loss-domain indicator(s) [${lossMatches.slice(0, 3).join(', ')}]; ${riskSignals.length} high-risk prior finding(s). ${inLossDomain && highRiskBehaviour ? 'Loss-domain framing likely amplifying risk-taking — behavioural explanation consistent with observed conduct.' : 'Prospect theory framing does not strongly explain current risk profile.'}`,
    [...lossMatches.slice(0, 3), ...riskSignals.slice(0, 3)]);
};

// ── status_quo_bias ──────────────────────────────────────────────────────────
// Samuelson & Zeckhauser (1988): preference for existing state.
// In AML: FI/customer maintains risky relationship due to inertia.
const statusQuoBiasApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const priors = ctx.priorFindings;

  const inertiaTerms = ['long-standing', 'long standing', 'historic relationship', 'always been', 'decades', 'traditional', 'no changes', 'unchanged', 'established practice', 'legacy', 'old relationship'];
  const warningPriors = priors.filter(f => f.score >= 0.4);

  const inertiaMatches = inertiaTerms.filter(t => ft.includes(t));
  // Status quo bias is a concern when warnings exist but relationship continues unchanged
  const score = warningPriors.length >= 2 && inertiaMatches.length >= 1 ? 0.55
    : warningPriors.length >= 1 && inertiaMatches.length >= 1 ? 0.35
    : 0.05;

  return build('status_quo_bias', 'cognitive_science', ['reasoning', 'introspection'],
    score, clamp(0.4 + (inertiaMatches.length + warningPriors.length) * 0.04, 0.4, 0.8),
    `Status quo bias (Samuelson & Zeckhauser 1988): ${inertiaMatches.length} inertia signal(s) [${inertiaMatches.slice(0, 3).join(', ')}] against ${warningPriors.length} flagged prior finding(s). ${score >= 0.5 ? 'Risk: existing risky relationship being maintained due to status quo inertia — recommend structured review.' : 'Status quo inertia does not appear to be driving continued risk exposure.'}`,
    inertiaMatches.slice(0, 4));
};

// ── endowment_effect ─────────────────────────────────────────────────────────
// Thaler (1980): people overvalue what they own.
// In AML: subject overvalues existing structure/assets → reluctant to divest
// or provide documentation about them.
const endowmentEffectApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);

  const endowmentTerms = ['refuse to sell', 'will not divest', 'mine', 'my property', 'my company', 'my asset', 'not for sale', 'i built it', 'family asset', 'inherited'];
  const documentResistance = ['refuses to provide', 'unwilling to disclose', 'declined to share', 'no documentation available', 'cannot provide'];

  const endowMatches = endowmentTerms.filter(t => ft.includes(t));
  const docResMatches = documentResistance.filter(t => ft.includes(t));

  const score = clamp((endowMatches.length * 0.12) + (docResMatches.length * 0.2), 0, 0.65);

  return build('endowment_effect', 'cognitive_science', ['reasoning', 'introspection'],
    score, clamp(0.35 + (endowMatches.length + docResMatches.length) * 0.05, 0.35, 0.78),
    `Endowment effect (Thaler 1980, Kahneman et al. 1991): ${endowMatches.length} ownership-overvaluation signal(s) + ${docResMatches.length} documentation-resistance signal(s). ${score >= 0.3 ? 'Subject appears to overvalue existing structure, impeding transparency obligations.' : 'No endowment-effect pattern detected.'}`,
    [...endowMatches.slice(0, 3), ...docResMatches.slice(0, 3)]);
};

// ── hyperbolic_discount ──────────────────────────────────────────────────────
// Laibson (1997), O'Donoghue & Rabin (1999): strong preference for immediate
// reward over larger future reward. In AML: rapid asset liquidation, immediate
// cash demands, short-cycle transactions despite adverse terms.
const hyperbolicDiscountApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = evArr<{ txId?: string; urgencyFlagDays?: number; discountPct?: number }>(ctx, 'transactions');

  const urgencyTerms = ['immediate', 'urgent', 'asap', 'same day', 'right now', 'no delay', 'cash now', 'liquidate', 'sell at any price', 'below market'];
  const urgencyMatches = urgencyTerms.filter(t => ft.includes(t));

  // Structured: high-discount rapid transactions
  const deepDiscountTxs = txs.filter(t => (t.discountPct ?? 0) >= 15 && (t.urgencyFlagDays ?? 99) <= 2);

  const score = clamp(urgencyMatches.length * 0.1 + deepDiscountTxs.length * 0.2, 0, 0.7);

  return build('hyperbolic_discount', 'cognitive_science', ['reasoning', 'deep_thinking'],
    score, clamp(0.4 + urgencyMatches.length * 0.04 + deepDiscountTxs.length * 0.06, 0.4, 0.82),
    `Hyperbolic discounting (Laibson 1997, O'Donoghue & Rabin 1999): ${urgencyMatches.length} urgency signal(s) + ${deepDiscountTxs.length} deep-discount rapid transaction(s). ${score >= 0.3 ? 'Subject exhibits strong present-bias — willingness to accept large losses for immediate liquidity is a placement-phase indicator.' : 'No hyperbolic discounting pattern.'}`,
    urgencyMatches.slice(0, 4));
};

// ── certainty_effect ─────────────────────────────────────────────────────────
// Kahneman & Tversky (1979): overweighting of certain outcomes vs probabilistic.
// In AML: subject insists on guaranteed/fixed payments, avoids variable structures
// that might attract regulatory attention — reveals intent.
const certaintyEffectApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const priors = ctx.priorFindings;

  const certaintyTerms = ['guaranteed', 'fixed amount', 'certain payment', 'no risk', 'assured', 'definite', 'promised', 'predetermined', 'agreed in advance'];
  const certMatches = certaintyTerms.filter(t => ft.includes(t));
  const highScorePriors = priors.filter(f => f.score >= 0.5);

  // Certainty effect is flagged when certainty-seeking combines with suspicious priors
  const score = certMatches.length >= 2 && highScorePriors.length >= 1 ? 0.5
    : certMatches.length >= 1 ? 0.25
    : 0.05;

  return build('certainty_effect', 'cognitive_science', ['reasoning', 'introspection'],
    score, clamp(0.38 + certMatches.length * 0.06, 0.38, 0.78),
    `Certainty effect (Kahneman & Tversky 1979 Allais paradox): ${certMatches.length} certainty-seeking signal(s) against ${highScorePriors.length} adverse prior findings. ${score >= 0.3 ? 'Insistence on pre-agreed fixed payments alongside suspicious activity may indicate structured/pre-arranged scheme.' : 'Certainty preference does not indicate adverse pattern in isolation.'}`,
    certMatches.slice(0, 4));
};

// ── reference_point_shift ────────────────────────────────────────────────────
// Kahneman & Tversky (1979): gains/losses defined relative to reference point.
// In AML: subject reframes illicit gains as "return on investment" or "earnings"
// to normalise them.
const referencePointShiftApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);

  const reframeTerms = [
    'return on investment', 'roi', 'earnings', 'profit', 'income', 'compensation',
    'reward', 'bonus', 'dividend', 'interest earned', 'it is just business',
    'normal business income', 'legitimate profit', 'deserved payment',
  ];

  const adverseContext = [
    'cash', 'cryptocurrency', 'wire', 'offshore', 'no invoice', 'no contract',
    'undocumented', 'informal', 'unregistered',
  ];

  const reframeMatches = reframeTerms.filter(t => ft.includes(t));
  const adverseMatches = adverseContext.filter(t => ft.includes(t));

  // Concern: reframing language used alongside indicators of informal/undocumented transactions
  const score = reframeMatches.length >= 2 && adverseMatches.length >= 2 ? 0.55
    : (reframeMatches.length >= 1 && adverseMatches.length >= 1) ? 0.3
    : 0.05;

  return build('reference_point_shift', 'cognitive_science', ['reasoning', 'deep_thinking'],
    score, clamp(0.38 + (reframeMatches.length + adverseMatches.length) * 0.04, 0.38, 0.8),
    `Reference point shift (Kahneman & Tversky 1979 prospect theory §3): ${reframeMatches.length} reframing term(s) + ${adverseMatches.length} adverse-context indicator(s). ${score >= 0.3 ? 'Subject appears to normalise illicit proceeds by reframing as legitimate earnings — integration-phase indicator.' : 'No adverse reference-point reframing detected.'}`,
    [...reframeMatches.slice(0, 3), ...adverseMatches.slice(0, 3)]);
};

// ── mental_accounting ────────────────────────────────────────────────────────
// Thaler (1985): people categorise money differently by source/purpose.
// In AML: "clean" and "dirty" funds kept in separate mental buckets;
// commingling between accounts with distinct stated purposes.
const mentalAccountingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = evArr<{ txId?: string; fromAccountPurpose?: string; toAccountPurpose?: string; amountAed?: number }>(ctx, 'transactions');

  const signals: string[] = [];
  let score = 0;

  // Structured: transactions moving between accounts with inconsistent stated purposes
  for (const tx of txs) {
    const from = (tx.fromAccountPurpose ?? '').toLowerCase();
    const to = (tx.toAccountPurpose ?? '').toLowerCase();
    if (from && to && from !== to) {
      const purposeConflict = (from.includes('personal') && to.includes('business')) ||
        (from.includes('salary') && to.includes('investment')) ||
        (from.includes('savings') && to.includes('operating'));
      if (purposeConflict) {
        signals.push(`${tx.txId ?? 'tx'}: ${from}→${to} AED ${(tx.amountAed ?? 0).toLocaleString()}`);
        score += 0.15;
      }
    }
  }

  // Free-text indicators
  const mentalTerms = ['separate accounts', 'keep separate', 'different pot', 'ring-fenced', 'another account for that', 'that money is separate'];
  const ftMatches = mentalTerms.filter(t => ft.includes(t));
  score += ftMatches.length * 0.1;

  return build('mental_accounting', 'cognitive_science', ['reasoning', 'data_analysis'],
    clamp(score, 0, 0.7), clamp(0.4 + (signals.length + ftMatches.length) * 0.04, 0.4, 0.82),
    `Mental accounting (Thaler 1985, Shefrin & Thaler 1988): ${signals.length} cross-purpose fund movement(s) + ${ftMatches.length} compartmentalisation term(s). ${score >= 0.3 ? 'Subject maintains distinct mental accounts for funds of different origins — potential commingling/integration indicator.' : 'No adverse mental-accounting pattern.'}`,
    [...signals.slice(0, 4), ...ftMatches.slice(0, 2)]);
};

// ════════════════════════════════════════════════════════════════════════════
// GRAPH ANALYSIS (6)
// ════════════════════════════════════════════════════════════════════════════

// ── k_core_analysis ──────────────────────────────────────────────────────────
// k-core decomposition: nodes remaining when iteratively removing nodes with
// degree < k. High k-core = dense criminal network core.
// Seidman (1983) Network Cohesion · UNODC network analysis guidance.
interface GraphNode { nodeId: string; degree?: number; kCore?: number; flagged?: boolean; }
const kCoreAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const nodes = evArr<GraphNode>(ctx, 'graphNodes');
  if (nodes.length < 3) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('k-core') || ft.includes('network core') || ft.includes('dense network');
    return build('k_core_analysis', 'graph_analysis', ['data_analysis', 'intelligence'],
      kw ? 0.3 : 0.05, kw ? 0.35 : 0.25,
      `k-core analysis: need ≥3 graph nodes. ${kw ? 'Free-text references dense network.' : ''}`, []);
  }

  // If pre-computed k-core values are provided, use them
  const withKCore = nodes.filter(n => typeof n.kCore === 'number');
  if (withKCore.length > 0) {
    const maxK = Math.max(...withKCore.map(n => n.kCore ?? 0));
    const highCoreNodes = withKCore.filter(n => (n.kCore ?? 0) >= Math.max(3, maxK * 0.7));
    const flaggedInCore = highCoreNodes.filter(n => n.flagged === true);
    const score = maxK >= 5 ? 0.75 : maxK >= 3 ? 0.5 : 0.2;

    return build('k_core_analysis', 'graph_analysis', ['data_analysis', 'intelligence'],
      flaggedInCore.length > 0 ? Math.min(score + 0.15, 1) : score,
      clamp(0.55 + withKCore.length * 0.02, 0.55, 0.9),
      `k-core (Seidman 1983, UNODC network analysis): max k=${maxK} over ${nodes.length} nodes. ${highCoreNodes.length} node(s) in high-density core; ${flaggedInCore.length} flagged entities in core. ${maxK >= 3 ? 'Dense criminal-network core structure detected — entities in high k-core are most deeply embedded.' : 'Network cohesion is low.'}`,
      highCoreNodes.map(n => n.nodeId).slice(0, 6));
  }

  // Approximate k-core from degree: k-shell ≈ minimum degree in induced subgraph
  const sortedByDegree = [...nodes].sort((a, b) => (a.degree ?? 0) - (b.degree ?? 0));
  const medianDegree = (sortedByDegree[Math.floor(sortedByDegree.length / 2)] as GraphNode | undefined)?.degree ?? 0;
  const highDegreeNodes = nodes.filter(n => (n.degree ?? 0) >= Math.max(3, medianDegree * 2));
  const flaggedHighDegree = highDegreeNodes.filter(n => n.flagged === true);

  const score = highDegreeNodes.length >= 3 ? 0.55 : highDegreeNodes.length >= 1 ? 0.3 : 0.1;
  return build('k_core_analysis', 'graph_analysis', ['data_analysis', 'intelligence'],
    flaggedHighDegree.length > 0 ? Math.min(score + 0.15, 1) : score,
    0.6,
    `k-core (degree proxy, n=${nodes.length}): median degree=${medianDegree}, ${highDegreeNodes.length} high-degree node(s), ${flaggedHighDegree.length} flagged. Pre-computed kCore values recommended for precise decomposition.`,
    highDegreeNodes.map(n => n.nodeId).slice(0, 6));
};

// ── bridge_detection ─────────────────────────────────────────────────────────
// Bridge nodes connect otherwise disconnected components — critical for ML
// layering. Removing a bridge fragments the money flow network.
// Girvan-Newman (2002), FATF network analysis.
interface GraphEdge { from: string; to: string; weight?: number; flagged?: boolean; }
const bridgeDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const nodes = evArr<GraphNode>(ctx, 'graphNodes');
  const edges = evArr<GraphEdge>(ctx, 'graphEdges');

  if (nodes.length < 3 || edges.length < 2) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('bridge') || ft.includes('cut vertex') || ft.includes('articulation');
    return build('bridge_detection', 'graph_analysis', ['data_analysis', 'intelligence'],
      kw ? 0.3 : 0.05, kw ? 0.35 : 0.25,
      `Bridge detection: insufficient graph data (nodes=${nodes.length}, edges=${edges.length}). ${kw ? 'Free-text references bridge/articulation concern.' : ''}`, []);
  }

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }

  // Find bridges using Tarjan's algorithm (simplified)
  const visited = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges: string[] = [];
  let timer = 0;

  const dfs = (u: string, parent: string | null): void => {
    visited.add(u);
    disc.set(u, timer);
    low.set(u, timer++);
    for (const v of (adj.get(u) ?? [])) {
      if (!visited.has(v)) {
        dfs(v, u);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > disc.get(u)!) {
          bridges.push(`${u}↔${v}`);
        }
      } else if (v !== parent) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  };

  for (const n of nodes) {
    if (!visited.has(n.nodeId)) dfs(n.nodeId, null);
  }

  const flaggedBridgeEdges = edges.filter(e => e.flagged === true && bridges.some(b => b.includes(e.from) || b.includes(e.to)));
  const score = bridges.length >= 3 ? 0.7 : bridges.length >= 1 ? 0.45 : 0.1;

  return build('bridge_detection', 'graph_analysis', ['data_analysis', 'intelligence'],
    flaggedBridgeEdges.length > 0 ? Math.min(score + 0.15, 1) : score,
    clamp(0.55 + edges.length * 0.01, 0.55, 0.9),
    `Bridge detection (Tarjan 1974, Girvan-Newman 2002): ${bridges.length} bridge edge(s) over ${nodes.length} nodes / ${edges.length} edges. ${bridges.length > 0 ? 'Bridge nodes are critical layering intermediaries — removal would fragment the financial flow network. Bridges: ' + bridges.slice(0, 4).join(', ') : 'No bridge structures in this network.'}`,
    bridges.slice(0, 6));
};

// ── temporal_motif ───────────────────────────────────────────────────────────
// Time-ordered subgraph patterns (A→B→C within δt) that indicate systematic
// ML activity. Paranjape et al. (2017) Motifs in Temporal Networks.
interface TemporalEdge { from: string; to: string; timestampMs: number; amountAed?: number; flagged?: boolean; }
const temporalMotifApply = async (ctx: BrainContext): Promise<Finding> => {
  const edges = evArr<TemporalEdge>(ctx, 'temporalEdges');
  if (edges.length < 3) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('temporal') || ft.includes('time-ordered') || ft.includes('sequential flow');
    return build('temporal_motif', 'graph_analysis', ['data_analysis', 'intelligence'],
      kw ? 0.3 : 0.05, kw ? 0.35 : 0.25,
      `Temporal motif: need ≥3 temporal edges. ${kw ? 'Free-text references temporal flow pattern.' : ''}`, []);
  }

  // Sort by time
  const sorted = [...edges].sort((a, b) => a.timestampMs - b.timestampMs);
  const DELTA_MS = 86400000 * 3; // 3-day window

  // Find A→B→C triangular motifs within δt
  const motifs: string[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const e1 = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const e2 = sorted[j]!;
      if (e2.timestampMs - e1.timestampMs > DELTA_MS) break;
      // e1: A→B, e2: B→C (fan-out chain)
      if (e2.from === e1.to && e2.to !== e1.from) {
        motifs.push(`${e1.from}→${e1.to}→${e2.to}`);
      }
    }
  }

  const score = motifs.length >= 5 ? 0.7 : motifs.length >= 2 ? 0.45 : motifs.length >= 1 ? 0.3 : 0.05;
  return build('temporal_motif', 'graph_analysis', ['data_analysis', 'intelligence'],
    score, clamp(0.5 + edges.length * 0.02, 0.5, 0.88),
    `Temporal motif (Paranjape et al. 2017, FATF network analysis): ${motifs.length} A→B→C motif(s) within 3-day window over ${edges.length} temporal edge(s). ${motifs.length >= 2 ? 'Repeated fan-out flow pattern consistent with layering. Top motifs: ' + [...new Set(motifs)].slice(0, 3).join(', ') : 'No significant temporal motifs.'}`,
    [...new Set(motifs)].slice(0, 6));
};

// ── reciprocal_edge_pattern ──────────────────────────────────────────────────
// Bidirectional flows between two parties that net close to zero — a
// hallmark of circular layering or wash trading. FATF circular flows 2018.
const reciprocalEdgePatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const edges = evArr<{ from: string; to: string; amountAed?: number; timestampMs?: number }>(ctx, 'graphEdges');
  if (edges.length < 2) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('reciprocal') || ft.includes('back-and-forth') || ft.includes('circular flow') || ft.includes('wash');
    return build('reciprocal_edge_pattern', 'graph_analysis', ['data_analysis', 'forensic_accounting'],
      kw ? 0.35 : 0.05, kw ? 0.4 : 0.25,
      `Reciprocal edge pattern: insufficient graph edges. ${kw ? 'Free-text references reciprocal/circular flows.' : ''}`, []);
  }

  // Aggregate flows by directed pair
  const flows = new Map<string, number>();
  for (const e of edges) {
    const k = `${e.from}→${e.to}`;
    flows.set(k, (flows.get(k) ?? 0) + (e.amountAed ?? 0));
  }

  const reciprocalPairs: string[] = [];
  const checked = new Set<string>();
  for (const [key, amt] of flows.entries()) {
    const [a, b] = key.split('→');
    if (!a || !b) continue;
    const reverseKey = `${b}→${a}`;
    if (checked.has(reverseKey)) continue;
    checked.add(key);
    const reverseAmt = flows.get(reverseKey) ?? 0;
    if (reverseAmt > 0 && amt > 0) {
      const netRatio = Math.abs(amt - reverseAmt) / Math.max(amt, reverseAmt);
      if (netRatio < 0.15) { // net ≈ 0 (within 15%)
        reciprocalPairs.push(`${a}↔${b}: AED ${amt.toLocaleString()}↔${reverseAmt.toLocaleString()} (net ${(netRatio * 100).toFixed(0)}%)`);
      }
    }
  }

  const score = reciprocalPairs.length >= 3 ? 0.75 : reciprocalPairs.length >= 1 ? 0.5 : 0.05;
  return build('reciprocal_edge_pattern', 'graph_analysis', ['data_analysis', 'forensic_accounting'],
    score, clamp(0.5 + edges.length * 0.02, 0.5, 0.9),
    `Reciprocal edge (FATF ML/TF risk in financial flows 2018, circular layering typology): ${reciprocalPairs.length} near-zero-net reciprocal pair(s) over ${edges.length} edges. ${reciprocalPairs.length > 0 ? reciprocalPairs.slice(0, 3).join(' | ') : 'No reciprocal flow anomalies.'}`,
    reciprocalPairs.slice(0, 5));
};

// ── triadic_closure ──────────────────────────────────────────────────────────
// High triadic closure (clustering coefficient) → closed, insular network.
// Low clustering in an otherwise dense network → brokerage/intermediary role.
// Watts & Strogatz (1998) small-world networks.
const triadicClosureApply = async (ctx: BrainContext): Promise<Finding> => {
  const nodes = evArr<GraphNode>(ctx, 'graphNodes');
  const edges = evArr<GraphEdge>(ctx, 'graphEdges');

  if (nodes.length < 3 || edges.length < 3) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('triadic') || ft.includes('clustering') || ft.includes('closed network');
    return build('triadic_closure', 'graph_analysis', ['data_analysis', 'intelligence'],
      kw ? 0.28 : 0.05, kw ? 0.35 : 0.25,
      `Triadic closure: need ≥3 nodes and ≥3 edges. ${kw ? 'Free-text references closed network.' : ''}`, []);
  }

  // Build adjacency sets
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }

  // Local clustering coefficient per node
  const coefficients: number[] = [];
  for (const n of nodes) {
    const neighbors = [...(adj.get(n.nodeId) ?? [])];
    const k = neighbors.length;
    if (k < 2) { coefficients.push(0); continue; }
    let triangles = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const u = neighbors[i]!; const v = neighbors[j]!;
        if (adj.get(u)?.has(v)) triangles++;
      }
    }
    coefficients.push((2 * triangles) / (k * (k - 1)));
  }

  const meanCC = coefficients.length > 0 ? coefficients.reduce((a, b) => a + b, 0) / coefficients.length : 0;
  // High clustering (>0.6) in suspicious context = closed criminal cluster
  const score = meanCC > 0.7 ? 0.65 : meanCC > 0.5 ? 0.4 : meanCC > 0.3 ? 0.2 : 0.05;

  return build('triadic_closure', 'graph_analysis', ['data_analysis', 'intelligence'],
    score, clamp(0.5 + nodes.length * 0.02, 0.5, 0.88),
    `Triadic closure / local clustering coefficient (Watts & Strogatz 1998): mean CC=${meanCC.toFixed(3)} over ${nodes.length} nodes. ${meanCC > 0.5 ? 'High clustering coefficient indicates closed, insular network — consistent with criminal gang or closed-loop layering scheme.' : 'Network clustering is within normal bounds.'}`,
    []);
};

// ── structural_hole ──────────────────────────────────────────────────────────
// Burt (1992): entities spanning structural holes have brokerage power and
// information asymmetry — key intermediary role in criminal networks.
const structuralHoleApply = async (ctx: BrainContext): Promise<Finding> => {
  const nodes = evArr<GraphNode>(ctx, 'graphNodes');
  const edges = evArr<GraphEdge>(ctx, 'graphEdges');

  if (nodes.length < 4 || edges.length < 4) {
    const ft = freeTextOf(ctx);
    const kw = ft.includes('structural hole') || ft.includes('broker') || ft.includes('intermediary') || ft.includes('brokerage');
    return build('structural_hole', 'graph_analysis', ['data_analysis', 'intelligence'],
      kw ? 0.32 : 0.05, kw ? 0.38 : 0.25,
      `Structural hole: need ≥4 nodes. ${kw ? 'Free-text references brokerage/intermediary.' : ''}`, []);
  }

  // Effective size proxy: nodes with high degree but low clustering (bridging role)
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }

  const brokers: string[] = [];
  for (const n of nodes) {
    const neighbors = [...(adj.get(n.nodeId) ?? [])];
    const k = neighbors.length;
    if (k < 2) continue;
    let triangles = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        if (adj.get(neighbors[i]!)?.has(neighbors[j]!)) triangles++;
      }
    }
    const cc = (2 * triangles) / (k * (k - 1));
    // High degree + low clustering = broker spanning structural holes
    if (k >= 4 && cc < 0.3) {
      brokers.push(`${n.nodeId}(degree=${k},cc=${cc.toFixed(2)})`);
    }
  }

  const subjectNode = nodes.find(n => n.nodeId === ctx.subject.name || n.nodeId.includes(ctx.subject.name));
  const subjectIsBroker = subjectNode ? brokers.some(b => b.startsWith(subjectNode.nodeId)) : false;

  const score = subjectIsBroker ? 0.72 : brokers.length >= 2 ? 0.55 : brokers.length >= 1 ? 0.35 : 0.05;

  return build('structural_hole', 'graph_analysis', ['data_analysis', 'intelligence'],
    score, clamp(0.5 + nodes.length * 0.02, 0.5, 0.9),
    `Structural hole / brokerage (Burt 1992 Structural Holes, FATF intermediary typology): ${brokers.length} broker node(s) identified. ${subjectIsBroker ? 'Subject is a network broker — high information/flow control warrants enhanced scrutiny.' : brokers.length > 0 ? 'Broker nodes: ' + brokers.slice(0, 3).join(', ') : 'No structural holes detected.'}`,
    brokers.slice(0, 5));
};

// ════════════════════════════════════════════════════════════════════════════
// ESG (4)
// ════════════════════════════════════════════════════════════════════════════

// ── greenwashing_signal ───────────────────────────────────────────────────────
// Company claims ESG credentials inconsistent with documented activities.
// EU Taxonomy Regulation · SEC ESG Disclosure rules · ESMA 2022 greenwashing report.
const greenwashingSignalApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const docs = evArr<{ docId?: string; docType?: string; text?: string }>(ctx, 'documents');

  const claimTerms = ['net zero', 'carbon neutral', 'sustainable', 'green', 'esg', 'responsible', 'eco-friendly', 'climate positive', 'zero emission', 'low carbon'];
  const contradictTerms = ['coal', 'fossil fuel', 'oil extraction', 'deforestation', 'pollution fine', 'environmental violation', 'carbon-intensive', 'regulatory sanction', 'epa violation', 'environmental breach'];

  const claims = claimTerms.filter(t => ft.includes(t));
  const contradictions = contradictTerms.filter(t => ft.includes(t));

  // Also check documents
  for (const doc of docs) {
    const text = (doc.text ?? '').toLowerCase();
    for (const t of claimTerms) if (text.includes(t)) claims.push(`${doc.docId}:${t}`);
    for (const t of contradictTerms) if (text.includes(t)) contradictions.push(`${doc.docId}:${t}`);
  }

  // Greenwashing = claims present BUT contradicted by evidence
  const score = claims.length >= 2 && contradictions.length >= 1 ? 0.65
    : claims.length >= 1 && contradictions.length >= 1 ? 0.45
    : claims.length > 0 && contradictions.length === 0 ? 0.1
    : 0.05;

  return build('greenwashing_signal', 'esg', ['intelligence', 'data_analysis'],
    score, clamp(0.4 + (claims.length + contradictions.length) * 0.04, 0.4, 0.88),
    `Greenwashing (EU Taxonomy Reg 2020/852, SEC ESG Disclosure 2022, ESMA Greenwashing Report 2022): ${claims.length} ESG claim(s) vs ${contradictions.length} contradicting indicator(s). ${score >= 0.45 ? 'Material discrepancy between stated ESG position and documented activities — potential EU Taxonomy misclassification or SEC disclosure violation. Claims: ' + [...new Set(claims)].slice(0, 3).join(', ') + '. Contradictions: ' + [...new Set(contradictions)].slice(0, 3).join(', ') : 'No significant greenwashing signal.'}`,
    [...new Set(claims)].slice(0, 3));
};

// ── forced_labour_supply_chain ────────────────────────────────────────────────
// Indicators of forced/trafficked labour in supply chain.
// ILO Forced Labour Protocol 2014 · UK Modern Slavery Act 2015 · US FCTC 2021.
const forcedLabourSupplyChainApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const docs = evArr<{ docId?: string; text?: string }>(ctx, 'documents');

  const forcedLabourIndicators = [
    'forced labour', 'forced labor', 'debt bondage', 'withhold passport', 'confiscate document',
    'restricted movement', 'no freedom to leave', 'excessive working hours', 'unpaid wages',
    'ilo convention 29', 'ilo convention 105', 'kafala', 'bonded labour', 'modern slavery',
    'human trafficking', 'labour trafficking', 'coercion', 'recruitment fee',
  ];

  const supplyChainTerms = ['supplier', 'subcontractor', 'manufacturer', 'factory', 'farm', 'mine', 'plantation', 'production facility'];

  const allText = [ft, ...docs.map(d => (d.text ?? '').toLowerCase())].join(' ');
  const flMatches = forcedLabourIndicators.filter(t => allText.includes(t));
  const scMatches = supplyChainTerms.filter(t => ft.includes(t));

  const score = flMatches.length >= 3 ? 0.8 : flMatches.length >= 2 ? 0.6 : flMatches.length >= 1 ? 0.4 : 0.05;
  const supplyChainContext = scMatches.length > 0;

  return build('forced_labour_supply_chain', 'esg', ['intelligence', 'data_analysis'],
    supplyChainContext ? score : clamp(score - 0.1, 0, 1),
    clamp(0.45 + flMatches.length * 0.06, 0.45, 0.9),
    `Forced labour / supply chain (ILO Forced Labour Protocol P029 2014, UK Modern Slavery Act 2015, US Uyghur FCTC 2021): ${flMatches.length} indicator(s) detected${supplyChainContext ? ' in supply chain context' : ''}. ${flMatches.length > 0 ? 'Signals: ' + flMatches.slice(0, 4).join(', ') + '. Enhanced supply chain due diligence required under UNGP RF Pillar 2.' : 'No forced-labour indicators.'}`,
    flMatches.slice(0, 5));
};

// ── conflict_mineral_typology ────────────────────────────────────────────────
// 3TG minerals (tin, tantalum, tungsten, gold) from conflict zones used to
// finance armed groups. Dodd-Frank §1502 · EU Conflict Minerals Reg 2017/821.
const conflictMineralTypologyApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const docs = evArr<{ docId?: string; text?: string }>(ctx, 'documents');

  const mineralTerms = ['tin', 'tantalum', 'tungsten', 'gold', '3tg', 'coltan', 'cassiterite', 'wolframite', 'mineral', 'ore', 'mining'];
  const conflictZones = ['drc', 'congo', 'democratic republic of congo', 'central african republic', 'south sudan', 'mali', 'myanmar', 'afghanistan', 'somalia', 'conflict zone', 'war zone', 'armed group'];
  const complianceGaps = ['no smelter audit', 'no cmrt', 'no conflict mineral report', 'unverified source', 'unknown origin', 'no certification'];

  const allText = [ft, ...docs.map(d => (d.text ?? '').toLowerCase())].join(' ');
  const mineralMatches = mineralTerms.filter(t => allText.includes(t));
  const conflictMatches = conflictZones.filter(t => allText.includes(t));
  const gapMatches = complianceGaps.filter(t => allText.includes(t));

  const score = mineralMatches.length >= 1 && conflictMatches.length >= 1 ? clamp(0.45 + gapMatches.length * 0.1 + conflictMatches.length * 0.1, 0, 0.85)
    : mineralMatches.length >= 2 ? 0.25
    : 0.05;

  return build('conflict_mineral_typology', 'esg', ['intelligence', 'data_analysis'],
    score, clamp(0.4 + (mineralMatches.length + conflictMatches.length) * 0.05, 0.4, 0.88),
    `Conflict mineral typology (Dodd-Frank §1502 2010, EU Reg 2017/821 3TG): ${mineralMatches.length} mineral reference(s), ${conflictMatches.length} conflict-zone reference(s), ${gapMatches.length} compliance gap(s). ${score >= 0.45 ? '3TG minerals linked to conflict zones — CMRT/RMI audit chain verification required before trading relationship can proceed.' : 'Conflict mineral risk is low or no supply-chain connection.'}`,
    [...mineralMatches.slice(0, 3), ...conflictMatches.slice(0, 3)]);
};

// ── carbon_fraud_pattern ─────────────────────────────────────────────────────
// Fraudulent carbon credits: double-counting, vintage manipulation, phantom
// projects. Europol 2011 MTIC carbon credit fraud · FATF carbon market report.
const carbonFraudPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = evArr<{ txId?: string; instrumentType?: string; projectId?: string; vintageYear?: number; registryVerified?: boolean; amountAed?: number }>(ctx, 'transactions');

  const carbonTerms = ['carbon credit', 'carbon offset', 'vcu', 'cer', 'redd+', 'emission reduction', 'carbon allowance', 'ets', 'eu ets', 'voluntary carbon'];
  const fraudTerms = ['double count', 'phantom project', 'fictitious project', 'no registry', 'unverified credit', 'manipulated vintage', 'missing serial', 'carousel fraud'];

  const carbonMatches = carbonTerms.filter(t => ft.includes(t));
  const fraudMatches = fraudTerms.filter(t => ft.includes(t));

  // Structured: unverified carbon credit transactions
  const suspiciousTxs = txs.filter(t =>
    (t.instrumentType ?? '').toLowerCase().includes('carbon') &&
    t.registryVerified === false,
  );

  const rapidCycles = txs.filter(t =>
    (t.instrumentType ?? '').toLowerCase().includes('carbon') &&
    (t.vintageYear ?? 0) > 0,
  );
  // Vintage anomaly: credits for future years or very old credits (pre-2005)
  const vintageAnomalies = rapidCycles.filter(t => (t.vintageYear ?? 2020) < 2005 || (t.vintageYear ?? 2020) > new Date().getFullYear() + 1);

  const score = fraudMatches.length >= 1 ? 0.7
    : suspiciousTxs.length >= 2 ? 0.6
    : (carbonMatches.length >= 1 && (suspiciousTxs.length >= 1 || vintageAnomalies.length >= 1)) ? 0.45
    : carbonMatches.length >= 1 ? 0.15
    : 0.05;

  return build('carbon_fraud_pattern', 'esg', ['forensic_accounting', 'data_analysis'],
    score, clamp(0.4 + (fraudMatches.length + suspiciousTxs.length) * 0.06, 0.4, 0.9),
    `Carbon fraud (Europol 2011 MTIC carbon credit, FATF Carbon Market Integrity 2023, EU ETS Directive 2003/87/EC): ${carbonMatches.length} carbon market reference(s), ${fraudMatches.length} fraud indicator(s), ${suspiciousTxs.length} unverified credit transaction(s), ${vintageAnomalies.length} vintage anomaly(ies). ${score >= 0.45 ? 'Pattern consistent with carousel/MTIC fraud or phantom carbon project — registry verification and serial number tracing required.' : 'Carbon fraud risk is low.'}`,
    [...fraudMatches.slice(0, 3), ...suspiciousTxs.map(t => t.txId ?? 'tx').slice(0, 3)]);
};

// ════════════════════════════════════════════════════════════════════════════
// STATISTICAL (4)
// ════════════════════════════════════════════════════════════════════════════

// ── dempster_shafer ──────────────────────────────────────────────────────────
// Dempster-Shafer evidence theory (1967/1976): combine belief masses from
// independent sources. Unlike Bayes, allows explicit modelling of ignorance.
const dempsterShaferApply = async (ctx: BrainContext): Promise<Finding> => {
  const priors = ctx.priorFindings.filter(f => !f.tags?.includes('meta') && !f.rationale.startsWith('[stub]'));

  if (priors.length < 2) {
    return build('dempster_shafer', 'statistical', ['reasoning', 'data_analysis'],
      0.05, 0.3,
      'Dempster-Shafer: need ≥2 prior findings to combine belief masses.', []);
  }

  // Each finding contributes a belief mass to {illicit} based on score/confidence
  // m({illicit}) = score × confidence
  // m({Θ}) = 1 - score × confidence  (Θ = frame of discernment, uncertainty)
  // Dempster's rule: combine pairwise
  let mIllicit = priors[0]!.score * priors[0]!.confidence;
  let mTheta = 1 - mIllicit;
  const K_warnings: string[] = []; // conflict tracking

  for (let i = 1; i < priors.length; i++) {
    const f = priors[i]!;
    const m2ill = f.score * f.confidence;
    const m2theta = 1 - m2ill;

    // Dempster combination:
    // m12({illicit}) = (m1·m2_ill + m1_ill·m2_theta + m1_theta·m2_ill) / (1 - K)
    // where K = m1_ill·m2_not + m1_not·m2_ill... simplified: K = conflict mass
    // In 2-hypothesis frame {illicit, ¬illicit}: conflict = mIllicit*(1-m2ill-m2theta) [=0 in 2-class]
    const unnorm = mIllicit * m2ill + mIllicit * m2theta + mTheta * m2ill;
    const _conflict = mIllicit * (1 - m2ill) + (1 - mIllicit) * m2ill; // approx — Dempster conflict mass, retained for reference
    const K = clamp(1 - (unnorm + mTheta * m2theta), 0, 0.99);
    if (K > 0.5) K_warnings.push(`high conflict at step ${i} (K=${K.toFixed(2)})`);
    const denom = 1 - K;
    mIllicit = denom > 0 ? unnorm / denom : unnorm;
    mTheta = denom > 0 ? (mTheta * m2theta) / denom : mTheta * m2theta;
    // Normalise
    const total = mIllicit + mTheta;
    if (total > 0) { mIllicit /= total; mTheta /= total; }
  }

  const belief = clamp(mIllicit, 0, 1);
  return build('dempster_shafer', 'statistical', ['reasoning', 'data_analysis'],
    belief, clamp(0.5 + priors.length * 0.04, 0.5, 0.9),
    `Dempster-Shafer (Dempster 1967, Shafer 1976): combined belief mass over ${priors.length} independent source(s). Bel({illicit})=${belief.toFixed(3)}, Pl({illicit})=${clamp(belief + mTheta, 0, 1).toFixed(3)} (plausibility). ${K_warnings.length > 0 ? 'Conflict warnings: ' + K_warnings.join('; ') : 'No high-conflict combination steps.'} Ignorance mass (Θ)=${mTheta.toFixed(3)}.`,
    priors.slice(0, 4).map(f => f.modeId));
};

// ── bayesian_update_cascade ──────────────────────────────────────────────────
// Sequential Bayesian updating: each finding updates the posterior of the
// previous, forming a cascade. Detects explosive convergence or drift.
// Jeffreys (1939) / Jaynes (2003) Probability Theory.
const bayesianUpdateCascadeApply = async (ctx: BrainContext): Promise<Finding> => {
  const priors = ctx.priorFindings.filter(f => !f.tags?.includes('meta') && !f.rationale.startsWith('[stub]'));

  const prior0 = 0.1; // baseline P(illicit) = 10%
  let posterior = prior0;
  const trace: string[] = [];

  for (const f of priors.slice(0, 12)) { // cap at 12 to avoid over-updating
    if (f.score < 0.05) continue;
    // LR = P(evidence|H+) / P(evidence|H-) estimated from score and confidence
    const pEgivenH = clamp(f.score * f.confidence + 0.01, 0.01, 0.99);
    const pEgivenNotH = clamp((1 - f.score) * 0.3 + 0.01, 0.01, 0.99);
    const lr = pEgivenH / pEgivenNotH;
    const odds = (posterior / (1 - posterior)) * lr;
    posterior = clamp(odds / (1 + odds), 0.001, 0.999);
    trace.push(`${f.modeId}:LR=${lr.toFixed(2)}→p=${posterior.toFixed(3)}`);
  }

  const delta = posterior - prior0;
  const score = clamp(posterior, 0, 1);

  return build('bayesian_update_cascade', 'statistical', ['reasoning', 'data_analysis'],
    score, clamp(0.5 + priors.length * 0.03, 0.5, 0.92),
    `Bayesian update cascade (Jeffreys 1939, Jaynes 2003): prior=${prior0}, posterior after ${Math.min(priors.length, 12)} update step(s)=${posterior.toFixed(4)} (Δ=${delta > 0 ? '+' : ''}${delta.toFixed(4)}). ${posterior > 0.5 ? 'Posterior probability of illicit activity exceeds 50% — material concern.' : 'Posterior remains below materiality threshold.'} Cascade: ${trace.slice(0, 5).join(' → ')}.`,
    priors.slice(0, 5).map(f => f.modeId));
};

// ── multi_source_consistency ──────────────────────────────────────────────────
// Measures agreement across findings from different categories/faculties.
// High agreement → evidence is robust. Low agreement → epistemic conflict.
// Inspired by inter-rater reliability (Cohen's κ) / FATF guidance P.4.
const multiSourceConsistencyApply = async (ctx: BrainContext): Promise<Finding> => {
  const relevant = ctx.priorFindings.filter(f =>
    !f.tags?.includes('meta') && !f.rationale.startsWith('[stub]') && f.score > 0,
  );

  if (relevant.length < 2) {
    return build('multi_source_consistency', 'statistical', ['data_analysis', 'reasoning'],
      0.05, 0.3,
      'Multi-source consistency: need ≥2 non-trivial findings to assess agreement.', []);
  }

  const verdictCounts = new Map<string, number>();
  for (const f of relevant) {
    verdictCounts.set(f.verdict, (verdictCounts.get(f.verdict) ?? 0) + 1);
  }

  const dominant = Math.max(...[...verdictCounts.values()]);
  const agreement = dominant / relevant.length;

  // Cross-category coverage
  const categories = new Set(relevant.map(f => f.category));
  const faculties = new Set(relevant.flatMap(f => f.faculties));

  // Score mean
  const meanScore = relevant.reduce((a, f) => a + f.score, 0) / relevant.length;
  const stdDev = Math.sqrt(relevant.reduce((a, f) => a + Math.pow(f.score - meanScore, 2), 0) / relevant.length);
  const cv = meanScore > 0 ? stdDev / meanScore : 0; // coefficient of variation

  // High agreement on escalate/flag → robust signal
  const dominantVerdict = [...verdictCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'clear';
  const isConsensusAdverse = (dominantVerdict === 'escalate' || dominantVerdict === 'flag') && agreement >= 0.7;
  const isConflicted = cv > 0.6;

  const score = isConsensusAdverse ? clamp(meanScore, 0.35, 0.9) : isConflicted ? 0.3 : 0.1;

  return build('multi_source_consistency', 'statistical', ['data_analysis', 'reasoning'],
    score, clamp(0.5 + relevant.length * 0.03, 0.5, 0.92),
    `Multi-source consistency (Cohen κ inter-rater principle, FATF risk-based approach P.4): ${relevant.length} source(s) across ${categories.size} categories / ${faculties.size} faculties. Dominant verdict: ${dominantVerdict} (${(agreement * 100).toFixed(0)}% agreement). Mean score=${meanScore.toFixed(3)}, CV=${cv.toFixed(2)}. ${isConsensusAdverse ? 'Strong cross-source consensus on adverse verdict.' : isConflicted ? 'High score variance (CV>0.6) — sources are in epistemic conflict; recommend MLRO adjudication.' : 'Sources are broadly consistent and non-adverse.'}`,
    relevant.slice(0, 5).map(f => f.modeId));
};

// ── counter_evidence_weighting ────────────────────────────────────────────────
// Identifies and weights exculpatory evidence against adverse findings.
// Over-reliance on adverse evidence without considering counter-evidence is
// a known analytical failure. FATF EDD · Schum (1994) Evidence & Inference.
const counterEvidenceWeightingApply = async (ctx: BrainContext): Promise<Finding> => {
  const allFindings = ctx.priorFindings.filter(f => !f.tags?.includes('meta') && !f.rationale.startsWith('[stub]'));
  const ft = freeTextOf(ctx);

  const adverseFindings = allFindings.filter(f => f.verdict === 'escalate' || f.verdict === 'flag');
  const clearFindings = allFindings.filter(f => f.verdict === 'clear');

  // Counter-evidence terms in free text
  const counterTerms = ['cleared', 'verified', 'legitimate', 'explained', 'documented', 'corroborated', 'audited', 'certified', 'compliant', 'clean', 'approved', 'authorised'];
  const counterMatches = counterTerms.filter(t => ft.includes(t));

  // Weighted adverse vs counter score
  const adverseWeight = adverseFindings.reduce((a, f) => a + f.score * f.confidence, 0);
  const clearWeight = clearFindings.reduce((a, f) => a + (1 - f.score) * f.confidence, 0) +
    counterMatches.length * 0.1;

  const netAdverse = clamp(adverseWeight - clearWeight * 0.5, 0, adverseWeight);
  const normalisedNet = allFindings.length > 0 ? clamp(netAdverse / Math.max(1, allFindings.length), 0, 1) : 0;

  // Warn if adverse findings dominate without any counter-evidence
  const noCounter = clearFindings.length === 0 && counterMatches.length === 0 && adverseFindings.length >= 2;

  return build('counter_evidence_weighting', 'statistical', ['reasoning', 'argumentation'],
    normalisedNet, clamp(0.45 + allFindings.length * 0.02, 0.45, 0.88),
    `Counter-evidence weighting (Schum 1994 Evidence & Inference, FATF RBA Guidance §2.4): ${adverseFindings.length} adverse finding(s) (weight ${adverseWeight.toFixed(2)}) vs ${clearFindings.length} clear finding(s) + ${counterMatches.length} documentary counter-indicator(s) (effective weight ${(clearWeight * 0.5).toFixed(2)}). Net adverse weight=${netAdverse.toFixed(2)}. ${noCounter ? 'CAUTION: No counter-evidence identified — risk of confirmation bias. Actively seek exculpatory evidence before escalation.' : adverseFindings.length === 0 ? 'Counter-evidence outweighs adverse signals.' : 'Adverse and counter-evidence both present — balanced assessment.'}`,
    [...adverseFindings.slice(0, 3).map(f => f.modeId), ...counterMatches.slice(0, 3)]);
};

// ════════════════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════════════════

export const WAVE4_BATCH_B_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  // forensic (15)
  benford_law: benfordLawApply,
  split_payment_detection: splitPaymentDetectionApply,
  round_trip_transaction: roundTripTransactionApply,
  shell_triangulation: shellTriangulationApply,
  po_fraud_pattern: poPraudPatternApply,
  vendor_master_anomaly: vendorMasterAnomalyApply,
  journal_entry_anomaly: journalEntryAnomalyApply,
  revenue_recognition_stretch: revenueRecognitionStretchApply,
  stylometry: stylometryApply,
  gaslighting_detection: gaslightingDetectionApply,
  obfuscation_pattern: obfuscationPatternApply,
  code_word_detection: codeWordDetectionApply,
  hedging_language: hedgingLanguageApply,
  minimisation_pattern: minimisationPatternApply,
  chain_of_custody_reasoning: chainOfCustodyReasoningApply,
  // cognitive_science (7)
  prospect_theory: prospectTheoryApply,
  status_quo_bias: statusQuoBiasApply,
  endowment_effect: endowmentEffectApply,
  hyperbolic_discount: hyperbolicDiscountApply,
  certainty_effect: certaintyEffectApply,
  reference_point_shift: referencePointShiftApply,
  mental_accounting: mentalAccountingApply,
  // graph_analysis (6)
  k_core_analysis: kCoreAnalysisApply,
  bridge_detection: bridgeDetectionApply,
  temporal_motif: temporalMotifApply,
  reciprocal_edge_pattern: reciprocalEdgePatternApply,
  triadic_closure: triadicClosureApply,
  structural_hole: structuralHoleApply,
  // esg (4)
  greenwashing_signal: greenwashingSignalApply,
  forced_labour_supply_chain: forcedLabourSupplyChainApply,
  conflict_mineral_typology: conflictMineralTypologyApply,
  carbon_fraud_pattern: carbonFraudPatternApply,
  // statistical (4)
  dempster_shafer: dempsterShaferApply,
  bayesian_update_cascade: bayesianUpdateCascadeApply,
  multi_source_consistency: multiSourceConsistencyApply,
  counter_evidence_weighting: counterEvidenceWeightingApply,
};
