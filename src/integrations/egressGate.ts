// Hawkeye Sterling — Egress gate wrappers.
//
// Every production path that releases an AI-generated artefact to the outside
// world (Asana task, goAML XML, regulator-facing narrative) must route through
// one of these wrappers. Each function calls `invokeComplianceAgent` BEFORE
// the side-effect and holds the artefact unless the gate verdict is
// `approved`. `returned_for_revision`, `blocked`, and `incomplete` all fail
// closed — the artefact is never delivered, only returned to the caller
// alongside the compliance review so an MLRO can disposition it.
//
// These wrappers never set a final disposition themselves (charter P3).
// They only decide: release or hold.
//
// Dependency injection mirrors mlroAdvisor.ts / complianceAgent.ts — an
// optional `EgressGateDeps` lets tests swap in a fake ChatCall, a fake
// delivery transport, or a fake advisor.

import { deliverToAsana, type AsanaConfig, type AsanaDeliveryResult } from './asana.js';
import { serialiseGoamlXml } from './goaml-xml.js';
import {
  invokeComplianceAgent,
  type ChatCall,
  type ComplianceAgentConfig,
  type ComplianceReviewRequest,
  type ComplianceReviewResult,
  type Verdict,
} from './complianceAgent.js';
import {
  invokeMlroAdvisor,
  type MlroAdvisorConfig,
  type MlroAdvisorRequest,
  type MlroAdvisorResult,
} from './mlroAdvisor.js';
import type { CaseReport } from '../reports/caseReport.js';
import type { GoAmlEnvelope } from '../brain/goaml-shapes.js';

export type GateStatus = 'approved' | 'held_for_revision' | 'blocked' | 'incomplete';

export interface GateDecision {
  /** True only when the compliance verdict is `approved`. Fail-closed for everything else. */
  released: boolean;
  status: GateStatus;
  gate: ComplianceReviewResult;
}

export interface GatedAsanaResult extends GateDecision {
  delivery?: AsanaDeliveryResult | undefined;
}

export interface GatedGoamlResult extends GateDecision {
  xml?: string | undefined;
}

export interface GatedAdvisorResult extends GateDecision {
  advisor: MlroAdvisorResult;
}

export interface GatedAsanaInput {
  report: CaseReport;
  /** Narrative that will accompany the Asana card. Required for the mandatory-sections precheck. */
  draftNarrative?: string;
  /** Any customer-facing text attached to the card (e.g. offboarding copy). Scanned for tipping-off. */
  customerFacingText?: string;
}

export interface EgressGateDeps {
  chat?: ChatCall;
  deliverAsana?: typeof deliverToAsana;
  serialiseGoaml?: typeof serialiseGoamlXml;
  adviseMlro?: typeof invokeMlroAdvisor;
}

export function verdictToStatus(v: Verdict): GateStatus {
  switch (v) {
    case 'approved': return 'approved';
    case 'returned_for_revision': return 'held_for_revision';
    case 'blocked': return 'blocked';
    case 'incomplete': return 'incomplete';
  }
}

function runComplianceAgent(
  req: ComplianceReviewRequest,
  cfg: ComplianceAgentConfig,
  chat: ChatCall | undefined,
): Promise<ComplianceReviewResult> {
  return chat ? invokeComplianceAgent(req, cfg, chat) : invokeComplianceAgent(req, cfg);
}

/**
 * Review the case report at the gate; deliver to Asana only if compliance
 * approves. All non-approved verdicts hold the artefact. Callers should
 * supply the narrative and any customer-facing copy so the mandatory-sections
 * precheck and tipping-off guard engage.
 */
export async function gatedAsanaDelivery(
  input: GatedAsanaInput,
  asanaCfg: AsanaConfig,
  agentCfg: ComplianceAgentConfig,
  deps: EgressGateDeps = {},
): Promise<GatedAsanaResult> {
  const req: ComplianceReviewRequest = { caseReport: input.report };
  if (input.draftNarrative) req.draftNarrative = input.draftNarrative;
  if (input.customerFacingText) req.customerFacingText = input.customerFacingText;

  const gate = await runComplianceAgent(req, agentCfg, deps.chat);
  const status = verdictToStatus(gate.verdict);
  if (status !== 'approved') {
    return { released: false, status, gate };
  }
  const deliver = deps.deliverAsana ?? deliverToAsana;
  const delivery = await deliver(input.report, asanaCfg);
  return { released: true, status, gate, delivery };
}

/**
 * Review the case report + envelope narrative at the gate; emit goAML XML
 * only if compliance approves. The envelope's `reason` narrative is fed in
 * as `draftNarrative` so the tipping-off guard and redline registry engage.
 */
export async function gatedGoamlEmission(
  report: CaseReport,
  envelope: GoAmlEnvelope,
  agentCfg: ComplianceAgentConfig,
  deps: EgressGateDeps = {},
): Promise<GatedGoamlResult> {
  const req: ComplianceReviewRequest = envelope.reason
    ? { caseReport: report, draftNarrative: envelope.reason }
    : { caseReport: report };
  const gate = await runComplianceAgent(req, agentCfg, deps.chat);
  const status = verdictToStatus(gate.verdict);
  if (status !== 'approved') {
    return { released: false, status, gate };
  }
  const serialise = deps.serialiseGoaml ?? serialiseGoamlXml;
  const xml = serialise(envelope);
  return { released: true, status, gate, xml };
}

/**
 * Run the MLRO advisor, then review its narrative at the egress gate.
 * The advisor result is ALWAYS returned (so callers can inspect the
 * reasoning trail even on hold); `released` tells you whether it is safe
 * to publish.
 */
export async function gatedMlroAdvisor(
  advisorReq: MlroAdvisorRequest,
  caseReport: CaseReport,
  mlroCfg: MlroAdvisorConfig,
  agentCfg: ComplianceAgentConfig,
  deps: EgressGateDeps = {},
): Promise<GatedAdvisorResult> {
  const advise = deps.adviseMlro ?? invokeMlroAdvisor;
  const advisor = deps.chat
    ? await advise(advisorReq, mlroCfg, deps.chat)
    : await advise(advisorReq, mlroCfg);

  const reviewReq: ComplianceReviewRequest = { caseReport };
  if (advisor.narrative) reviewReq.draftNarrative = advisor.narrative;
  if (advisorReq.audience) reviewReq.audience = advisorReq.audience;

  const gate = await runComplianceAgent(reviewReq, agentCfg, deps.chat);
  const status = verdictToStatus(gate.verdict);
  return { released: status === 'approved', status, gate, advisor };
}
