// Hawkeye Sterling — PEP family / business-network expansion.
//
// FATF R.12 requires institutions to identify family members and close
// associates of PEPs. Static name-screening misses most of these
// because the family member doesn't share an identifier with the PEP —
// only a relationship. We surface candidate relations from the
// adverse-media co-occurrence pass and from any explicit family
// metadata in the matched record.

export interface PepHit {
  candidateName: string;
  type?: string;            // PEP / LE / OB / etc.
  category?: string;        // CRIME-FINANCIAL / MILITARY / etc.
  relations?: Array<{ name: string; role?: string; relation?: string }>;
}

export interface NetworkResult {
  isPep: boolean;
  pepProfile?: { name: string; category?: string };
  knownRelations: Array<{ name: string; relation?: string; source: "record" | "co-occurrence" }>;
  matchingFamilyOnQueue: Array<{ name: string; jurisdiction?: string }>;   // subjects in operator's queue with matching surname
  signal: string;
}

const FAMILY_TERMS = [
  "spouse", "wife", "husband", "son", "daughter", "father", "mother",
  "brother", "sister", "nephew", "niece", "uncle", "aunt", "cousin",
  "in-law", "stepson", "stepdaughter", "stepfather", "stepmother",
];

export function expandPepNetwork(
  hits: PepHit[],
  coOccurringNames: string[],
  queueSubjects: Array<{ name: string; jurisdiction?: string }>,
): NetworkResult {
  const pepHit = hits.find((h) => h.type === "PEP" || /pep|politically.?exposed/i.test(h.category ?? ""));
  if (!pepHit) {
    return {
      isPep: false,
      knownRelations: [],
      matchingFamilyOnQueue: [],
      signal: "No PEP designation in screened hits — family-network expansion not applied.",
    };
  }

  const knownRelations: NetworkResult["knownRelations"] = [];
  for (const rel of pepHit.relations ?? []) {
    knownRelations.push({ name: rel.name, relation: rel.relation ?? rel.role, source: "record" });
  }
  // Co-occurrence: any name mentioned alongside the PEP in adverse media
  // with a family-term in the article — caller pre-filters this list.
  for (const name of coOccurringNames) {
    if (!knownRelations.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      knownRelations.push({ name, source: "co-occurrence" });
    }
  }

  // Match candidate relations against the operator's customer queue —
  // surfaces "this PEP's son is one of our existing clients".
  const matchingFamilyOnQueue: NetworkResult["matchingFamilyOnQueue"] = [];
  const lastNameOfPep = pepHit.candidateName.split(/\s+/).pop()?.toLowerCase() ?? "";
  for (const s of queueSubjects) {
    const lastName = s.name.split(/\s+/).pop()?.toLowerCase() ?? "";
    if (lastName && lastName === lastNameOfPep) {
      matchingFamilyOnQueue.push(s);
    }
  }

  let signal: string;
  if (matchingFamilyOnQueue.length > 0) {
    signal = `PEP relationship cluster: ${matchingFamilyOnQueue.length} subject(s) in your queue share the surname of PEP "${pepHit.candidateName}". Verify whether they're family members per FATF R.12.`;
  } else if (knownRelations.length > 0) {
    signal = `PEP "${pepHit.candidateName}" has ${knownRelations.length} known relation(s) on file. Cross-check against new onboarding to avoid family-member onboarding without EDD.`;
  } else {
    signal = `Subject is a PEP — apply EDD per FATF R.12, capture source-of-wealth and senior-management approval.`;
  }

  return {
    isPep: true,
    pepProfile: { name: pepHit.candidateName, category: pepHit.category },
    knownRelations,
    matchingFamilyOnQueue,
    signal,
  };
}

/** Helper: returns true when a snippet contains a family-relationship term. */
export function snippetMentionsFamily(snippet: string): boolean {
  const lower = snippet.toLowerCase();
  return FAMILY_TERMS.some((t) => lower.includes(t));
}
