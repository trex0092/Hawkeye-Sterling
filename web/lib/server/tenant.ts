// Tenant id helper — bridges the enforce() gate result to a stable
// per-deployment-tenant identifier used as a blob-key prefix in the
// case vault and other tenant-scoped storage.
//
// Mapping:
//   ADMIN_TOKEN portal call  → "portal"     (single shared register)
//   API key                  → keyId        (per-key isolation)
//   anonymous                → keyId        (anon_<hash> from enforce)

interface GateOk {
  ok: true;
  keyId: string;
}

export function tenantIdFromGate(gate: GateOk): string {
  // "portal_admin" is the keyId enforce() emits for ADMIN_TOKEN; collapse
  // to a stable "portal" slug so the blob path doesn't change if the gate
  // implementation later renames the constant.
  if (gate.keyId === "portal_admin") return "portal";
  return gate.keyId;
}
