// MoonDB REST client for Hawkeye Sterling — server-side only.
// All operations use the admin key (MOONDB_ADMIN_KEY) — never expose it client-side.
//
// Usage:
//   import { db } from "@/lib/server/moondb";
//   const subjects = await db.list("subjects", { tenant_id: "portal" });
//   const subject  = await db.get("subjects", id);
//   const created  = await db.create("subjects", { ...fields });
//   await db.update("subjects", id, { risk_score: 75 });
//   await db.delete("subjects", id);

export type FilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "like" | "in" | "is_null" | "not_null";

export interface ListOptions {
  /** Simple equality shorthand: { tenant_id: "portal" } → tenant_id=eq.portal */
  [field: string]: string | number | boolean | undefined | FilterSpec | FilterSpec[];
}

export interface FilterSpec {
  op: FilterOp;
  value: string | number | boolean | (string | number)[];
}

export interface ListMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ListResult<T> {
  data: T[];
  meta: ListMeta;
}

export interface MoonDBError {
  code: string;
  message: string;
  suggestion?: string;
}

export class MoonDBClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: MoonDBError
  ) {
    super(`MoonDB ${status}: ${error.message}${error.suggestion ? ` — ${error.suggestion}` : ""}`);
    this.name = "MoonDBClientError";
  }
}

function moondbUrl(): string {
  const id = process.env["MOONDB_PROJECT_ID"];
  if (!id) throw new Error("MOONDB_PROJECT_ID is not set");
  return `https://moondb.ai/p/${id}`;
}

function adminHeaders(): Record<string, string> {
  const key = process.env["MOONDB_ADMIN_KEY"];
  if (!key) throw new Error("MOONDB_ADMIN_KEY is not set");
  return {
    "Content-Type": "application/json",
    "X-Admin-Key": key,
  };
}

function buildQuery(
  filters: Record<string, string | number | boolean | FilterSpec | FilterSpec[] | undefined>,
  extra?: { sort?: string; limit?: number; offset?: number; select?: string; include?: string }
): string {
  const params = new URLSearchParams();

  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value) && "op" in value) {
      const spec = value as FilterSpec;
      params.set(field, `${spec.op}.${Array.isArray(spec.value) ? spec.value.join(",") : spec.value}`);
    } else if (Array.isArray(value)) {
      // Array of FilterSpec
      for (const spec of value as FilterSpec[]) {
        params.append(field, `${spec.op}.${Array.isArray(spec.value) ? spec.value.join(",") : spec.value}`);
      }
    } else {
      params.set(field, `eq.${value}`);
    }
  }

  if (extra?.sort) params.set("sort", extra.sort);
  if (extra?.limit !== undefined) params.set("limit", String(extra.limit));
  if (extra?.offset !== undefined) params.set("offset", String(extra.offset));
  if (extra?.select) params.set("select", extra.select);
  if (extra?.include) params.set("include", extra.include);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${moondbUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: adminHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await res.text();
  let json: { data?: T; error?: MoonDBError };
  try {
    json = JSON.parse(text);
  } catch {
    throw new MoonDBClientError(res.status, {
      code: "parse_error",
      message: `Non-JSON response: ${text.slice(0, 200)}`,
    });
  }

  if (!res.ok) {
    throw new MoonDBClientError(
      res.status,
      json.error ?? { code: "unknown", message: `HTTP ${res.status}` }
    );
  }

  return json.data as T;
}

// ─── Typed table interfaces ─────────────────────────────────────────────────

export interface OperatorRow {
  id: string;
  email: string;
  display_name: string;
  role: "mlro" | "co" | "analyst" | "admin" | "viewer";
  tenant_id: string;
  active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SubjectRow {
  id: string;
  tenant_id: string;
  record_id: string;
  name: string;
  aliases?: unknown;
  entity_type: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  subject_type?: string;
  country?: string;
  jurisdiction?: string;
  nationality?: string;
  date_of_birth?: string;
  date_of_incorporation?: string;
  identifiers?: unknown;
  risk_score: number;
  status: "active" | "frozen" | "cleared";
  cdd_posture: "CDD" | "EDD" | "SDD";
  list_coverage?: unknown;
  exposure_aed?: string;
  sla_notify?: string;
  pep_tier?: string;
  pep_rationale?: string;
  notes?: string;
  risk_category?: string;
  snoozed_until?: string;
  snooze_reason?: string;
  assigned_to?: string;
  wallet_addresses?: unknown;
  vessel_imo?: string;
  vessel_mmsi?: string;
  aircraft_tail?: string;
  opened_at: string;
  badge?: string;
  badge_tone: "violet" | "orange" | "dashed";
  created_at: string;
  updated_at: string;
}

export interface ScreeningRunRow {
  id: string;
  tenant_id: string;
  subject_id: string;
  mode: "first_screening" | "daily_monitoring" | "batch";
  top_score: number;
  severity: "clear" | "low" | "medium" | "high" | "critical";
  lists_checked?: unknown;
  hit_count: number;
  reasoning_chain?: unknown;
  cognitive_depth?: unknown;
  asana_task_url?: string;
  operator_id?: string;
  ran_at: string;
  created_at: string;
  updated_at: string;
}

export interface SanctionHitRow {
  id: string;
  tenant_id: string;
  run_id: string;
  subject_id: string;
  list_id: string;
  list_ref: string;
  candidate_name: string;
  match_score: number;
  match_method?: string;
  programs?: unknown;
  flagged: boolean;
  created_at: string;
  updated_at: string;
}

export interface HitResolutionRow {
  id: string;
  tenant_id: string;
  hit_id: string;
  subject_id: string;
  verdict: "false_positive" | "possible_match" | "confirmed_positive" | "unspecified";
  reason_category: string;
  risk_level: "high" | "medium" | "low" | "unknown";
  reason: string;
  resolved_by?: string;
  enrolled_in_monitoring: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaseRow {
  id: string;
  tenant_id: string;
  subject_id: string;
  badge?: string;
  badge_tone: "violet" | "orange" | "green";
  status: "active" | "review" | "reported" | "closed";
  evidence?: unknown;
  timeline?: unknown;
  go_aml_reference?: string;
  mlro_disposition?: string;
  asana_task_url?: string;
  screening_snapshot?: unknown;
  reported_at?: string;
  opened_by?: string;
  created_at: string;
  updated_at: string;
}

export interface FourEyesRow {
  id: string;
  tenant_id: string;
  subject_id: string;
  subject_name: string;
  action: "str" | "freeze" | "decline" | "edd-uplift" | "escalate";
  initiated_by: string;
  reason: string;
  context_url?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface CddReviewRow {
  id: string;
  tenant_id: string;
  subject_id: string;
  tier: "high" | "medium" | "standard";
  review_date: string;
  next_review_date: string;
  days_overdue: number;
  status: "due" | "overdue" | "completed" | "in_progress";
  notes?: string;
  outcome?: "adequate" | "marginal" | "inadequate";
  adequacy_score?: number;
  enhanced_measures_required: boolean;
  gaps?: unknown;
  recommended_actions?: unknown;
  case_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;
  name: string;
  tier: string;
  email: string;
  role?: string;
  last_used_at?: string;
  revoked_at?: string;
  usage_monthly: number;
  usage_reset_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AuditEntryRow {
  id: string;
  tenant_id: string;
  subject_id?: string;
  action: string;
  actor: string;
  detail?: unknown;
  hmac?: string;
  prev_hmac?: string;
  sequence: number;
  created_at: string;
  updated_at: string;
}

export interface SavedSearchRow {
  id: string;
  tenant_id: string;
  label: string;
  query?: string;
  filter_key?: string;
  status_filter?: string;
  min_risk?: number;
  pep_tiers?: unknown;
  jurisdictions?: unknown;
  opened_within_h?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ScreeningHistoryRow {
  id: string;
  tenant_id: string;
  subject_id: string;
  top_score: number;
  severity: "clear" | "low" | "medium" | "high" | "critical";
  lists?: unknown;
  hits?: unknown;
  confidence_band?: number;
  captured_at: string;
  created_at: string;
  updated_at: string;
}

// Table → row type mapping
export interface TableRowMap {
  operators: OperatorRow;
  subjects: SubjectRow;
  subject_details: Record<string, unknown>;
  screening_runs: ScreeningRunRow;
  sanction_hits: SanctionHitRow;
  hit_resolutions: HitResolutionRow;
  cases: CaseRow;
  four_eyes_queue: FourEyesRow;
  cdd_reviews: CddReviewRow;
  api_keys: ApiKeyRow;
  audit_entries: AuditEntryRow;
  saved_searches: SavedSearchRow;
  screening_history: ScreeningHistoryRow;
}

export type TableName = keyof TableRowMap;

// ─── Client ─────────────────────────────────────────────────────────────────

export interface QueryOptions {
  sort?: string;
  limit?: number;
  offset?: number;
  select?: string;
  include?: string;
  filters?: Record<string, string | number | boolean | FilterSpec | FilterSpec[] | undefined>;
}

const db = {
  /** List rows from a table. Simple equality filters can be passed directly. */
  async list<T extends TableName>(
    table: T,
    filters: Partial<Record<string, string | number | boolean | FilterSpec | FilterSpec[]>> = {},
    opts: Omit<QueryOptions, "filters"> = {}
  ): Promise<ListResult<TableRowMap[T]>> {
    const qs = buildQuery(filters, opts);
    return request<ListResult<TableRowMap[T]>>("GET", `/api/${table}${qs}`);
  },

  /** Fetch a single row by ID. Returns null on 404. */
  async get<T extends TableName>(
    table: T,
    id: string
  ): Promise<TableRowMap[T] | null> {
    try {
      return await request<TableRowMap[T]>("GET", `/api/${table}/${id}`);
    } catch (err) {
      if (err instanceof MoonDBClientError && err.status === 404) return null;
      throw err;
    }
  },

  /** Create a new row. Returns the created row with server-assigned id + timestamps. */
  async create<T extends TableName>(
    table: T,
    body: Omit<Partial<TableRowMap[T]>, "id" | "created_at" | "updated_at">
  ): Promise<TableRowMap[T]> {
    return request<TableRowMap[T]>("POST", `/api/${table}`, body);
  },

  /** Partial update — only supplied fields are changed. */
  async update<T extends TableName>(
    table: T,
    id: string,
    body: Omit<Partial<TableRowMap[T]>, "id" | "created_at" | "updated_at">
  ): Promise<TableRowMap[T]> {
    return request<TableRowMap[T]>("PATCH", `/api/${table}/${id}`, body);
  },

  /** Delete a row by ID. */
  async delete<T extends TableName>(
    table: T,
    id: string
  ): Promise<void> {
    await request<void>("DELETE", `/api/${table}/${id}`);
  },

  /** Bulk-create multiple rows in a single request. */
  async bulk<T extends TableName>(
    table: T,
    rows: Omit<Partial<TableRowMap[T]>, "id" | "created_at" | "updated_at">[]
  ): Promise<TableRowMap[T][]> {
    return request<TableRowMap[T][]>("POST", `/api/${table}/bulk`, rows);
  },
};

export { db };

// ─── Availability check ─────────────────────────────────────────────────────

/** Returns true when MOONDB_PROJECT_ID and MOONDB_ADMIN_KEY are both set. */
export function moondbAvailable(): boolean {
  return Boolean(
    process.env["MOONDB_PROJECT_ID"] && process.env["MOONDB_ADMIN_KEY"]
  );
}
