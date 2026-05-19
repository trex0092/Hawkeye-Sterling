// Hawkeye Sterling — Senzing G2 entity format export.
// Senzing is the leading entity resolution platform used by financial institutions.
// This exporter converts Hawkeye screening subjects and watchlist entries
// into Senzing's standard entity format for interoperability.
// Senzing spec: https://senzing.com/senzing-api/

export interface SenzingFeature {
  FULL_NAME?: string;
  NAME_FIRST?: string;
  NAME_LAST?: string;
  NAME_MIDDLE?: string;
  ADDR_FULL?: string;
  ADDR_LINE1?: string;
  ADDR_CITY?: string;
  ADDR_STATE?: string;
  ADDR_POSTAL_CODE?: string;
  ADDR_COUNTRY?: string;
  DATE_OF_BIRTH?: string;
  NATIONAL_ID?: string;
  PASSPORT_NUMBER?: string;
  PASSPORT_COUNTRY?: string;
  EMAIL_ADDRESS?: string;
  PHONE_NUMBER?: string;
  TAX_ID_NUM?: string;
  LEI_NUMBER?: string;
  REGISTRATION_NUMBER?: string;
  ENTITY_TYPE?: 'PERSON' | 'ORGANIZATION';
  [key: string]: string | undefined;
}

export interface SenzingRecord {
  DATA_SOURCE: string;
  RECORD_ID: string;
  ENTITY_TYPE: 'PERSON' | 'ORGANIZATION';
  RECORD_TYPE?: string;
  features: SenzingFeature[];
}

export interface SenzingExportBatch {
  export_date: string;
  source: string;
  records: SenzingRecord[];
}

export interface HawkeyeSubject {
  name: string;
  entityType?: 'person' | 'entity';
  dateOfBirth?: string;
  nationality?: string;
  passportNumber?: string;
  nationalId?: string;
  addresses?: Array<{ line1?: string; city?: string; country?: string; zip?: string }>;
  emails?: string[];
  phones?: string[];
  registrationNumber?: string;
  taxNumber?: string;
  lei?: string;
}

export function subjectToSenzingRecord(subject: HawkeyeSubject, recordId: string): SenzingRecord {
  const entityType = subject.entityType === 'entity' ? 'ORGANIZATION' : 'PERSON';
  const nameParts = subject.name.trim().split(/\s+/);
  const features: SenzingFeature[] = [];

  // Primary name feature
  const nameFeature: SenzingFeature = { FULL_NAME: subject.name, ENTITY_TYPE: entityType };
  if (entityType === 'PERSON' && nameParts.length >= 2) {
    nameFeature.NAME_FIRST = nameParts[0]!;
    nameFeature.NAME_LAST = nameParts[nameParts.length - 1]!;
    if (nameParts.length > 2) {
      nameFeature.NAME_MIDDLE = nameParts.slice(1, -1).join(' ');
    }
  }
  features.push(nameFeature);

  // DOB
  if (subject.dateOfBirth) {
    features.push({ DATE_OF_BIRTH: subject.dateOfBirth });
  }

  // Identifiers
  if (subject.passportNumber) {
    features.push({
      PASSPORT_NUMBER: subject.passportNumber,
      ...(subject.nationality ? { PASSPORT_COUNTRY: subject.nationality } : {}),
    });
  }
  if (subject.nationalId) {
    features.push({ NATIONAL_ID: subject.nationalId });
  }
  if (subject.taxNumber) {
    features.push({ TAX_ID_NUM: subject.taxNumber });
  }
  if (subject.lei) {
    features.push({ LEI_NUMBER: subject.lei });
  }
  if (subject.registrationNumber) {
    features.push({ REGISTRATION_NUMBER: subject.registrationNumber });
  }

  // Addresses
  for (const addr of subject.addresses ?? []) {
    const addrFeature: SenzingFeature = {};
    if (addr.line1) addrFeature.ADDR_LINE1 = addr.line1;
    if (addr.city) addrFeature.ADDR_CITY = addr.city;
    if (addr.country) addrFeature.ADDR_COUNTRY = addr.country;
    if (addr.zip) addrFeature.ADDR_POSTAL_CODE = addr.zip;
    if (Object.keys(addrFeature).length > 0) features.push(addrFeature);
  }

  // Contact
  for (const email of subject.emails ?? []) {
    features.push({ EMAIL_ADDRESS: email });
  }
  for (const phone of subject.phones ?? []) {
    features.push({ PHONE_NUMBER: phone });
  }

  return {
    DATA_SOURCE: 'HAWKEYE_STERLING',
    RECORD_ID: recordId,
    ENTITY_TYPE: entityType,
    features,
  };
}

export function buildSenzingExport(subjects: Array<{ id: string; subject: HawkeyeSubject }>): SenzingExportBatch {
  return {
    export_date: new Date().toISOString(),
    source: 'Hawkeye Sterling AML Platform',
    records: subjects.map(({ id, subject }) => subjectToSenzingRecord(subject, id)),
  };
}

/** Convert a Senzing record to JSONL format (one record per line) for bulk import */
export function toSenzingJsonl(batch: SenzingExportBatch): string {
  return batch.records
    .map((r) => JSON.stringify({ DATA_SOURCE: r.DATA_SOURCE, RECORD_ID: r.RECORD_ID, ENTITY_TYPE: r.ENTITY_TYPE, ...Object.assign({}, ...r.features) }))
    .join('\n');
}
