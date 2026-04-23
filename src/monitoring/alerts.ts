// Hawkeye Sterling — ongoing-monitoring alert model.
//
// An alert is raised when a stored subject matches a NEW entry in a
// watchlist snapshot (addition), an amended entry changed a field the
// match depended on (amendment), or an existing match was de-listed
// (removal → positive news, still surfaced).

import type { Subject } from '../brain/types.js';
import type { SanctionAddition, SanctionAmendment, SanctionRemoval } from '../brain/sanction-delta.js';

export type AlertKind = 'new_match' | 'match_amended' | 'match_delisted';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface MonitoringAlert {
  id: string;
  subjectId: string;
  subject: Subject;
  kind: AlertKind;
  severity: AlertSeverity;
  listId: string;
  sourceRef: string;
  matchedName: string;
  matchScore: number;                 // 0..1 from identity matcher
  triggerReason: string;              // human-readable
  triggeredAt: string;                // ISO 8601
  chainAnchor?: string;               // audit-chain entry hash that produced this alert
  previousHash?: string;              // last screen hash (for de-dup)
  // Surface the raw diff payload so a human can see exactly what changed.
  triggerPayload: SanctionAddition | SanctionAmendment | SanctionRemoval;
}

export interface AlertSink {
  emit(alert: MonitoringAlert): Promise<void>;
  drain(): Promise<MonitoringAlert[]>;                 // pulls accumulated alerts
}

export class InMemoryAlertSink implements AlertSink {
  private buf: MonitoringAlert[] = [];
  async emit(alert: MonitoringAlert): Promise<void> { this.buf.push(alert); }
  async drain(): Promise<MonitoringAlert[]> { const out = this.buf; this.buf = []; return out; }
}

/** Suggest a default severity from the alert kind + critical-regime heuristic. */
export function severityFor(kind: AlertKind, listId: string): AlertSeverity {
  const critical = ['un_1267', 'un_1988', 'ofac_sdn', 'uae_eocn', 'uae_local_terrorist'];
  if (kind === 'match_delisted') return 'low';
  if (critical.includes(listId)) return kind === 'new_match' ? 'critical' : 'high';
  return kind === 'new_match' ? 'high' : 'medium';
}
