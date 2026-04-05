/**
 * Cross-entity counterparty register.
 *
 * Maintains a single CSV at history/registers/counterparties.csv listing
 * every counterparty the compliance automation has seen across every
 * programme in the HAWKEYE STERLING V2 portfolio. The register is
 * human-readable (opens in Excel), machine-readable (parsed by the daily
 * and weekly runs), version-controlled in the repository, and retained
 * for 10 years in accordance with the applicable provision of
 * Federal Decree-Law No. 10 of 2025.
 *
 * Columns (in this exact order):
 *   first_seen            YYYY-MM-DD of the first observation
 *   last_seen             YYYY-MM-DD of the most recent observation
 *   counterparty_name     full name as observed in Asana
 *   alias_of              optional link to another counterparty in the register
 *   jurisdiction          best-effort country or emirate
 *   entities_touching     pipe-separated list of HSV2 programme names
 *   typologies            pipe-separated list of typology keywords
 *   status                open / under_review / watchlist / cleared / escalated
 *   risk_rating           low / medium / high / critical
 *   mlro_notes            free text reserved for the MLRO
 *   last_task_gid         the most recent Asana task GID observed
 *
 * The module exposes:
 *   readRegister()        → parses the CSV if present, returns a Map keyed on
 *                           lowercased counterparty_name
 *   writeRegister(map)    → serialises back to CSV, sorted by risk rating
 *                           then last_seen desc, with a trailing newline
 *   upsertFromTasks(...)  → merges new observations into the register,
 *                           preserving MLRO notes and status, and updating
 *                           first_seen / last_seen / entities_touching /
 *                           typologies / last_task_gid automatically
 *
 * The module is imported by daily-priorities.mjs. It never calls Claude.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const REGISTER_PATH = path.resolve(
  process.cwd(),
  "..",
  "history",
  "registers",
  "counterparties.csv",
);

const COLUMNS = [
  "first_seen",
  "last_seen",
  "counterparty_name",
  "alias_of",
  "jurisdiction",
  "entities_touching",
  "typologies",
  "status",
  "risk_rating",
  "mlro_notes",
  "last_task_gid",
];

const RISK_RATING_ORDER = { critical: 0, high: 1, medium: 2, low: 3, "": 4 };

/* ─── CSV helpers ───────────────────────────────────────────────────────── */

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function rowToEntry(row) {
  const entry = {};
  for (let i = 0; i < COLUMNS.length; i++) {
    entry[COLUMNS[i]] = row[i] ?? "";
  }
  return entry;
}

function entryToRow(entry) {
  return COLUMNS.map((col) => csvEscape(entry[col] ?? "")).join(",");
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Read the register from disk. Returns a Map keyed on the lowercased
 * counterparty name, with each value being the parsed row object. If the
 * file does not exist, returns an empty Map.
 */
export async function readRegister() {
  try {
    const text = await readFile(REGISTER_PATH, "utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return new Map();
    const header = parseCsvLine(lines[0]);
    if (header.join(",") !== COLUMNS.join(",")) {
      console.warn(
        `counterparty register header mismatch; expected ${COLUMNS.join(",")}, got ${header.join(",")}. Reading on a best-effort basis.`,
      );
    }
    const map = new Map();
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const entry = rowToEntry(row);
      if (!entry.counterparty_name) continue;
      map.set(entry.counterparty_name.toLowerCase().trim(), entry);
    }
    return map;
  } catch (err) {
    if (err.code === "ENOENT") return new Map();
    throw err;
  }
}

/**
 * Serialise the Map back to disk. Rows are sorted by risk rating (critical
 * first), then by last_seen descending, then by counterparty_name
 * ascending. Writes a trailing newline.
 */
export async function writeRegister(map) {
  const rows = [...map.values()];
  rows.sort((a, b) => {
    const ra = RISK_RATING_ORDER[a.risk_rating ?? ""] ?? 5;
    const rb = RISK_RATING_ORDER[b.risk_rating ?? ""] ?? 5;
    if (ra !== rb) return ra - rb;
    if (a.last_seen !== b.last_seen) return (b.last_seen ?? "").localeCompare(a.last_seen ?? "");
    return (a.counterparty_name ?? "").localeCompare(b.counterparty_name ?? "");
  });
  const body = [COLUMNS.join(","), ...rows.map(entryToRow)].join("\n") + "\n";
  await mkdir(path.dirname(REGISTER_PATH), { recursive: true });
  await writeFile(REGISTER_PATH, body, "utf8");
  return REGISTER_PATH;
}

/**
 * Merge a list of observed counterparty observations into the register.
 * Each observation is a small object describing what was seen today. The
 * function preserves any MLRO-edited fields (status, risk_rating,
 * mlro_notes, alias_of, jurisdiction when already set) and only updates
 * automatic fields.
 *
 * Observations shape:
 *   [
 *     {
 *       name: string,              // counterparty name from task
 *       entity: string,             // HSV2 programme name
 *       typologies: string[],       // zero or more typology keywords
 *       taskGid: string,            // source task GID
 *       jurisdiction: string|null,  // optional
 *       today: "YYYY-MM-DD"
 *     },
 *     ...
 *   ]
 *
 * Returns { added, updated, crossEntityHits } where crossEntityHits is an
 * array of register entries that now appear in more than one programme.
 */
export async function upsertFromTasks(observations) {
  const register = await readRegister();
  let added = 0;
  let updated = 0;

  for (const obs of observations) {
    if (!obs?.name) continue;
    const key = obs.name.toLowerCase().trim();
    const existing = register.get(key);
    if (!existing) {
      register.set(key, {
        first_seen: obs.today,
        last_seen: obs.today,
        counterparty_name: obs.name,
        alias_of: "",
        jurisdiction: obs.jurisdiction ?? "",
        entities_touching: obs.entity,
        typologies: (obs.typologies ?? []).join("|"),
        status: "open",
        risk_rating: "medium",
        mlro_notes: "",
        last_task_gid: obs.taskGid ?? "",
      });
      added++;
      continue;
    }

    // Preserve MLRO-edited fields. Only touch the automatic ones.
    existing.last_seen = obs.today;
    if (!existing.first_seen) existing.first_seen = obs.today;
    if (!existing.jurisdiction && obs.jurisdiction) existing.jurisdiction = obs.jurisdiction;

    const entities = new Set((existing.entities_touching ?? "").split("|").filter(Boolean));
    entities.add(obs.entity);
    existing.entities_touching = [...entities].join("|");

    const typologies = new Set((existing.typologies ?? "").split("|").filter(Boolean));
    for (const t of obs.typologies ?? []) typologies.add(t);
    existing.typologies = [...typologies].join("|");

    if (obs.taskGid) existing.last_task_gid = obs.taskGid;
    updated++;
  }

  const crossEntityHits = [...register.values()].filter((e) => {
    const entities = (e.entities_touching ?? "").split("|").filter(Boolean);
    return entities.length >= 2;
  });

  await writeRegister(register);
  return { added, updated, crossEntityHits, path: REGISTER_PATH };
}

/* ─── CLI entry point ───────────────────────────────────────────────────── */

// Running this file directly prints a short summary of the current register.
if (import.meta.url === `file://${process.argv[1]}`) {
  readRegister().then((map) => {
    console.log(`Counterparty register at ${REGISTER_PATH}`);
    console.log(`Total entries: ${map.size}`);
    const critical = [...map.values()].filter((e) => e.risk_rating === "critical");
    const high = [...map.values()].filter((e) => e.risk_rating === "high");
    const crossEntity = [...map.values()].filter(
      (e) => (e.entities_touching ?? "").split("|").filter(Boolean).length >= 2,
    );
    console.log(`Critical:     ${critical.length}`);
    console.log(`High:         ${high.length}`);
    console.log(`Cross-entity: ${crossEntity.length}`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
