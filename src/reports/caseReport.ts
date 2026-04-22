import type { FacultyId } from '../brain/types.js';

export type ReasoningModeId = string;
export type AdverseMediaCategoryId =
  | 'ml_financial_crime'
  | 'terrorist_financing'
  | 'proliferation_financing'
  | 'corruption_organised_crime'
  | 'legal_criminal_regulatory';

export type CaseRating = 'Not Rated' | 'Low' | 'Medium' | 'High' | 'Critical';
export type EntityType = 'Individual' | 'Organisation' | 'Vessel' | 'Aircraft' | 'Other';
export type MatchVerdict = 'Positive' | 'Possible' | 'False' | 'Unspecified';
export type ScreeningMode = 'first_screening' | 'daily_monitoring';

export interface CaseIdentity {
  caseId: string;
  recordUid: string;
  name: string;
  entityType: EntityType;
  gender?: string;
  dateOfBirth?: string;
  citizenship?: string[];
  identificationNumbers?: Array<{
    kind: string;
    number: string;
    issuer?: string;
    country?: string;
  }>;
}

export interface CaseComparisonData {
  client: {
    name: string;
    gender?: string;
    citizenship?: string;
    dob?: string;
  };
  worldCheck: {
    name: string;
    gender?: string;
    citizenship?: string;
    dob?: string;
  };
  matched: {
    name: boolean;
    gender: boolean;
    citizenship: boolean;
    dob: boolean;
  };
}

export interface KeyDataBlock {
  dataset?: string;
  category?: string;
  subCategory?: string;
  pepStatus?: 'Active' | 'Former' | 'Related' | 'None';
  specialInterestCategories: string[];
  enteredDate?: string;
  updatedDate?: string;
  updateCategorization?: string;
}

export interface AliasBlock {
  aliases: string[];
}

export interface LocationBlock {
  country?: string;
  city?: string;
  region?: string;
  street?: string;
}

export interface PepRole {
  role: string;
  roleLevel: string;
  position: string;
  roleBio?: string;
  roleStatus: 'CURRENT' | 'FORMER';
  roleTermStart?: string;
  roleTermEnd?: string;
}

export interface ConnectionLink {
  name: string;
  role?: string;
  type?: string;
}

export interface SourceLink {
  date: string;
  url: string;
  title?: string;
}

export interface KeywordRow {
  keyword: string;
  description: string;
  type: 'S' | 'LE' | 'RE' | 'OB' | 'SIC' | 'PEP';
  country?: string;
}

export interface ReasoningStep {
  step: number;
  faculty: FacultyId;
  mode: ReasoningModeId;
  claim: string;
  evidence: string[];
  confidence: number;
  caveats?: string[];
}

export interface AdverseMediaHit {
  category: AdverseMediaCategoryId;
  keyword: string;
  headline: string;
  url: string;
  publishedAt: string;
  source: string;
  snippet?: string;
}

export interface AuditRow {
  date: string;
  actionedBy: string;
  action: string;
  notes?: string;
  source: 'Desktop' | 'API' | 'Scheduler' | 'Mobile';
}

export interface KeyFindings {
  totalMatches: number | 'NO MATCHES FOUND';
  resolvedMatches: number;
  verdictBreakdown: { Positive: number; Possible: number; False: number; Unspecified: number };
  unresolvedMatches: number;
}

export interface CaseReport {
  header: {
    product: 'Hawkeye Sterling V2';
    reportKind: 'MATCH DETAILS' | 'CASE REPORT';
    confidential: true;
    generatedAt: string;
    printedBy: string;
    group: string;
    mode: ScreeningMode;
  };
  identity: CaseIdentity;
  keyFindings: KeyFindings;
  comparison?: CaseComparisonData;
  keyData?: KeyDataBlock;
  aliases?: AliasBlock;
  locations?: LocationBlock[];
  pepRoles?: PepRole[];
  connections?: ConnectionLink[];
  keywords?: KeywordRow[];
  adverseMediaHits?: AdverseMediaHit[];
  reasoningChain: ReasoningStep[];
  audit: AuditRow[];
  sources: SourceLink[];
  notes: {
    timezone: 'UTC';
    legalNotice: string;
  };
}

export function emptyCaseReport(partial: Partial<CaseReport> & {
  identity: CaseIdentity;
  mode: ScreeningMode;
  printedBy: string;
  group: string;
}): CaseReport {
  const { identity, mode, printedBy, group, ...rest } = partial;
  return {
    header: {
      product: 'Hawkeye Sterling V2',
      reportKind: 'CASE REPORT',
      confidential: true,
      generatedAt: new Date().toISOString(),
      printedBy,
      group,
      mode,
    },
    identity,
    keyFindings: {
      totalMatches: 'NO MATCHES FOUND',
      resolvedMatches: 0,
      verdictBreakdown: { Positive: 0, Possible: 0, False: 0, Unspecified: 0 },
      unresolvedMatches: 0,
    },
    reasoningChain: [],
    audit: [],
    sources: [],
    notes: {
      timezone: 'UTC',
      legalNotice:
        'The contents of this record are private and confidential. Do not rely on this report without independent verification of the underlying sources.',
    },
    ...rest,
  };
}
