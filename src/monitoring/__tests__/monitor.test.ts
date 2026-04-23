import { describe, expect, it } from 'vitest';
import { InMemorySubjectStore } from '../subject-registry.js';
import { InMemoryAlertSink } from '../alerts.js';
import { runMonitoring } from '../monitor.js';
import type { SanctionDelta } from '../../brain/sanction-delta.js';

function buildDelta(): SanctionDelta {
  return {
    listId: 'ofac_sdn',
    previousCount: 0,
    currentCount: 1,
    additions: [{
      listId: 'ofac_sdn',
      sourceRef: 'SDN-1',
      primaryName: 'Mohammed Al-Hassan',
      entityType: 'individual',
      programs: ['IRAN'],
      publishedAt: '2026-04-23',
    }],
    removals: [],
    amendments: [],
  };
}

describe('runMonitoring', () => {
  it('raises a new_match alert when a stored subject matches an addition', async () => {
    const subjects = new InMemorySubjectStore();
    await subjects.put({
      id: 'cust-1',
      subject: { name: 'Mohammad Hassan', type: 'individual', dateOfBirth: '1985-03-12' },
      registeredAt: new Date().toISOString(),
    });
    const sink = new InMemoryAlertSink();
    const res = await runMonitoring(buildDelta(), subjects, sink, { scoreThreshold: 0.5 });
    expect(res.alertsRaised).toBe(1);
    expect(res.alerts[0]!.kind).toBe('new_match');
    expect(res.alerts[0]!.listId).toBe('ofac_sdn');
    expect(res.alerts[0]!.severity).toBe('critical');
    const drained = await sink.drain();
    expect(drained).toHaveLength(1);
  });

  it('does NOT alert when the score is below threshold', async () => {
    const subjects = new InMemorySubjectStore();
    await subjects.put({
      id: 'unrelated',
      subject: { name: 'Jessica Rodriguez', type: 'individual' },
      registeredAt: new Date().toISOString(),
    });
    const sink = new InMemoryAlertSink();
    const res = await runMonitoring(buildDelta(), subjects, sink);
    expect(res.alertsRaised).toBe(0);
  });

  it('marks every examined subject as screened regardless of hit', async () => {
    const subjects = new InMemorySubjectStore();
    await subjects.put({ id: 's1', subject: { name: 'Anyone', type: 'individual' }, registeredAt: '2025-01-01T00:00:00Z' });
    const sink = new InMemoryAlertSink();
    await runMonitoring(buildDelta(), subjects, sink);
    const s = await subjects.get('s1');
    expect(s?.lastScreenedAt).toBeTruthy();
    expect(s?.lastScreenHash).toBeTruthy();
  });
});
