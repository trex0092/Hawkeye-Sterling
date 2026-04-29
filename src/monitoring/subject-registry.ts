// Hawkeye Sterling — stored-subject registry for ongoing monitoring.
//
// Every onboarded customer / counterparty / beneficial owner that the
// engine has screened once is registered here so that subsequent watchlist
// deltas can trigger automatic re-screens. The registry is intentionally
// format-agnostic: persistence (Postgres / Redis / DynamoDB) is injected
// via the SubjectStore interface; the default InMemorySubjectStore is
// sufficient for tests and development.

import type { Subject } from '../brain/types.js';

export interface RegisteredSubject {
  id: string;                        // stable ID supplied by the caller
  subject: Subject;
  registeredAt: string;              // ISO 8601
  lastScreenedAt?: string;
  lastScreenHash?: string;           // fnv1a of the last verdict summary
  tags?: string[];                   // free-form (e.g. 'tier1', 'dpms', 'pep')
  jurisdiction?: string;             // for geographic routing
}

export interface SubjectStore {
  put(s: RegisteredSubject): Promise<void>;
  get(id: string): Promise<RegisteredSubject | null>;
  delete(id: string): Promise<void>;
  list(opts?: { jurisdiction?: string; tag?: string }): Promise<RegisteredSubject[]>;
  markScreened(id: string, hash: string, at?: string): Promise<void>;
}

export class InMemorySubjectStore implements SubjectStore {
  private readonly byId = new Map<string, RegisteredSubject>();

  async put(s: RegisteredSubject): Promise<void> { this.byId.set(s.id, s); }
  async get(id: string): Promise<RegisteredSubject | null> { return this.byId.get(id) ?? null; }
  async delete(id: string): Promise<void> { this.byId.delete(id); }

  async list(opts: { jurisdiction?: string; tag?: string } = {}): Promise<RegisteredSubject[]> {
    const all = [...this.byId.values()];
    return all.filter((s) => {
      if (opts.jurisdiction && s.jurisdiction !== opts.jurisdiction) return false;
      if (opts.tag && !(s.tags ?? []).includes(opts.tag)) return false;
      return true;
    });
  }

  async markScreened(id: string, hash: string, at?: string): Promise<void> {
    const s = this.byId.get(id);
    if (!s) return;
    s.lastScreenedAt = at ?? new Date().toISOString();
    s.lastScreenHash = hash;
  }
}
