// Wrapper that enriches screening audit-chain entries with J-04 (list
// versions) + J-05 (match threshold) fields. Every screening route should
// use this wrapper instead of calling writeAuditChainEntry directly so the
// audit shape stays consistent across the codebase.
//
// Design:
//   · The list-version capture is memoised per request. The first audit
//     write triggers the capture; subsequent writes within the same request
//     reuse the same snapshot. Caller pays the cost at most once.
//   · The wrapper is async-but-fire-and-forget-safe — callers continue to
//     `void writeScreeningAuditEntry(...)` exactly as they did with the
//     plain `writeAuditChainEntry`. Audit failures never break a response.
//   · The Blobs store is opened lazily inside the wrapper and shared
//     across all audit writes for the request. The same env-var precedence
//     used by the rest of the screening code is preserved.

import { writeAuditChainEntry, type AuditChainEvent } from "./audit-chain";
import {
  captureListVersions,
  buildListVersionAuditFields,
  type CapturedListVersions,
  type ListVersionStore,
} from "./list-versions";

// Open the same `hawkeye-lists` store the screening corpus is loaded from,
// using identical env-var precedence to the rest of the route code. Returns
// null when the Blobs binding is unavailable (local dev, missing env). The
// audit entry still writes — the listVersionsStoreUnavailable flag records
// that the snapshot was empty by environment, not by code error.
async function openListStore(): Promise<ListVersionStore | null> {
  let mod: typeof import("@netlify/blobs");
  try {
    mod = await import("@netlify/blobs");
  } catch {
    return null;
  }
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  try {
    const raw =
      siteID && token
        ? mod.getStore({ name: "hawkeye-lists", siteID, token, consistency: "strong" })
        : mod.getStore({ name: "hawkeye-lists" });
    // Adapt the @netlify/blobs Store to our minimal ListVersionStore interface.
    // The blob handle's get supports `{ type: 'json' }` which is what we use.
    return {
      get: (key, opts) => raw.get(key, opts as { type: "json" }) as Promise<unknown>,
    };
  } catch {
    return null;
  }
}

export interface ScreeningAuditContext {
  /** Match threshold used for this request. Will be normalised before write. */
  matchThreshold: unknown;
}

/** Per-request memoiser. Construct once at the top of a route handler and pass
 *  to every call to writeScreeningAuditEntry within the same request. */
export class ScreeningAuditWriter {
  private captureP: Promise<CapturedListVersions> | null = null;
  private readonly threshold: unknown;

  constructor(ctx: ScreeningAuditContext) {
    this.threshold = ctx.matchThreshold;
  }

  private getCapture(): Promise<CapturedListVersions> {
    // Single-flight: the first call kicks off the capture, all subsequent
    // calls reuse the same promise. Even if the first capture fails (it
    // can't — captureListVersions never throws), the promise resolves so
    // every audit write completes.
    if (!this.captureP) {
      this.captureP = (async () => {
        const store = await openListStore();
        return captureListVersions(store);
      })();
    }
    return this.captureP;
  }

  /** Drop-in replacement for writeAuditChainEntry that spreads J-04 + J-05
   *  fields into the body. Returns the same boolean the underlying writer
   *  returns so callers retain the existing error-surfacing contract. */
  async write(event: AuditChainEvent, tenantId = "default"): Promise<boolean> {
    const capture = await this.getCapture();
    const extra = buildListVersionAuditFields(capture, this.threshold);
    return writeAuditChainEntry({ ...event, ...extra }, tenantId);
  }
}
