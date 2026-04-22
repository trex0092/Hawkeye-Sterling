// Hawkeye Sterling — goAML envelope shapes.
// goAML XML is the UAE FIU's required filing format. This module exposes the
// TypeScript shapes the envelope-builder targets. Real XML serialisation is
// Phase 2 (filings ingest); this file fixes the contract today.

export interface GoAmlAddress {
  type: 'business' | 'private' | 'registered' | 'other';
  countryIso2: string;
  city?: string;
  zip?: string;
  line1?: string;
  line2?: string;
}

export interface GoAmlPhone {
  type: 'mobile' | 'landline' | 'fax' | 'other';
  number: string;
  countryPrefix?: string;
}

export interface GoAmlEmail {
  type: 'work' | 'personal' | 'other';
  address: string;
}

export interface GoAmlPerson {
  gender?: 'M' | 'F' | 'O';
  title?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth?: string; // YYYY-MM-DD
  placeOfBirth?: string;
  nationality1?: string;
  nationality2?: string;
  nationality3?: string;
  residenceIso2?: string;
  identification?: Array<{
    type: 'passport' | 'national_id' | 'driving_licence' | 'other';
    number: string;
    issueCountryIso2?: string;
    issueDate?: string;
    expiryDate?: string;
  }>;
  occupation?: string;
  employer?: string;
  addresses?: GoAmlAddress[];
  phones?: GoAmlPhone[];
  emails?: GoAmlEmail[];
}

export interface GoAmlEntity {
  legalName: string;
  commercialName?: string;
  incorporationCountryIso2: string;
  incorporationDate?: string;
  registrationNumber?: string;
  taxNumber?: string;
  businessActivity?: string;
  addresses: GoAmlAddress[];
  phones?: GoAmlPhone[];
  emails?: GoAmlEmail[];
  directors?: GoAmlPerson[];
  ubos?: GoAmlPerson[];
}

export type GoAmlReportCode = 'STR' | 'SAR' | 'AIF' | 'RFI' | 'FFR' | 'PNMR' | 'CTR' | 'EFT' | 'HRC';

export interface GoAmlTransaction {
  transactionNumber: string;
  date: string; // YYYY-MM-DDThh:mm:ssZ
  amountLocal: number;
  amountForeign?: number;
  currency: string;
  type: 'cash' | 'wire' | 'card' | 'crypto' | 'cheque' | 'other';
  fromMy?: GoAmlPerson | GoAmlEntity;
  toMy?: GoAmlPerson | GoAmlEntity;
  counterpartyName?: string;
  comments?: string;
}

export interface GoAmlReportingPerson {
  fullName: string;
  occupation: string;
  email: string;
  phoneNumber: string;
  reportingPersonId?: string;
}

export interface GoAmlEnvelope {
  reportCode: GoAmlReportCode;
  rentityId: string;          // reporting entity goAML id
  rentityBranch?: string;
  reportingPerson: GoAmlReportingPerson;
  submissionCode: 'E' | 'M';  // electronic / manual
  currencyCodeLocal: 'AED';
  reason: string;
  action?: string;
  reportIndicators?: string[];
  involvedPersons?: GoAmlPerson[];
  involvedEntities?: GoAmlEntity[];
  transactions?: GoAmlTransaction[];
  internalReference: string;  // e.g. HWK-01F-...
  generatedAt: string;        // ISO 8601 UTC
  charterIntegrityHash: string;
}

export function validateGoamlEnvelope(env: GoAmlEnvelope): string[] {
  const errs: string[] = [];
  if (!env.rentityId) errs.push('rentityId missing');
  if (!env.reportingPerson?.fullName) errs.push('reportingPerson.fullName missing');
  if (!env.reportingPerson?.email) errs.push('reportingPerson.email missing');
  if (!env.internalReference) errs.push('internalReference missing');
  if (!env.charterIntegrityHash) errs.push('charterIntegrityHash missing');
  if (env.currencyCodeLocal !== 'AED') errs.push('currencyCodeLocal must be AED for UAE FIU');
  if (env.reportCode === 'STR' || env.reportCode === 'SAR') {
    if (!env.reason || env.reason.length < 50) {
      errs.push('STR/SAR reason narrative is too thin (< 50 chars)');
    }
    if (!env.transactions?.length && !env.involvedPersons?.length && !env.involvedEntities?.length) {
      errs.push('STR/SAR must include at least one transaction or involved party');
    }
  }
  if (env.reportCode === 'FFR') {
    if (!env.involvedPersons?.length && !env.involvedEntities?.length) {
      errs.push('FFR must identify at least one frozen subject');
    }
  }
  return errs;
}
