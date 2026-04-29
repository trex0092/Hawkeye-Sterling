export type EntityType =
  | "individual"
  | "organisation"
  | "vessel"
  | "aircraft"
  | "other";

export type QuickScreenSeverity = "clear" | "low" | "medium" | "high" | "critical";

export type MatchingMethod =
  | "exact"
  | "levenshtein"
  | "jaro-winkler"
  | "soundex"
  | "double-metaphone";

export interface QuickScreenSubject {
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
}

export interface QuickScreenCandidate {
  listId: string;
  listRef: string;
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  programs?: string[];
}

export interface QuickScreenHit {
  listId: string;
  listRef: string;
  candidateName: string;
  matchedAlias?: string;
  score: number;
  method: MatchingMethod;
  phoneticAgreement: boolean;
  programs?: string[];
  reason: string;
}

export interface QuickScreenOptions {
  scoreThreshold?: number;
  maxHits?: number;
}

export interface QuickScreenResult {
  subject: QuickScreenSubject;
  hits: QuickScreenHit[];
  topScore: number;
  severity: QuickScreenSeverity;
  listsChecked: number;
  candidatesChecked: number;
  durationMs: number;
  generatedAt: string;
}

export type QuickScreenResponse =
  | ({ ok: true } & QuickScreenResult)
  | { ok: false; error: string; detail?: string };
