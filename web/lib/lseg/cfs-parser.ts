// Hawkeye Sterling — generic LSEG CFS file parser.
//
// LSEG (Refinitiv) Client File Store distributes bulk data in several
// formats depending on the package. World-Check One delivers JSON; the
// Sanctions DataFile delivers XML; CSV variants exist for some legacy
// packages. Rather than building one parser per package, this module
// detects the format and extracts a common LsegCfsEntity shape that the
// downstream PEP / sanctions index can consume uniformly.
//
// Defensive by design: bad input never throws — returns an empty array
// and logs to console. The poll function writes raw payloads from the
// upstream, and "the upstream" can drift schema at any time.

export interface LsegCfsEntity {
  // Stable cross-package identity.
  id: string;
  source: "lseg-cfs";
  // Best-effort name extraction. Empty if the row had no recognisable name.
  primaryName: string;
  aliases: string[];
  // "individual" / "entity" / "vessel" / "aircraft" / "other".
  entityType: "individual" | "entity" | "vessel" | "aircraft" | "other";
  // Country / nationality codes if present, otherwise empty.
  countries: string[];
  // PEP categories / sanctions programs / adverse topics — whichever the
  // source labels the row with. Free-form strings.
  categories: string[];
  // ISO date if the source supplies one.
  publishedAt?: string;
  // Original payload, kept for audit. Caller should NOT search this directly.
  rawHash: string;
  // ── Vessel-specific identifiers (only populated when entityType === "vessel")
  // Used by web/lib/lseg/vessel-index.ts to build the IMO-keyed lookup
  // consumed by /api/vessel-check.
  imoNumber?: string;
  mmsi?: string;
  callSign?: string;
  flag?: string;
  vesselType?: string;
}

// ── Vessel-identifier extraction helpers ────────────────────────────────────

/**
 * Pull IMO/MMSI/flag/callsign/type from a JSON row or XML block. The CFS
 * payloads are inconsistent — some packages embed identifiers as siblings
 * of `name`, others nest them under `identifiers[]` / `imoNumber`. Probe
 * each known shape and return what we can find.
 */
function extractVesselFromJson(o: Record<string, unknown>): {
  imoNumber?: string; mmsi?: string; callSign?: string; flag?: string; vesselType?: string;
} {
  const direct = {
    imoNumber: typeof o["imoNumber"] === "string" ? o["imoNumber"] :
               typeof o["imo"] === "string" ? o["imo"] :
               typeof o["IMO"] === "string" ? o["IMO"] : undefined,
    mmsi: typeof o["mmsi"] === "string" ? o["mmsi"] :
          typeof o["MMSI"] === "string" ? o["MMSI"] : undefined,
    callSign: typeof o["callSign"] === "string" ? o["callSign"] :
              typeof o["callsign"] === "string" ? o["callsign"] : undefined,
    flag: typeof o["flag"] === "string" ? o["flag"] :
          typeof o["flagState"] === "string" ? o["flagState"] :
          typeof o["flag_state"] === "string" ? o["flag_state"] : undefined,
    vesselType: typeof o["vesselType"] === "string" ? o["vesselType"] :
                typeof o["shipType"] === "string" ? o["shipType"] : undefined,
  };
  // Some shapes nest identifiers under `identifiers: [{ type, value }]` or
  // `attributes: { ... }`. Probe both.
  const idsRaw = o["identifiers"];
  if (Array.isArray(idsRaw)) {
    for (const id of idsRaw) {
      if (!id || typeof id !== "object") continue;
      const r = id as Record<string, unknown>;
      const t = typeof r["type"] === "string" ? r["type"].toLowerCase() : "";
      const v = typeof r["value"] === "string" ? r["value"] :
                typeof r["number"] === "string" ? r["number"] : undefined;
      if (!v) continue;
      if (!direct.imoNumber && /imo/.test(t)) direct.imoNumber = v;
      if (!direct.mmsi && /mmsi/.test(t)) direct.mmsi = v;
      if (!direct.callSign && /call.?sign/.test(t)) direct.callSign = v;
    }
  }
  // Normalise IMO to digits only (LSEG sometimes prefixes "IMO ").
  if (direct.imoNumber) direct.imoNumber = direct.imoNumber.replace(/[^0-9]/g, "");
  if (direct.imoNumber && direct.imoNumber.length !== 7) direct.imoNumber = undefined;
  return direct;
}

function extractVesselFromXml(block: string): {
  imoNumber?: string; mmsi?: string; callSign?: string; flag?: string; vesselType?: string;
} {
  const rawImo = xmlField(block, "imoNumber") || xmlField(block, "imo") || xmlField(block, "IMO");
  const normalisedImo = rawImo ? rawImo.replace(/[^0-9]/g, "") : "";
  const out: { imoNumber?: string; mmsi?: string; callSign?: string; flag?: string; vesselType?: string } = {};
  if (normalisedImo.length === 7) out.imoNumber = normalisedImo;
  const mmsi = xmlField(block, "mmsi") || xmlField(block, "MMSI");
  if (mmsi) out.mmsi = mmsi;
  const callSign = xmlField(block, "callSign") || xmlField(block, "callsign");
  if (callSign) out.callSign = callSign;
  const flag = xmlField(block, "flag") || xmlField(block, "flagState");
  if (flag) out.flag = flag;
  const vt = xmlField(block, "vesselType") || xmlField(block, "shipType");
  if (vt) out.vesselType = vt;
  return out;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function toEntityType(raw: unknown): LsegCfsEntity["entityType"] {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("individual") || s.includes("person") || s.includes("natural")) return "individual";
  if (s.includes("vessel") || s.includes("ship")) return "vessel";
  if (s.includes("aircraft") || s.includes("plane")) return "aircraft";
  if (s.includes("entity") || s.includes("organi") || s.includes("legal") || s.includes("company")) return "entity";
  return "other";
}

function takeStringArray(v: unknown, max = 16): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, max);
  }
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}

// ── JSON path ────────────────────────────────────────────────────────────────

function parseWorldCheckJson(payload: unknown, baseId: string): LsegCfsEntity[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;

  // World-Check One JSON typically nests under `entities`, `records`, `data`,
  // or is a direct array. Probe each known layout.
  let rows: unknown[] = [];
  if (Array.isArray(root["entities"])) rows = root["entities"];
  else if (Array.isArray(root["records"])) rows = root["records"];
  else if (Array.isArray(root["data"])) rows = root["data"];
  else if (Array.isArray(root["results"])) rows = root["results"];
  else if (Array.isArray(payload)) rows = payload;
  else return [];

  const out: LsegCfsEntity[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const primaryName =
      (typeof o["name"] === "string" && o["name"]) ||
      (typeof o["primaryName"] === "string" && o["primaryName"]) ||
      (typeof o["fullName"] === "string" && o["fullName"]) ||
      (typeof o["caption"] === "string" && o["caption"]) ||
      "";
    if (!primaryName) continue;
    const aliasesSource = o["aliases"] ?? o["aka"] ?? o["alternateNames"] ?? o["alternativeSpellings"];
    const countriesSource = o["countries"] ?? o["country"] ?? o["nationality"] ?? o["nationalities"];
    const categoriesSource = o["categories"] ?? o["riskCategories"] ?? o["topics"] ?? o["pepCategory"];
    const idCandidate =
      (typeof o["id"] === "string" && o["id"]) ||
      (typeof o["uid"] === "string" && o["uid"]) ||
      (typeof o["worldCheckId"] === "string" && o["worldCheckId"]) ||
      `${baseId}:${i}`;
    const entityType = toEntityType(o["type"] ?? o["entityType"] ?? o["category"]);
    const ent: LsegCfsEntity = {
      id: String(idCandidate),
      source: "lseg-cfs",
      primaryName: String(primaryName).trim(),
      aliases: takeStringArray(aliasesSource),
      entityType,
      countries: takeStringArray(countriesSource, 8),
      categories: takeStringArray(categoriesSource, 16),
      rawHash: fnv1a(JSON.stringify(o)),
    };
    if (typeof o["publishedAt"] === "string") ent.publishedAt = o["publishedAt"] as string;
    else if (typeof o["lastUpdated"] === "string") ent.publishedAt = o["lastUpdated"] as string;
    // Vessel-specific identifiers extracted only when the entity is a vessel
    // — keeps individuals/entities clean of unused fields.
    if (entityType === "vessel") {
      const v = extractVesselFromJson(o);
      if (v.imoNumber)  ent.imoNumber  = v.imoNumber;
      if (v.mmsi)       ent.mmsi       = v.mmsi;
      if (v.callSign)   ent.callSign   = v.callSign;
      if (v.flag)       ent.flag       = v.flag;
      if (v.vesselType) ent.vesselType = v.vesselType;
    }
    out.push(ent);
  }
  return out;
}

// ── XML path (regex-based; permissive, schema-tolerant) ──────────────────────

function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function xmlField(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "s"));
  return m?.[1]?.trim() ?? "";
}

function xmlFieldAll(block: string, tag: string): string[] {
  return xmlBlocks(block, tag).map((s) => s.trim()).filter(Boolean);
}

function parseLsegXml(xml: string, baseId: string): LsegCfsEntity[] {
  // LSEG XML schemas vary by package. The recurring outermost-record tag is
  // one of <record>, <Subject>, <entity>, <Entity>. Try each.
  const candidateTags = ["record", "Subject", "entity", "Entity"];
  let blocks: string[] = [];
  for (const tag of candidateTags) {
    blocks = xmlBlocks(xml, tag);
    if (blocks.length > 0) break;
  }
  if (blocks.length === 0) return [];

  const out: LsegCfsEntity[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const primaryName =
      xmlField(b, "fullName") ||
      xmlField(b, "name") ||
      xmlField(b, "primaryName") ||
      [xmlField(b, "firstName"), xmlField(b, "lastName")].filter(Boolean).join(" ");
    if (!primaryName) continue;
    const idCandidate = xmlField(b, "uid") || xmlField(b, "id") || `${baseId}:${i}`;
    const aliases = [
      ...xmlFieldAll(b, "alias"),
      ...xmlFieldAll(b, "aka"),
      ...xmlFieldAll(b, "alternateName"),
    ];
    const countries = [
      ...xmlFieldAll(b, "country"),
      ...xmlFieldAll(b, "nationality"),
    ];
    const categories = [
      ...xmlFieldAll(b, "category"),
      ...xmlFieldAll(b, "program"),
      ...xmlFieldAll(b, "topic"),
      ...xmlFieldAll(b, "riskFactor"),
    ];
    const publishedAt = xmlField(b, "publishedAt") || xmlField(b, "lastUpdated") || xmlField(b, "modifiedAt") || "";
    const entityType = toEntityType(xmlField(b, "entityType") || xmlField(b, "type") || xmlField(b, "subjectType"));
    const ent: LsegCfsEntity = {
      id: idCandidate,
      source: "lseg-cfs",
      primaryName,
      aliases,
      entityType,
      countries,
      categories,
      rawHash: fnv1a(b),
    };
    if (publishedAt) ent.publishedAt = publishedAt;
    if (entityType === "vessel") {
      const v = extractVesselFromXml(b);
      if (v.imoNumber)  ent.imoNumber  = v.imoNumber;
      if (v.mmsi)       ent.mmsi       = v.mmsi;
      if (v.callSign)   ent.callSign   = v.callSign;
      if (v.flag)       ent.flag       = v.flag;
      if (v.vesselType) ent.vesselType = v.vesselType;
    }
    out.push(ent);
  }
  return out;
}

// ── CSV path (RFC-4180 lite) ─────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuote = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseLsegCsv(csv: string, baseId: string): LsegCfsEntity[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const idx = (col: string): number => header.indexOf(col);
  const cName = Math.max(idx("name"), idx("fullname"), idx("primaryname"), idx("subject"));
  if (cName < 0) return [];
  const cId = Math.max(idx("id"), idx("uid"), idx("worldcheckid"));
  const cType = Math.max(idx("entitytype"), idx("type"), idx("subjecttype"));
  const cCountry = Math.max(idx("country"), idx("nationality"), idx("countries"));
  const cCategory = Math.max(idx("category"), idx("categories"), idx("program"), idx("topic"));
  const cAliases = Math.max(idx("aliases"), idx("aka"), idx("alternatenames"));
  const cPub = Math.max(idx("publishedat"), idx("lastupdated"), idx("modifiedat"));

  const out: LsegCfsEntity[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const primaryName = (cols[cName] ?? "").trim();
    if (!primaryName) continue;
    const ent: LsegCfsEntity = {
      id: (cId >= 0 ? cols[cId]?.trim() : "") || `${baseId}:${i}`,
      source: "lseg-cfs",
      primaryName,
      aliases: cAliases >= 0 ? (cols[cAliases] ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
      entityType: toEntityType(cType >= 0 ? cols[cType] : ""),
      countries: cCountry >= 0 ? (cols[cCountry] ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
      categories: cCategory >= 0 ? (cols[cCategory] ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
      rawHash: fnv1a(lines[i]!),
    };
    if (cPub >= 0 && cols[cPub]) ent.publishedAt = cols[cPub]!.trim();
    out.push(ent);
  }
  return out;
}

// ── Format detection + main entrypoint ───────────────────────────────────────

export type LsegCfsFormat = "json" | "xml" | "csv" | "unknown";

export function detectFormat(payload: string): LsegCfsFormat {
  const trimmed = payload.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<")) return "xml";
  // CSV heuristic: first 200 chars contain at least 3 commas and a newline.
  const head = trimmed.slice(0, 200);
  if (head.split(",").length >= 4 && head.includes("\n")) return "csv";
  return "unknown";
}

export function parseCfsPayload(payload: string, baseId = "cfs"): {
  format: LsegCfsFormat;
  entities: LsegCfsEntity[];
  error?: string;
} {
  const format = detectFormat(payload);
  try {
    if (format === "json") {
      let parsed: unknown;
      try { parsed = JSON.parse(payload); } catch (e) {
        return { format, entities: [], error: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}` };
      }
      return { format, entities: parseWorldCheckJson(parsed, baseId) };
    }
    if (format === "xml") {
      return { format, entities: parseLsegXml(payload, baseId) };
    }
    if (format === "csv") {
      return { format, entities: parseLsegCsv(payload, baseId) };
    }
    return { format, entities: [], error: "unknown format — could not detect JSON/XML/CSV from payload prefix" };
  } catch (e) {
    return { format, entities: [], error: e instanceof Error ? e.message : String(e) };
  }
}
