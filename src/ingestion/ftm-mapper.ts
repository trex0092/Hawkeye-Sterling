// Hawkeye Sterling — FtM entity mapper.
// Converts Hawkeye Sterling's internal NormalisedListEntry format into
// FollowTheMoney (FtM) entity format, enabling output to be piped into
// `ftm aggregate`, `ftm cypher` (Neo4j), `ftm gexf` (Gephi/NetworkX),
// and `ftm rdf` (knowledge graph tooling).
//
// Reference: alephdata/followthemoney v3.8.4, MIT licence.

import type { NormalisedListEntry } from '../brain/watchlist-adapters.js';
import { type FtmEntity, type FtmSchema, type FtmProperties, ftmId, toFtmStream } from '../brain/ftm-schema.js';

// Map HS entity types to FtM schema types
function schemaFor(entry: NormalisedListEntry): FtmSchema {
  switch (entry.entityType) {
    case 'individual': return 'Person';
    case 'organisation': return 'Organization';
    case 'vessel': return 'Vessel';
    case 'aircraft': return 'Aircraft';
    default: return 'LegalEntity';
  }
}

// Convert a single NormalisedListEntry to an FtmEntity (Person or Organization)
export function entryToFtm(entry: NormalisedListEntry): FtmEntity {
  const schema = schemaFor(entry);
  const props: FtmProperties = {
    name: [entry.primaryName, ...entry.aliases].filter(Boolean),
  };

  // Identifiers
  for (const id of entry.identifiers ?? []) {
    if (id.kind === 'passport') {
      props.passportNumber = [...(props.passportNumber ?? []), id.number];
    } else if (id.kind === 'national_id') {
      props.idNumber = [...(props.idNumber ?? []), id.number];
    }
  }

  if (entry.nationalities?.length) {
    props.nationality = entry.nationalities;
  }

  if (entry.addresses?.length) {
    props['addressFull'] = entry.addresses
      .map((a) => [a.line, a.city, a.country].filter(Boolean).join(', '))
      .filter(Boolean);
  }

  if (entry.remarks) props.description = [entry.remarks];
  if (entry.publishedAt) props.modifiedAt = [entry.publishedAt];

  const id = ftmId(schema, entry.primaryName, entry.listId, entry.sourceRef);
  const entity: FtmEntity = {
    id,
    schema,
    caption: entry.primaryName,
    datasets: [entry.listId],
    properties: props,
    first_seen: entry.ingestedAt,
    last_seen: entry.ingestedAt,
  };

  return entity;
}

// Convert a NormalisedListEntry to an FtmEntity + a linked Sanction entity.
// Returns both — the subject entity and the Sanction relationship entity.
export function entryToFtmWithSanction(entry: NormalisedListEntry): FtmEntity[] {
  const subject = entryToFtm(entry);

  const sanctionProps: FtmProperties = {
    authority: entry.programs?.length ? entry.programs : [entry.listId],
    program: entry.programs ?? [],
    entity: [subject.id],
  };
  if (entry.publishedAt) sanctionProps.listingDate = [entry.publishedAt];
  if (entry.remarks) sanctionProps.reason = [entry.remarks];

  const sanctionId = ftmId('Sanction', subject.id, entry.listId);
  const sanction: FtmEntity = {
    id: sanctionId,
    schema: 'Sanction',
    caption: `${entry.primaryName} — ${entry.listId.toUpperCase()}`,
    datasets: [entry.listId],
    properties: sanctionProps,
    first_seen: entry.ingestedAt,
  };

  return [subject, sanction];
}

// Convert an array of NormalisedListEntries to FtM NDJSON stream.
// The output is compatible with `ftm aggregate`, `ftm cypher`, etc.
export function entriesToFtmStream(
  entries: NormalisedListEntry[],
  includeSanctions = true,
): string {
  const entities: FtmEntity[] = [];
  for (const entry of entries) {
    if (includeSanctions) {
      entities.push(...entryToFtmWithSanction(entry));
    } else {
      entities.push(entryToFtm(entry));
    }
  }
  // Deduplicate by id
  const seen = new Set<string>();
  const unique = entities.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  return toFtmStream(unique);
}

// Export a single entry as FtM JSON (for inline use in API responses).
export function entryToFtmJson(entry: NormalisedListEntry): Record<string, unknown> {
  return entryToFtm(entry) as unknown as Record<string, unknown>;
}
