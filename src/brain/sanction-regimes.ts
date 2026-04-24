// Hawkeye Sterling — named sanction regimes.
// Each regime binds to an authority, a legal instrument, a public list URL
// (where applicable), and the reasoning modes the brain must engage when the
// regime is in scope. This catalogue is the registry the brain uses to answer
// "which regimes did we screen against?" — mandatory for P7 scope declarations.

export type SanctionRegimeId =
  | 'un_1267'
  | 'un_1988'
  | 'un_dprk'
  | 'un_iran'
  | 'un_libya'
  | 'un_somalia'
  | 'ofac_sdn'
  | 'ofac_cons'
  | 'ofac_capta'
  | 'ofac_13599'
  | 'ofac_ukraine_related'
  | 'eu_consolidated'
  | 'eu_russia'
  | 'eu_belarus'
  | 'eu_iran'
  | 'uk_ofsi'
  | 'uk_russia'
  | 'uk_belarus'
  | 'uae_eocn'
  | 'uae_local_terrorist'
  | 'switzerland_fdfa'
  | 'canada_sema'
  | 'australia_dfat'
  | 'australia_russia'
  | 'japan_meti'
  | 'japan_mofa'
  | 'singapore_mas'
  | 'south_korea_mofa'
  | 'new_zealand_mfat'
  | 'norway_mfa'
  | 'liechtenstein_llv'
  | 'un_mali';

export interface SanctionRegime {
  id: SanctionRegimeId;
  authority: string;
  instrument: string;
  scope: string;
  listUrlEnvKey?: string;
  reasoningModes: string[];
  jurisdictionsPrimary: string[];
}

export const SANCTION_REGIMES: SanctionRegime[] = [
  { id: 'un_1267', authority: 'UN Security Council', instrument: 'Resolutions 1267 / 1989 / 2253', scope: 'ISIL (Da’esh) & Al-Qaida sanctions list.', listUrlEnvKey: 'UN_CONSOLIDATED_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['GLOBAL'] },
  { id: 'un_1988', authority: 'UN Security Council', instrument: 'Resolution 1988', scope: 'Taliban sanctions list.', listUrlEnvKey: 'UN_CONSOLIDATED_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['AF'] },
  { id: 'un_dprk', authority: 'UN Security Council', instrument: 'Resolution 1718 and successors', scope: 'DPRK targeted financial sanctions / non-proliferation.', listUrlEnvKey: 'UN_CONSOLIDATED_URL', reasoningModes: ['sanctions_regime_matrix', 'pf_dual_use_controls'], jurisdictionsPrimary: ['KP'] },
  { id: 'un_iran', authority: 'UN Security Council', instrument: 'Resolution 2231', scope: 'Iran-related non-proliferation measures.', listUrlEnvKey: 'UN_CONSOLIDATED_URL', reasoningModes: ['sanctions_regime_matrix', 'pf_dual_use_controls'], jurisdictionsPrimary: ['IR'] },
  { id: 'un_libya', authority: 'UN Security Council', instrument: 'Resolution 1970', scope: 'Libya sanctions list.', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['LY'] },
  { id: 'un_somalia', authority: 'UN Security Council', instrument: 'Resolution 751 / 1907', scope: 'Somalia / Eritrea sanctions list.', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['SO'] },
  { id: 'ofac_sdn', authority: 'US Treasury — OFAC', instrument: 'Specially Designated Nationals List', scope: 'Primary US sanctions list.', listUrlEnvKey: 'OFAC_SDN_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['US'] },
  { id: 'ofac_cons', authority: 'US Treasury — OFAC', instrument: 'Consolidated Non-SDN List', scope: 'Sectoral, 13599, FSE, NS-PLC, MBS, PLC lists.', listUrlEnvKey: 'OFAC_CONS_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['US'] },
  { id: 'ofac_capta', authority: 'US Treasury — OFAC', instrument: 'CAPTA list', scope: 'Correspondent Account / Payable-Through Account sanctions.', reasoningModes: ['corresp_nested_bank_flow', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['US'] },
  { id: 'ofac_13599', authority: 'US Treasury — OFAC', instrument: 'Executive Order 13599', scope: 'Iranian government-owned / controlled entities.', reasoningModes: ['sanctions_regime_matrix'], jurisdictionsPrimary: ['US', 'IR'] },
  { id: 'ofac_ukraine_related', authority: 'US Treasury — OFAC', instrument: 'Ukraine-Related sanctions (EO 13660 et seq.)', scope: 'US Russia/Ukraine-related sanctions program.', reasoningModes: ['sanctions_regime_matrix'], jurisdictionsPrimary: ['US', 'RU', 'UA'] },
  { id: 'eu_consolidated', authority: 'European Union', instrument: 'Council restrictive measures', scope: 'EU consolidated financial sanctions file.', listUrlEnvKey: 'EU_FSF_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['EU'] },
  { id: 'eu_russia', authority: 'European Union', instrument: 'Council Regulation (EU) No 833/2014 and successors', scope: 'EU Russia sanctions.', reasoningModes: ['sanctions_regime_matrix'], jurisdictionsPrimary: ['EU', 'RU'] },
  { id: 'eu_belarus', authority: 'European Union', instrument: 'Council Regulation (EC) No 765/2006 and successors', scope: 'EU Belarus sanctions.', reasoningModes: ['sanctions_regime_matrix'], jurisdictionsPrimary: ['EU', 'BY'] },
  { id: 'eu_iran', authority: 'European Union', instrument: 'Council Regulation (EU) No 267/2012 and successors', scope: 'EU Iran sanctions.', reasoningModes: ['sanctions_regime_matrix', 'pf_dual_use_controls'], jurisdictionsPrimary: ['EU', 'IR'] },
  { id: 'uk_ofsi', authority: 'HM Treasury — OFSI', instrument: 'Sanctions & Anti-Money Laundering Act 2018', scope: 'UK consolidated list of financial sanctions targets.', listUrlEnvKey: 'UK_OFSI_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['UK'] },
  { id: 'uk_russia', authority: 'HM Treasury — OFSI', instrument: 'Russia (Sanctions) (EU Exit) Regulations 2019', scope: 'UK Russia sanctions regime.', reasoningModes: ['sanctions_regime_matrix'], jurisdictionsPrimary: ['UK', 'RU'] },
  { id: 'uk_belarus', authority: 'HM Treasury — OFSI', instrument: 'Republic of Belarus (Sanctions) (EU Exit) Regulations 2019', scope: 'UK Belarus sanctions regime.', reasoningModes: ['sanctions_regime_matrix'], jurisdictionsPrimary: ['UK', 'BY'] },
  { id: 'uae_eocn', authority: 'UAE Executive Office for Control & Non-Proliferation', instrument: 'Cabinet Decision 74/2020', scope: 'UAE-adopted UN TFS + national implementation.', listUrlEnvKey: 'UAE_EOCN_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix', 'escalation_trigger'], jurisdictionsPrimary: ['AE'] },
  { id: 'uae_local_terrorist', authority: 'UAE Cabinet', instrument: 'UAE Local Terrorist List', scope: 'UAE-designated terrorist persons and organisations.', reasoningModes: ['list_walk', 'sanctions_regime_matrix', 'escalation_trigger'], jurisdictionsPrimary: ['AE'] },
  { id: 'switzerland_fdfa', authority: 'Switzerland — FDFA (SECO)', instrument: 'Embargo Act (EmbA)', scope: 'Swiss Federal Council restrictive measures.', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['CH'] },
  { id: 'canada_sema', authority: 'Global Affairs Canada', instrument: 'Special Economic Measures Act (SEMA)', scope: 'Canadian sanctions (SEMA + JVCFO + SCCS).', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['CA'] },
  { id: 'australia_dfat', authority: 'Australian DFAT', instrument: 'Charter of the United Nations Act 1945 (Cth); Autonomous Sanctions Act 2011 (Cth)', scope: 'Australian Consolidated Sanctions List — UN + autonomous measures.', listUrlEnvKey: 'AUSTRALIA_DFAT_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['AU'] },
  { id: 'australia_russia', authority: 'Australian DFAT', instrument: 'Autonomous Sanctions Act 2011 — Russia Regulations', scope: 'Australian Russia-specific autonomous sanctions.', reasoningModes: ['sanctions_regime_matrix'], jurisdictionsPrimary: ['AU', 'RU'] },
  { id: 'japan_meti', authority: 'Japan — Ministry of Economy, Trade and Industry (METI)', instrument: 'Foreign Exchange and Foreign Trade Act (FEFTA)', scope: 'Japan export controls and end-user post-shipment verification; METI denied-party lists.', listUrlEnvKey: 'JAPAN_METI_URL', reasoningModes: ['sanctions_regime_matrix', 'pf_dual_use_controls'], jurisdictionsPrimary: ['JP'] },
  { id: 'japan_mofa', authority: 'Japan — Ministry of Foreign Affairs (MOFA)', instrument: 'Act on Punishment of Financing for Crimes of Collective or Organized Destruction of Civilians', scope: 'Japan targeted financial sanctions — UNSCR implementation + bilateral autonomous measures.', listUrlEnvKey: 'JAPAN_MOFA_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['JP'] },
  { id: 'singapore_mas', authority: 'Monetary Authority of Singapore (MAS)', instrument: 'Monetary Authority of Singapore Act 1970; MAS (Sanctions and Freeze Measures) Regulations', scope: 'Singapore MAS Financial Sanctions — UNSCR implementation + autonomous.', listUrlEnvKey: 'MAS_SANCTIONS_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['SG'] },
  { id: 'south_korea_mofa', authority: 'Republic of Korea — Ministry of Foreign Affairs (MOFA)', instrument: 'Act on International Peace and Security; Foreign Exchange Transactions Act', scope: 'South Korea targeted financial sanctions — UNSCR implementation + bilateral autonomous measures.', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['KR'] },
  { id: 'new_zealand_mfat', authority: 'New Zealand — Ministry of Foreign Affairs and Trade (MFAT)', instrument: 'Russia Sanctions Act 2022; United Nations Act 1946', scope: 'New Zealand targeted sanctions — UN + Russia autonomous measures.', listUrlEnvKey: 'NZMFAT_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['NZ'] },
  { id: 'norway_mfa', authority: 'Norway — Ministry of Foreign Affairs', instrument: 'Act relating to measures against foreign states etc. (Sanctions Act 2021); Forskrift om restriktive tiltak', scope: 'Norwegian autonomous sanctions — Russia, Belarus, and other restrictive measures.', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['NO'] },
  { id: 'liechtenstein_llv', authority: 'Liechtenstein — Office for Foreign Affairs (LLV)', instrument: 'Sanktionsgesetz (SanktG); EEA-mirrored EU sanctions', scope: 'Liechtenstein sanctions — EEA-mirrored EU restrictive measures and UN implementation.', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['LI'] },
  { id: 'un_mali', authority: 'UN Security Council', instrument: 'Resolution 2374 and successors', scope: 'UN Mali sanctions list — targeted financial sanctions on individuals and entities.', listUrlEnvKey: 'UN_CONSOLIDATED_URL', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], jurisdictionsPrimary: ['ML'] },
];

export const SANCTION_REGIME_BY_ID: Map<SanctionRegimeId, SanctionRegime> = new Map(
  SANCTION_REGIMES.map((r) => [r.id, r]),
);

export function regimesForJurisdiction(iso2: string): SanctionRegime[] {
  const u = iso2.toUpperCase();
  return SANCTION_REGIMES.filter((r) => r.jurisdictionsPrimary.includes(u));
}

export const MANDATORY_UAE_REGIMES: SanctionRegimeId[] = [
  'un_1267',
  'un_1988',
  'un_dprk',
  'un_iran',
  'uae_eocn',
  'uae_local_terrorist',
];
