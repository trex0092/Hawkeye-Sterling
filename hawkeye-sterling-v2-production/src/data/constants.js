export const SHIFT = {
  officer: 'Noor Al-Mansouri',
  role: 'MLRO, Precision Screening UAE',
  avatar: 'N',
  shiftStart: '08:00',
  shiftEnd: '16:00',
  caseload: 42,
  session: 'a7fb19c4',
  region: 'DXB / UAE',
};

export const FILTERS = [
  { id: 'all', label: 'All open', count: 42 },
  { id: 'critical', label: 'Critical', count: 3, kind: 'critical' },
  { id: 'sanctions', label: 'Sanctions hits', count: 7 },
  { id: 'edd', label: 'EDD review', count: 12 },
  { id: 'pep', label: 'PEP exposure', count: 5 },
  { id: 'sla', label: 'SLA breaching (<24h)', count: 4 },
  { id: 'awaiting', label: 'Awaiting 2nd approver', count: 9 },
  { id: 'closed', label: 'Closed today', count: 18 },
];

export const WORKSPACES = [
  { id: 'bench', label: 'Workbench', active: true },
  { id: 'screen', label: 'Screening' },
  { id: 'cases', label: 'Cases' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'audit', label: 'Audit trail' },
];

export const REG_TICKER = [
  { text: 'FDL No.10/2025 Art.24 · 10-yr retention active', ok: true },
  { text: 'Cabinet Res 134/2025 Art.18 · STR immediate-notify mode', warn: true },
  { text: 'EOCN watch-list · sync 14:12 · Δ 41 entries', ok: true },
  { text: 'LBMA RGG v9 Step 5 · independent audit pending', warn: true },
  { text: 'MoE Circular 08/AML/2021 · AED 55K DPMS CTR threshold', ok: true },
  { text: 'Cabinet Decision 109/2023 · UBO 25% threshold', ok: true },
  { text: 'FATF Rec.6 · TFS mandatory screening active', ok: true },
  { text: 'UNSC Consolidated · last sync 14:04', ok: true },
];

export const SUBJECTS = [
  {
    id: 'HS-24891',
    name: 'Dmitri Volkov-Arenova',
    jur: 'RU / AE',
    type: 'Individual · UBO',
    reason: 'Name match on OFAC SDN (87% phonetic)',
    severity: 'crit',
    score: 94,
    age: '02h 14m',
    ageLate: false,
    lists: [
      { code: 'OFAC', hit: true },
      { code: 'UN', hit: false },
      { code: 'EU', hit: true },
      { code: 'UK', hit: false },
      { code: 'EOCN', hit: false },
      { code: 'IPRN', hit: false },
    ],
    structure: 'Volkov Holdings DMCC → Arenova Bullion SARL → 3 layers',
    context: 'Bullion counterparty for pending AED 2.1M consignment. Incorporated 2023, Dubai South. UBO share 34%.',
    incorporation: '2023-11-14 · DMCC',
    dpms: 'XAU · 28.4 kg',
    amount: 'AED 2,140,000',
    product: 'Gold Kilobar · Brinks-insured',
    onboarded: '2024-02-03',
    cdd: 'EDD',
    linkedCases: 2,
    hits: [
      {
        list: 'OFAC SDN',
        listRef: 'OFAC-SDN-28841',
        name: 'VOLKOV, Dmitri Sergeyevich',
        meta: 'DOB 1971-08-14 · RU · E.O. 14024 · Designated 2022-04-06',
        score: 87,
        kind: 'crit',
        reason: 'Phonetic + DOB ±2',
      },
      {
        list: 'EU Consolidated',
        listRef: 'EU-CFSP-2014/145',
        name: 'VOLKOV, D.',
        meta: 'RU · CFSP 2014/145 · Restrictive measures',
        score: 82,
        kind: 'crit',
        reason: 'Phonetic + jurisdiction',
      },
    ],
    ubos: [
      { avatar: 'D', name: 'Dmitri Volkov-Arenova', role: 'Founder, 34%', share: '34.0%', status: 'flag', statusLabel: 'Hit' },
      { avatar: 'Y', name: 'Yelena Arenova', role: 'Director, 28%', share: '28.0%', status: 'pending', statusLabel: 'Pending' },
      { avatar: 'M', name: 'Marko Petričević', role: 'Director, 22%', share: '22.0%', status: 'clear', statusLabel: 'Clear' },
    ],
    timeline: [
      { t: '14:27', head: 'Sanctions engine: OFAC SDN hit raised', body: 'Phonetic 87%, DOB match ±2 years. Entity flagged automatically.', actor: 'system · screening-svc/v4.1', kind: 'crit' },
      { t: '14:24', head: 'Consignment presented for approval', body: 'Brinks release requested for AED 2.14M bullion shipment.', actor: 'trader · S.Okafor' },
      { t: '11:08', head: 'Periodic EDD review opened', body: 'Next review was due 2026-05-01. Pulled forward due to transaction.', actor: 'auto · cdd-scheduler' },
    ],
  },
  { id: 'HS-24887', name: 'Crescent Refineries Jordan', jur: 'JO / AE', type: 'Corporate · Supplier', reason: 'CAHRA jurisdiction · LBMA Step 3 trigger', severity: 'crit', score: 88, age: '04h 02m', ageLate: true, lists: [{ code: 'OFAC', hit: false }, { code: 'UN', hit: false }] },
  { id: 'HS-24883', name: 'Istanbul Altin Rafinerisi A.S', jur: 'TR', type: 'Corporate · Refiner', reason: 'LBMA RGG v9 Step 5 audit missing', severity: 'crit', score: 81, age: '06h 11m', ageLate: true, lists: [{ code: 'OFAC', hit: false }] },
  { id: 'HS-24880', name: 'Kwame Asante-Boateng', jur: 'GH / AE', type: 'Individual · UBO', reason: 'PEP · deputy minister (former)', severity: 'high', score: 72, age: '08h 44m', ageLate: false, lists: [{ code: 'OFAC', hit: false }] },
];

export const APPROVALS = [
  { id: 'APR-0144', title: 'Release AED 2.14M bullion consignment · HS-24891', meta: ['Maker: S.Okafor', 'Type: High-risk txn', 'Opened 14:24'], sla: 'SLA 24h · 21h 46m left', kind: 'danger' },
  { id: 'APR-0143', title: 'Close alert · HS-24858 (false positive, name collision)', meta: ['Maker: R.Menon', 'Type: Alert closure', 'Opened 13:50'], sla: 'SLA 24h · 22h 20m left' },
  { id: 'APR-0142', title: 'Threshold override · AED 55K CTR · Crescent Refineries', meta: ['Maker: N.Al-Mansouri', 'Type: Threshold', 'Opened 12:08'], sla: 'SLA 24h · 20h 02m left' },
  { id: 'APR-0139', title: 'Onboarding approval · Istanbul Altin — EDD', meta: ['Maker: R.Menon', 'Type: High-risk onboarding', 'Opened 09:41'], sla: 'SLA 24h · 17h 35m left', warn: true },
];

// Demo candidate list for /api/quick-screen. In a production deploy this is
// replaced by authoritative watchlist ingest (see watchlist-adapters in the
// brain). Kept small on purpose so the UI boots instantly.
export const CANDIDATES = [
  {
    listId: 'ofac_sdn',
    listRef: 'OFAC-SDN-28841',
    name: 'Dmitri Sergeyevich Volkov',
    aliases: ['D. Volkov', 'Dmitry Volkov'],
    entityType: 'individual',
    jurisdiction: 'RU',
    programs: ['E.O. 14024'],
  },
  {
    listId: 'eu_consolidated',
    listRef: 'EU-CFSP-2014/145',
    name: 'VOLKOV, D.',
    aliases: [],
    entityType: 'individual',
    jurisdiction: 'RU',
    programs: ['CFSP 2014/145'],
  },
  {
    listId: 'un_1267',
    listRef: 'UN-1267-AQ-1234',
    name: 'Kwame Asante-Boateng',
    aliases: ['K. Boateng'],
    entityType: 'individual',
    jurisdiction: 'GH',
    programs: ['UNSCR 1267'],
  },
  {
    listId: 'uk_ofsi',
    listRef: 'UK-OFSI-18877',
    name: 'Crescent Refineries Jordan',
    aliases: ['Crescent Refineries', 'CRJ'],
    entityType: 'organisation',
    jurisdiction: 'JO',
    programs: ['UK Russia Regulations'],
  },
  {
    listId: 'ofac_cons',
    listRef: 'OFAC-CONS-90221',
    name: 'Istanbul Altin Rafinerisi A.S',
    aliases: ['Istanbul Altin'],
    entityType: 'organisation',
    jurisdiction: 'TR',
  },
];

export const CONSOLE_LINES = [
  { ts: '14:27:14', lvl: 'HIT', kind: 'hit', msg: 'OFAC SDN · VOLKOV DMITRI · 87% · HS-24891 — promoted to critical' },
  { ts: '14:27:11', lvl: 'EU', kind: 'hit', msg: 'EU CFSP 2014/145 · VOLKOV D. · 82% · HS-24891' },
  { ts: '14:26:58', lvl: 'SYS', kind: 'sys', msg: 'Cross-list fusion: 2 hits on 2 lists → promote severity' },
  { ts: '14:26:44', lvl: 'CLEAR', kind: 'clear', msg: 'UN Consolidated · 0 matches · HS-24891' },
  { ts: '14:26:42', lvl: 'CLEAR', kind: 'clear', msg: 'UK OFSI · 0 matches · HS-24891' },
  { ts: '14:26:40', lvl: 'CLEAR', kind: 'clear', msg: 'EOCN Local · 0 matches · HS-24891' },
  { ts: '14:24:08', lvl: 'SYS', kind: 'sys', msg: 'Screening run initiated · operator: N.Al-Mansouri · policy v4.1' },
  { ts: '14:23:50', lvl: 'SYS', kind: 'sys', msg: 'Subject ingested: HS-24891 · type=Individual · jur=RU/AE' },
  { ts: '14:12:00', lvl: 'SYS', kind: 'sys', msg: 'EOCN watch-list sync complete · Δ 41 · next 15:12' },
  { ts: '14:04:33', lvl: 'SYS', kind: 'sys', msg: 'UNSC Consolidated sync complete · Δ 0' },
];
