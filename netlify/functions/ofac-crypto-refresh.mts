// Hawkeye Sterling — OFAC crypto address live refresh.
//
// Fetches sanctioned digital currency addresses from the OFAC SDN list and
// writes them to `hawkeye-lists/ofac_crypto/latest.json`. The crypto-risk
// route reads from this blob at cold start (6h module-level cache).
//
// This replaces the static hardcoded wallet set in crypto-risk/route.ts with
// a live-refreshed list, ensuring newly-designated addresses (Lazarus Group,
// ransomware operators, exchange sanctions) are caught without a redeploy.
//
// Schedule: daily at 07:00 UTC.
//
// OFAC SDN Advanced List (CSV) format:
//   https://www.treasury.gov/ofac/downloads/sdn.csv
//   https://www.treasury.gov/ofac/downloads/alt.csv (aliases)
//   Digital currency addresses in sdn.csv are tagged with |Digital Currency Address - ETH|
//   or |Digital Currency Address - BTC| etc. in the remarks column.
//
// Environment variables required:
//   None (OFAC SDN list is publicly available without authentication)
//   HAWKEYE_CRON_TOKEN — bearer token to protect the HTTP trigger path (optional)

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { writeHeartbeat } from "../lib/heartbeat.js";

const STORE_NAME = "hawkeye-lists";
const BLOB_KEY = "ofac_crypto/latest.json";
const RUN_LABEL = "ofac-crypto-refresh";

// OFAC SDN Advanced List — full XML includes all digital currency addresses
const OFAC_SDN_XML_URL = "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml";

interface CryptoEntry {
  address: string;
  chain: string;
  entityName: string;
  program: string;
}

interface OFACCryptoBlob {
  fetchedAt: string;
  entityCount: number;
  source: "ofac_sdn_advanced" | "fallback";
  addresses: CryptoEntry[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseCryptoAddressesFromXml(xml: string): CryptoEntry[] {
  const entries: CryptoEntry[] = [];
  // Extract all <feature> elements with featureTypeID matching digital currency chains
  // Pattern: <feature featureTypeID="..."><versionDetail>ADDRESS</versionDetail>
  // Chain IDs in OFAC XML: 1486=ETH, 1383=BTC, 1490=XBT (bitcoin), 1487=XMR, 1500=USDC, etc.
  // We use a broader approach: find all <featureVersion><versionDetail> near "Digital Currency"

  // Extract SDN entries with digital currency feature types
  const sdnEntryRegex = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/gi;
  let sdnMatch: RegExpExecArray | null;

  while ((sdnMatch = sdnEntryRegex.exec(xml)) !== null) {
    const block = sdnMatch[1] ?? "";

    // Extract entity name
    const lastName = /<lastName>([^<]+)<\/lastName>/i.exec(block)?.[1] ?? "";
    const firstName = /<firstName>([^<]+)<\/firstName>/i.exec(block)?.[1] ?? "";
    const entityName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";

    // Extract sanctions program
    const program = /<programList>[\s\S]*?<program>([^<]+)<\/program>/i.exec(block)?.[1] ?? "UNKNOWN";

    // Find all featureVersion blocks with digital currency addresses
    const featureVersionRegex = /<featureVersion>([\s\S]*?)<\/featureVersion>/gi;
    let fvMatch: RegExpExecArray | null;
    while ((fvMatch = featureVersionRegex.exec(block)) !== null) {
      const fvBlock = fvMatch[1] ?? "";
      // Check if this feature version detail looks like a crypto address (hex or base58)
      const detail = /<versionDetail>([^<]+)<\/versionDetail>/i.exec(fvBlock)?.[1]?.trim();
      if (!detail) continue;
      // Crypto address heuristics: ETH (0x + 40 hex chars), BTC (1/3/bc1 prefix), XMR (4...)
      const isEth = /^0x[0-9a-fA-F]{40}$/.test(detail);
      const isBtc = /^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(detail);
      const isXmr = /^4[0-9a-zA-Z]{94}$/.test(detail);
      const isTrx = /^T[a-zA-Z0-9]{33}$/.test(detail);
      const isXrp = /^r[a-zA-Z0-9]{24,34}$/.test(detail);
      const isLtc = /^[LM][a-zA-Z0-9]{26,33}$/.test(detail);
      if (isEth || isBtc || isXmr || isTrx || isXrp || isLtc) {
        const chain = isEth ? "ethereum" : isBtc ? "bitcoin" : isXmr ? "monero" : isTrx ? "tron" : isXrp ? "xrp" : "litecoin";
        entries.push({ address: detail.toLowerCase(), chain, entityName, program });
      }
    }
  }

  return entries;
}

export default async function handler(req: Request): Promise<Response> {
  // Netlify scheduler sets x-nf-event: schedule; HTTP callers must authenticate.
  // Defense-in-depth: x-nf-event is technically forgeable as a plain header.
  // If a claimed scheduled event also carries an Authorization header, verify it —
  // a genuine Netlify scheduler invocation never sends Authorization.
  const cronToken = process.env["HAWKEYE_CRON_TOKEN"];
  const isScheduledEvent = req.headers.get("x-nf-event") === "schedule";
  const authHeader = req.headers.get("authorization");
  if (!isScheduledEvent) {
    const supplied = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!cronToken || supplied !== cronToken) {
      return jsonResponse({ ok: false, label: RUN_LABEL, error: "Unauthorized" }, 401);
    }
  } else if (authHeader !== null && cronToken) {
    const supplied = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (supplied !== cronToken) {
      return jsonResponse({ ok: false, label: RUN_LABEL, error: "Unauthorized" }, 401);
    }
  }

  const fetchedAt = new Date().toISOString();
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` }, 503);
  }

  try {
    const res = await fetch(OFAC_SDN_XML_URL, {
      headers: { "User-Agent": "HawkeyeSterling/1.0 AML-Compliance-Platform" },
      signal: AbortSignal.timeout(55_000),
    });

    if (!res.ok) {
      console.error(`[${RUN_LABEL}] OFAC SDN fetch failed: HTTP ${res.status}`);
      return jsonResponse({ ok: false, label: RUN_LABEL, error: `OFAC SDN HTTP ${res.status}` }, 502);
    }

    const xml = await res.text();
    const addresses = parseCryptoAddressesFromXml(xml);

    const blob: OFACCryptoBlob = {
      fetchedAt,
      entityCount: addresses.length,
      source: "ofac_sdn_advanced",
      addresses,
    };

    await store.set(BLOB_KEY, JSON.stringify(blob));

    console.info(`[${RUN_LABEL}] refreshed ${addresses.length} OFAC crypto addresses`);
    await writeHeartbeat(RUN_LABEL);
    return jsonResponse({ ok: true, label: RUN_LABEL, addressCount: addresses.length, fetchedAt });
  } catch (err) {
    console.error(`[${RUN_LABEL}] failed:`, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, label: RUN_LABEL, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export const config: Config = {
  // Daily at 07:00 UTC — after OFAC publishes daily updates.
  schedule: "0 7 * * *",
};
