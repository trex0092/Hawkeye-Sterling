// Hawkeye Sterling — Temporal Threat Forecasting Engine (Wave 14 Feature 1).
// Predicts when dormant risk factors will materialise into active threats using
// exponential decay + geopolitical trigger correlation.

import { isCahra } from './cahra.js';

export interface GeopoliticalTrigger {
  country: string;         // ISO-2
  eventType: 'sanctions' | 'election' | 'financial_crisis' | 'conflict' | 'regulatory';
  riskLevel: number;       // 0..1
  daysUntilEvent: number;
  description: string;
}

export interface ThreatFactor {
  kind: 'sanctions_exposure' | 'cahra_reactivation' | 'pep_transition' | 'dormant_account';
  currentRisk: number;
  forecastRisk: number;
  peakDate: string;
  decayLambda: number;
  correlatedEvents: string[];
}

export interface ForecastResult {
  caseId: string;
  forecastAt: string;
  factors: ThreatFactor[];
  overallThreatHorizonDays: number;
  peakRiskDate: string;
  confidenceInterval: { low: number; mean: number; high: number };
  triggeringEvents: GeopoliticalTrigger[];
  methodology: string;
}

// Decay lambdas: higher = faster decay (risk fades faster with dormancy)
const DECAY_LAMBDAS: Record<ThreatFactor['kind'], number> = {
  sanctions_exposure: 0.005,
  cahra_reactivation: 0.003,
  pep_transition: 0.010,
  dormant_account: 0.008,
};

// Simple Monte Carlo: run N paths with ±10% noise on decay and boost
const MC_PATHS = 100;

function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function decayedRisk(currentRisk: number, daysDormant: number, lambda: number): number {
  return currentRisk * Math.exp(-lambda * daysDormant);
}

function reactivationBoost(trigger: GeopoliticalTrigger): number {
  return trigger.riskLevel * (1 / (1 + trigger.daysUntilEvent / 30));
}

export interface SubjectInput {
  name: string;
  jurisdiction?: string;
  nationality?: string;
  pepMandateExpiryDays?: number;
}

export interface EvidencePacket {
  sanctionsNearMiss?: boolean;
  cahraLastSeenDaysAgo?: number;
  dormantDaysAgo?: number;
}

export function forecastThreatMaturity(
  caseId: string,
  subject: SubjectInput,
  evidence: EvidencePacket,
  triggers: GeopoliticalTrigger[],
  horizonDays = 180,
): ForecastResult {
  const now = new Date().toISOString();
  const factors: ThreatFactor[] = [];

  const jurisdiction = (subject.jurisdiction ?? subject.nationality ?? '').toUpperCase();
  const relevantTriggers = triggers.filter((t) => t.country === jurisdiction);

  // Factor 1: sanctions exposure
  if (evidence.sanctionsNearMiss) {
    const kind: ThreatFactor['kind'] = 'sanctions_exposure';
    const lambda = DECAY_LAMBDAS[kind];
    const currentRisk = 0.6;
    const boost = relevantTriggers
      .filter((t) => t.eventType === 'sanctions')
      .reduce((s, t) => s + reactivationBoost(t), 0);
    const forecastRisk = Math.min(1, decayedRisk(currentRisk, 0, lambda) + boost);
    const peakDays = Math.min(
      horizonDays,
      relevantTriggers.find((t) => t.eventType === 'sanctions')?.daysUntilEvent ?? horizonDays,
    );
    factors.push({
      kind, currentRisk, forecastRisk,
      peakDate: addDays(peakDays),
      decayLambda: lambda,
      correlatedEvents: relevantTriggers.filter((t) => t.eventType === 'sanctions').map((t) => t.description),
    });
  }

  // Factor 2: CAHRA route reactivation
  const cahraActive = isCahra(jurisdiction);
  if (cahraActive || (evidence.cahraLastSeenDaysAgo !== undefined && evidence.cahraLastSeenDaysAgo > 0)) {
    const kind: ThreatFactor['kind'] = 'cahra_reactivation';
    const lambda = DECAY_LAMBDAS[kind];
    const daysDormant = evidence.cahraLastSeenDaysAgo ?? 0;
    const currentRisk = cahraActive ? 0.7 : 0.4;
    const decayed = decayedRisk(currentRisk, daysDormant, lambda);
    const boost = relevantTriggers
      .filter((t) => t.eventType === 'conflict' || t.eventType === 'sanctions')
      .reduce((s, t) => s + reactivationBoost(t), 0);
    const forecastRisk = Math.min(1, decayed + boost);
    const peakDays = relevantTriggers.find((t) => t.eventType === 'conflict')?.daysUntilEvent ?? Math.floor(horizonDays / 3);
    factors.push({
      kind, currentRisk: decayed, forecastRisk,
      peakDate: addDays(peakDays),
      decayLambda: lambda,
      correlatedEvents: relevantTriggers
        .filter((t) => t.eventType === 'conflict' || t.eventType === 'sanctions')
        .map((t) => t.description),
    });
  }

  // Factor 3: PEP role transition
  if (subject.pepMandateExpiryDays !== undefined && subject.pepMandateExpiryDays <= 180) {
    const kind: ThreatFactor['kind'] = 'pep_transition';
    const lambda = DECAY_LAMBDAS[kind];
    const daysUntil = Math.max(0, subject.pepMandateExpiryDays);
    const currentRisk = 0.5;
    const boost = relevantTriggers
      .filter((t) => t.eventType === 'election')
      .reduce((s, t) => s + reactivationBoost(t), 0);
    const forecastRisk = Math.min(1, decayedRisk(currentRisk, 0, lambda) * (1 + boost) + 0.2);
    factors.push({
      kind, currentRisk, forecastRisk,
      peakDate: addDays(daysUntil + 30),
      decayLambda: lambda,
      correlatedEvents: [`mandate_expiry_days=${daysUntil}`, ...relevantTriggers.filter((t) => t.eventType === 'election').map((t) => t.description)],
    });
  }

  // Factor 4: dormant account
  if (evidence.dormantDaysAgo !== undefined && evidence.dormantDaysAgo > 90) {
    const kind: ThreatFactor['kind'] = 'dormant_account';
    const lambda = DECAY_LAMBDAS[kind];
    const currentRisk = 0.3;
    const boost = relevantTriggers.reduce((s, t) => s + reactivationBoost(t) * 0.3, 0);
    const forecastRisk = Math.min(1, decayedRisk(currentRisk, evidence.dormantDaysAgo - 90, lambda) + boost);
    factors.push({
      kind, currentRisk, forecastRisk,
      peakDate: addDays(30),
      decayLambda: lambda,
      correlatedEvents: relevantTriggers.map((t) => t.description),
    });
  }

  // Monte Carlo confidence interval
  const paths: number[] = [];
  for (let i = 0; i < MC_PATHS; i++) {
    const noise = 0.9 + Math.random() * 0.2;
    const pathRisk = factors.reduce((s, f) => s + f.forecastRisk * noise, 0) / Math.max(1, factors.length);
    paths.push(Math.min(1, pathRisk));
  }
  paths.sort((a, b) => a - b);
  const ci = {
    low: paths[Math.floor(MC_PATHS * 0.025)] ?? 0,
    mean: paths.reduce((s, v) => s + v, 0) / MC_PATHS,
    high: paths[Math.floor(MC_PATHS * 0.975)] ?? 1,
  };

  const peakFactor = factors.reduce((best, f) => (f.forecastRisk > (best?.forecastRisk ?? 0) ? f : best), factors[0]);
  const horizonDaysResult = factors.length
    ? Math.min(...factors.map((f) => {
      const d = new Date(f.peakDate).getTime() - Date.now();
      return Math.max(0, Math.floor(d / 86_400_000));
    }))
    : horizonDays;

  return {
    caseId,
    forecastAt: now,
    factors,
    overallThreatHorizonDays: horizonDaysResult,
    peakRiskDate: peakFactor?.peakDate ?? addDays(horizonDays),
    confidenceInterval: ci,
    triggeringEvents: relevantTriggers,
    methodology: 'Exponential decay (λ per factor type) + geopolitical trigger boost + Monte Carlo 100-path CI. ' +
      'FATF R.10 ongoing monitoring / UAE FDL 10/2025 Art.15.',
  };
}
