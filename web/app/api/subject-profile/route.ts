import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { getJson, listKeys, setJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Structured subject profile. Persists a rolling dossier per subject
// across screens, ongoing-monitoring ticks, STR filings, and MLRO
// dispositions — the regulator-replay artefact that answers "what
// did the MLRO see when they made this decision?"
//
// Storage:
//   profile/<safe-id> → ProfileRecord
//   profile-snapshot/<safe-id>/<timestamp>.json → ProfileSnapshot
//
// Snapshots are append-only; the root ProfileRecord is the latest
// consolidated view.

const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:]+$/;
const MAX_ID_LENGTH = 128;
const MAX_HISTORY_ENTRIES = 200;

interface Hit {
  listId: string;
  listRef: string;
  candidateName: string;
  score: number;
  method?: string;
}

interface Snapshot {
  at: string;
  topScore: number;
  severity: string;
  hits: Hit[];
  compositeScore?: number;
  adverseMediaCategories?: string[];
  jurisdictionCahra?: boolean;
  pepTier?: string;
  source: "screen" | "ongoing" | "manual";
}

interface DispositionLog {
  at: string;
  action: "clear" | "monitor" | "escalate" | "str" | "close";
  actor?: string;
  note?: string;
}

interface ProfileRecord {
  id: string;
  name: string;
  aliases?: string[];
  entityType?: string;
  jurisdiction?: string;
  createdAt: string;
  updatedAt: string;
  snapshots: Snapshot[];
  dispositions: DispositionLog[];
  hitsEverSeen: string[]; // fingerprints (listRef|candidateName)
  adverseMediaEverSeen: string[]; // article URLs
}

interface AppendBody {
  subject: {
    id: string;
    name: string;
    aliases?: string[];
    entityType?: string;
    jurisdiction?: string;
  };
  snapshot?: Omit<Snapshot, "at"> & { at?: string };
  disposition?: Omit<DispositionLog, "at"> & { at?: string };
  adverseMediaUrls?: string[];
}

function safeId(id: string): string | null {
  if (!id || id.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(id)) return null;
  return id;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = safeId(url.searchParams.get("id") ?? "");
  if (!id) {
    // list mode — return profile ids + minimal metadata
    const keys = await listKeys("profile/");
    const ids = keys
      .map((k) => k.replace(/^profile\//, ""))
      .filter((s) => !s.includes("/"));
    return NextResponse.json({ ok: true, profileIds: ids });
  }
  const profile = await getJson<ProfileRecord>(`profile/${id}`);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, profile });
}

async function handlePost(req: Request): Promise<NextResponse> {
  let body: AppendBody;
  try {
    body = (await req.json()) as AppendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const id = safeId(body.subject?.id ?? "");
  if (!id || !body.subject?.name) {
    return NextResponse.json(
      { ok: false, error: "subject.id (alphanumeric/._-:, <=128) and subject.name required" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const existing = await getJson<ProfileRecord>(`profile/${id}`);
  const base: ProfileRecord = existing ?? {
    id,
    name: body.subject.name,
    ...(body.subject.aliases?.length ? { aliases: body.subject.aliases } : {}),
    ...(body.subject.entityType ? { entityType: body.subject.entityType } : {}),
    ...(body.subject.jurisdiction ? { jurisdiction: body.subject.jurisdiction } : {}),
    createdAt: now,
    updatedAt: now,
    snapshots: [],
    dispositions: [],
    hitsEverSeen: [],
    adverseMediaEverSeen: [],
  };

  const updated: ProfileRecord = { ...base, updatedAt: now };
  if (body.subject.name) updated.name = body.subject.name;
  if (body.subject.aliases?.length) updated.aliases = body.subject.aliases;
  if (body.subject.entityType) updated.entityType = body.subject.entityType;
  if (body.subject.jurisdiction) updated.jurisdiction = body.subject.jurisdiction;

  if (body.snapshot) {
    const snap: Snapshot = {
      ...body.snapshot,
      at: body.snapshot.at ?? now,
    };
    updated.snapshots = [
      ...updated.snapshots.slice(-(MAX_HISTORY_ENTRIES - 1)),
      snap,
    ];
    const fingerprints = new Set(updated.hitsEverSeen);
    for (const h of snap.hits) {
      fingerprints.add(`${h.listRef}|${h.candidateName}`);
    }
    updated.hitsEverSeen = Array.from(fingerprints).slice(-500);

    // Also persist the snapshot as an append-only artefact for audit.
    try {
      await setJson(`profile-snapshot/${id}/${snap.at}`, snap);
    } catch (err) {
      console.warn(
        `[hawkeye] subject-profile snapshot persist failed for ${id}/${snap.at} ` +
        "(append-only artefact lost; consolidated record still wins):",
        err,
      );
    }
  }

  if (body.disposition) {
    const disp: DispositionLog = {
      ...body.disposition,
      at: body.disposition.at ?? now,
    };
    updated.dispositions = [
      ...updated.dispositions.slice(-(MAX_HISTORY_ENTRIES - 1)),
      disp,
    ];
  }

  if (body.adverseMediaUrls?.length) {
    const urls = new Set(updated.adverseMediaEverSeen);
    for (const u of body.adverseMediaUrls) urls.add(u);
    updated.adverseMediaEverSeen = Array.from(urls).slice(-500);
  }

  await setJson(`profile/${id}`, updated);

  return NextResponse.json({
    ok: true,
    profile: updated,
    snapshotCount: updated.snapshots.length,
  });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
