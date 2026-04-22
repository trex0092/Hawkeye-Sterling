// Hawkeye Sterling — UAE emirate-level supervisor registry.
// Maps emirates, sectors, and free-zones to the competent supervisor. Brain
// cites supervisor by id in any narrative that touches licence / supervision.

export type Supervisor =
  | 'cbuae'            // Central Bank of the UAE
  | 'sca'              // Securities and Commodities Authority (federal)
  | 'moe'              // UAE Ministry of Economy (DNFBPs)
  | 'fiu'              // UAE Financial Intelligence Unit
  | 'eocn'             // UAE Executive Office for Control & Non-Proliferation
  | 'dfsa'             // Dubai Financial Services Authority (DIFC)
  | 'fsra'             // Financial Services Regulatory Authority (ADGM)
  | 'vara'             // Virtual Assets Regulatory Authority (Dubai)
  | 'ded_dubai'        // Dubai Department of Economy and Tourism
  | 'added'            // Abu Dhabi Department of Economic Development
  | 'ded_sharjah'
  | 'ded_ajman'
  | 'ded_uaq'
  | 'ded_rak'
  | 'ded_fujairah'
  | 'uaeiec';          // UAE International Energy Commission / as applicable

export interface SupervisorFacts {
  id: Supervisor;
  name: string;
  scope: string;
  emirate?: 'AbuDhabi' | 'Dubai' | 'Sharjah' | 'Ajman' | 'UmmAlQuwain' | 'RasAlKhaimah' | 'Fujairah' | 'Federal';
}

export const SUPERVISORS: SupervisorFacts[] = [
  { id: 'cbuae', name: 'Central Bank of the UAE', scope: 'Licensed banks, exchange houses, finance companies, insurance companies (certain matters).', emirate: 'Federal' },
  { id: 'sca',   name: 'Securities and Commodities Authority', scope: 'Capital-markets participants, listed securities, funds, VASPs outside emirate-level regimes.', emirate: 'Federal' },
  { id: 'moe',   name: 'Ministry of Economy', scope: 'DNFBPs including DPMS, real estate brokers, auditors, company service providers.', emirate: 'Federal' },
  { id: 'fiu',   name: 'UAE Financial Intelligence Unit', scope: 'Receives STR/SAR/FFR/PNMR filings via goAML.', emirate: 'Federal' },
  { id: 'eocn',  name: 'Executive Office for Control & Non-Proliferation', scope: 'UAE implementation of UN TFS and national sanctions list; 24-hour freeze regime.', emirate: 'Federal' },
  { id: 'dfsa',  name: 'Dubai Financial Services Authority', scope: 'DIFC free zone — banking, insurance, asset management, VASPs within DIFC.', emirate: 'Dubai' },
  { id: 'fsra',  name: 'Financial Services Regulatory Authority', scope: 'ADGM free zone — banking, insurance, asset management, digital assets within ADGM.', emirate: 'AbuDhabi' },
  { id: 'vara',  name: 'Virtual Assets Regulatory Authority', scope: 'Emirate of Dubai (excluding DIFC) — virtual-asset service providers.', emirate: 'Dubai' },
  { id: 'ded_dubai', name: 'Dubai Department of Economy and Tourism', scope: 'Mainland Dubai commercial licensing incl. DNFBPs.', emirate: 'Dubai' },
  { id: 'added', name: 'Abu Dhabi Department of Economic Development', scope: 'Mainland Abu Dhabi commercial licensing incl. DNFBPs.', emirate: 'AbuDhabi' },
  { id: 'ded_sharjah', name: 'Sharjah Economic Development Department', scope: 'Mainland Sharjah commercial licensing.', emirate: 'Sharjah' },
  { id: 'ded_ajman', name: 'Ajman Department of Economic Development', scope: 'Mainland Ajman commercial licensing.', emirate: 'Ajman' },
  { id: 'ded_uaq', name: 'Umm Al Quwain Department of Economic Development', scope: 'Mainland UAQ commercial licensing.', emirate: 'UmmAlQuwain' },
  { id: 'ded_rak', name: 'RAK Department of Economic Development', scope: 'Mainland RAK commercial licensing.', emirate: 'RasAlKhaimah' },
  { id: 'ded_fujairah', name: 'Fujairah Department of Industry and Economy', scope: 'Mainland Fujairah commercial licensing.', emirate: 'Fujairah' },
];

export const SUPERVISOR_BY_ID: Map<Supervisor, SupervisorFacts> = new Map(
  SUPERVISORS.map((s) => [s.id, s]),
);

export function supervisorsForSector(sector: 'dpms' | 'bank' | 'insurance' | 'asset_mgmt' | 'vasp' | 'real_estate' | 'auditor' | 'corporate_services'): Supervisor[] {
  switch (sector) {
    case 'dpms': return ['moe', 'fiu'];
    case 'bank': return ['cbuae', 'fiu', 'eocn'];
    case 'insurance': return ['cbuae', 'fiu'];
    case 'asset_mgmt': return ['sca', 'dfsa', 'fsra', 'fiu'];
    case 'vasp': return ['vara', 'sca', 'dfsa', 'fsra', 'fiu'];
    case 'real_estate': return ['moe', 'fiu'];
    case 'auditor': return ['moe', 'fiu'];
    case 'corporate_services': return ['moe', 'fiu'];
    default: return ['fiu'];
  }
}
