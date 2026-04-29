import type { ReportingEntity } from "@/lib/types/entity";

// HAWKEYE_ENTITIES is a JSON array of ReportingEntity. When unset, the
// loader falls back to a single legacy entity built from the old
// GOAML_RENTITY_ID / GOAML_RENTITY_BRANCH env vars so existing
// deployments keep working until the operator switches.
//
// Example value (paste verbatim into Netlify, single line):
//   HAWKEYE_ENTITIES=[{"id":"hs-dubai","name":"Hawkeye Sterling DMCC",
//   "goamlRentityId":"REN-12345"}, ...]

const LEGACY_ENTITY_ID = "default";

let cached: ReportingEntity[] | null = null;

function parseEntitiesJson(raw: string): ReportingEntity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `HAWKEYE_ENTITIES is not valid JSON — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("HAWKEYE_ENTITIES must be a JSON array of entity objects.");
  }
  const seenIds = new Set<string>();
  return parsed.map((raw, idx) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`HAWKEYE_ENTITIES[${idx}] is not an object.`);
    }
    const e = raw as Record<string, unknown>;
    const id = typeof e["id"] === "string" ? e["id"].trim() : "";
    const name = typeof e["name"] === "string" ? e["name"].trim() : "";
    const goamlRentityId =
      typeof e["goamlRentityId"] === "string" ? e["goamlRentityId"].trim() : "";
    if (!id) throw new Error(`HAWKEYE_ENTITIES[${idx}].id is required.`);
    if (!name) throw new Error(`HAWKEYE_ENTITIES[${idx}].name is required.`);
    if (!goamlRentityId)
      throw new Error(
        `HAWKEYE_ENTITIES[${idx}].goamlRentityId is required (use a placeholder like "REPLACE_ME" until the FIU assigns one).`,
      );
    if (seenIds.has(id)) {
      throw new Error(`HAWKEYE_ENTITIES has duplicate id "${id}".`);
    }
    seenIds.add(id);
    const entity: ReportingEntity = { id, name, goamlRentityId };
    if (typeof e["goamlBranch"] === "string" && e["goamlBranch"].trim()) {
      entity.goamlBranch = e["goamlBranch"].trim();
    }
    if (typeof e["jurisdiction"] === "string" && e["jurisdiction"].trim()) {
      entity.jurisdiction = e["jurisdiction"].trim().toUpperCase();
    } else {
      entity.jurisdiction = "AE";
    }
    return entity;
  });
}

function legacyFallback(): ReportingEntity[] {
  const goamlRentityId =
    process.env["GOAML_RENTITY_ID"] ?? "PENDING_FIU_ASSIGNMENT";
  const entity: ReportingEntity = {
    id: LEGACY_ENTITY_ID,
    name: "Default reporting entity",
    goamlRentityId,
    jurisdiction: "AE",
  };
  if (process.env["GOAML_RENTITY_BRANCH"]) {
    entity.goamlBranch = process.env["GOAML_RENTITY_BRANCH"];
  }
  return [entity];
}

/** Parses HAWKEYE_ENTITIES once per server lifetime; returns the array. */
export function loadEntities(): ReportingEntity[] {
  if (cached) return cached;
  const raw = process.env["HAWKEYE_ENTITIES"];
  cached = raw && raw.trim() ? parseEntitiesJson(raw) : legacyFallback();
  return cached;
}

/**
 * Returns the entity matching `id`, or the configured default when `id`
 * is null/undefined/unknown. Default is `HAWKEYE_DEFAULT_ENTITY_ID` if
 * set and resolvable, otherwise the first entry in the array.
 */
export function getEntity(id?: string | null): ReportingEntity {
  const list = loadEntities();
  if (id) {
    const match = list.find((e) => e.id === id);
    if (match) return match;
  }
  const defaultId = process.env["HAWKEYE_DEFAULT_ENTITY_ID"];
  if (defaultId) {
    const def = list.find((e) => e.id === defaultId);
    if (def) return def;
  }
  return list[0]!;
}

/** Test-only — clears the in-process cache so .env changes take effect. */
export function _resetEntitiesCacheForTests(): void {
  cached = null;
}
