// Switzerland — SECO (State Secretariat for Economic Affairs) sanctions.
//
// Swiss federal ordinances implementing UN and EU sanctions plus
// autonomous designations. Published via the SESAM portal as a single
// consolidated XML.
//
// XML root: <sanctions> with nested <target> entries. Each target has
// <general-info>, <name>, <identity>, <address>, etc. Permissive
// regex-based parser — minor schema drift in any single field does not
// kill the whole adapter.
//
// Override via FEED_CH_SECO env var.

import { type SourceAdapter, type NormalisedEntity, type EntityType, mkListing } from '../types.js';
import { fetchText, sha256Hex } from '../fetch-util.js';

const SOURCE_URL = process.env['FEED_CH_SECO']
  ?? 'https://www.sesam.search.admin.ch/sesam-search-web/pages/downloadXmlGesamtliste.xhtml?lang=en';

export const chSecoAdapter: SourceAdapter = {
  id: 'ch_seco',
  displayName: 'Switzerland SECO Sanctions',
  sourceUrl: SOURCE_URL,
  async fetch() {
    const xml = await fetchText(SOURCE_URL, { accept: 'application/xml' });
    const rawChecksum = await sha256Hex(xml);
    const fetchedAt = Date.now();
    const entities: NormalisedEntity[] = [];

    // Diagnostic: a `<?xml` prolog alone doesn't prove the body is the
    // sanctions XML — SESAM's faceted-search portal serves XHTML pages
    // that also start with `<?xml ...?>` followed by `<!DOCTYPE html ...>`.
    // The audit-flagged H-03 ("ch_seco healthy with 0 entities") was
    // exactly this: the URL returned the SESAM portal HTML, the prolog
    // check passed, the TARGET_RE matched nothing, and the adapter wrote
    // an empty dataset that the matcher treats as a clean screen.
    //
    // Require evidence of the sanctions XML structure (a <sanctions> root,
    // a <target> block, or a SECO-specific element) before parsing. If
    // absent, throw with a clear hint pointing at the URL configuration.
    const trimmed = xml.trimStart();
    const looksLikeXhtml = /<!DOCTYPE\s+html|<html[\s>]/i.test(trimmed.slice(0, 500));
    const hasSanctionsRoot = /<(?:sanctions|sanction-list|sanction-target|target)[\s>]/i.test(trimmed);
    if (looksLikeXhtml || !hasSanctionsRoot) {
      throw new Error(
        `ch_seco: response is not the SECO sanctions XML — got ${trimmed.length} bytes` +
        (looksLikeXhtml ? ` (XHTML portal page detected)` : ` (no <sanctions>/<target> root found)`) +
        ` starting with "${trimmed.slice(0, 100).replace(/\s+/g, ' ')}". ` +
        `The published SESAM endpoint may have moved; set FEED_CH_SECO to the direct XML download URL.`,
      );
    }

    // SECO publishes with two equivalent root-element conventions across
    // schema revisions. Match both <target> and (rare) <sanction-target>.
    const TARGET_RE = /<(?:target|sanction-target)[^>]*>([\s\S]*?)<\/(?:target|sanction-target)>/g;
    for (const m of xml.matchAll(TARGET_RE)) {
      const block = m[1] ?? '';
      const ssid = xmlAttrFromOpening(m[0]!, 'ssid') || xmlField(block, 'ssid');
      const programs = xmlFieldAll(block, 'sanctions-program-set');
      const programFallback = xmlField(block, 'general-info').match(/sanctions[\s-]program[s]?[:>]([^<]+)/i)?.[1] ?? '';

      // Iterate <name-set> entries. The first is the primary, the rest are
      // aliases / aka.
      const nameBlocks = Array.from(block.matchAll(/<name[^>]*>([\s\S]*?)<\/name>/g)).map((nm) => nm[1] ?? '');
      const formattedNames = nameBlocks.map((nb) => {
        const whole = xmlField(nb, 'whole-name');
        if (whole) return whole;
        const fn = xmlField(nb, 'first-name');
        const ln = xmlField(nb, 'family-name') || xmlField(nb, 'last-name');
        return [fn, ln].filter(Boolean).join(' ').trim();
      }).filter(Boolean);
      const primaryName = formattedNames[0];
      if (!primaryName) continue;
      const aliases = formattedNames.slice(1);

      const isPerson = /<individual>|<person>|sex|gender|date-of-birth/i.test(block);
      const t: EntityType = isPerson ? 'individual' : 'entity';

      const dob = xmlField(block, 'date-of-birth');
      const nationalities = xmlFieldAll(block, 'country').slice(0, 4);
      const passports = xmlFieldAll(block, 'passport-number');
      const idNumbers = xmlFieldAll(block, 'identification-number');
      const addresses = xmlFieldAll(block, 'address-line').slice(0, 4);

      const identifiers: Record<string, string> = {};
      if (passports[0]) identifiers['passport'] = passports[0];
      if (idNumbers[0]) identifiers['national_id'] = idNumbers[0];

      const ent: NormalisedEntity = {
        id: `ch_seco:${ssid || primaryName}`,
        name: primaryName,
        aliases,
        type: t,
        nationalities,
        jurisdictions: nationalities,
        ...(dob ? { dateOfBirth: dob } : {}),
        identifiers,
        addresses,
        listings: [
          mkListing('ch_seco', {
            program: programs[0] ?? programFallback ?? undefined,
            reference: ssid || undefined,
            authorityUrl: 'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos.html',
          }),
        ],
        source: 'ch_seco',
        fetchedAt,
      };
      entities.push(ent);
    }

    return { entities, rawChecksum };
  },
};

// ── XML helpers (regex-based; permissive) ────────────────────────────────────

function xmlField(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 's'));
  return (m?.[1] ?? '').trim();
}

function xmlFieldAll(block: string, tag: string): string[] {
  return Array.from(
    block.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gs')),
    (m) => (m[1] ?? '').trim(),
  ).filter(Boolean);
}

function xmlAttrFromOpening(opening: string, name: string): string {
  return opening.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? '';
}
