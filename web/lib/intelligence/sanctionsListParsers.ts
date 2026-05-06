// Hawkeye Sterling — sanctions-list parser stubs (Layers 86-95).
// Light-weight parsers for the canonical regime feeds. Each takes a raw
// payload (XML / CSV / JSON) and returns a normalised candidate list the
// matcher can consume. Implementations are intentionally permissive —
// upstream feeds change; the parsers must keep working when fields drop.

export interface NormalisedListEntry {
  listId: string;
  listRef: string;
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  programs?: string[];
  designatedAt?: string;
  birthDate?: string;
  nationality?: string;
  passportNumbers?: string[];
  imo?: string;
  icao24?: string;
  walletAddresses?: string[];
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

// 86. UN 1267 (XML)
export function parseUn1267Xml(xml: string): NormalisedListEntry[] {
  // Crude regex parser — full XML parser would need a dependency.
  const entries: NormalisedListEntry[] = [];
  const indMatches = xml.matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g);
  for (const m of indMatches) {
    const block = m[1] ?? "";
    const ref = safe(() => block.match(/<DATAID>(.*?)<\/DATAID>/)?.[1] ?? "", "");
    const first = safe(() => block.match(/<FIRST_NAME>(.*?)<\/FIRST_NAME>/)?.[1] ?? "", "");
    const second = safe(() => block.match(/<SECOND_NAME>(.*?)<\/SECOND_NAME>/)?.[1] ?? "", "");
    const third = safe(() => block.match(/<THIRD_NAME>(.*?)<\/THIRD_NAME>/)?.[1] ?? "", "");
    const name = [first, second, third].filter(Boolean).join(" ");
    if (name && ref) entries.push({ listId: "UN_1267", listRef: ref, name, entityType: "individual" });
  }
  const entMatches = xml.matchAll(/<ENTITY>([\s\S]*?)<\/ENTITY>/g);
  for (const m of entMatches) {
    const block = m[1] ?? "";
    const ref = safe(() => block.match(/<DATAID>(.*?)<\/DATAID>/)?.[1] ?? "", "");
    const name = safe(() => block.match(/<FIRST_NAME>(.*?)<\/FIRST_NAME>/)?.[1] ?? "", "");
    if (name && ref) entries.push({ listId: "UN_1267", listRef: ref, name, entityType: "organisation" });
  }
  return entries;
}

// 87. OFAC SDN (XML — DSV-style)
export function parseOfacSdnXml(xml: string): NormalisedListEntry[] {
  const out: NormalisedListEntry[] = [];
  const sdns = xml.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/g);
  for (const m of sdns) {
    const block = m[1] ?? "";
    const uid = block.match(/<uid>(.*?)<\/uid>/)?.[1] ?? "";
    const fn = block.match(/<firstName>(.*?)<\/firstName>/)?.[1] ?? "";
    const ln = block.match(/<lastName>(.*?)<\/lastName>/)?.[1] ?? "";
    const sdnType = block.match(/<sdnType>(.*?)<\/sdnType>/)?.[1] ?? "Individual";
    const programs = Array.from(block.matchAll(/<program>(.*?)<\/program>/g)).map((p) => p[1] ?? "");
    const name = (fn + " " + ln).trim() || ln || fn;
    if (name && uid) {
      out.push({
        listId: "OFAC_SDN",
        listRef: uid,
        name,
        entityType: sdnType.toLowerCase().includes("entity") ? "organisation"
          : sdnType.toLowerCase().includes("vessel") ? "vessel"
          : sdnType.toLowerCase().includes("aircraft") ? "aircraft"
          : "individual",
        ...(programs.length ? { programs } : {}),
      });
    }
  }
  return out;
}

// 88. OFAC consolidated (CSV)
export function parseOfacConsCsv(csv: string): NormalisedListEntry[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      listId: "OFAC_CONS",
      listRef: cols[0] ?? "",
      name: cols[1] ?? "",
      entityType: ((cols[2] ?? "").toLowerCase().includes("ind") ? "individual" : "organisation") as NormalisedListEntry["entityType"],
      ...(cols[3] ? { programs: [cols[3]!] } : {}),
    } satisfies NormalisedListEntry;
  }).filter((e) => e.name);
}

// 89. EU CFSP (XML)
export function parseEuCfspXml(xml: string): NormalisedListEntry[] {
  const entries: NormalisedListEntry[] = [];
  const blocks = xml.matchAll(/<sanctionEntity[^>]*>([\s\S]*?)<\/sanctionEntity>/g);
  for (const m of blocks) {
    const block = m[1] ?? "";
    const ref = block.match(/euReferenceNumber="([^"]+)"/)?.[1] ?? block.match(/logicalId="([^"]+)"/)?.[1] ?? "";
    const name = block.match(/<wholeName>(.*?)<\/wholeName>/)?.[1] ?? block.match(/<lastName>(.*?)<\/lastName>/)?.[1] ?? "";
    if (name && ref) entries.push({ listId: "EU_CFSP", listRef: ref, name, entityType: "individual" });
  }
  return entries;
}

// 90. UK OFSI (CSV)
export function parseUkOfsiCsv(csv: string): NormalisedListEntry[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0]!.split(",").map((h) => h.toLowerCase());
  const idx = (n: string): number => header.indexOf(n);
  const out: NormalisedListEntry[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const name = cols[idx("name 6")] ?? cols[idx("name")] ?? "";
    const id = cols[idx("group id")] ?? "";
    const regime = cols[idx("regime")];
    if (name && id) {
      out.push({
        listId: "UK_OFSI",
        listRef: id,
        name,
        entityType: "individual",
        ...(regime ? { programs: [regime] } : {}),
      });
    }
  }
  return out;
}

// 91. UAE EOCN (JSON)
export function parseUaeEocnJson(raw: string): NormalisedListEntry[] {
  const data = safe(() => JSON.parse(raw), null) as { entries?: Array<Record<string, unknown>> } | null;
  if (!data?.entries) return [];
  return data.entries
    .map((e) => ({
      listId: "UAE_EOCN",
      listRef: String(e.id ?? e.reference ?? ""),
      name: String(e.name ?? ""),
      entityType: ((e.type ?? "individual") as string).toLowerCase().includes("ent")
        ? ("organisation" as const) : ("individual" as const),
      ...(typeof e.aliases === "string" ? { aliases: (e.aliases as string).split(";").map((a) => a.trim()) } : {}),
      ...(typeof e.dob === "string" ? { birthDate: e.dob } : {}),
    } satisfies NormalisedListEntry))
    .filter((e) => e.name && e.listRef);
}

// 92. Sectoral SSI (OFAC E.O. 13662 et al.)
export function parseOfacSsiCsv(csv: string): NormalisedListEntry[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      listId: "OFAC_SSI",
      listRef: cols[0] ?? "",
      name: cols[1] ?? "",
      entityType: "organisation" as const,
      programs: cols[2] ? [cols[2]!] : ["SSI"],
    } satisfies NormalisedListEntry;
  }).filter((e) => e.name);
}

// 93. Maritime sanctions (vessels)
export function parseMaritimeJson(raw: string): NormalisedListEntry[] {
  const data = safe(() => JSON.parse(raw), null) as { vessels?: Array<{ imo?: string; mmsi?: string; name?: string; programs?: string[] }> } | null;
  if (!data?.vessels) return [];
  return data.vessels
    .filter((v) => v.imo && v.name)
    .map((v) => ({
      listId: "MARITIME",
      listRef: v.imo!,
      name: v.name!,
      entityType: "vessel" as const,
      ...(v.imo ? { imo: v.imo } : {}),
      ...(v.programs ? { programs: v.programs } : {}),
    } satisfies NormalisedListEntry));
}

// 94. Aviation sanctions (aircraft)
export function parseAviationJson(raw: string): NormalisedListEntry[] {
  const data = safe(() => JSON.parse(raw), null) as { aircraft?: Array<{ icao24?: string; tail?: string; operator?: string; programs?: string[] }> } | null;
  if (!data?.aircraft) return [];
  return data.aircraft
    .filter((a) => a.icao24 || a.tail)
    .map((a) => ({
      listId: "AVIATION",
      listRef: a.icao24 ?? a.tail ?? "",
      name: a.operator ?? a.tail ?? a.icao24 ?? "",
      entityType: "aircraft" as const,
      ...(a.icao24 ? { icao24: a.icao24 } : {}),
      ...(a.programs ? { programs: a.programs } : {}),
    } satisfies NormalisedListEntry));
}

// 95. Crypto-wallet sanctions list (OFAC SDN crypto appendix)
export function parseCryptoWalletList(raw: string): NormalisedListEntry[] {
  const data = safe(() => JSON.parse(raw), null) as { wallets?: Array<{ address?: string; entity?: string; chain?: string; programs?: string[] }> } | null;
  if (!data?.wallets) return [];
  return data.wallets
    .filter((w) => w.address && w.entity)
    .map((w) => ({
      listId: "OFAC_CRYPTO",
      listRef: w.address!,
      name: w.entity!,
      entityType: "other" as const,
      walletAddresses: [w.address!],
      ...(w.programs ? { programs: w.programs } : {}),
    } satisfies NormalisedListEntry));
}
