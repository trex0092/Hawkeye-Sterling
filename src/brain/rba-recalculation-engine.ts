// Hawkeye Sterling — Dynamic RBA Recalculation Engine (Wave 14 Feature 6).
// Event-driven customer risk-tier recalculation. Triggered by sanctions deltas,
// adverse media, or geopolitical events. Closes CG-2 (OFAC SDN delta monitoring).

import { randomBytes } from 'node:crypto';

export type RbaTriggerKind =
  | 'sanctions_delta'
  | 'adverse_media_live'
  | 'geopolitical'
  | 'periodic_review';

export type RbaUrgency = 'immediate' | 'same_day' | 'next_review_cycle';

export type CddTier = 'simplified' | 'standard' | 'enhanced' | 'intensive' | 'prohibited';

export interface RbaTriggerEvent {
  triggerId: string;
  customerId: string;
  triggerKind: RbaTriggerKind;
  urgency: RbaUrgency;
  priorTier: CddTier;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TierChangeEvent {
  changeId: string;
  customerId: string;
  fromTier: CddTier;
  toTier: CddTier;
  triggerKind: RbaTriggerKind;
  triggeredBy: string;
  rationale: string;
  changedAt: string;
}

export interface RbaRecalcResult {
  ok: boolean;
  customerId: string;
  priorTier: CddTier;
  newTier: CddTier;
  tierChanged: boolean;
  rbaScore: number;
  tierChangeEvent?: TierChangeEvent;
  auditId: string;
}

function newId(): string {
  return `rba_${Date.now()}_${randomBytes(3).toString("hex")}`;
}

const TIER_ORDER: CddTier[] = ['simplified', 'standard', 'enhanced', 'intensive', 'prohibited'];

export function tierRank(tier: CddTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function evaluateTrigger(
  triggerKind: RbaTriggerKind,
  payload: Record<string, unknown>,
  priorTier: CddTier,
  customerId: string,
): RbaTriggerEvent | null {
  const urgencyMap: Record<RbaTriggerKind, RbaUrgency> = {
    sanctions_delta: 'immediate',
    adverse_media_live: 'same_day',
    geopolitical: 'next_review_cycle',
    periodic_review: 'next_review_cycle',
  };

  // Only trigger recalc when there's a meaningful reason
  if (triggerKind === 'adverse_media_live') {
    const severity = payload['severity'] as string | undefined;
    if (!severity || !['critical', 'high'].includes(severity)) return null;
  }

  if (triggerKind === 'geopolitical') {
    // Only trigger for customers at standard tier or above whose jurisdiction is affected
    if (tierRank(priorTier) < tierRank('standard')) return null;
  }

  return {
    triggerId: newId(),
    customerId,
    triggerKind,
    urgency: urgencyMap[triggerKind],
    priorTier,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function computeRbaScore(
  priorTier: CddTier,
  triggerKind: RbaTriggerKind,
  payload: Record<string, unknown>,
): { newTier: CddTier; rbaScore: number; rationale: string } {
  let boost = 0;
  let rationale = '';

  if (triggerKind === 'sanctions_delta') {
    const listId = payload['listId'] as string ?? '';
    if (listId.includes('OFAC') || listId.includes('SDN')) {
      boost = 30;
      rationale = `OFAC SDN list delta detected (${listId}). Mandatory re-evaluation per UAE FDL 10/2025 Art.15 and Cabinet Decision 74/2020.`;
    } else {
      boost = 15;
      rationale = `Sanctions list delta on ${listId}. CDD review required.`;
    }
  } else if (triggerKind === 'adverse_media_live') {
    const severity = payload['severity'] as string ?? '';
    boost = severity === 'critical' ? 25 : 10;
    rationale = `Live adverse media alert (severity: ${severity}). Ongoing monitoring trigger per FATF R.10.`;
  } else if (triggerKind === 'geopolitical') {
    boost = 8;
    rationale = `Geopolitical event affecting customer jurisdiction. Periodic RBA recalculation.`;
  } else {
    rationale = `Periodic review cadence reached. Standard RBA reassessment.`;
  }

  // Map prior tier + boost to new score
  const baseTierScore: Record<CddTier, number> = {
    simplified: 10,
    standard: 30,
    enhanced: 60,
    intensive: 80,
    prohibited: 100,
  };
  const rbaScore = Math.min(100, (baseTierScore[priorTier] ?? 30) + boost);

  let newTier: CddTier;
  if (rbaScore >= 90) newTier = 'prohibited';
  else if (rbaScore >= 70) newTier = 'intensive';
  else if (rbaScore >= 45) newTier = 'enhanced';
  else if (rbaScore >= 20) newTier = 'standard';
  else newTier = 'simplified';

  return { newTier, rbaScore, rationale };
}

export function buildTierChangeEvent(
  customerId: string,
  priorTier: CddTier,
  newTier: CddTier,
  triggerKind: RbaTriggerKind,
  rationale: string,
): TierChangeEvent {
  return {
    changeId: newId(),
    customerId,
    fromTier: priorTier,
    toTier: newTier,
    triggerKind,
    triggeredBy: 'rba-recalc-engine',
    rationale,
    changedAt: new Date().toISOString(),
  };
}
