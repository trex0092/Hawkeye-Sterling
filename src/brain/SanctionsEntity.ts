// Hawkeye Sterling — canonical sanctions entity schema.
// Defines the authoritative data model for all sanctioned entities
// across OFAC SDN, UN Consolidated, EU FSF, UK OFSI, UAE, and other lists.
// Every field is documented so downstream systems can explain what they hold.

export type SanctionsEntityType =
  | 'individual'
  | 'entity'
  | 'vessel'
  | 'aircraft'
  | 'other';

export type SanctionsListId =
  | 'ofac_sdn'
  | 'ofac_cons'
  | 'un_consolidated'
  | 'eu_consolidated'
  | 'uk_ofsi'
  | 'uae_local'
  | 'interpol_red'
  | 'fatf_blacklist'
  | string;   // extensible for custom lists

export type IdentifierKind =
  | 'passport'
  | 'national_id'
  | 'registration_number'      // company registration
  | 'tax_id'
  | 'imo_number'               // vessel
  | 'mmsi'                     // vessel transponder
  | 'icao'                     // aircraft
  | 'lei'                      // Legal Entity Identifier
  | 'swift_bic'
  | 'crypto_wallet'
  | 'call_sign'
  | 'dea_registration'
  | string;

export interface SanctionsIdentifier {
  kind: IdentifierKind;
  number: string;
  issuer?: string;             // issuing country / authority
  issuedAt?: string;           // ISO 8601 date
  expiresAt?: string;          // ISO 8601 date
  countryCode?: string;        // ISO 3166-1 alpha-2
}

export interface SanctionsAddress {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;            // ISO 3166-1 alpha-2 or full name
  fullText?: string;           // raw address text from source
}

export interface SanctionsRelationship {
  relatedEntityId: string;     // entity_id of the related entity
  relationshipType:
    | 'director_of'
    | 'shareholder_of'
    | 'controlled_by'
    | 'controls'
    | 'spouse_of'
    | 'parent_of'
    | 'sibling_of'
    | 'associated_with'
    | 'formerly_known_as'
    | 'subsidiary_of'
    | 'branch_of'
    | string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface EffectiveDates {
  listingDate?: string;        // when added to the list (ISO 8601)
  effectiveDate?: string;      // when sanctions took effect
  expiryDate?: string;         // if time-limited
  lastReviewDate?: string;     // last review/update from source
  delistedDate?: string;       // if removed from list
}

export interface SanctionsEntity {
  // ── Core identity ─────────────────────────────────────────────────────────
  entity_id: string;           // canonical internal ID (stable across updates)
  source_list: SanctionsListId;
  source_ref: string;          // list-native reference (OFAC SDNID, etc.)
  entity_type: SanctionsEntityType;

  // ── Names ─────────────────────────────────────────────────────────────────
  primary_name: string;        // official primary name
  aliases: string[];           // all alternative names, transliterations, former names
  native_name?: string;        // name in native script (Arabic, Cyrillic, etc.)
  romanised_name?: string;     // Latin transliteration of native name
  title?: string;              // honorific (Sheikh, Dr., etc.)
  suffix?: string;

  // ── Personal data (individuals) ──────────────────────────────────────────
  dob?: string;                // ISO 8601 date or partial (YYYY, YYYY-MM)
  dob_alternatives?: string[]; // where source lists multiple possible DOBs
  place_of_birth?: string;
  nationalities: string[];     // ISO 3166-1 alpha-2 codes
  gender?: 'M' | 'F' | 'unknown';
  deceased?: boolean;
  deceased_date?: string;

  // ── Organisation data ─────────────────────────────────────────────────────
  incorporation_country?: string;
  registration_number?: string;
  parent_organisation?: string;
  sector?: string;             // industry/sector

  // ── Vessel / Aircraft ─────────────────────────────────────────────────────
  flag_state?: string;         // current flag (ISO 3166-1 alpha-2)
  former_flags?: string[];
  vessel_type?: string;        // bulk carrier, tanker, etc.
  tonnage?: number;
  build_year?: number;

  // ── Identifiers ───────────────────────────────────────────────────────────
  identifiers: SanctionsIdentifier[];

  // ── Addresses ─────────────────────────────────────────────────────────────
  addresses: SanctionsAddress[];

  // ── Relationships ─────────────────────────────────────────────────────────
  relationships: SanctionsRelationship[];

  // ── Sanctions programs ────────────────────────────────────────────────────
  programs: string[];          // e.g. ['IRAN', 'SDGT', 'DPRK']
  programs_detail?: Record<string, string>; // program → description

  // ── Remarks / narrative ───────────────────────────────────────────────────
  remarks?: string;            // free-text notes from source
  basis_for_listing?: string;  // legal basis for designation
  associated_persons?: string[]; // free-text list from source

  // ── Source provenance ─────────────────────────────────────────────────────
  source_urls: string[];       // URLs of authoritative source documents
  raw_hash: string;            // SHA-256 / FNV-1a of the raw source record
  schema_version: string;      // this schema version (e.g. '2025.1')

  // ── Effective dates ───────────────────────────────────────────────────────
  effective_dates: EffectiveDates;

  // ── Internal metadata ─────────────────────────────────────────────────────
  ingested_at: string;         // ISO 8601 UTC
  last_updated_at: string;     // ISO 8601 UTC
  is_active: boolean;          // false if delisted
  confidence_score?: number;   // 0..1 — data quality/completeness
}

// ── Schema validation ─────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateSanctionsEntity(e: SanctionsEntity): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!e.entity_id) errors.push({ field: 'entity_id', message: 'Required', severity: 'error' });
  if (!e.source_list) errors.push({ field: 'source_list', message: 'Required', severity: 'error' });
  if (!e.primary_name) errors.push({ field: 'primary_name', message: 'Required', severity: 'error' });
  if (!e.entity_type) errors.push({ field: 'entity_type', message: 'Required', severity: 'error' });

  if (e.entity_type === 'individual') {
    if (!e.dob) errors.push({ field: 'dob', message: 'Missing for individual — reduces screening precision', severity: 'warning' });
    if (e.nationalities.length === 0) errors.push({ field: 'nationalities', message: 'Missing for individual', severity: 'warning' });
  }

  if (!e.source_ref) errors.push({ field: 'source_ref', message: 'Required for delta tracking', severity: 'error' });
  if (!e.raw_hash) errors.push({ field: 'raw_hash', message: 'Required for integrity verification', severity: 'error' });
  if (!e.ingested_at) errors.push({ field: 'ingested_at', message: 'Required for provenance', severity: 'error' });
  if (e.programs.length === 0) errors.push({ field: 'programs', message: 'No sanctions programs listed', severity: 'warning' });

  // DOB format check
  if (e.dob && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(e.dob)) {
    errors.push({ field: 'dob', message: `Invalid date format: ${e.dob} — use YYYY, YYYY-MM, or YYYY-MM-DD`, severity: 'warning' });
  }

  return errors;
}

// ── Completeness scoring ──────────────────────────────────────────────────────

export function computeCompletenessScore(e: SanctionsEntity): number {
  const checks: boolean[] = [
    Boolean(e.primary_name),
    Boolean(e.dob || e.entity_type !== 'individual'),
    e.aliases.length > 0,
    e.nationalities.length > 0,
    e.identifiers.length > 0,
    e.addresses.length > 0,
    e.programs.length > 0,
    Boolean(e.remarks),
    Boolean(e.native_name || e.entity_type === 'entity'),
    Boolean(e.effective_dates.listingDate),
  ];
  return checks.filter(Boolean).length / checks.length;
}

// ── Canonical entity builder ──────────────────────────────────────────────────

export function buildEntityId(sourceList: SanctionsListId, sourceRef: string): string {
  return `${sourceList}::${sourceRef.replace(/\s+/g, '_').toUpperCase()}`;
}

export const SCHEMA_VERSION = '2025.1';
