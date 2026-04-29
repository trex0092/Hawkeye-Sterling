// Hawkeye Sterling — UAE free-zone authority registry.
// Factual public reference data (zone names + emirate). Brain uses this to
// flag entities incorporated in free zones for the relevant supervisory
// regime. Risk weight is NOT asserted here — that comes from rubrics +
// jurisdiction tier.

export type Emirate = 'AbuDhabi' | 'Dubai' | 'Sharjah' | 'Ajman' | 'UmmAlQuwain' | 'RasAlKhaimah' | 'Fujairah' | 'Federal';

export interface FreeZone {
  id: string;
  shortName: string;
  legalName: string;
  emirate: Emirate;
  primaryRegulator?: string;
  notes?: string;
}

export const UAE_FREE_ZONES: FreeZone[] = [
  // Dubai
  { id: 'fz_difc',  shortName: 'DIFC',  legalName: 'Dubai International Financial Centre', emirate: 'Dubai', primaryRegulator: 'DFSA' },
  { id: 'fz_dmcc',  shortName: 'DMCC',  legalName: 'Dubai Multi Commodities Centre', emirate: 'Dubai' },
  { id: 'fz_jafza', shortName: 'JAFZA', legalName: 'Jebel Ali Free Zone', emirate: 'Dubai' },
  { id: 'fz_dafza', shortName: 'DAFZA', legalName: 'Dubai Airport Free Zone Authority', emirate: 'Dubai' },
  { id: 'fz_disc',  shortName: 'DSO',   legalName: 'Dubai Silicon Oasis', emirate: 'Dubai' },
  { id: 'fz_dsoa',  shortName: 'DSOA',  legalName: 'Dubai South Free Zone (DSOA)', emirate: 'Dubai' },
  { id: 'fz_dwc',   shortName: 'DWC',   legalName: 'Dubai World Central', emirate: 'Dubai' },
  { id: 'fz_dhcc',  shortName: 'DHCC',  legalName: 'Dubai Healthcare City', emirate: 'Dubai' },
  { id: 'fz_dic',   shortName: 'DIC',   legalName: 'Dubai Internet City', emirate: 'Dubai' },
  { id: 'fz_dmc',   shortName: 'DMC',   legalName: 'Dubai Media City', emirate: 'Dubai' },
  { id: 'fz_dwt',   shortName: 'DWTC',  legalName: 'Dubai World Trade Centre Free Zone', emirate: 'Dubai' },
  { id: 'fz_meydan',shortName: 'MEYDAN',legalName: 'Meydan Free Zone', emirate: 'Dubai' },
  { id: 'fz_iffsa', shortName: 'IFZA',  legalName: 'International Free Zone Authority', emirate: 'Dubai' },

  // Abu Dhabi
  { id: 'fz_adgm',  shortName: 'ADGM',  legalName: 'Abu Dhabi Global Market', emirate: 'AbuDhabi', primaryRegulator: 'FSRA' },
  { id: 'fz_kizad', shortName: 'KIZAD', legalName: 'Khalifa Industrial Zone Abu Dhabi', emirate: 'AbuDhabi' },
  { id: 'fz_2adfz',  shortName: 'twofour54', legalName: 'twofour54 Free Zone', emirate: 'AbuDhabi' },
  { id: 'fz_madsh', shortName: 'Masdar', legalName: 'Masdar City Free Zone', emirate: 'AbuDhabi' },
  { id: 'fz_aifz',  shortName: 'AIFZ',  legalName: 'Abu Dhabi Airport Free Zone', emirate: 'AbuDhabi' },

  // Sharjah
  { id: 'fz_saif',  shortName: 'SAIF',  legalName: 'Sharjah Airport International Free Zone', emirate: 'Sharjah' },
  { id: 'fz_hfza',  shortName: 'HFZA',  legalName: 'Hamriyah Free Zone Authority', emirate: 'Sharjah' },
  { id: 'fz_shams', shortName: 'SHAMS', legalName: 'Sharjah Media City', emirate: 'Sharjah' },
  { id: 'fz_srtip', shortName: 'SRTIP', legalName: 'Sharjah Research Technology and Innovation Park', emirate: 'Sharjah' },
  { id: 'fz_spc',   shortName: 'SPC',   legalName: 'Sharjah Publishing City', emirate: 'Sharjah' },

  // Ras Al Khaimah
  { id: 'fz_rakez', shortName: 'RAKEZ', legalName: 'Ras Al Khaimah Economic Zone', emirate: 'RasAlKhaimah' },
  { id: 'fz_rakicc',shortName: 'RAK ICC', legalName: 'Ras Al Khaimah International Corporate Centre', emirate: 'RasAlKhaimah' },
  { id: 'fz_rakmc', shortName: 'RAK MC', legalName: 'RAK Maritime City', emirate: 'RasAlKhaimah' },

  // Ajman
  { id: 'fz_afz',   shortName: 'AFZ',   legalName: 'Ajman Free Zone', emirate: 'Ajman' },
  { id: 'fz_amc',   shortName: 'AMC',   legalName: 'Ajman Media City', emirate: 'Ajman' },

  // Umm Al Quwain
  { id: 'fz_uaqftz',shortName: 'UAQ FTZ', legalName: 'Umm Al Quwain Free Trade Zone', emirate: 'UmmAlQuwain' },

  // Fujairah
  { id: 'fz_fcc',   shortName: 'FCC',   legalName: 'Fujairah Creative City', emirate: 'Fujairah' },
  { id: 'fz_fujfz', shortName: 'Fujairah FZ', legalName: 'Fujairah Free Zone', emirate: 'Fujairah' },
];

export const FREE_ZONE_BY_ID: Map<string, FreeZone> = new Map(
  UAE_FREE_ZONES.map((z) => [z.id, z]),
);
export const FREE_ZONES_BY_EMIRATE: Record<Emirate, FreeZone[]> =
  UAE_FREE_ZONES.reduce((acc, z) => {
    (acc[z.emirate] ||= []).push(z);
    return acc;
  }, {} as Record<Emirate, FreeZone[]>);
