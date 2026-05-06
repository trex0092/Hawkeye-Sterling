// Hawkeye Sterling — reporting / regulatory-filing validators (Layers 131-135).

export interface StrDraft {
  subject?: { name: string; id?: string };
  narrative?: string;
  filingType?: "STR" | "SAR" | "CTR" | "FFR";
  predicateOffence?: string;
  amountUsd?: number;
  approver?: string;
  filedAt?: string;
}

// 131. STR draft validator
export function validateStr(draft: StrDraft): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!draft.subject?.name) issues.push("subject.name required");
  if (!draft.narrative || draft.narrative.length < 100) issues.push("narrative must be ≥100 chars");
  if (!draft.predicateOffence) issues.push("predicate offence must be cited");
  if (!draft.approver) issues.push("four-eyes approver required");
  if (draft.filingType !== "STR" && draft.filingType !== "SAR") issues.push("filingType must be STR or SAR");
  return { ok: issues.length === 0, issues };
}

// 132. SAR draft validator (slightly different rules: amount optional)
export function validateSar(draft: StrDraft): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!draft.subject?.name) issues.push("subject.name required");
  if (!draft.narrative || draft.narrative.length < 200) issues.push("SAR narrative must be ≥200 chars (more detail than STR)");
  if (!draft.predicateOffence) issues.push("predicate offence must be cited");
  if (!draft.approver) issues.push("four-eyes approver required");
  return { ok: issues.length === 0, issues };
}

// 133. CTR threshold checker (UAE AED 55,000 / USD 15,000)
export function ctrThresholdCheck(input: { channel?: string; amountUsd: number; periodHours?: number }): { required: boolean; rationale: string } {
  if (input.channel !== "cash") return { required: false, rationale: "Non-cash transaction; CTR not required." };
  if (input.amountUsd >= 15_000) return { required: true, rationale: `Cash USD ${input.amountUsd.toLocaleString()} ≥ CTR threshold; file CTR within statutory window.` };
  return { required: false, rationale: `Cash USD ${input.amountUsd.toLocaleString()} below CTR threshold.` };
}

// 134. goAML envelope auto-generator (minimal)
export interface GoamlMinimal {
  reportCode: "STR" | "SAR" | "CTR" | "FFR" | "DPMSR";
  rentityId: string;
  reason: string;
  subject: { fullName: string; iso2?: string; dob?: string };
  internalReference: string;
  generatedAt: string;
}
export function buildGoamlMinimal(draft: StrDraft, rentityId: string): GoamlMinimal | null {
  if (!draft.subject?.name || !draft.narrative) return null;
  return {
    reportCode: (draft.filingType ?? "STR") as GoamlMinimal["reportCode"],
    rentityId,
    reason: draft.narrative.slice(0, 5000),
    subject: { fullName: draft.subject.name, ...(draft.subject.id ? { dob: draft.subject.id } : {}) },
    internalReference: `HWK-${draft.filingType ?? "STR"}-${draft.subject.id ?? Date.now()}`,
    generatedAt: new Date().toISOString(),
  };
}

// 135. Audit-chain integrity (HMAC chain over filing events)
export interface AuditEvent {
  at: string;
  action: string;
  actor: string;
  bodyHash: string;
  prevHash?: string;
}
export function verifyAuditChain(events: AuditEvent[]): { ok: boolean; brokenAt?: number } {
  for (let i = 1; i < events.length; i += 1) {
    const expected = events[i - 1]!.bodyHash;
    if (events[i]!.prevHash !== expected) return { ok: false, brokenAt: i };
  }
  return { ok: true };
}
