// Hawkeye Sterling — MLRO outcome feedback loop.
// When the MLRO reviews an advisor proposal + confirms or overrides it,
// the outcome is appended here. The loop drives:
//   - calibration (feeds CalibrationLedger with ground truth)
//   - prompt refinement (surfaces modes the MLRO repeatedly disagrees with)
//   - agreement-rate tracking (auto vs MLRO disposition)
//   - bias flagging (systematic over-conservatism or over-permissiveness)

import type { DispositionCode } from './dispositions.js';
import type { CalibrationLedger, CalibrationSample, GroundTruth, CalibrationVerdict } from './mlro-calibration.js';

export interface OutcomeRecord {
  runId: string;
  at: string;                        // ISO 8601
  caseId: string;
  modeIds: string[];
  autoProposed: DispositionCode;     // what the auto-dispositioner suggested
  autoConfidence: number;            // 0..1
  mlroDecided: DispositionCode;      // what the MLRO recorded
  overridden: boolean;               // mlroDecided !== autoProposed
  overrideReason?: string;
  reviewerId: string;
  /** The MLRO's eventual ground-truth judgement ('confirmed' / 'reversed' /
   *  'pending'). Updated later when the outcome is validated in a lookback
   *  or escalation. Defaults to 'pending'. */
  groundTruth?: GroundTruth;
}

export interface AgreementReport {
  total: number;
  agreed: number;
  overridden: number;
  agreementRate: number;           // 0..1
  overrideRateByCode: Record<DispositionCode, { total: number; overridden: number; rate: number }>;
  overrideRateByMode: Record<string, { total: number; overridden: number; rate: number }>;
  biasSignals: Array<{ signal: string; detail: string }>;
}

/** Map DispositionCode → CalibrationVerdict expected by the ledger. */
function verdictFor(code: DispositionCode): CalibrationVerdict {
  if (code === 'D05_frozen_ffr' || code === 'D07_str_filed' || code === 'D08_exit_relationship' || code === 'D09_do_not_onboard') return 'blocked';
  if (code === 'D03_edd_required' || code === 'D04_heightened_monitoring' || code === 'D06_partial_match_pnmr' || code === 'D10_refer_to_authority') return 'returned_for_revision';
  return 'approved';
}

export class OutcomeFeedbackJournal {
  private records: OutcomeRecord[] = [];

  record(r: OutcomeRecord): void { this.records.push({ ...r }); }

  list(): readonly OutcomeRecord[] { return this.records; }

  size(): number { return this.records.length; }

  /** Push the records into a CalibrationLedger as samples so Brier / log-
   *  score tracking reflects MLRO judgement. Returns how many were appended. */
  hydrateCalibration(ledger: CalibrationLedger): number {
    let n = 0;
    for (const r of this.records) {
      const sample: CalibrationSample = {
        runId: r.runId,
        at: r.at,
        modeIds: r.modeIds,
        predictedVerdict: verdictFor(r.autoProposed),
        predictedProbability: r.autoConfidence,
        groundTruth: r.groundTruth ?? 'pending',
      };
      ledger.append(sample);
      n++;
    }
    return n;
  }

  agreement(): AgreementReport {
    const total = this.records.length;
    let agreed = 0, overridden = 0;
    const byCode: Record<string, { total: number; overridden: number }> = {};
    const byMode: Record<string, { total: number; overridden: number }> = {};

    for (const r of this.records) {
      if (r.overridden) overridden++; else agreed++;
      const code = r.autoProposed;
      byCode[code] = byCode[code] ?? { total: 0, overridden: 0 };
      byCode[code].total++;
      if (r.overridden) byCode[code].overridden++;
      for (const m of r.modeIds) {
        byMode[m] = byMode[m] ?? { total: 0, overridden: 0 };
        byMode[m].total++;
        if (r.overridden) byMode[m].overridden++;
      }
    }

    const toRates = <T extends Record<string, { total: number; overridden: number }>>(src: T) => {
      const out: Record<string, { total: number; overridden: number; rate: number }> = {};
      for (const [k, v] of Object.entries(src)) {
        out[k] = { total: v.total, overridden: v.overridden, rate: v.total === 0 ? 0 : v.overridden / v.total };
      }
      return out;
    };

    const overrideRateByCode = toRates(byCode) as Record<DispositionCode, { total: number; overridden: number; rate: number }>;
    const overrideRateByMode = toRates(byMode);

    const biasSignals: AgreementReport['biasSignals'] = [];

    // Over-conservatism: MLRO frequently downgrades `blocked`-ish codes.
    const hardCodes: DispositionCode[] = ['D05_frozen_ffr', 'D08_exit_relationship', 'D09_do_not_onboard'];
    let hardAuto = 0, hardAutoNotFollowed = 0;
    for (const r of this.records) {
      if (hardCodes.includes(r.autoProposed)) {
        hardAuto++;
        if (!hardCodes.includes(r.mlroDecided)) hardAutoNotFollowed++;
      }
    }
    if (hardAuto >= 5 && hardAutoNotFollowed / hardAuto >= 0.5) {
      biasSignals.push({ signal: 'mlro_softens_hard_proposals', detail: `${hardAutoNotFollowed}/${hardAuto} auto 'blocked'-class proposals downgraded by MLRO — review thresholds.` });
    }

    // Over-permissiveness: MLRO frequently upgrades `approved`-ish codes to blocked-class.
    const softCodes: DispositionCode[] = ['D00_no_match', 'D02_cleared_proceed'];
    let softAuto = 0, softAutoUpgraded = 0;
    for (const r of this.records) {
      if (softCodes.includes(r.autoProposed)) {
        softAuto++;
        if (hardCodes.includes(r.mlroDecided)) softAutoUpgraded++;
      }
    }
    if (softAuto >= 5 && softAutoUpgraded / softAuto >= 0.3) {
      biasSignals.push({ signal: 'mlro_upgrades_soft_proposals', detail: `${softAutoUpgraded}/${softAuto} auto-'approved' upgraded to blocked-class — engine is under-sensitive.` });
    }

    // Problem modes: modes with > 60% override rate across ≥ 5 runs.
    for (const [m, v] of Object.entries(byMode)) {
      if (v.total >= 5 && v.overridden / v.total > 0.6) {
        biasSignals.push({ signal: `mode_low_agreement:${m}`, detail: `Mode ${m} overridden on ${v.overridden}/${v.total} runs — inspect prefix or drop from preset.` });
      }
    }

    return {
      total,
      agreed,
      overridden,
      agreementRate: total === 0 ? 0 : agreed / total,
      overrideRateByCode,
      overrideRateByMode,
      biasSignals,
    };
  }
}
