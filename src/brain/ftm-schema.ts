// Hawkeye Sterling — FollowTheMoney (FtM) compatible TypeScript entity schema.
// Mirrors the canonical alephdata/followthemoney ontology (v3.8.4, MIT).
// These types allow HS to produce FtM-format output that can be piped directly
// into `ftm cypher`, `ftm gexf`, `ftm rdf`, `ftm aggregate` etc.
//
// Reference: https://followthemoney.tech/explorer/

export type FtmSchema =
  | 'Thing'
  | 'Person'
  | 'Organization'
  | 'Company'
  | 'LegalEntity'
  | 'PublicBody'
  | 'Asset'
  | 'RealEstate'
  | 'BankAccount'
  | 'CryptoWallet'
  | 'Payment'
  | 'Sanction'
  | 'Identification'
  | 'Address'
  | 'Ownership'
  | 'Directorship'
  | 'Membership'
  | 'Associate'
  | 'Family'
  | 'UnknownLink'
  | 'Vessel'
  | 'Aircraft'
  | 'Vehicle';

// Core FtM entity — maps to alephdata/followthemoney Entity object.
export interface FtmEntity {
  id: string;                    // Deterministic content-hash ID
  schema: FtmSchema;
  caption: string;               // Display name
  datasets: string[];
  properties: FtmProperties;
  first_seen?: string;
  last_seen?: string;
}

// Property bags per schema type. All values are string arrays (FtM stores
// everything as lists even for single-value fields).
export interface FtmProperties {
  // Thing (base)
  name?: string[];
  alias?: string[];
  weakAlias?: string[];
  description?: string[];
  summary?: string[];
  sourceUrl?: string[];
  modifiedAt?: string[];
  retrievedAt?: string[];

  // Person
  firstName?: string[];
  lastName?: string[];
  fatherName?: string[];
  birthDate?: string[];
  birthPlace?: string[];
  deathDate?: string[];
  nationality?: string[];
  citizenship?: string[];
  gender?: string[];
  passportNumber?: string[];
  idNumber?: string[];
  taxNumber?: string[];
  position?: string[];
  title?: string[];
  education?: string[];

  // Organization / Company / LegalEntity
  jurisdiction?: string[];
  incorporationDate?: string[];
  dissolutionDate?: string[];
  registrationNumber?: string[];
  leiCode?: string[];            // GLEIF LEI
  vatCode?: string[];
  status?: string[];
  classification?: string[];
  sector?: string[];

  // Sanction
  authority?: string[];          // e.g. 'OFAC', 'EU', 'UN Security Council'
  program?: string[];            // Sanctions programme
  listingDate?: string[];
  startDate?: string[];
  endDate?: string[];
  reason?: string[];

  // BankAccount
  iban?: string[];
  bic?: string[];
  bankName?: string[];
  accountNumber?: string[];
  currency?: string[];

  // CryptoWallet
  publicKey?: string[];
  cryptoAsset?: string[];        // ETH, BTC, TRX, ...

  // Payment
  amount?: string[];
  date?: string[];
  valueDate?: string[];
  purpose?: string[];
  amountEur?: string[];
  amountUsd?: string[];

  // Relationship properties (Ownership, Directorship, Membership)
  startDate2?: string[];         // use startDate for the relationship itself
  endDate2?: string[];
  role?: string[];
  percentage?: string[];         // ownership %
  asset?: string[];              // ref to owned entity id
  organization?: string[];       // ref to org entity id
  member?: string[];             // ref to member entity id
  director?: string[];           // ref to director entity id
  owner?: string[];              // ref to owner entity id

  // Address
  full?: string[];
  street?: string[];
  city?: string[];
  country?: string[];
  postalCode?: string[];
  region?: string[];

  // Vessel / Aircraft
  flag?: flag[];
  imoNumber?: string[];
  mmsi?: string[];
  callSign?: string[];
  grossTonnage?: string[];
  type?: string[];

  // Catch-all for source-specific fields
  [key: string]: string[] | undefined;
}

type flag = string;

// Deterministic FNV-1a ID for an FtM entity — used to detect duplicates.
export function ftmId(schema: FtmSchema, ...keyValues: string[]): string {
  const input = [schema, ...keyValues].join('\x00');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Build a minimal FtmEntity from a name + schema. Callers add properties.
export function makeFtmEntity(
  schema: FtmSchema,
  caption: string,
  datasets: string[],
  properties: FtmProperties = {},
): FtmEntity {
  const id = ftmId(schema, caption, datasets[0] ?? '');
  return {
    id,
    schema,
    caption,
    datasets,
    properties: { name: [caption], ...properties },
    first_seen: new Date().toISOString(),
  };
}

// Render an FtmEntity as an NDJSON line (the format accepted by ftm aggregate,
// ftm cypher, ftm gexf etc.).
export function toFtmNdjson(entity: FtmEntity): string {
  return JSON.stringify(entity);
}

// Render a stream of entities as an NDJSON string.
export function toFtmStream(entities: FtmEntity[]): string {
  return entities.map(toFtmNdjson).join('\n');
}
