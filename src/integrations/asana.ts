import type { CaseReport, ScreeningMode } from '../reports/caseReport.js';

export interface AsanaConfig {
  personalAccessToken: string;
  workspaceGid: string;
  projectGid: string;
  sections: {
    firstScreening: string;
    dailyMonitoring: string;
  };
}

export interface AsanaDeliveryEnvelope {
  name: string;
  notes: string;
  section: string;
  dueOn?: string;
  customFields?: Record<string, string | number | boolean>;
  attachments?: Array<{
    filename: string;
    mimeType: 'application/json' | 'application/pdf' | 'text/html';
    content: string;
  }>;
}

export interface AsanaDeliveryResult {
  ok: boolean;
  taskGid?: string | undefined;
  url?: string | undefined;
  error?: string | undefined;
}

function summariseReport(report: CaseReport): string {
  const { identity, keyFindings, header } = report;
  const total = keyFindings.totalMatches === 'NO MATCHES FOUND' ? 0 : keyFindings.totalMatches;
  return [
    `Subject: ${identity.name}`,
    `Entity type: ${identity.entityType}`,
    `Mode: ${header.mode.toUpperCase()}`,
    `Total matches: ${total}`,
    `Verdicts: P=${keyFindings.verdictBreakdown.Positive} · Ps=${keyFindings.verdictBreakdown.Possible} · F=${keyFindings.verdictBreakdown.False} · U=${keyFindings.verdictBreakdown.Unspecified}`,
    `Generated: ${header.generatedAt}`,
  ].join('\n');
}

function sectionFor(mode: ScreeningMode, config: AsanaConfig): string {
  return mode === 'first_screening'
    ? config.sections.firstScreening
    : config.sections.dailyMonitoring;
}

export function buildAsanaEnvelope(
  report: CaseReport,
  config: AsanaConfig,
): AsanaDeliveryEnvelope {
  const { identity, header, keyFindings } = report;
  const hits = keyFindings.totalMatches === 'NO MATCHES FOUND' ? 0 : keyFindings.totalMatches;
  const tag = header.mode === 'first_screening' ? 'FIRST' : 'DAILY';
  return {
    name: `[${tag}] ${identity.name} · ${hits} match${hits === 1 ? '' : 'es'} · ${identity.caseId}`,
    notes: summariseReport(report),
    section: sectionFor(header.mode, config),
    customFields: {
      subject: identity.name,
      entity_type: identity.entityType,
      mode: header.mode,
      total_matches: hits,
    },
    attachments: [
      {
        filename: `${identity.caseId}.json`,
        mimeType: 'application/json',
        content: JSON.stringify(report, null, 2),
      },
    ],
  };
}

export async function deliverToAsana(
  report: CaseReport,
  config: AsanaConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<AsanaDeliveryResult> {
  const envelope = buildAsanaEnvelope(report, config);
  try {
    const res = await fetchImpl('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.personalAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          name: envelope.name,
          notes: envelope.notes,
          projects: [config.projectGid],
          memberships: [{ project: config.projectGid, section: envelope.section }],
        },
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Asana HTTP ${res.status}` };
    }
    const json = (await res.json()) as { data?: { gid?: string; permalink_url?: string } };
    return {
      ok: true,
      taskGid: json.data?.gid,
      url: json.data?.permalink_url,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
