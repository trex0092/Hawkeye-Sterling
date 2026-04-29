import { describe, expect, it } from 'vitest';
import { can, enforce, PermissionDenied, verifyFourEyes, type Principal } from '../rbac.js';

const analyst: Principal = { id: 'a1', tenantId: 't1', roles: ['analyst'] };
const mlro: Principal = { id: 'm1', tenantId: 't1', roles: ['mlro'] };
const deputy: Principal = { id: 'd1', tenantId: 't1', roles: ['deputy_mlro'] };
const auditor: Principal = { id: 'aud1', tenantId: 't1', roles: ['auditor'] };

describe('RBAC permissions', () => {
  it('analyst can create but cannot dispose', () => {
    expect(can(analyst, 'case.create')).toBe(true);
    expect(can(analyst, 'case.dispose_clear')).toBe(false);
  });
  it('mlro can dispose and counter-sign', () => {
    expect(can(mlro, 'case.dispose_escalate')).toBe(true);
    expect(can(mlro, 'four_eyes.counter_sign')).toBe(true);
  });
  it('auditor is read-only', () => {
    expect(can(auditor, 'case.read')).toBe(true);
    expect(can(auditor, 'case.create')).toBe(false);
    expect(can(auditor, 'case.dispose_escalate')).toBe(false);
  });
  it('enforce throws PermissionDenied', () => {
    expect(() => enforce(auditor, 'case.create')).toThrow(PermissionDenied);
  });
});

describe('four-eyes verification', () => {
  it('passes for distinct signer + counter-signer with correct perms', () => {
    expect(verifyFourEyes(analyst, deputy)).toEqual({ ok: true });
    expect(verifyFourEyes(analyst, mlro)).toEqual({ ok: true });
  });
  it('rejects same-principal', () => {
    const r = verifyFourEyes(analyst, analyst);
    expect(r).toMatchObject({ ok: false });
  });
  it('rejects cross-tenant', () => {
    const other: Principal = { id: 'x', tenantId: 't2', roles: ['deputy_mlro'] };
    const r = verifyFourEyes(analyst, other);
    expect(r).toMatchObject({ ok: false });
  });
  it('rejects signer without sign permission', () => {
    const r = verifyFourEyes(auditor, mlro);
    expect(r).toMatchObject({ ok: false });
  });
});
