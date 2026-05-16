// Hawkeye Sterling — watchlist parser implementations.
// Adapter SHAPES + real parsers for the public watchlist formats.
// Each parser normalises raw feed content into NormalisedListEntry objects
// the matcher can consume. Parsers are intentionally permissive — upstream
// feeds change format; the parsers keep working when minor fields drop.

export interface NormalisedListEntry {
  listId: string;             // e.g. 'ofac_sdn'
  sourceRef: string;          // upstream identifier (e.g. SDN UID)
  primaryName: string;
  aliases: string[];
  entityType: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  identifiers: Array<{ kind: string; number: string; issuer?: string }>;
  nationalities?: string[];
  addresses?: Array<{ country?: string; city?: string; line?: string }>;
  programs?: string[];        // sanctions programmes / designations
  remarks?: string;
  publishedAt?: string;
  ingestedAt: string;
  rawHash: string;            // fnv32a of raw record block for dedup / tamper evidence
}

export interface WatchlistAdapter {
  listId: string;
  format: 'xml' | 'json' | 'csv' | 'tsv' | 'pdf';
  authoritativeUrlEnvKey: string;
  parse: (raw: string) => NormalisedListEntry[];
  validate: (entry: NormalisedListEntry) => string[]; // list of validation errors
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function fnv32a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function xmlTag(block: string, name: string): string {
  return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 's'))?.[1]?.trim() ?? '';
}

function xmlTags(block: string, name: string): string[] {
  return Array.from(
    block.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gs')),
    (m) => m[1]?.trim() ?? '',
  ).filter(Boolean);
}

function xmlAttr(fragment: string, name: string): string {
  return fragment.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? '';
}

// ── UN Consolidated List (XML — UNSC 1267/1988 consolidated format) ───────────

function parseUnXml(raw: string, listId: string): NormalisedListEntry[] {
  const out: NormalisedListEntry[] = [];
  const now = new Date().toISOString();

  for (const m of raw.matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g)) {
    const block = m[1] ?? '';
    const ref = xmlTag(block, 'DATAID');
    const first = xmlTag(block, 'FIRST_NAME');
    const second = xmlTag(block, 'SECOND_NAME');
    const third = xmlTag(block, 'THIRD_NAME');
    const name = [first, second, third].filter(Boolean).join(' ');
    if (!name || !ref) continue;

    const aliases = xmlTags(block, 'ALIAS_NAME');
    const nationality = xmlTag(block, 'NATIONALITY');
    const dob = xmlTag(block, 'DATE_OF_BIRTH');
    const passport = xmlTag(block, 'PASSPORT_NUMBER');
    const ni = xmlTag(block, 'NATIONAL_IDENTIFICATION_NUMBER');
    const programs = xmlTags(block, 'UN_LIST_TYPE');
    const identifiers: Array<{ kind: string; number: string }> = [];
    if (passport) identifiers.push({ kind: 'passport', number: passport });
    if (ni) identifiers.push({ kind: 'national_id', number: ni });
    if (dob) identifiers.push({ kind: 'dob', number: dob });

    const addresses: Array<{ country?: string; city?: string; line?: string }> = [];
    for (const am of block.matchAll(/<INDIVIDUAL_ADDRESS>([\s\S]*?)<\/INDIVIDUAL_ADDRESS>/g)) {
      const ab = am[1] ?? '';
      const country = xmlTag(ab, 'COUNTRY_OF_RESIDENCE') || xmlTag(ab, 'COUNTRY');
      const city = xmlTag(ab, 'CITY');
      if (country || city) addresses.push({ ...(country ? { country } : {}), ...(city ? { city } : {}) });
    }

    out.push({
      listId,
      sourceRef: ref,
      primaryName: name,
      aliases,
      entityType: 'individual',
      identifiers,
      ...(nationality ? { nationalities: [nationality] } : {}),
      ...(addresses.length ? { addresses } : {}),
      ...(programs.length ? { programs } : {}),
      ingestedAt: now,
      rawHash: fnv32a(block),
    });
  }

  for (const m of raw.matchAll(/<ENTITY>([\s\S]*?)<\/ENTITY>/g)) {
    const block = m[1] ?? '';
    const ref = xmlTag(block, 'DATAID');
    const name = xmlTag(block, 'FIRST_NAME') || xmlTag(block, 'ENTITY_NAME');
    if (!name || !ref) continue;

    const aliases = xmlTags(block, 'ALIAS_NAME').concat(xmlTags(block, 'ENTITY_ALIAS'));
    const programs = xmlTags(block, 'UN_LIST_TYPE');

    out.push({
      listId,
      sourceRef: ref,
      primaryName: name,
      aliases,
      entityType: 'organisation',
      identifiers: [],
      ...(programs.length ? { programs } : {}),
      ingestedAt: now,
      rawHash: fnv32a(block),
    });
  }

  return out;
}

// ── OFAC SDN / Consolidated (XML — sdnEntry schema) ──────────────────────────

function parseOfacSdnXml(raw: string, listId: string): NormalisedListEntry[] {
  const out: NormalisedListEntry[] = [];
  const now = new Date().toISOString();

  for (const m of raw.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/g)) {
    const block = m[1] ?? '';
    const uid = xmlTag(block, 'uid');
    const fn = xmlTag(block, 'firstName');
    const ln = xmlTag(block, 'lastName');
    const sdnType = xmlTag(block, 'sdnType');
    const name = (fn + ' ' + ln).trim() || ln || fn;
    if (!name || !uid) continue;

    const programs = xmlTags(block, 'program');
    const aliases: string[] = [];
    for (const am of block.matchAll(/<aka>([\s\S]*?)<\/aka>/g)) {
      const ab = am[1] ?? '';
      const af = xmlTag(ab, 'firstName');
      const al = xmlTag(ab, 'lastName');
      const aname = (af + ' ' + al).trim() || al || af;
      if (aname) aliases.push(aname);
    }

    const identifiers: Array<{ kind: string; number: string; issuer?: string }> = [];
    for (const im of block.matchAll(/<id>([\s\S]*?)<\/id>/g)) {
      const ib = im[1] ?? '';
      const kind = xmlTag(ib, 'idType').toLowerCase().replace(/\s+/g, '_');
      const number = xmlTag(ib, 'idNumber');
      const issuer = xmlTag(ib, 'idCountry');
      if (number) identifiers.push({ kind, number, ...(issuer ? { issuer } : {}) });
    }

    const addresses: Array<{ country?: string; city?: string; line?: string }> = [];
    for (const am of block.matchAll(/<address>([\s\S]*?)<\/address>/g)) {
      const ab = am[1] ?? '';
      const country = xmlTag(ab, 'country') || xmlTag(ab, 'countryCode');
      const city = xmlTag(ab, 'city');
      if (country || city) addresses.push({ ...(country ? { country } : {}), ...(city ? { city } : {}) });
    }

    const nationality = xmlTag(block, 'nationality') || xmlTag(block, 'nationality1');
    const entityType: NormalisedListEntry['entityType'] =
      sdnType.toLowerCase().includes('entity') ? 'organisation'
        : sdnType.toLowerCase().includes('vessel') ? 'vessel'
          : sdnType.toLowerCase().includes('aircraft') ? 'aircraft'
            : 'individual';

    out.push({
      listId,
      sourceRef: uid,
      primaryName: name,
      aliases,
      entityType,
      identifiers,
      ...(addresses.length ? { addresses } : {}),
      ...(nationality ? { nationalities: [nationality] } : {}),
      ...(programs.length ? { programs } : {}),
      ingestedAt: now,
      rawHash: fnv32a(block),
    });
  }

  return out;
}

// ── EU Consolidated CFSP (XML — sanctionEntity schema) ────────────────────────

function parseEuCfspXml(raw: string, listId: string): NormalisedListEntry[] {
  const out: NormalisedListEntry[] = [];
  const now = new Date().toISOString();

  for (const m of raw.matchAll(/<sanctionEntity([^>]*)>([\s\S]*?)<\/sanctionEntity>/g)) {
    const attrStr = m[1] ?? '';
    const block = m[2] ?? '';
    const ref = xmlAttr(attrStr, 'euReferenceNumber')
      || xmlAttr(attrStr, 'logicalId')
      || xmlTag(block, 'euReferenceNumber')
      || xmlTag(block, 'logicalId');
    const whole = xmlTag(block, 'wholeName');
    const last = xmlTag(block, 'lastName');
    const first = xmlTag(block, 'firstName');
    const name = whole || [first, last].filter(Boolean).join(' ');
    if (!name) continue;

    const aliases: string[] = [];
    for (const am of block.matchAll(/<nameAlias[^>]*>([\s\S]*?)<\/nameAlias>/g)) {
      const aname = xmlTag(am[1] ?? '', 'wholeName') || xmlTag(am[1] ?? '', 'lastName');
      if (aname) aliases.push(aname);
    }

    const programs = xmlTags(block, 'regulation');
    const dob = xmlTag(block, 'birthDate');
    const nationality = xmlAttr(block, 'countryIso2Code') || xmlTag(block, 'countryIso2Code');

    const identifiers: Array<{ kind: string; number: string; issuer?: string }> = [];
    if (dob) identifiers.push({ kind: 'dob', number: dob });
    for (const im of block.matchAll(/<identification[^>]*>([\s\S]*?)<\/identification>/g)) {
      const ib = im[1] ?? '';
      const kind = (xmlTag(ib, 'identificationTypeCode') || 'document').toLowerCase();
      const number = xmlTag(ib, 'number') || xmlAttr(ib, 'number');
      const issuer = xmlTag(ib, 'countryIso2Code');
      if (number) identifiers.push({ kind, number, ...(issuer ? { issuer } : {}) });
    }

    out.push({
      listId,
      sourceRef: ref || fnv32a(name),
      primaryName: name,
      aliases,
      entityType: 'individual',
      identifiers,
      ...(nationality ? { nationalities: [nationality] } : {}),
      ...(programs.length ? { programs } : {}),
      ingestedAt: now,
      rawHash: fnv32a(block),
    });
  }

  return out;
}

// ── UK OFSI (XML — HM Treasury FinancialSanctionsTarget schema) ───────────────

function parseUkOfsiXml(raw: string, listId: string): NormalisedListEntry[] {
  const out: NormalisedListEntry[] = [];
  const now = new Date().toISOString();

  for (const m of raw.matchAll(/<FinancialSanctionsTarget>([\s\S]*?)<\/FinancialSanctionsTarget>/g)) {
    const block = m[1] ?? '';
    const ref = xmlTag(block, 'GroupID') || xmlTag(block, 'ConsolidatedListEntryReference');
    const full = xmlTag(block, 'FullName');
    const parts = [xmlTag(block, 'Name1'), xmlTag(block, 'Name2'), xmlTag(block, 'Name3')].filter(Boolean);
    const name = full || parts.join(' ');
    if (!name) continue;

    const aliases: string[] = [];
    for (const am of block.matchAll(/<Alias>([\s\S]*?)<\/Alias>/g)) {
      const aname = xmlTag(am[1] ?? '', 'FullName') || xmlTag(am[1] ?? '', 'AliasName');
      if (aname) aliases.push(aname);
    }

    const regimes = xmlTags(block, 'RegimeName');
    const nationality = xmlTag(block, 'Nationality');
    const dob = xmlTag(block, 'DateOfBirth');
    const passport = xmlTag(block, 'PassportNumber') || xmlTag(block, 'TravelDocumentNumber');
    const ni = xmlTag(block, 'NationalIdentificationNumber');

    const identifiers: Array<{ kind: string; number: string; issuer?: string }> = [];
    if (dob) identifiers.push({ kind: 'dob', number: dob });
    if (passport) identifiers.push({ kind: 'passport', number: passport });
    if (ni) identifiers.push({ kind: 'national_id', number: ni });

    const entityTypeStr = (xmlTag(block, 'GroupType') || xmlTag(block, 'EntityType')).toLowerCase();
    const entityType: NormalisedListEntry['entityType'] =
      entityTypeStr.includes('individual') ? 'individual'
        : entityTypeStr.includes('ship') || entityTypeStr.includes('vessel') ? 'vessel'
          : entityTypeStr.includes('aircraft') ? 'aircraft'
            : entityTypeStr.includes('entity') || entityTypeStr.includes('organisation') ? 'organisation'
              : 'individual';

    out.push({
      listId,
      sourceRef: ref || fnv32a(name),
      primaryName: name,
      aliases,
      entityType,
      identifiers,
      ...(nationality ? { nationalities: [nationality] } : {}),
      ...(regimes.length ? { programs: regimes } : {}),
      ingestedAt: now,
      rawHash: fnv32a(block),
    });
  }

  // Fallback: OFSI also publishes CSV — handle that format when XML blocks are absent.
  if (out.length === 0 && raw.includes(',')) {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length > 1) {
      const header = (lines[0] ?? '').split(',').map((h) => h.toLowerCase().trim());
      const col = (n: string): number => header.findIndex((h) => h.includes(n));
      const nameIdx = col('name');
      const idIdx = col('group id') !== -1 ? col('group id') : col(' id');
      const regimeIdx = col('regime');
      for (const line of lines.slice(1)) {
        const cols = line.split(',');
        const name = nameIdx >= 0 ? (cols[nameIdx] ?? '').trim() : '';
        if (!name) continue;
        out.push({
          listId,
          sourceRef: (idIdx >= 0 ? cols[idIdx] : '') || fnv32a(name),
          primaryName: name,
          aliases: [],
          entityType: 'individual',
          identifiers: [],
          ...(regimeIdx >= 0 && cols[regimeIdx] ? { programs: [(cols[regimeIdx] ?? '').trim()] } : {}),
          ingestedAt: now,
          rawHash: fnv32a(line),
        });
      }
    }
  }

  return out;
}

// ── Pure-JS PDF binary text extractor ────────────────────────────────────────
// Extracts visible text from binary PDF bytes without any external library.
// Technique: scan for BT/ET (Begin Text / End Text) markers in PDF content
// streams and extract Tj/TJ operands, which carry rendered text strings.
// Handles both ASCII and PDFDocEncoding. Works for text-layer PDFs (the vast
// majority of government sanction lists); returns empty string for image-only
// (scanned) PDFs where no BT/ET blocks exist.
function extractPdfText(raw: string): string {
  const parts: string[] = [];

  // Find all BT…ET text blocks.
  for (const blockMatch of raw.matchAll(/BT([\s\S]*?)ET/g)) {
    const block = blockMatch[1] ?? '';

    // Tj operator: (string) Tj  — literal parenthesised string
    for (const m of block.matchAll(/\(([^)]*)\)\s*Tj/g)) {
      const s = (m[1] ?? '').replace(/\\n/g, ' ').replace(/\\r/g, ' ');
      if (s.trim()) parts.push(s.trim());
    }

    // TJ operator: [(string)(string)...] TJ  — array of strings
    for (const m of block.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      const inner = m[1] ?? '';
      for (const sm of inner.matchAll(/\(([^)]*)\)/g)) {
        const s = (sm[1] ?? '').replace(/\\n/g, ' ').replace(/\\r/g, ' ');
        if (s.trim()) parts.push(s.trim());
      }
    }
  }

  // Also capture /Contents stream text that may not be within BT/ET (some PDFs)
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const stream = m[1] ?? '';
    if (!stream.includes('BT')) {
      // Non-text stream — skip
      continue;
    }
  }

  return parts.join(' ');
}

// ── PDF text-layer / JSON-wrapped fallback (UAE EOCN + Local Terrorist List) ──
// Binary PDF parsing requires a library (e.g. pdf-parse). This implementation
// handles two common delivery patterns from the UAE government portals:
//   1. JSON envelope with an "entries" array (API-style endpoints)
//   2. Readable text layer extracted from the PDF before delivery
// When raw binary bytes arrive without pre-extraction, no records are found —
// the caller should route the file through a PDF-to-text step first.

function parsePdfTextFallback(raw: string, listId: string): NormalisedListEntry[] {
  const out: NormalisedListEntry[] = [];
  const now = new Date().toISOString();

  // Attempt 1: JSON envelope
  try {
    const obj = JSON.parse(raw) as unknown;
    const entries: unknown[] = Array.isArray(obj)
      ? obj
      : (obj && typeof obj === 'object' && Array.isArray((obj as Record<string, unknown>)['entries']))
        ? ((obj as Record<string, unknown>)['entries'] as unknown[])
        : [];
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const r = e as Record<string, unknown>;
      const name = String(r['name'] ?? r['fullName'] ?? '').trim();
      if (!name) continue;
      const ref = String(r['id'] ?? r['reference'] ?? r['uid'] ?? '').trim();
      const aliases = Array.isArray(r['aliases'])
        ? (r['aliases'] as string[]).map(String)
        : typeof r['aliases'] === 'string'
          ? (r['aliases'] as string).split(';').map((a) => a.trim()).filter(Boolean)
          : [];
      const entityTypeRaw = String(r['type'] ?? '').toLowerCase();
      const entityType: NormalisedListEntry['entityType'] =
        entityTypeRaw.includes('ent') || entityTypeRaw.includes('org') ? 'organisation' : 'individual';
      out.push({
        listId,
        sourceRef: ref || fnv32a(name),
        primaryName: name,
        aliases,
        entityType,
        identifiers: [],
        ingestedAt: now,
        rawHash: fnv32a(JSON.stringify(e)),
      });
    }
    if (out.length > 0) return out;
  } catch {
    // Not JSON — fall through to text extraction.
  }

  // Attempt 2: Binary PDF — extract text via BT/ET stream scanning.
  const pdfText = extractPdfText(raw);
  const sourceForLines = pdfText.length > 50 ? pdfText : raw;

  // Attempt 3: Readable text-layer PDF or extracted PDF text — UAE EOCN lists
  // typically follow a pattern of numbered entries with uppercase names.
  const lines = sourceForLines.split(/\r?\n|\r/).map((l) => l.trim()).filter((l) => l.length > 3);
  let counter = 0;
  for (const line of lines) {
    // Match: optional serial number/dot, then uppercase name tokens
    const nameMatch = line.match(/^(?:\d{1,4}[\.\)\-]\s*)?([A-Z][A-ZÀ-ɏ\s\-'.]+[A-ZÀ-ɏ])(?:\s+\d.*)?$/u);
    if (!nameMatch) continue;
    const name = (nameMatch[1] ?? '').replace(/\s{2,}/g, ' ').trim();
    // Exclude header-like strings
    if (name.length < 4 || ['NAME', 'FULL NAME', 'ENTITY', 'INDIVIDUAL', 'LAST NAME', 'FIRST NAME'].includes(name)) continue;
    counter++;
    out.push({
      listId,
      sourceRef: `${listId}:txt:${counter}`,
      primaryName: name,
      aliases: [],
      entityType: 'individual',
      identifiers: [],
      ingestedAt: now,
      rawHash: fnv32a(line),
    });
  }

  return out;
}

// ── Adapter exports ───────────────────────────────────────────────────────────

export const UN_CONSOLIDATED_ADAPTER: WatchlistAdapter = {
  listId: 'un_1267',
  format: 'xml',
  authoritativeUrlEnvKey: 'UN_CONSOLIDATED_URL',
  parse: (raw) => parseUnXml(raw, 'un_1267'),
  validate: (e) => validateCommon(e),
};

export const OFAC_SDN_ADAPTER: WatchlistAdapter = {
  listId: 'ofac_sdn',
  format: 'xml',
  authoritativeUrlEnvKey: 'OFAC_SDN_URL',
  parse: (raw) => parseOfacSdnXml(raw, 'ofac_sdn'),
  validate: (e) => validateCommon(e),
};

export const OFAC_CONS_ADAPTER: WatchlistAdapter = {
  listId: 'ofac_cons',
  format: 'xml',
  authoritativeUrlEnvKey: 'OFAC_CONS_URL',
  // OFAC consolidated shares the sdnEntry XML schema with the SDN list.
  parse: (raw) => parseOfacSdnXml(raw, 'ofac_cons'),
  validate: (e) => validateCommon(e),
};

export const EU_FSF_ADAPTER: WatchlistAdapter = {
  listId: 'eu_consolidated',
  format: 'xml',
  authoritativeUrlEnvKey: 'EU_FSF_URL',
  parse: (raw) => parseEuCfspXml(raw, 'eu_consolidated'),
  validate: (e) => validateCommon(e),
};

export const UK_OFSI_ADAPTER: WatchlistAdapter = {
  listId: 'uk_ofsi',
  format: 'xml',
  authoritativeUrlEnvKey: 'UK_OFSI_URL',
  parse: (raw) => parseUkOfsiXml(raw, 'uk_ofsi'),
  validate: (e) => validateCommon(e),
};

export const UAE_EOCN_ADAPTER: WatchlistAdapter = {
  listId: 'uae_eocn',
  format: 'pdf',
  authoritativeUrlEnvKey: 'UAE_EOCN_URL',
  parse: (raw) => parsePdfTextFallback(raw, 'uae_eocn'),
  validate: (e) => validateCommon(e),
};

export const UAE_LOCAL_TERRORIST_ADAPTER: WatchlistAdapter = {
  listId: 'uae_local_terrorist',
  format: 'pdf',
  authoritativeUrlEnvKey: 'UAE_LOCAL_TERRORIST_URL',
  parse: (raw) => parsePdfTextFallback(raw, 'uae_local_terrorist'),
  validate: (e) => validateCommon(e),
};

export const ADAPTERS: Record<string, WatchlistAdapter> = {
  un_1267: UN_CONSOLIDATED_ADAPTER,
  ofac_sdn: OFAC_SDN_ADAPTER,
  ofac_cons: OFAC_CONS_ADAPTER,
  eu_consolidated: EU_FSF_ADAPTER,
  uk_ofsi: UK_OFSI_ADAPTER,
  uae_eocn: UAE_EOCN_ADAPTER,
  uae_local_terrorist: UAE_LOCAL_TERRORIST_ADAPTER,
};

function validateCommon(e: NormalisedListEntry): string[] {
  const errs: string[] = [];
  if (!e.listId) errs.push('listId missing');
  if (!e.sourceRef) errs.push('sourceRef missing');
  if (!e.primaryName) errs.push('primaryName missing');
  if (!e.entityType) errs.push('entityType missing');
  if (!e.ingestedAt) errs.push('ingestedAt missing');
  if (!e.rawHash) errs.push('rawHash missing (tamper-evidence required)');
  return errs;
}
