// Hawkeye Sterling — wave-3 identity / KYC batch (8 modes).
// Anchors: FATF R.10 (CDD) · UAE FDL 10/2025 Art.10 · Cabinet Res 10/2019.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
type ModeApply = (ctx: BrainContext) => Promise<Finding>;
const FAC: FacultyId[] = ['data_analysis', 'forensic_accounting'];
const CAT: ReasoningCategory = 'identity_fraud';
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
function empty(modeId: string, key: string): Finding {
  return { modeId, category: CAT, faculties: FAC, score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict, rationale: `No ${key} evidence supplied.`, evidence: [], producedAt: Date.now() };
}
function build(modeId: string, hits: SignalHit[], n: number, anchors: string): Finding {
  const raw = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(raw > 0.7 ? 0.7 + (raw - 0.7) * 0.3 : raw);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return { modeId, category: CAT, faculties: FAC, score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict, rationale: `${hits.length} signal(s) over ${n} item(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: ${anchors}.`, evidence: hits.slice(0, 8).map((h) => h.evidence), producedAt: Date.now() };
}

interface SyntheticIdSignal { customerId: string; ssnEmiratesIdAge?: number; creditFileAgeDays?: number; nameDobMixedSourceMatch?: boolean; }
const syntheticIdApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SyntheticIdSignal>(ctx, 'syntheticIdSignals');
  if (items.length === 0) return empty('synthetic_identity_indicator', 'syntheticIdSignals');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.creditFileAgeDays ?? Infinity) <= 90 && (i.ssnEmiratesIdAge ?? 0) >= 10) hits.push({ id: 'thin_file_old_id', label: 'Old ID with thin credit file', weight: 0.4, evidence: i.customerId });
    if (i.nameDobMixedSourceMatch === false) hits.push({ id: 'name_dob_mismatch', label: 'Name+DOB do not co-match across sources', weight: 0.35, evidence: i.customerId });
  }
  return build('synthetic_identity_indicator', hits, items.length, 'FATF R.10 · FinCEN synthetic identity advisory 2020');
};

interface DocCheck { docId: string; deepfakeScore?: number; livenessScore?: number; ocrConfidence?: number; }
const docDeepfakeApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DocCheck>(ctx, 'docChecks');
  if (items.length === 0) return empty('id_document_deepfake', 'docChecks');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.deepfakeScore ?? 0) >= 0.5) hits.push({ id: 'deepfake_score', label: `Deepfake score ${(i.deepfakeScore ?? 0).toFixed(2)}`, weight: 0.45, evidence: i.docId });
    if ((i.livenessScore ?? 1) <= 0.4) hits.push({ id: 'low_liveness', label: `Liveness ${(i.livenessScore ?? 0).toFixed(2)}`, weight: 0.3, evidence: i.docId });
    if ((i.ocrConfidence ?? 1) <= 0.5) hits.push({ id: 'low_ocr_conf', label: `OCR conf ${(i.ocrConfidence ?? 0).toFixed(2)}`, weight: 0.2, evidence: i.docId });
  }
  return build('id_document_deepfake', hits, items.length, 'FATF Digital Identity Guidance 2020 · NIST SP 800-63');
};

interface AddressCluster { addressKey: string; uniqueCustomers?: number; sharedDevicesCount?: number; }
const addressAggregationApply: ModeApply = async (ctx) => {
  const items = typedEvidence<AddressCluster>(ctx, 'addressClusters');
  if (items.length === 0) return empty('address_aggregation_red_flag', 'addressClusters');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.uniqueCustomers ?? 0) >= 5) hits.push({ id: 'address_aggregation', label: `${i.uniqueCustomers} customers at one address`, weight: 0.4, evidence: i.addressKey });
    if ((i.sharedDevicesCount ?? 0) >= 3) hits.push({ id: 'shared_devices', label: `${i.sharedDevicesCount} shared devices`, weight: 0.3, evidence: i.addressKey });
  }
  return build('address_aggregation_red_flag', hits, items.length, 'FATF R.10 · UAE Cabinet Res 10/2019');
};

interface DeviceCluster { deviceFingerprint: string; accountCount?: number; ipChangesPerHour?: number; }
const multiAccountDeviceApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DeviceCluster>(ctx, 'deviceClusters');
  if (items.length === 0) return empty('multi_account_same_device', 'deviceClusters');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.accountCount ?? 0) >= 3) hits.push({ id: 'multi_account_device', label: `${i.accountCount} accounts on same device`, weight: 0.4, evidence: i.deviceFingerprint });
    if ((i.ipChangesPerHour ?? 0) >= 10) hits.push({ id: 'ip_velocity', label: `${i.ipChangesPerHour} IP changes/hr`, weight: 0.3, evidence: i.deviceFingerprint });
  }
  return build('multi_account_same_device', hits, items.length, 'FATF Digital Identity Guidance 2020');
};

interface EmailSignal { customerId: string; emailDomain: string; isDisposable?: boolean; isFreemail?: boolean; ageDays?: number; }
const disposableEmailApply: ModeApply = async (ctx) => {
  const items = typedEvidence<EmailSignal>(ctx, 'emailSignals');
  if (items.length === 0) return empty('disposable_email_signal', 'emailSignals');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.isDisposable === true) hits.push({ id: 'disposable_domain', label: `Disposable: ${i.emailDomain}`, weight: 0.35, evidence: i.customerId });
    if ((i.ageDays ?? Infinity) <= 7) hits.push({ id: 'fresh_email', label: `Email registered ${i.ageDays}d ago`, weight: 0.25, evidence: i.customerId });
  }
  return build('disposable_email_signal', hits, items.length, 'FATF R.10 · industry KYC heuristics');
};

interface PhoneSignal { customerId: string; phoneType?: 'mobile' | 'landline' | 'voip' | 'satellite'; carrier?: string; portedCount?: number; }
const voipPhoneApply: ModeApply = async (ctx) => {
  const items = typedEvidence<PhoneSignal>(ctx, 'phoneSignals');
  if (items.length === 0) return empty('voip_phone_anomaly', 'phoneSignals');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.phoneType === 'voip') hits.push({ id: 'voip_phone', label: `VOIP carrier ${i.carrier ?? '?'}`, weight: 0.3, evidence: i.customerId });
    if ((i.portedCount ?? 0) >= 3) hits.push({ id: 'frequent_porting', label: `Ported ${i.portedCount}×`, weight: 0.25, evidence: i.customerId });
  }
  return build('voip_phone_anomaly', hits, items.length, 'FATF R.10 · TRA UAE numbering rules');
};

interface SimSwapSignal { customerId: string; simSwapWithin72h?: boolean; deviceChangeWithin72h?: boolean; subsequentLargeTransferAed?: number; }
const simSwapApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SimSwapSignal>(ctx, 'simSwapSignals');
  if (items.length === 0) return empty('sim_swap_indicator', 'simSwapSignals');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.simSwapWithin72h === true && (i.subsequentLargeTransferAed ?? 0) >= 50_000) hits.push({ id: 'sim_swap_then_transfer', label: `SIM swap then AED ${i.subsequentLargeTransferAed} transfer`, weight: 0.5, evidence: i.customerId });
    if (i.deviceChangeWithin72h === true && i.simSwapWithin72h === true) hits.push({ id: 'sim_and_device', label: 'SIM + device both changed within 72h', weight: 0.3, evidence: i.customerId });
  }
  return build('sim_swap_indicator', hits, items.length, 'FBI/FinCEN SIM swap advisories');
};

interface AccountVelocity { tenantId: string; accountsCreatedLast24h?: number; sameIpRange?: boolean; }
const accountVelocityApply: ModeApply = async (ctx) => {
  const items = typedEvidence<AccountVelocity>(ctx, 'accountVelocity');
  if (items.length === 0) return empty('velocity_account_creation', 'accountVelocity');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.accountsCreatedLast24h ?? 0) >= 10) hits.push({ id: 'mass_creation', label: `${i.accountsCreatedLast24h} accounts/24h`, weight: 0.4, evidence: i.tenantId });
    if (i.sameIpRange === true && (i.accountsCreatedLast24h ?? 0) >= 5) hits.push({ id: 'same_ip_range', label: 'All accounts from same IP range', weight: 0.3, evidence: i.tenantId });
  }
  return build('velocity_account_creation', hits, items.length, 'FATF Digital Identity Guidance 2020');
};

export const IDENTITY_BATCH_APPLIES: Record<string, ModeApply> = {
  synthetic_identity_indicator: syntheticIdApply,
  id_document_deepfake: docDeepfakeApply,
  address_aggregation_red_flag: addressAggregationApply,
  multi_account_same_device: multiAccountDeviceApply,
  disposable_email_signal: disposableEmailApply,
  voip_phone_anomaly: voipPhoneApply,
  sim_swap_indicator: simSwapApply,
  velocity_account_creation: accountVelocityApply,
};
