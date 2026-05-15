#!/usr/bin/env node
// MoonDB project setup for Hawkeye Sterling.
// Run once after obtaining your MoonDB management key:
//   node scripts/moondb-setup.mjs
//
// Reads MOONDB_API_KEY from env (mk_...) and optionally MOONDB_PROJECT_ID
// if you already created the project and just want to re-apply the schema.
// On success writes MOONDB_PROJECT_ID, MOONDB_ADMIN_KEY, MOONDB_PUBLIC_KEY
// to .env (or prints them if .env is absent).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const API_KEY = process.env.MOONDB_API_KEY;
if (!API_KEY || !API_KEY.startsWith("mk_")) {
  console.error(
    "Set MOONDB_API_KEY=mk_... in your environment before running this script.\n" +
      "Find it at https://moondb.ai/dashboard → Account → Regenerate key."
  );
  process.exit(1);
}

const BASE = "https://moondb.ai";

async function api(method, path, body, adminKey) {
  const headers = { "Content-Type": "application/json" };
  if (adminKey) {
    headers["X-Admin-Key"] = adminKey;
  } else {
    headers["X-API-Key"] = API_KEY;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    console.error(`[moondb] ${method} ${path} → ${res.status}`, json);
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json;
}

// ─── Schema ────────────────────────────────────────────────────────────────

const SCHEMA = {
  tables: {
    // Portal auth — MLRO / compliance officers / analysts
    operators: {
      auth_table: true,
      verify_email: false,
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "owner",
        delete: "authenticated",
      },
      owner_field: "id",
      columns: {
        display_name: "string required",
        role: {
          type: "enum",
          values: ["mlro", "co", "analyst", "admin", "viewer"],
          default: "analyst",
        },
        tenant_id: "string required index",
        active: "bool default true",
        last_login_at: "datetime",
      },
    },

    // Screened entities (individuals, corporates, vessels, wallets, aircraft)
    subjects: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        record_id: "string required unique",
        name: "string required index",
        aliases: "json",
        entity_type: {
          type: "enum",
          values: ["individual", "organisation", "vessel", "aircraft", "other"],
          required: true,
        },
        subject_type: "string",
        country: "string",
        jurisdiction: "string index",
        nationality: "string",
        date_of_birth: "date",
        date_of_incorporation: "date",
        identifiers: "json",
        risk_score: { type: "int", min: 0, max: 100, default: 0 },
        status: {
          type: "enum",
          values: ["active", "frozen", "cleared"],
          default: "active",
        },
        cdd_posture: {
          type: "enum",
          values: ["CDD", "EDD", "SDD"],
          default: "CDD",
        },
        list_coverage: "json",
        exposure_aed: "string",
        sla_notify: "string",
        pep_tier: "string",
        pep_rationale: "text",
        notes: "text",
        risk_category: "string",
        snoozed_until: "datetime",
        snooze_reason: "text",
        assigned_to: "string",
        wallet_addresses: "json",
        vessel_imo: "string",
        vessel_mmsi: "string",
        aircraft_tail: "string",
        opened_at: "datetime required",
        badge: "string",
        badge_tone: {
          type: "enum",
          values: ["violet", "orange", "dashed"],
          default: "violet",
        },
      },
    },

    // Extended per-subject CDD data (UBO chain, EDD checklist, evidence items)
    subject_details: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "cascade",
          required: true,
        },
        cdd_review_date: "date",
        edd_checklist: "json",
        ubo_entries: "json",
        evidence_items: "json",
        timeline_events: "json",
        hit_resolutions: "json",
      },
      unique: [["tenant_id", "subject_id"]],
    },

    // Each screening run (first-screening or daily-monitoring)
    screening_runs: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "cascade",
          required: true,
        },
        mode: {
          type: "enum",
          values: ["first_screening", "daily_monitoring", "batch"],
          required: true,
        },
        top_score: { type: "int", min: 0, max: 100, default: 0 },
        severity: {
          type: "enum",
          values: ["clear", "low", "medium", "high", "critical"],
          default: "clear",
        },
        lists_checked: "json",
        hit_count: { type: "int", default: 0 },
        reasoning_chain: "json",
        cognitive_depth: "json",
        asana_task_url: "string",
        operator_id: "string",
        ran_at: "datetime required",
      },
    },

    // Individual sanction / PEP / adverse-media hits from a screening run
    sanction_hits: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        run_id: {
          type: "ref",
          table: "screening_runs",
          on_delete: "cascade",
          required: true,
        },
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "cascade",
          required: true,
        },
        list_id: "string required",
        list_ref: "string required",
        candidate_name: "string required",
        match_score: { type: "int", min: 0, max: 100, required: true },
        match_method: "string",
        programs: "json",
        flagged: "bool default false",
      },
    },

    // Analyst dispositions on individual hits
    hit_resolutions: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        hit_id: {
          type: "ref",
          table: "sanction_hits",
          on_delete: "cascade",
          required: true,
        },
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "cascade",
          required: true,
        },
        verdict: {
          type: "enum",
          values: [
            "false_positive",
            "possible_match",
            "confirmed_positive",
            "unspecified",
          ],
          required: true,
        },
        reason_category: {
          type: "enum",
          values: [
            "no_match",
            "partial_match",
            "full_match",
            "name_only",
            "duplicate_record",
            "verified_negative",
            "data_quality_issue",
            "stale_listing",
            "other",
          ],
          default: "other",
        },
        risk_level: {
          type: "enum",
          values: ["high", "medium", "low", "unknown"],
          default: "unknown",
        },
        reason: "text required",
        resolved_by: "string",
        enrolled_in_monitoring: "bool default false",
      },
    },

    // Investigation cases
    cases: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "restrict",
          required: true,
        },
        badge: "string",
        badge_tone: {
          type: "enum",
          values: ["violet", "orange", "green"],
          default: "violet",
        },
        status: {
          type: "enum",
          values: ["active", "review", "reported", "closed"],
          default: "active",
        },
        evidence: "json",
        timeline: "json",
        go_aml_reference: "string",
        mlro_disposition: "text",
        asana_task_url: "string",
        screening_snapshot: "json",
        reported_at: "datetime",
        opened_by: "string",
      },
    },

    // Four-eyes separation-of-duties approval queue
    four_eyes_queue: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "cascade",
          required: true,
        },
        subject_name: "string required",
        action: {
          type: "enum",
          values: ["str", "freeze", "decline", "edd-uplift", "escalate"],
          required: true,
        },
        initiated_by: "string required",
        reason: "text required",
        context_url: "string",
        status: {
          type: "enum",
          values: ["pending", "approved", "rejected", "expired"],
          default: "pending",
        },
        approved_by: "string",
        approved_at: "datetime",
        rejected_by: "string",
        rejected_at: "datetime",
        rejection_reason: "text",
      },
    },

    // Periodic CDD review cadence records (FDL 10/2025 Art.11 + FATF R.10)
    cdd_reviews: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "cascade",
          required: true,
        },
        tier: {
          type: "enum",
          values: ["high", "medium", "standard"],
          default: "standard",
        },
        review_date: "date required",
        next_review_date: "date required",
        days_overdue: { type: "int", default: 0 },
        status: {
          type: "enum",
          values: ["due", "overdue", "completed", "in_progress"],
          default: "due",
        },
        notes: "text",
        outcome: {
          type: "enum",
          values: ["adequate", "marginal", "inadequate"],
        },
        adequacy_score: { type: "int", min: 0, max: 100 },
        enhanced_measures_required: "bool default false",
        gaps: "json",
        recommended_actions: "json",
        case_id: "string",
      },
    },

    // API key registry (hashed — plaintext never stored)
    api_keys: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        key_hash: "string required unique",
        name: "string required",
        tier: "string required",
        email: "string required",
        role: "string",
        last_used_at: "datetime",
        revoked_at: "datetime",
        usage_monthly: { type: "int", default: 0 },
        usage_reset_at: "datetime required",
        version: { type: "int", default: 0 },
      },
    },

    // Tamper-evident audit chain (FDL 10/2025 Art.24 — 10-year retention)
    audit_entries: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        subject_id: "string index",
        action: "string required index",
        actor: "string required",
        detail: "json",
        hmac: "string",
        prev_hmac: "string",
        sequence: { type: "int", required: true },
      },
    },

    // Analyst saved search presets
    saved_searches: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        label: "string required",
        query: "string",
        filter_key: "string",
        status_filter: "string",
        min_risk: "int",
        pep_tiers: "json",
        jurisdictions: "json",
        opened_within_h: "int",
        created_by: "string",
      },
    },

    // Screening history snapshots (bounded ring buffer per subject)
    screening_history: {
      access: {
        read: "authenticated",
        create: "authenticated",
        update: "authenticated",
        delete: "authenticated",
      },
      columns: {
        tenant_id: "string required index",
        subject_id: {
          type: "ref",
          table: "subjects",
          on_delete: "cascade",
          required: true,
        },
        top_score: { type: "int", min: 0, max: 100, required: true },
        severity: {
          type: "enum",
          values: ["clear", "low", "medium", "high", "critical"],
          required: true,
        },
        lists: "json",
        hits: "json",
        confidence_band: "int",
        captured_at: "datetime required",
      },
    },
  },
};

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let projectId = process.env.MOONDB_PROJECT_ID;
  let adminKey = process.env.MOONDB_ADMIN_KEY;
  let publicKey = process.env.MOONDB_PUBLIC_KEY;

  // Step 1 — create project (skip if already have IDs)
  if (!projectId) {
    console.log("Creating MoonDB project 'hawkeye-sterling'…");
    const res = await api("POST", "/v1/projects", { name: "hawkeye-sterling" });
    projectId = res.data.project_id;
    adminKey = res.data.admin_key;
    publicKey = res.data.public_key;
    console.log(`  project_id  : ${projectId}`);
    console.log(`  admin_key   : ${adminKey}`);
    console.log(`  public_key  : ${publicKey}`);
  } else {
    console.log(`Using existing project: ${projectId}`);
  }

  // Step 2 — apply schema
  console.log("\nApplying schema…");
  const schemaRes = await api(
    "PUT",
    `/p/${projectId}/v1/schema`,
    SCHEMA,
    adminKey
  );
  console.log("  Schema applied:", JSON.stringify(schemaRes, null, 2).slice(0, 400));

  // Step 3 — fetch llm-context
  console.log("\nFetching llm-context…");
  const ctxRes = await fetch(
    `https://moondb.ai/p/${projectId}/v1/llm-context`,
    { headers: { "X-Admin-Key": adminKey } }
  );
  const llmCtx = await ctxRes.text();

  // Step 4 — persist credentials to .env
  const envPath = resolve(process.cwd(), ".env");
  const envVars = [
    `MOONDB_PROJECT_ID=${projectId}`,
    `MOONDB_ADMIN_KEY=${adminKey}`,
    `MOONDB_PUBLIC_KEY=${publicKey}`,
  ];

  if (existsSync(envPath)) {
    let current = readFileSync(envPath, "utf8");
    for (const line of envVars) {
      const key = line.split("=")[0];
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(current)) {
        current = current.replace(re, line);
      } else {
        current += `\n${line}`;
      }
    }
    writeFileSync(envPath, current);
    console.log("\nCredentials written to .env");
  } else {
    console.log("\n.env not found — set these environment variables manually:");
    for (const line of envVars) console.log("  " + line);
  }

  // Step 5 — write llm-context to a reference file
  const ctxPath = resolve(process.cwd(), "docs/moondb-llm-context.md");
  writeFileSync(ctxPath, llmCtx);
  console.log(`\nMoonDB API reference written to docs/moondb-llm-context.md`);
  console.log("\nSetup complete.");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
