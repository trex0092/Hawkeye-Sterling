import { describe, expect, it } from 'vitest';
import { AuditChain } from '../audit-chain.js';

describe('audit chain — append + verify', () => {
  it('appends entries with linked hashes', () => {
    const c = new AuditChain();
    c.append('mlro', 'case.open', { caseId: 'HWK-01F-20260422-ABC12' });
    c.append('analyst', 'screen.run', { subject: 'Test' });
    c.append('mlro', 'disposition.set', { decision: 'escalate_edd' });
    const v = c.verify();
    expect(v.ok).toBe(true);
    const entries = c.list();
    expect(entries).toHaveLength(3);
    expect(entries[0]!.prevHash).toMatch(/^0{8}$/);
    expect(entries[1]!.prevHash).toBe(entries[0]!.entryHash);
    expect(entries[2]!.prevHash).toBe(entries[1]!.entryHash);
  });

  it('detects tampering', () => {
    const c = new AuditChain();
    c.append('a', 'x', { foo: 1 });
    c.append('b', 'y', { foo: 2 });
    const exported = c.export();
    // Tamper with the middle row's payload.
    exported[0]!.payload = { foo: 999 };
    const restored = AuditChain.fromEntries(exported);
    const v = restored.verify();
    expect(v.ok).toBe(false);
    expect(v.firstBreakAt).toBe(1);
  });
});
