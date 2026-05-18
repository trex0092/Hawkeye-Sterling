// Hawkeye Sterling — multi-tier escalation workflow engine.
// Manages the full escalation lifecycle from analyst review through
// MLRO → Legal → Regulator escalation. Every state transition is
// logged with rationale and timestamped for regulatory audit.
//
// Tier definitions:
//   L1: Analyst review
//   L2: Senior analyst / Team lead
//   L3: MLRO review
//   L4: Legal review
//   L5: Regulator escalation (SAR/STR filing)

export type EscalationTier =
  | 'L1_analyst'
  | 'L2_senior'
  | 'L3_mlro'
  | 'L4_legal'
  | 'L5_regulator';

export type EscalationStatus =
  | 'pending'
  | 'in_review'
  | 'escalated'
  | 'de_escalated'
  | 'resolved_cleared'
  | 'resolved_reported'
  | 'overridden'
  | 'expired';

export type EscalationTrigger =
  | 'sanctions_hit_critical'
  | 'sanctions_hit_strong'
  | 'adverse_media_critical'
  | 'adverse_media_high'
  | 'pep_tier1'
  | 'pep_tier2'
  | 'graph_exposure_critical'
  | 'graph_exposure_high'
  | 'risk_score_very_high'
  | 'risk_score_high'
  | 'analyst_referral'
  | 'system_auto'
  | 'regulatory_request'
  | 'customer_behavior';

export interface EscalationEvent {
  eventId: string;
  timestamp: string;
  actor: string;        // analyst ID, MLRO ID, system
  fromTier: EscalationTier | null;
  toTier: EscalationTier | null;
  fromStatus: EscalationStatus;
  toStatus: EscalationStatus;
  rationale: string;
  evidenceRefs: string[];    // evidence IDs supporting this decision
  policyRefs: string[];      // policy/regulation references
  overriddenAlerts: string[];
  isOverride: boolean;
}

export interface EscalationCase {
  caseId: string;
  subjectId: string;
  subjectName: string;
  currentTier: EscalationTier;
  currentStatus: EscalationStatus;
  triggers: EscalationTrigger[];
  riskScore: number;         // 0..1
  urgency: 'immediate' | 'within_24h' | 'within_7_days' | 'routine';
  assignedTo?: string;
  deadline?: string;         // ISO 8601
  events: EscalationEvent[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  sarFiled: boolean;
  sarReference?: string;
  goAMLRef?: string;
}

// ── Tier configuration ────────────────────────────────────────────────────────

export const TIER_CONFIG: Record<EscalationTier, {
  name: string;
  slaHours: number;
  canEscalateTo: EscalationTier[];
  canDeEscalateTo: EscalationTier[];
  requiredRoles: string[];
}> = {
  L1_analyst: {
    name: 'Analyst Review',
    slaHours: 4,
    canEscalateTo: ['L2_senior', 'L3_mlro'],
    canDeEscalateTo: [],
    requiredRoles: ['analyst', 'compliance_officer'],
  },
  L2_senior: {
    name: 'Senior Analyst Review',
    slaHours: 8,
    canEscalateTo: ['L3_mlro'],
    canDeEscalateTo: ['L1_analyst'],
    requiredRoles: ['senior_analyst', 'team_lead'],
  },
  L3_mlro: {
    name: 'MLRO Review',
    slaHours: 24,
    canEscalateTo: ['L4_legal', 'L5_regulator'],
    canDeEscalateTo: ['L2_senior', 'L1_analyst'],
    requiredRoles: ['mlro', 'deputy_mlro'],
  },
  L4_legal: {
    name: 'Legal Review',
    slaHours: 48,
    canEscalateTo: ['L5_regulator'],
    canDeEscalateTo: ['L3_mlro'],
    requiredRoles: ['legal_counsel', 'general_counsel'],
  },
  L5_regulator: {
    name: 'Regulator Escalation / STR Filing',
    slaHours: 24,
    canEscalateTo: [],
    canDeEscalateTo: [],
    requiredRoles: ['mlro', 'general_counsel', 'ceo'],
  },
};

// ── Trigger → initial tier mapping ───────────────────────────────────────────

const TRIGGER_INITIAL_TIER: Record<EscalationTrigger, { tier: EscalationTier; urgency: EscalationCase['urgency'] }> = {
  sanctions_hit_critical:    { tier: 'L3_mlro',  urgency: 'immediate' },
  sanctions_hit_strong:      { tier: 'L2_senior', urgency: 'within_24h' },
  adverse_media_critical:    { tier: 'L3_mlro',  urgency: 'immediate' },
  adverse_media_high:        { tier: 'L2_senior', urgency: 'within_24h' },
  pep_tier1:                 { tier: 'L2_senior', urgency: 'within_24h' },
  pep_tier2:                 { tier: 'L1_analyst', urgency: 'within_7_days' },
  graph_exposure_critical:   { tier: 'L3_mlro',  urgency: 'immediate' },
  graph_exposure_high:       { tier: 'L2_senior', urgency: 'within_24h' },
  risk_score_very_high:      { tier: 'L2_senior', urgency: 'within_24h' },
  risk_score_high:           { tier: 'L1_analyst', urgency: 'within_7_days' },
  analyst_referral:          { tier: 'L2_senior', urgency: 'within_7_days' },
  system_auto:               { tier: 'L1_analyst', urgency: 'routine' },
  regulatory_request:        { tier: 'L3_mlro',  urgency: 'immediate' },
  customer_behavior:         { tier: 'L1_analyst', urgency: 'within_7_days' },
};

// ── Case ID generator ─────────────────────────────────────────────────────────

let _caseCounter = 0;
function generateCaseId(): string {
  _caseCounter++;
  const ts = Date.now().toString(36).toUpperCase();
  const seq = String(_caseCounter).padStart(4, '0');
  return `ESC-${ts}-${seq}`;
}

function generateEventId(): string {
  return `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── SLA deadline calculation ──────────────────────────────────────────────────

function calculateDeadline(urgency: EscalationCase['urgency'], tier: EscalationTier): string {
  const tierSla = TIER_CONFIG[tier].slaHours;
  const urgencyHours: Record<EscalationCase['urgency'], number> = {
    immediate: 1,
    within_24h: 24,
    within_7_days: 168,
    routine: 336,
  };
  const hours = Math.min(tierSla, urgencyHours[urgency]);
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface EscalationError {
  code: string;
  message: string;
}

function validateTransition(
  currentCase: EscalationCase,
  targetTier: EscalationTier,
  actor: string,
  actorRole: string,
): EscalationError | null {
  const tierConf = TIER_CONFIG[currentCase.currentTier];

  if (targetTier !== currentCase.currentTier) {
    const isUp = [...TIER_CONFIG[currentCase.currentTier].canEscalateTo].includes(targetTier);
    const isDown = [...TIER_CONFIG[currentCase.currentTier].canDeEscalateTo].includes(targetTier);
    if (!isUp && !isDown) {
      return {
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${currentCase.currentTier} to ${targetTier}`,
      };
    }
  }

  const hasRole = tierConf.requiredRoles.includes(actorRole);
  if (!hasRole) {
    return {
      code: 'INSUFFICIENT_ROLE',
      message: `Actor role "${actorRole}" cannot act on tier ${currentCase.currentTier}. Required: ${tierConf.requiredRoles.join(', ')}`,
    };
  }

  return null;
}

// ── Core engine functions ─────────────────────────────────────────────────────

export function createEscalationCase(
  subjectId: string,
  subjectName: string,
  triggers: EscalationTrigger[],
  riskScore: number,
  actor: string,
  rationale: string,
  evidenceRefs: string[] = [],
): EscalationCase {
  // Determine highest priority tier from triggers
  const triggerResults = triggers.map((t) => TRIGGER_INITIAL_TIER[t]);
  const tierOrder: EscalationTier[] = ['L5_regulator', 'L4_legal', 'L3_mlro', 'L2_senior', 'L1_analyst'];
  const bestTier = triggerResults.reduce((best, t) => {
    return tierOrder.indexOf(t.tier) < tierOrder.indexOf(best.tier) ? t : best;
  }, triggerResults[0] ?? { tier: 'L1_analyst' as EscalationTier, urgency: 'routine' as const });

  const urgencyOrder: EscalationCase['urgency'][] = ['immediate', 'within_24h', 'within_7_days', 'routine'];
  const bestUrgency = triggerResults.reduce((best, t) => {
    return urgencyOrder.indexOf(t.urgency) < urgencyOrder.indexOf(best) ? t.urgency : best;
  }, 'routine' as EscalationCase['urgency']);

  const now = new Date().toISOString();
  const caseId = generateCaseId();

  const creationEvent: EscalationEvent = {
    eventId: generateEventId(),
    timestamp: now,
    actor,
    fromTier: null,
    toTier: bestTier.tier,
    fromStatus: 'pending',
    toStatus: 'pending',
    rationale,
    evidenceRefs,
    policyRefs: ['FATF R.20', 'CBUAE AML-CFT Standards'],
    overriddenAlerts: [],
    isOverride: false,
  };

  return {
    caseId,
    subjectId,
    subjectName,
    currentTier: bestTier.tier,
    currentStatus: 'pending',
    triggers,
    riskScore,
    urgency: bestUrgency,
    deadline: calculateDeadline(bestUrgency, bestTier.tier),
    events: [creationEvent],
    createdAt: now,
    updatedAt: now,
    sarFiled: false,
  };
}

export interface TransitionInput {
  actor: string;
  actorRole: string;
  targetTier?: EscalationTier;
  targetStatus: EscalationStatus;
  rationale: string;
  evidenceRefs?: string[];
  policyRefs?: string[];
  overriddenAlerts?: string[];
  sarReference?: string;
  goAMLRef?: string;
}

export function transitionCase(
  currentCase: EscalationCase,
  input: TransitionInput,
): { ok: boolean; error?: EscalationError; updatedCase: EscalationCase } {
  const targetTier = input.targetTier ?? currentCase.currentTier;

  const err = validateTransition(currentCase, targetTier, input.actor, input.actorRole);
  if (err) return { ok: false, error: err, updatedCase: currentCase };

  const now = new Date().toISOString();
  const event: EscalationEvent = {
    eventId: generateEventId(),
    timestamp: now,
    actor: input.actor,
    fromTier: currentCase.currentTier,
    toTier: targetTier,
    fromStatus: currentCase.currentStatus,
    toStatus: input.targetStatus,
    rationale: input.rationale,
    evidenceRefs: input.evidenceRefs ?? [],
    policyRefs: input.policyRefs ?? [],
    overriddenAlerts: input.overriddenAlerts ?? [],
    isOverride: Boolean(input.overriddenAlerts?.length),
  };

  const isResolved = input.targetStatus === 'resolved_cleared' || input.targetStatus === 'resolved_reported';

  const updatedCase: EscalationCase = {
    ...currentCase,
    currentTier: targetTier,
    currentStatus: input.targetStatus,
    events: [...currentCase.events, event],
    updatedAt: now,
    ...(isResolved ? { resolvedAt: now } : {}),
    ...(input.sarReference ? { sarFiled: true, sarReference: input.sarReference } : {}),
    ...(input.goAMLRef ? { goAMLRef: input.goAMLRef } : {}),
    deadline: calculateDeadline(currentCase.urgency, targetTier),
  };

  return { ok: true, updatedCase };
}

// ── SLA breach detection ──────────────────────────────────────────────────────

export function detectSLABreaches(cases: EscalationCase[]): Array<{
  caseId: string;
  subjectName: string;
  currentTier: EscalationTier;
  deadlineBreached: boolean;
  hoursOverdue: number;
}> {
  const now = Date.now();
  return cases
    .filter((c) => c.currentStatus !== 'resolved_cleared' && c.currentStatus !== 'resolved_reported')
    .map((c) => {
      const deadline = c.deadline ? new Date(c.deadline).getTime() : Infinity;
      const overdue = now > deadline;
      return {
        caseId: c.caseId,
        subjectName: c.subjectName,
        currentTier: c.currentTier,
        deadlineBreached: overdue,
        hoursOverdue: overdue ? Math.floor((now - deadline) / 3_600_000) : 0,
      };
    })
    .filter((r) => r.deadlineBreached);
}

// ── Auto-escalation policy ────────────────────────────────────────────────────

export function applyAutoEscalationPolicy(
  currentCase: EscalationCase,
): { shouldEscalate: boolean; targetTier?: EscalationTier; reason?: string } {
  // Auto-escalate if deadline breached and in early tiers
  if (currentCase.deadline && Date.now() > new Date(currentCase.deadline).getTime()) {
    const tierOrder: EscalationTier[] = ['L1_analyst', 'L2_senior', 'L3_mlro', 'L4_legal', 'L5_regulator'];
    const currentIdx = tierOrder.indexOf(currentCase.currentTier);
    if (currentIdx < tierOrder.length - 1) {
      return {
        shouldEscalate: true,
        targetTier: tierOrder[currentIdx + 1] ?? tierOrder[tierOrder.length - 1] ?? 'L5_regulator',
        reason: `SLA breached at ${currentCase.currentTier} — auto-escalating to next tier`,
      };
    }
  }

  // Auto-escalate if risk score is critical and still at L1
  if (currentCase.riskScore >= 0.85 && currentCase.currentTier === 'L1_analyst') {
    return {
      shouldEscalate: true,
      targetTier: 'L3_mlro',
      reason: 'Very high risk score — bypassing L2 and escalating directly to MLRO',
    };
  }

  return { shouldEscalate: false };
}
