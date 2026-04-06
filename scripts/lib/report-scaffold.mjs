/**
 * Shared report-scaffold helpers for the [Reporting Entity] compliance
 * automation. Extracted to cut boilerplate in the operational log and
 * long-tail report scripts. Every existing production script continues
 * to work unchanged; new scripts may opt in by importing from here.
 *
 * This file has no side effects on import and no top-level environment
 * reads — callers pass env values explicitly so the module is safe to
 * re-import from multiple scripts.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SYSTEM_PROMPT,
  STYLE_REMINDER,
  CONFIRMED_REFERENCES,
  validateOutput,
} from "../regulatory-context.mjs";

export { SYSTEM_PROMPT, STYLE_REMINDER, CONFIRMED_REFERENCES, validateOutput };

/* ─── Environment config ────────────────────────────────────────────────── */

export function readCommonEnv(extra = {}) {
  const env = {
    ASANA_TOKEN: process.env.ASANA_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ASANA_WORKSPACE_ID: process.env.ASANA_WORKSPACE_ID,
    ASANA_TEAM_ID: process.env.ASANA_TEAM_ID,
    CLAUDE_MODEL: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
    PINNED_TASK_NAME: process.env.PINNED_TASK_NAME ?? "📌 Today's Priorities",
    PORTFOLIO_PROJECT_NAME: process.env.PORTFOLIO_PROJECT_NAME ?? "SCREENINGS",
    DRY_RUN: process.env.DRY_RUN === "true",
    ...extra,
  };
  // ASANA_TOKEN and ASANA_WORKSPACE_ID are always required.
  // ANTHROPIC_API_KEY is only required for scripts that call Claude;
  // deterministic scripts (sanctions-screening, cdd-refresh-tracker,
  // deadline-calendar, regulatory-watcher, task-pack, ops-logs, etc.)
  // never call Claude and pass { requireClaude: false } in extra.
  const requireClaude = env.requireClaude !== false;
  const required = ["ASANA_TOKEN", "ASANA_WORKSPACE_ID"];
  if (requireClaude) required.push("ANTHROPIC_API_KEY");
  for (const key of required) {
    if (!env[key]) {
      console.error(`❌ Missing required env var: ${key}`);
      process.exit(1);
    }
  }
  return env;
}

/* ─── Asana client factory ──────────────────────────────────────────────── */

export function createAsanaClient(env) {
  async function asana(reqPath, init = {}) {
    const res = await fetch(`https://app.asana.com/api/1.0${reqPath}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.ASANA_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Asana ${res.status} ${res.statusText} on ${reqPath}: ${body}`);
    }
    return res.json();
  }

  async function listProjects() {
    const params = new URLSearchParams({
      workspace: env.ASANA_WORKSPACE_ID,
      archived: "false",
      limit: "100",
      opt_fields: "gid,name,archived",
    });
    if (env.ASANA_TEAM_ID) params.set("team", env.ASANA_TEAM_ID);
    const all = [];
    let offset;
    do {
      if (offset) params.set("offset", offset);
      const page = await asana(`/projects?${params}`);
      all.push(...page.data);
      offset = page.next_page?.offset;
    } while (offset);
    return all.filter((p) => !p.archived);
  }

  async function listProjectTasks(projectGid, extraParams = {}) {
    const params = new URLSearchParams({
      project: projectGid,
      limit: "100",
      opt_fields:
        "gid,name,notes,due_on,due_at,completed,completed_at,modified_at,created_at,assignee.name,permalink_url,tags.name",
      ...extraParams,
    });
    const all = [];
    let offset;
    do {
      if (offset) params.set("offset", offset);
      const page = await asana(`/tasks?${params}`);
      all.push(...page.data);
      offset = page.next_page?.offset;
    } while (offset);
    return all;
  }

  async function postComment(taskGid, text) {
    return asana(`/tasks/${taskGid}/stories`, {
      method: "POST",
      body: JSON.stringify({ data: { text } }),
    });
  }

  /**
   * Upload a file as an attachment on an Asana task.
   * `fileBuffer` must be a Node Buffer or Uint8Array.
   * `fileName` is the name the attachment will carry inside Asana.
   * `mimeType` defaults to application/octet-stream.
   */
  async function attachFile(taskGid, fileBuffer, fileName, mimeType = "application/octet-stream") {
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    form.append("parent", taskGid);
    form.append("file", blob, fileName);
    const res = await fetch(`https://app.asana.com/api/1.0/tasks/${taskGid}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.ASANA_TOKEN}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Asana attachment upload ${res.status} ${res.statusText}: ${body}`);
    }
    return res.json();
  }

  async function findPortfolioPinned(projects) {
    for (const project of projects) {
      if (!project.name.toLowerCase().includes(env.PORTFOLIO_PROJECT_NAME.toLowerCase())) continue;
      const page = await asana(
        `/tasks?${new URLSearchParams({
          project: project.gid,
          completed_since: "now",
          limit: "100",
          opt_fields: "gid,name",
        })}`,
      );
      const pinned = page.data.find((t) => t.name.trim() === env.PINNED_TASK_NAME.trim());
      if (pinned) return { projectName: project.name, taskGid: pinned.gid };
    }
    return null;
  }

  return { asana, listProjects, listProjectTasks, postComment, attachFile, findPortfolioPinned };
}

/* ─── Claude caller factory ─────────────────────────────────────────────── */

export function createClaudeCaller(env) {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function callClaude(prompt, { label = "claude", maxTokens = 3000 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const msg = await anthropic.messages.create({
          model: env.CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        });
        const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (!text) throw new Error("Claude returned an empty response");
        const check = validateOutput(text);
        if (!check.ok) {
          console.warn(`  ${label} attempt ${attempt}/4 failed style validation:`);
          for (const p of check.problems) console.warn(`    - ${p}`);
          if (attempt < 4) {
            await sleep(2000);
            continue;
          }
        }
        return text;
      } catch (err) {
        lastErr = err;
        const status = err?.status ?? err?.response?.status;
        if (status && status >= 400 && status < 500 && status !== 429) break;
        if (attempt >= 4) break;
        const retryAfter = Number.parseInt(
          err?.headers?.["retry-after"] ?? err?.response?.headers?.get?.("retry-after"),
          10,
        );
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 + 1000 : 30000 * attempt;
        console.warn(`  ${label} attempt ${attempt}/4 failed, retrying in ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
      }
    }
    throw lastErr;
  }

  return { anthropic, callClaude };
}

/* ─── Document control and sign-off assembly ────────────────────────────── */

/**
 * Build the standard document control block used across every HSV2
 * artefact. Pass any subset of the named fields; missing fields are
 * omitted from the output.
 */
export function buildDocControl(fields) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;
  const retentionYears = CONFIRMED_REFERENCES.recordRetention.years;
  const primaryLaw = CONFIRMED_REFERENCES.primaryLaw.title.split(" on ")[0];
  const today = fields.preparedOn ?? new Date().toISOString().slice(0, 10);

  const lines = [
    "=============================================================================",
    entity.legalName.toUpperCase(),
    fields.title.toUpperCase(),
    ...(fields.subtitle ? [fields.subtitle] : []),
    "=============================================================================",
    "",
    `Document reference:   ${fields.reference}`,
    `Classification:       ${fields.classification ?? "Confidential. For MLRO review only."}`,
    `Version:              ${fields.version ?? "1.0"}`,
    `Prepared by:          Compliance function, ${entity.legalName}`,
    `Prepared on:          ${today}${fields.timeOfDay ? `, ${fields.timeOfDay} Asia/Dubai` : ""}`,
    `Addressee:            ${fields.addressee ?? `${mlro.name}, ${mlro.title}`}`,
    ...(fields.coverage ? [`Coverage:             ${fields.coverage}`] : []),
    `Retention period:     ${retentionYears} years, in accordance with the applicable provision`,
    `                      of ${primaryLaw}.`,
  ];
  return lines.join("\n");
}

/**
 * Build the standard sign-off block. The `type` argument selects between
 * an "awaiting MLRO review" footer (default) and a "issued by MLRO"
 * footer for documents the MLRO signs herself.
 */
export function buildSignOff({ type = "awaiting" } = {}) {
  const entity = CONFIRMED_REFERENCES.entity;
  const mlro = CONFIRMED_REFERENCES.mlro;

  if (type === "issued") {
    return `-----------------------------------------------------------------------------
DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Issued by:     ${mlro.name}, Money Laundering Reporting Officer
Signature:     __________________________
Date:          __________________________
Acknowledged:  __________________________

[End of document]`;
  }

  return `-----------------------------------------------------------------------------
DOCUMENT SIGN-OFF
-----------------------------------------------------------------------------

Prepared by:   Compliance function, ${entity.legalName}
Reviewed by:   [awaiting MLRO review]
Approved by:   [awaiting MLRO approval]

For review by the MLRO, ${mlro.name}.

[End of document]`;
}

/**
 * Wrap a body string with the standard document control block and
 * sign-off. This is the common path for almost every scheduled report.
 */
export function wrapDocument({
  title,
  subtitle,
  reference,
  classification,
  version,
  timeOfDay,
  addressee,
  coverage,
  preparedOn,
  body,
  signOffType = "awaiting",
}) {
  const header = buildDocControl({
    title,
    subtitle,
    reference,
    classification,
    version,
    timeOfDay,
    addressee,
    coverage,
    preparedOn,
  });
  const footer = buildSignOff({ type: signOffType });
  return `${header}\n\n${body}\n\n${footer}`;
}

/* ─── CSV helpers (for the counterparty register and other CSV artefacts) ─ */

export function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(current); current = ""; }
    else current += ch;
  }
  out.push(current);
  return out;
}

export async function readCounterpartyRegister() {
  try {
    const text = await readFile(
      path.resolve(process.cwd(), "..", "history", "registers", "counterparties.csv"),
      "utf8",
    );
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length <= 1) return [];
    const header = parseCsvLine(lines[0]);
    return lines.slice(1).map((l) => {
      const cells = parseCsvLine(l);
      const obj = {};
      header.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
      return obj;
    });
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`register read error: ${err.message}`);
    return [];
  }
}

/* ─── Table formatter for text-format log artefacts ─────────────────────── */

/**
 * Render an array of row objects as a fixed-width text table. Used by the
 * data-driven operational logs where Claude narrative is unnecessary or
 * undesirable.
 */
export function renderTable(rows, columns) {
  if (rows.length === 0) return "(no rows)";
  const widths = columns.map((c) => {
    const headerLen = c.header.length;
    const maxCellLen = rows.reduce((max, r) => {
      const v = String(r[c.key] ?? "");
      return Math.max(max, v.length);
    }, 0);
    return Math.min(Math.max(headerLen, maxCellLen), c.max ?? 60);
  });
  const sep = columns.map((_, i) => "-".repeat(widths[i])).join("  ");
  const header = columns.map((c, i) => c.header.padEnd(widths[i])).join("  ");
  const body = rows
    .map((r) =>
      columns
        .map((c, i) => {
          let v = String(r[c.key] ?? "");
          if (v.length > widths[i]) v = v.slice(0, widths[i] - 1) + "…";
          return v.padEnd(widths[i]);
        })
        .join("  "),
    )
    .join("\n");
  return `${header}\n${sep}\n${body}`;
}

/* ─── Keyword classifier used by multiple operational logs ──────────────── */

export const TYPOLOGY_KEYWORDS = Object.freeze({
  // Sanctions and targeted financial sanctions
  sanctions: ["sanction", "unsc", "consolidated list", "local terrorist", "eocn", "embargo", "designated person", "asset freeze", "travel ban", "un listed"],
  // Politically Exposed Persons
  pep: ["pep ", "politically exposed", "pep_", "pep-", "public office", "senior official", "government minister", "state-owned", "diplomatic"],
  // Cash-intensive and structuring indicators (DPMS-specific)
  cash: ["cash", "aed ", "bank notes", "walk-in", "walkin", "cash deposit", "cash payment", "cash settlement", "structured", "structuring", "split transaction", "just below threshold"],
  // Cross-border and trade-based patterns
  crossBorder: ["cross-border", "cross border", "smuggling", "trade-based", "export", "import", "free zone", "freezone", "re-export", "transit", "transshipment", "hawala", "informal value transfer"],
  // Recycled gold and precious metals specific
  recycledGold: ["recycled gold", "scrap", "jewellery scrap", "jewelry scrap", "old gold", "melted gold", "unrefined", "unknown origin", "undocumented source", "conflict mineral", "artisanal", "small-scale mining"],
  // DPMSR trigger conditions
  dpmsrTrigger: ["dpmsr", "linked cash", "rolling 30 day", "aggregation", "threshold", "cash transaction report", "15000", "55000", "single transaction"],
  // CDD and EDD gaps
  cddGap: ["cdd exemption", "refused cdd", "declined cdd", "missing cdd", "cdd refresh", "cdd slipped", "expired id", "expired passport", "incomplete kyc", "beneficial owner unknown", "nominee", "shell company", "complex structure"],
  // Stalled or blocked items
  stalled: ["stalled", "no response", "overdue", "blocked", "unresolved", "pending response", "awaiting documentation"],
  // Training and awareness
  training: ["training", "refresher", "attendance", "module delivered", "e-learning", "awareness session", "competency"],
  // Escalation and MLRO items
  escalation: ["escalated", "escalation", "mlro review", "awaiting mlro", "urgent", "immediate attention", "regulatory deadline"],
  // Invoice and valuation fraud (DPMS-specific)
  invoiceFraud: ["over-invoiced", "under-invoiced", "mispriced", "inflated value", "deflated value", "fake invoice", "fictitious", "valuation discrepancy", "assay mismatch", "carat mismatch"],
  // Third-party and layering patterns
  thirdParty: ["third party", "third-party", "intermediary", "broker", "agent payment", "paying on behalf", "receiving on behalf", "layering", "round-tripping", "back-to-back"],
  // Geographic risk indicators
  highRiskJurisdiction: ["high-risk jurisdiction", "fatf grey list", "grey-listed", "iran", "north korea", "dprk", "myanmar", "somalia", "yemen", "syria", "afghanistan", "non-cooperative"],
  // Precious stones specific
  preciousStones: ["diamond", "emerald", "ruby", "sapphire", "gemstone", "precious stone", "kimberley", "conflict diamond", "blood diamond", "rough diamond", "polished stone"],
  // Unusual transaction patterns
  unusualPattern: ["unusual", "no economic rationale", "no apparent purpose", "inconsistent with profile", "rapid movement", "dormant then active", "sudden spike", "atypical", "out of character"],
});

/**
 * Given a task, return an object mapping typology keys to match counts.
 * Used by the operational log scripts to classify tasks without needing
 * a Claude call.
 */
export function classifyTask(task) {
  const haystack = `${task.name ?? ""}\n${(task.notes ?? "").slice(0, 1500)}`.toLowerCase();
  const result = {};
  for (const [key, words] of Object.entries(TYPOLOGY_KEYWORDS)) {
    let count = 0;
    for (const w of words) {
      if (haystack.includes(w)) count++;
    }
    result[key] = count;
  }
  return result;
}

/* ─── Shared archive writer notification bridge ─────────────────────────── */

export async function tryArchive(writeFn, label) {
  try {
    const p = await writeFn();
    console.log(`✓ archived ${label}`);
    return p;
  } catch (err) {
    console.warn(`⚠  archive failed for ${label}: ${err.message}`);
    return null;
  }
}
