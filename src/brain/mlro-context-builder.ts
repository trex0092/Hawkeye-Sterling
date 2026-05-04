// Hawkeye Sterling — case-context builder.
// Normalises mixed case input (Module 01 form rows + evidence items +
// audit-chain entries) into a canonical structure the pipeline runner
// understands. Applies signal detection (cahra / hasPep / hasCrypto / …)
// so the preset recommender and context-mask can fire automatically.

import type { EvidenceItem } from './evidence.js';
import { isCahra } from './cahra.js';
import type { AuditEntry } from './audit-chain.js';
import { classifyPepRole, type PepClassification } from './pep-classifier.js';

export interface RawCaseInput {
  caseId: string;
  subjectName: string;
  subjectType?: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  nationalityIso2?: string;
  countryOfIncorporationIso2?: string;
  roles?: readonly string[];           // e.g. 'Minister of Interior', 'Trustee'
  businessActivity?: string;
  transactions?: readonly {
    amountAed?: number;
    currency?: string;
    channel?: 'cash' | 'wire' | 'card' | 'crypto' | 'cheque' | 'other';
    counterpartyCountryIso2?: string;
  }[];
  wallets?: readonly string[];
  evidence?: readonly EvidenceItem[];
  audit?: readonly AuditEntry[];
}

export interface CaseSignals {
  sector: 'dpms' | 'bank' | 'vasp' | 'real_estate' | 'insurance' | 'unknown';
  hasCahra: boolean;
  hasCrypto: boolean;
  hasPep: boolean;
  /** Per-role classifications produced by `classifyPepRole`. Filtered to
   *  exclude `type === 'not_pep'`. Empty when no role matched a PEP rule.
   *  Carries tier + type + salience + matchedRule so downstream consumers
   *  can drive EDD regime + review cadence (RCA family/associate too). */
  pepClassifications: readonly PepClassification[];
  hasCash: boolean;
  structuring: boolean;
  eocnConfirmed: boolean;
  eocnPartial: boolean;
  tbml: boolean;
  uboOpaque: boolean;
  bec: boolean;
  nestedCorresp: boolean;
  realEstateCash: boolean;
  npoConflictZone: boolean;
  tippingOff: boolean;
  audit: boolean;
}

export interface BuiltContext {
  caseId: string;
  subjectName: string;
  subjectType: NonNullable<RawCaseInput['subjectType']>;
  scope: {
    listsChecked: string[];
    listVersionDates: Record<string, string>;
    jurisdictions: string[];
    matchingMethods: string[];
  };
  evidenceIds: string[];
  signals: CaseSignals;
  derivedFlags: string[];  // human-readable flag notes
}

const STRUCTURING_RX = /\b(structur|split|broken into|below threshold)\b/i;
const EOCN_CONFIRMED_RX = /\b(confirmed[_ ](match|sanctions|designation))\b/i;
const EOCN_PARTIAL_RX = /\b(partial[_ ](name[_ ])?match|pnmr)\b/i;
const TBML_RX = /\b(tbml|over[-_ ]invoice|under[-_ ]invoice|phantom[-_ ]shipment)\b/i;
const BEC_RX = /\b(bec|business[- ]email[- ]compromise|typosquat|invoice redirect)\b/i;
const NPO_CONFLICT_RX = /\b(charity|npo|aid|relief)\b.*\b(conflict zone|cahra)\b/i;
const TIPPING_OFF_RX = /\b(tell the customer|notify the subject|before we (file|submit))\b/i;
const AUDIT_RX = /\b(audit|lookback|sample review|thematic review)\b/i;

export function buildContext(raw: RawCaseInput): BuiltContext {
  // Real PEP classification (tier + type + salience + RCA family/associate)
  // via the dedicated classifier rather than the previous binary regex.
  // Each role gets one classification; `not_pep` results are filtered out
  // so the resulting array has only true PEP signals. Charter P8: callers
  // must source role strings from a verifiable primary source — the
  // classifier itself never asserts PEP status from training data.
  const pepClassifications: PepClassification[] = (raw.roles ?? [])
    .map((r) => classifyPepRole(r))
    .filter((p) => p.type !== 'not_pep');

  const signals: CaseSignals = {
    sector: detectSector(raw),
    hasCahra: isCahra(raw.nationalityIso2 ?? '') || isCahra(raw.countryOfIncorporationIso2 ?? '') ||
              (raw.transactions ?? []).some((t) => t.counterpartyCountryIso2 && isCahra(t.counterpartyCountryIso2)),
    hasCrypto: (raw.wallets?.length ?? 0) > 0 || (raw.transactions ?? []).some((t) => t.channel === 'crypto'),
    hasPep: pepClassifications.length > 0,
    pepClassifications,
    hasCash: (raw.transactions ?? []).some((t) => t.channel === 'cash'),
    structuring: (raw.transactions ?? []).filter((t) => (t.amountAed ?? 0) >= 45000 && (t.amountAed ?? 0) < 55000).length >= 3,
    eocnConfirmed: false,
    eocnPartial: false,
    tbml: false,
    uboOpaque: false,
    bec: false,
    nestedCorresp: false,
    realEstateCash: (raw.businessActivity ?? '').toLowerCase().includes('real estate') &&
                    (raw.transactions ?? []).some((t) => t.channel === 'cash'),
    npoConflictZone: false,
    tippingOff: false,
    audit: false,
  };

  // Text-hint signals from evidence excerpts and audit actions.
  const corpus = [
    ...(raw.evidence ?? []).map((e) => e.excerpt ?? ''),
    ...(raw.audit ?? []).map((a) => a.action + ' ' + JSON.stringify(a.payload)),
    raw.businessActivity ?? '',
  ].join(' ');

  if (STRUCTURING_RX.test(corpus)) signals.structuring = true;
  if (EOCN_CONFIRMED_RX.test(corpus)) signals.eocnConfirmed = true;
  if (EOCN_PARTIAL_RX.test(corpus)) signals.eocnPartial = true;
  if (TBML_RX.test(corpus)) signals.tbml = true;
  if (BEC_RX.test(corpus)) signals.bec = true;
  if (NPO_CONFLICT_RX.test(corpus)) signals.npoConflictZone = true;
  if (TIPPING_OFF_RX.test(corpus)) signals.tippingOff = true;
  if (AUDIT_RX.test(corpus)) signals.audit = true;

  // UBO opacity hint.
  if (/\b(nominee director|bearer share|unknown beneficial owner|opaque ownership)\b/i.test(corpus)) {
    signals.uboOpaque = true;
  }
  // Nested correspondent.
  if (/\bnested (correspondent|respondent)\b/i.test(corpus)) {
    signals.nestedCorresp = true;
  }

  const derivedFlags: string[] = [];
  for (const [k, v] of Object.entries(signals)) {
    if (v === true) derivedFlags.push(k);
  }

  // Default scope.
  const listsChecked = ['un_1267', 'uae_eocn', 'uae_local_terrorist', 'ofac_sdn', 'eu_consolidated', 'uk_ofsi'];
  const listVersionDates: Record<string, string> = {};
  for (const l of listsChecked) listVersionDates[l] = 'pending_refresh';
  const jurisdictions = Array.from(new Set([
    raw.nationalityIso2,
    raw.countryOfIncorporationIso2,
    ...(raw.transactions ?? []).map((t) => t.counterpartyCountryIso2),
  ].filter(Boolean) as string[]));

  return {
    caseId: raw.caseId,
    subjectName: raw.subjectName,
    subjectType: raw.subjectType ?? 'individual',
    scope: {
      listsChecked,
      listVersionDates,
      jurisdictions,
      matchingMethods: ['exact', 'levenshtein', 'jaro_winkler', 'soundex', 'double_metaphone', 'token_set'],
    },
    evidenceIds: (raw.evidence ?? []).map((e) => e.id),
    signals,
    derivedFlags,
  };
}

function detectSector(raw: RawCaseInput): CaseSignals['sector'] {
  const activity = (raw.businessActivity ?? '').toLowerCase();
  if (/(dpms|precious metal|gold|bullion|jewel|diamond|refin)/.test(activity)) return 'dpms';
  if (/(bank|financial institution|lending)/.test(activity)) return 'bank';
  if (/(vasp|virtual asset|crypto|exchange|wallet)/.test(activity) || (raw.wallets?.length ?? 0) > 0) return 'vasp';
  if (/(real estate|property|developer)/.test(activity)) return 'real_estate';
  if (/(insurance|life policy|takaful)/.test(activity)) return 'insurance';
  return 'unknown';
}
