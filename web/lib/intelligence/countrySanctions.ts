// Hawkeye Sterling — country-specific sanctions / consolidated lists.
//
// Each adapter wraps a single jurisdiction's official consolidated list:
// HMT OFSI (UK), OFAC SDN (US), EU EBA, UN Security Council, AU DFAT,
// CH SECO, CA SEMA, NZ DPMC, SG MAS, AE EOCN, JP METI.
//
// Most are FREE public feeds — we env-toggle them with *_ENABLED=1 to
// keep the always-on surface explicit. They mirror RegistryAdapter so
// they can plug straight into the country dispatcher.

import type { RegistryAdapter, RegistryRecord } from "./registryAdapters";
import { NULL_REGISTRY_ADAPTER } from "./registryAdapters";

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`country-sanctions adapter exceeded ${ms}ms`)), ms),
    ),
  ]);
}

function envOn(envKey: string): boolean {
  const v = process.env[envKey];
  if (!v) return false;
  if (v === "0" || v.toLowerCase() === "false") return false;
  return true;
}

interface CountrySanctionAdapter extends RegistryAdapter {
  jurisdiction: string;     // ISO-2 of the issuing authority
  listName: string;
}

function nullSanction(jurisdiction: string, listName: string): CountrySanctionAdapter {
  return { ...NULL_REGISTRY_ADAPTER, jurisdiction, listName };
}

// ── UK HM Treasury OFSI Consolidated List — free CSV/JSON ────────────
function hmtOfsiAdapter(): CountrySanctionAdapter {
  if (!envOn("HMT_OFSI_ENABLED")) return nullSanction("GB", "HMT-OFSI");
  return {
    jurisdiction: "GB",
    listName: "HMT-OFSI",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch("https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.json", {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as Array<{ Name6?: string; Name1?: string; Address1?: string; Country?: string; "Group ID"?: number; Regime?: string; "Listed On"?: string }>;
        const needle = subjectName.toLowerCase();
        return (Array.isArray(json) ? json : [])
          .filter((r) => {
            const full = [r.Name1, r.Name6].filter(Boolean).join(" ").toLowerCase();
            return full.includes(needle);
          })
          .slice(0, opts?.limit ?? 25)
          .map((r) => ({
            source: "hmt-ofsi",
            name: [r.Name1, r.Name6].filter(Boolean).join(" "),
            jurisdiction: r.Country ?? "GB",
            ...(r["Group ID"] ? { registrationNumber: `OFSI-${r["Group ID"]}` } : {}),
            ...(r.Regime ? { status: r.Regime } : {}),
            ...(r["Listed On"] ? { incorporationDate: r["Listed On"] } : {}),
            url: "https://www.gov.uk/government/publications/the-uk-sanctions-list",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[hmt-ofsi] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── US OFAC SDN Consolidated List — free JSON ────────────────────────
function ofacSdnAdapter(): CountrySanctionAdapter {
  if (!envOn("OFAC_SDN_ENABLED")) return nullSanction("US", "OFAC-SDN");
  return {
    jurisdiction: "US",
    listName: "OFAC-SDN",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch("https://www.treasury.gov/ofac/downloads/consolidated/consolidated.json", {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ name?: string; type?: string; programs?: string[]; ids?: Array<{ number?: string; type?: string }>; addresses?: Array<{ country?: string }> }> };
        const needle = subjectName.toLowerCase();
        return (json.results ?? [])
          .filter((r) => r.name?.toLowerCase().includes(needle))
          .slice(0, opts?.limit ?? 25)
          .map((r) => {
            const id = r.ids?.find((x) => x.number)?.number;
            return {
              source: "ofac-sdn",
              name: r.name!,
              jurisdiction: r.addresses?.[0]?.country ?? "US",
              ...(id ? { registrationNumber: id } : {}),
              ...(r.programs?.length ? { status: r.programs.join(",") } : r.type ? { status: r.type } : {}),
              url: "https://sanctionssearch.ofac.treas.gov/",
            } satisfies RegistryRecord;
          });
      } catch (err) {
        console.warn("[ofac-sdn] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── EU EBA Consolidated Sanctions List — free XML/JSON ──────────────
function euEbaAdapter(): CountrySanctionAdapter {
  if (!envOn("EU_EBA_ENABLED")) return nullSanction("EU", "EU-EBA");
  // Note: Official EU list is on the Financial Sanctions endpoint
  // requiring an EU Login API key for raw XML; we use OpenSanctions'
  // EU subset as the public mirror here.
  return {
    jurisdiction: "EU",
    listName: "EU-EBA",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "eu_fsf" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, {
            headers: { accept: "application/json", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "eu-eba",
            name: r.caption!,
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "EU",
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
            url: "https://webgate.ec.europa.eu/fsd/fsf",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[eu-eba] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── UN Security Council Consolidated List — free XML ─────────────────
function unScAdapter(): CountrySanctionAdapter {
  if (!envOn("UN_SC_ENABLED")) return nullSanction("UN", "UN-SC");
  return {
    jurisdiction: "UN",
    listName: "UN-SC",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const res = await abortable(
          fetch("https://scsanctions.un.org/resources/xml/en/consolidated.xml", {
            headers: { accept: "application/xml", "user-agent": "HawkeyeSterling/1.0" },
          }),
        );
        if (!res.ok) return [];
        const xml = await res.text();
        // Cheap: extract <INDIVIDUAL> + <ENTITY> blocks for substring match
        const blocks = xml.match(/<(?:INDIVIDUAL|ENTITY)>[\s\S]*?<\/(?:INDIVIDUAL|ENTITY)>/g) ?? [];
        const needle = subjectName.toLowerCase();
        const records: RegistryRecord[] = [];
        for (const b of blocks) {
          const first = /<FIRST_NAME>([\s\S]*?)<\/FIRST_NAME>/.exec(b)?.[1]?.trim();
          const second = /<SECOND_NAME>([\s\S]*?)<\/SECOND_NAME>/.exec(b)?.[1]?.trim();
          const entityName = /<FIRST_NAME>([\s\S]*?)<\/FIRST_NAME>/.exec(b)?.[1]?.trim()
            ?? /<NAME>([\s\S]*?)<\/NAME>/.exec(b)?.[1]?.trim();
          const dataid = /<DATAID>([\s\S]*?)<\/DATAID>/.exec(b)?.[1]?.trim();
          const reflist = /<REFERENCE_NUMBER>([\s\S]*?)<\/REFERENCE_NUMBER>/.exec(b)?.[1]?.trim();
          const fullName = [first, second].filter(Boolean).join(" ") || entityName || "";
          if (!fullName || !fullName.toLowerCase().includes(needle)) continue;
          records.push({
            source: "un-sc",
            name: fullName,
            jurisdiction: "UN",
            ...(reflist ? { registrationNumber: reflist } : dataid ? { registrationNumber: `UN-${dataid}` } : {}),
            url: "https://www.un.org/securitycouncil/sanctions/information",
          });
          if (records.length >= (opts?.limit ?? 25)) break;
        }
        return records;
      } catch (err) {
        console.warn("[un-sc] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Australia DFAT Consolidated List — free Excel→JSON via OS ───────
function dfatAdapter(): CountrySanctionAdapter {
  if (!envOn("AU_DFAT_ENABLED")) return nullSanction("AU", "AU-DFAT");
  return {
    jurisdiction: "AU",
    listName: "AU-DFAT",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "au_dfat_sanctions" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "au-dfat",
            name: r.caption!,
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "AU",
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
            url: "https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[au-dfat] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Swiss SECO Sanctions — free, OpenSanctions mirror ────────────────
function secoAdapter(): CountrySanctionAdapter {
  if (!envOn("CH_SECO_ENABLED")) return nullSanction("CH", "CH-SECO");
  return {
    jurisdiction: "CH",
    listName: "CH-SECO",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "ch_seco_sanctions" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "ch-seco",
            name: r.caption!,
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "CH",
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
            url: "https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos.html",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[ch-seco] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Canada SEMA / Justice — free, OpenSanctions mirror ──────────────
function caSemaAdapter(): CountrySanctionAdapter {
  if (!envOn("CA_SEMA_ENABLED")) return nullSanction("CA", "CA-SEMA");
  return {
    jurisdiction: "CA",
    listName: "CA-SEMA",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "ca_sema_sanctions" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "ca-sema",
            name: r.caption!,
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "CA",
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
            url: "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[ca-sema] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── New Zealand DPMC Designated Persons — free mirror ───────────────
function nzDpmcAdapter(): CountrySanctionAdapter {
  if (!envOn("NZ_DPMC_ENABLED")) return nullSanction("NZ", "NZ-DPMC");
  return {
    jurisdiction: "NZ",
    listName: "NZ-DPMC",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "nz_russia_sanctions" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "nz-dpmc",
            name: r.caption!,
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "NZ",
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
            url: "https://www.dpmc.govt.nz/our-business-units/cabinet-office/supporting-work-cabinet/sanctions",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[nz-dpmc] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Singapore MAS — premium ─────────────────────────────────────────
function masAdapter(): CountrySanctionAdapter {
  const key = process.env["SG_MAS_API_KEY"];
  if (!key) return nullSanction("SG", "SG-MAS");
  return {
    jurisdiction: "SG",
    listName: "SG-MAS",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25) });
        const res = await abortable(
          fetch(`https://api.mas.gov.sg/sanctions/v1/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
          }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ name?: string; reference?: string; status?: string; country?: string }> };
        return (json.results ?? [])
          .filter((r) => r.name)
          .map((r) => ({
            source: "sg-mas",
            name: r.name!,
            jurisdiction: r.country ?? "SG",
            ...(r.reference ? { registrationNumber: r.reference } : {}),
            ...(r.status ? { status: r.status } : {}),
            url: "https://www.mas.gov.sg/regulation/anti-money-laundering/targeted-financial-sanctions",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[sg-mas] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── UAE EOCN (Executive Office for Control & Non-proliferation) ─────
function eocnAdapter(): CountrySanctionAdapter {
  if (!envOn("AE_EOCN_ENABLED")) return nullSanction("AE", "AE-EOCN");
  return {
    jurisdiction: "AE",
    listName: "AE-EOCN",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "ae_local_terrorists,ae_uaelocal" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "ae-eocn",
            name: r.caption!,
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "AE",
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
            url: "https://www.uaeiec.gov.ae/en-us/un-page",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[ae-eocn] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

// ── Japan METI End-User List — free mirror ──────────────────────────
function metiAdapter(): CountrySanctionAdapter {
  if (!envOn("JP_METI_ENABLED")) return nullSanction("JP", "JP-METI");
  return {
    jurisdiction: "JP",
    listName: "JP-METI",
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      try {
        const params = new URLSearchParams({ q: subjectName, limit: String(opts?.limit ?? 25), datasets: "jp_meti_eul" });
        const res = await abortable(
          fetch(`https://api.opensanctions.org/search/default?${params.toString()}`, { headers: { accept: "application/json" } }),
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { results?: Array<{ caption?: string; properties?: { country?: string[]; idNumber?: string[]; topics?: string[] } }> };
        return (json.results ?? [])
          .filter((r) => r.caption)
          .map((r) => ({
            source: "jp-meti",
            name: r.caption!,
            jurisdiction: r.properties?.country?.[0]?.toUpperCase() ?? "JP",
            ...(r.properties?.idNumber?.[0] ? { registrationNumber: r.properties.idNumber[0] } : {}),
            ...(r.properties?.topics?.length ? { status: r.properties.topics.join(",") } : {}),
            url: "https://www.meti.go.jp/policy/anpo/englishpage.html",
          } satisfies RegistryRecord));
      } catch (err) {
        console.warn("[jp-meti] failed:", err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}

const COUNTRY_SANCTION_ADAPTERS: Array<() => CountrySanctionAdapter> = [
  hmtOfsiAdapter,
  ofacSdnAdapter,
  euEbaAdapter,
  unScAdapter,
  dfatAdapter,
  secoAdapter,
  caSemaAdapter,
  nzDpmcAdapter,
  masAdapter,
  eocnAdapter,
  metiAdapter,
];

export function activeCountrySanctionAdapters(): CountrySanctionAdapter[] {
  return COUNTRY_SANCTION_ADAPTERS.map((f) => f()).filter((a) => a.isAvailable());
}

/**
 * Country-aware sanctions dispatcher. Pass an ISO-2 to fan out only to
 * lists from that issuing authority (or include UN/EU because those are
 * cross-jurisdictional). Empty jurisdiction = hit every active list.
 */
export async function searchCountrySanctions(
  subjectName: string,
  jurisdiction?: string,
  limit?: number,
): Promise<{ records: RegistryRecord[]; lists: string[] }> {
  const adapters = activeCountrySanctionAdapters();
  const targets = jurisdiction
    ? adapters.filter((a) => {
        const j = jurisdiction.toUpperCase();
        return a.jurisdiction === j || a.jurisdiction === "UN" || a.jurisdiction === "EU";
      })
    : adapters;
  if (targets.length === 0) return { records: [], lists: [] };
  const results = await Promise.all(targets.map((a) => a.search(subjectName, { jurisdiction, limit }).catch(() => [])));
  const merged = results.flat();
  const seen = new Set<string>();
  const records = merged.filter((r) => {
    const k = `${r.source}|${r.name.toLowerCase()}|${r.registrationNumber ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { records, lists: targets.map((a) => a.listName) };
}
