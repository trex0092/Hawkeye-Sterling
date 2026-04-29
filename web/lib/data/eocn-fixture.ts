// EOCN list-updates fixture — used as the API fallback when no live
// feed is configured (or when the upstream fetch fails). Mirrors the
// shape stored in Netlify Blobs by the future eocn-poll scheduled
// function so a switchover from fixture → live needs no consumer-side
// changes. ListUpdate / EocnMatch / AnnualDeclaration shapes match
// the EOCN page's interfaces 1:1.

export type ListUpdateStatus = "applied" | "pending" | "failed";
export type MatchDisposition =
  | "false-positive"
  | "confirmed"
  | "under-review"
  | "escalated";
export type DeclarationStatus = "filed" | "overdue" | "in-progress" | "not-due";

export interface ListUpdate {
  id: string;
  date: string;
  time: string;
  version: string;
  deltaAdded: number;
  deltaRemoved: number;
  screeningStatus: ListUpdateStatus;
  screeningCompletedAt?: string;
  notes: string;
  /** Source URL on the EOCN portal — populated when the live HTML
   *  parser extracts the announcement <a href>. Drives the
   *  "View on EOCN" button in the row's expanded detail panel. */
  sourceUrl?: string;
}

export interface EocnMatch {
  id: string;
  screenedAt: string;
  subject: string;
  matchScore: number;
  listEntry: string;
  listVersion: string;
  disposition: MatchDisposition;
  dispositionDate?: string;
  goAmlRef?: string;
  mlroSignedOff: boolean;
  notes: string;
}

export interface AnnualDeclaration {
  year: number;
  status: DeclarationStatus;
  filedDate?: string;
  refNumber?: string;
  period: string;
  notes: string;
}

// Source-of-truth shape returned by /api/eocn-list-updates. `source`
// signals which path produced the data so the UI can show "live ·
// last sync" vs "demo data — live feed not configured". `lastSyncedAt`
// is an ISO timestamp.
export interface EocnFeedPayload {
  source: "live" | "fixture";
  lastSyncedAt: string;
  upstreamUrl?: string;
  upstreamError?: string;
  listUpdates: ListUpdate[];
  matches: EocnMatch[];
  declarations: AnnualDeclaration[];
}

export const EOCN_LIST_UPDATES: ListUpdate[] = [
  {
    // Latest EOCN UAE update — Cabinet Decision 74 of 2020 amendment to
    // the UNSC 1988 (Taliban) sanctions committee list. Added to the
    // fixture so the page reflects today's reality until EOCN_FEED_URL
    // is configured and the cron pulls it from the live source.
    id: "LU-2026-0001",
    date: "2026-04-29",
    time: "09:00",
    version: "EOCN-TFS-v2026.001",
    deltaAdded: 0,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2026-04-29 12:33",
    notes:
      "Amend of 17 Names on UNSC Sanction Committee 1988 (Taliban) — name / address / DOB updates per Cabinet Decision 74 of 2020. Re-screen completed within 4h SLA; no new customer matches.",
    sourceUrl: "https://www.uaeiec.gov.ae/en-us/un-page",
  },
  {
    id: "LU-2025-0041",
    date: "2025-04-22",
    time: "08:15",
    version: "EOCN-TFS-v2025.041",
    deltaAdded: 3,
    deltaRemoved: 1,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-22 09:47",
    notes: "3 new designations; 1 delisting. Full re-screen completed within SLA (24h).",
  },
  {
    id: "LU-2025-0038",
    date: "2025-04-15",
    time: "10:30",
    version: "EOCN-TFS-v2025.038",
    deltaAdded: 0,
    deltaRemoved: 2,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-15 11:15",
    notes: "2 delistings only. Rapid re-screen completed within 45 minutes.",
  },
  {
    id: "LU-2025-0035",
    date: "2025-04-08",
    time: "14:00",
    version: "EOCN-TFS-v2025.035",
    deltaAdded: 7,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-08 20:30",
    notes:
      "7 new designations including 2 UAE-nexus entities. Re-screen flagged 1 potential match (see EOCN-MATCH-0012).",
  },
  {
    id: "LU-2025-0031",
    date: "2025-04-01",
    time: "09:00",
    version: "EOCN-TFS-v2025.031",
    deltaAdded: 1,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-01 14:22",
    notes: "1 new designation. No customer matches.",
  },
  {
    id: "LU-2025-0028",
    date: "2025-03-25",
    time: "11:45",
    version: "EOCN-TFS-v2025.028",
    deltaAdded: 0,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-03-25 12:10",
    notes: "Administrative update — no new designations.",
  },
];

export const EOCN_MATCHES: EocnMatch[] = [
  {
    id: "EOCN-MATCH-0012",
    screenedAt: "2025-04-08 21:00",
    subject: "Al-Noor Trading LLC",
    matchScore: 91,
    listEntry: "Al Noor General Trading Co — UAE designation 2025-04-08",
    listVersion: "EOCN-TFS-v2025.035",
    disposition: "under-review",
    mlroSignedOff: false,
    notes: "91% fuzzy match on name. Corporate structure check in progress. 24h MLRO review window active.",
  },
  {
    id: "EOCN-MATCH-0009",
    screenedAt: "2025-03-12 14:30",
    subject: "Gulf Gem Jewellers",
    matchScore: 87,
    listEntry: "Gulf Gem Exchange — UNSC 1267 designee",
    listVersion: "EOCN-TFS-v2025.019",
    disposition: "false-positive",
    dispositionDate: "2025-03-13 09:15",
    mlroSignedOff: true,
    notes: "Different entity — different trade licence, directors, address. MLRO confirmed false positive. Documented.",
  },
  {
    id: "EOCN-MATCH-0007",
    screenedAt: "2025-02-20 10:00",
    subject: "Tariq Al-Rashidi",
    matchScore: 96,
    listEntry: "Tariq Mohammed Al-Rashidi — MoE TFS designation",
    listVersion: "EOCN-TFS-v2025.011",
    disposition: "confirmed",
    dispositionDate: "2025-02-20 11:30",
    goAmlRef: "goAML-STR-2025-0033",
    mlroSignedOff: true,
    notes:
      "Confirmed match — same DoB, Emirates ID fragment. Assets frozen. goAML FFR filed within 5 business days. MoE notified.",
  },
  {
    id: "EOCN-MATCH-0005",
    screenedAt: "2025-01-15 09:20",
    subject: "Crescent Bullion FZC",
    matchScore: 88,
    listEntry: "Crescent Metals & Bullion Co — EU FSF designation",
    listVersion: "EOCN-TFS-v2025.004",
    disposition: "escalated",
    dispositionDate: "2025-01-15 16:00",
    mlroSignedOff: false,
    notes: "Match under Board review — entity has UAE trade licence but listed by EU. Pending MoE guidance.",
  },
];

export const EOCN_DECLARATIONS: AnnualDeclaration[] = [
  {
    year: 2024,
    status: "filed",
    filedDate: "2025-02-15",
    refNumber: "EOCN-DEC-2024-00441",
    period: "01/01/2024 – 31/12/2024",
    notes: "Filed on time. Covers all upstream smelters and refiners. LBMA / RJC CoC certificates attached.",
  },
  {
    year: 2023,
    status: "filed",
    filedDate: "2024-03-10",
    refNumber: "EOCN-DEC-2023-00291",
    period: "01/01/2023 – 31/12/2023",
    notes: "Filed. One late observation from EOCN acknowledged.",
  },
  {
    year: 2025,
    status: "in-progress",
    period: "01/01/2025 – 31/12/2025",
    notes: "Data collection in progress. Declaration due 31 March 2026.",
  },
];

export function fixturePayload(): EocnFeedPayload {
  return {
    source: "fixture",
    lastSyncedAt: new Date(0).toISOString(),
    listUpdates: EOCN_LIST_UPDATES,
    matches: EOCN_MATCHES,
    declarations: EOCN_DECLARATIONS,
  };
}
