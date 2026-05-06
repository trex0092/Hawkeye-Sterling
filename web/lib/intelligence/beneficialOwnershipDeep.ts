// Hawkeye Sterling — beneficial-ownership deep checks (Layers 191-200).

export interface BoNode {
  id: string; name: string;
  kind: "natural" | "company" | "trust" | "foundation" | "cell" | "series_llc" | "vcc" | "nominee";
  flags?: { nominee?: boolean; bearerShare?: boolean; pep?: boolean; sanctioned?: boolean };
  controls?: Array<{ targetId: string; pct: number; type?: "shares" | "voting" | "control" | "poa" }>;
  trustRoles?: { settlor?: string; trustees?: string[]; beneficiaries?: string[]; protector?: string };
  foundationCouncil?: string[];
}

// 191. Pierce nominee director — find true beneficial owner behind nominee
export function pierceNominee(nodeId: string, nodes: Record<string, BoNode>): { piercedTo?: string; rationale: string } {
  const node = nodes[nodeId];
  if (!node) return { rationale: "node not found" };
  if (!node.flags?.nominee) return { rationale: "not flagged as nominee" };
  for (const c of node.controls ?? []) {
    if (c.type === "poa" || c.pct >= 0.5) return { piercedTo: c.targetId, rationale: `nominee ${node.name} → ${nodes[c.targetId]?.name ?? c.targetId} via ${c.type ?? "shares"} ${(c.pct * 100).toFixed(0)}%` };
  }
  return { rationale: "no underlying controller identified" };
}
// 192. Power-of-attorney walker
export function poaWalker(rootId: string, nodes: Record<string, BoNode>): string[] {
  const out: string[] = [];
  const root = nodes[rootId];
  for (const c of root?.controls ?? []) if (c.type === "poa") out.push(c.targetId);
  return out;
}
// 193. Bearer-share check
export function bearerShareCheck(node: BoNode): { flagged: boolean; rationale: string } {
  return node.flags?.bearerShare
    ? { flagged: true, rationale: "Entity issues bearer shares — UBO cannot be reliably determined; FATF R.24 violation if uncured." }
    : { flagged: false, rationale: "No bearer-share issuance flagged." };
}
// 194. Trust-protector identification
export function trustProtector(node: BoNode): { hasProtector: boolean; protector?: string } {
  return { hasProtector: !!node.trustRoles?.protector, ...(node.trustRoles?.protector ? { protector: node.trustRoles.protector } : {}) };
}
// 195. Settlor-vs-beneficiary mismatch (settlor IS a beneficiary)
export function settlorBeneficiaryMismatch(node: BoNode): { selfDealing: boolean; rationale: string } {
  const s = node.trustRoles?.settlor; const bs = node.trustRoles?.beneficiaries ?? [];
  if (s && bs.includes(s)) return { selfDealing: true, rationale: "Settlor is also a beneficiary — sham-trust indicator." };
  return { selfDealing: false, rationale: "Settlor not in beneficiary list." };
}
// 196. Foundation council scan (every council member must be screened)
export function foundationCouncilScan(node: BoNode, sanctioned: Set<string>): { sanctionedMembers: string[] } {
  return { sanctionedMembers: (node.foundationCouncil ?? []).filter((m) => sanctioned.has(m.toLowerCase())) };
}
// 197. Discretionary-trust opacity
export function discretionaryTrustOpacity(node: BoNode): { opaque: boolean; rationale: string } {
  if (node.kind !== "trust") return { opaque: false, rationale: "not a trust" };
  const bs = node.trustRoles?.beneficiaries ?? [];
  if (bs.length > 5 || bs.some((b) => /class|family|descendants/i.test(b))) return { opaque: true, rationale: "Discretionary class of beneficiaries — UBO not enumerable." };
  return { opaque: false, rationale: "Specific named beneficiaries." };
}
// 198. Cell company (PCC/ICC) detection
export function cellCompanyCheck(node: BoNode): boolean { return node.kind === "cell"; }
// 199. Series LLC walker
export function seriesLlcCheck(node: BoNode): boolean { return node.kind === "series_llc"; }
// 200. Variable Capital Company (VCC) detection
export function vccCheck(node: BoNode): boolean { return node.kind === "vcc"; }
