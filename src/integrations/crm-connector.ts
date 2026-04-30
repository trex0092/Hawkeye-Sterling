// Hawkeye Sterling — CRM connector layer (audit follow-up #52).
//
// Pushes ESCALATE / BLOCK / FREEZE verdicts as flags / cases / tasks
// into Salesforce or Microsoft Dynamics 365. Each adapter is configured
// via env (instance URL + bearer token). Charter P4: payloads are
// scrubbed via redactPdplObject before transmission.

import { redactPdplObject } from '../brain/pdpl-guard.js';

export type CrmProvider = 'salesforce' | 'dynamics' | 'none';

export interface CrmFlagPayload {
  caseId: string;
  subjectName: string;
  outcome: string;
  aggregateScore?: number;
  posterior?: number;
  redlinesFired?: string[];
  reasoning?: string;
  generatedAt: string;
}

export interface CrmOutcome {
  ok: boolean;
  provider: CrmProvider;
  recordId?: string;
  error?: string;
  durationMs: number;
}

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function pushSalesforce(payload: CrmFlagPayload): Promise<CrmOutcome> {
  const startedAt = Date.now();
  const baseUrl = process.env['SFDC_INSTANCE_URL'];
  const token = process.env['SFDC_ACCESS_TOKEN'];
  const objectName = process.env['SFDC_OBJECT_NAME'] ?? 'Hawkeye_Flag__c';
  if (!baseUrl || !token) {
    return { ok: false, provider: 'salesforce', error: 'SFDC_INSTANCE_URL + SFDC_ACCESS_TOKEN required', durationMs: Date.now() - startedAt };
  }
  const { safe } = redactPdplObject(payload);
  try {
    const res = await fetchWithTimeout(`${baseUrl}/services/data/v59.0/sobjects/${objectName}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        Hawkeye_Case_Id__c: safe.caseId,
        Subject_Name__c: safe.subjectName,
        Outcome__c: safe.outcome,
        Aggregate_Score__c: safe.aggregateScore,
        Posterior__c: safe.posterior,
        Redlines_Fired__c: (safe.redlinesFired ?? []).join('; '),
        Reasoning__c: (safe.reasoning ?? '').slice(0, 32000),
        Generated_At__c: safe.generatedAt,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, provider: 'salesforce', error: `HTTP ${res.status}: ${text.slice(0, 200)}`, durationMs: Date.now() - startedAt };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, provider: 'salesforce', recordId: data.id, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, provider: 'salesforce', error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startedAt };
  }
}

async function pushDynamics(payload: CrmFlagPayload): Promise<CrmOutcome> {
  const startedAt = Date.now();
  const baseUrl = process.env['DYNAMICS_INSTANCE_URL'];
  const token = process.env['DYNAMICS_ACCESS_TOKEN'];
  const entityName = process.env['DYNAMICS_ENTITY_NAME'] ?? 'cr1f5_hawkeye_flags';
  if (!baseUrl || !token) {
    return { ok: false, provider: 'dynamics', error: 'DYNAMICS_INSTANCE_URL + DYNAMICS_ACCESS_TOKEN required', durationMs: Date.now() - startedAt };
  }
  const { safe } = redactPdplObject(payload);
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/data/v9.2/${entityName}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        accept: 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({
        cr1f5_caseid: safe.caseId,
        cr1f5_subjectname: safe.subjectName,
        cr1f5_outcome: safe.outcome,
        cr1f5_aggregatescore: safe.aggregateScore,
        cr1f5_posterior: safe.posterior,
        cr1f5_redlinesfired: (safe.redlinesFired ?? []).join('; '),
        cr1f5_reasoning: (safe.reasoning ?? '').slice(0, 32000),
        cr1f5_generatedat: safe.generatedAt,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, provider: 'dynamics', error: `HTTP ${res.status}: ${text.slice(0, 200)}`, durationMs: Date.now() - startedAt };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const id = typeof data['cr1f5_hawkeye_flagid'] === 'string' ? (data['cr1f5_hawkeye_flagid'] as string) : undefined;
    const result: CrmOutcome = { ok: true, provider: 'dynamics', durationMs: Date.now() - startedAt };
    if (id !== undefined) result.recordId = id;
    return result;
  } catch (err) {
    return { ok: false, provider: 'dynamics', error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startedAt };
  }
}

/** Push a CRM flag — auto-detect provider from env, or pass explicitly. */
export async function pushCrmFlag(payload: CrmFlagPayload, provider?: CrmProvider): Promise<CrmOutcome> {
  if (provider === 'salesforce') return pushSalesforce(payload);
  if (provider === 'dynamics') return pushDynamics(payload);
  if (process.env['SFDC_INSTANCE_URL']) return pushSalesforce(payload);
  if (process.env['DYNAMICS_INSTANCE_URL']) return pushDynamics(payload);
  return { ok: false, provider: 'none', error: 'no CRM provider configured', durationMs: 0 };
}

/** Configured providers — useful for status/health endpoints. */
export function configuredCrmProviders(): CrmProvider[] {
  const out: CrmProvider[] = [];
  if (process.env['SFDC_INSTANCE_URL'] && process.env['SFDC_ACCESS_TOKEN']) out.push('salesforce');
  if (process.env['DYNAMICS_INSTANCE_URL'] && process.env['DYNAMICS_ACCESS_TOKEN']) out.push('dynamics');
  return out;
}
