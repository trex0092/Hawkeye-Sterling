// GET /api/lists — sanctions/PEP/adverse-media list freshness status.
// Phase 1 returns static coverage metadata. Phase 2 will read Netlify Blobs
// and return real fetch timestamps, record counts, and checksum fingerprints.

import type { Handler } from '@netlify/functions';

interface ListStatus {
  id: string;
  displayName: string;
  authority: string;
  coverage: string;
  phase: number;
  status: 'planned' | 'ingested' | 'stale' | 'error';
}

const LISTS: ListStatus[] = [
  { id: 'un_consolidated', displayName: 'UN Consolidated List',
    authority: 'United Nations Security Council',
    coverage: 'global sanctions, designated individuals & entities',
    phase: 2, status: 'planned' },
  { id: 'ofac_sdn', displayName: 'OFAC SDN',
    authority: 'US Department of the Treasury (OFAC)',
    coverage: 'Specially Designated Nationals, blocked persons',
    phase: 2, status: 'planned' },
  { id: 'ofac_cons', displayName: 'OFAC Consolidated Non-SDN',
    authority: 'US Department of the Treasury (OFAC)',
    coverage: 'FSE, SSI, 13599, NS-PLC, and related lists',
    phase: 2, status: 'planned' },
  { id: 'eu_fsf', displayName: 'EU Financial Sanctions Files',
    authority: 'European External Action Service',
    coverage: 'EU restrictive measures, consolidated XML',
    phase: 2, status: 'planned' },
  { id: 'uk_ofsi', displayName: 'UK OFSI Consolidated List',
    authority: 'HM Treasury — Office of Financial Sanctions Implementation',
    coverage: 'UK sanctions regime designations',
    phase: 2, status: 'planned' },
  { id: 'uae_eocn', displayName: 'UAE EOCN Sanctions List',
    authority: 'UAE Executive Office for Control & Non-Proliferation',
    coverage: 'UAE national sanctions list implementing UNSCRs and local designations',
    phase: 2, status: 'planned' },
  { id: 'uae_ltl', displayName: 'UAE Local Terrorist List',
    authority: 'UAE Cabinet',
    coverage: 'UAE Cabinet-designated terrorist individuals & organisations',
    phase: 2, status: 'planned' },
  { id: 'opensanctions_pep', displayName: 'OpenSanctions PEP',
    authority: 'OpenSanctions.org',
    coverage: 'politically-exposed persons, family & close associates',
    phase: 5, status: 'planned' },
  { id: 'adverse_media', displayName: 'Adverse Media (news + RSS + CSE)',
    authority: 'Aggregated',
    coverage: 'financial crime, TF, PF, corruption, legal/regulatory',
    phase: 6, status: 'planned' },
];

export const handler: Handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  },
  body: JSON.stringify({
    lists: LISTS,
    note:
      'Phase 1 scaffold. Ingestion, freshness, and record counts activate in Phase 2.',
  }),
});
