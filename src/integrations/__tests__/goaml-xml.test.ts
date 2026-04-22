import { describe, expect, it } from 'vitest';
import { serialiseGoamlXml, serialiseBatch } from '../goaml-xml.js';
import type { GoAmlEnvelope } from '../../brain/goaml-shapes.js';

function baseEnv(overrides: Partial<GoAmlEnvelope> = {}): GoAmlEnvelope {
  return {
    reportCode: 'STR',
    rentityId: 'UAE-RE-001',
    reportingPerson: {
      fullName: 'Alice Compliance Officer',
      occupation: 'MLRO',
      email: 'alice@example.ae',
      phoneNumber: '+9711234567',
    },
    submissionCode: 'E',
    currencyCodeLocal: 'AED',
    reason: 'Structured near-threshold cash deposits suggesting smurfing over a six-week window.',
    involvedPersons: [],
    involvedEntities: [],
    transactions: [],
    reportIndicators: [],
    internalReference: 'HWK-01F-0001',
    generatedAt: '2026-04-22T00:00:00Z',
    charterIntegrityHash: 'abcd1234',
    ...overrides,
  };
}

describe('goaml-xml — serialiseGoamlXml', () => {
  it('emits a well-formed XML doc with header', () => {
    const xml = serialiseGoamlXml(baseEnv());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<report');
    expect(xml).toContain('</report>');
    expect(xml).toContain('<rentity_id>UAE-RE-001</rentity_id>');
    expect(xml).toContain('<submission_code>E</submission_code>');
    expect(xml).toContain('<currency_code_local>AED</currency_code_local>');
  });

  it('includes charter integrity hash and generatedAt in the trailer comment', () => {
    const xml = serialiseGoamlXml(baseEnv({ charterIntegrityHash: 'deadbeef', generatedAt: '2026-04-22T12:34:56Z' }));
    expect(xml).toMatch(/charter deadbeef/);
    expect(xml).toMatch(/generated 2026-04-22T12:34:56Z/);
  });

  it('is deterministic — same envelope → same bytes', () => {
    const env = baseEnv();
    expect(serialiseGoamlXml(env)).toBe(serialiseGoamlXml(env));
  });

  it('xml-escapes user-supplied reason text', () => {
    const xml = serialiseGoamlXml(baseEnv({
      reason: 'Contains <script>alert("x")</script> & some "quotes" and \'apos\' — must be escaped.',
    }));
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
  });

  it('serialises an involved person', () => {
    const xml = serialiseGoamlXml(baseEnv({
      involvedPersons: [{
        firstName: 'Zayd',
        lastName: 'Al-Mansouri',
        gender: 'M',
        dateOfBirth: '1982-03-14',
        nationality1: 'AE',
        identification: [{ type: 'passport', number: 'AE1234567', issueCountryIso2: 'AE' }],
      }],
    }));
    expect(xml).toContain('<person_my_client>');
    expect(xml).toContain('<first_name>Zayd</first_name>');
    expect(xml).toContain('<last_name>Al-Mansouri</last_name>');
    expect(xml).toContain('<birthdate>1982-03-14</birthdate>');
    expect(xml).toContain('<number>AE1234567</number>');
  });

  it('serialises an involved entity with address', () => {
    const xml = serialiseGoamlXml(baseEnv({
      involvedEntities: [{
        legalName: 'Acme DPMS LLC',
        incorporationCountryIso2: 'AE',
        addresses: [{ type: 'business', countryIso2: 'AE', city: 'Dubai', line1: 'Gold Souk 1' }],
      }],
    }));
    expect(xml).toContain('<entity_my_client>');
    expect(xml).toContain('<name>Acme DPMS LLC</name>');
    expect(xml).toContain('<town>Dubai</town>');
    expect(xml).toContain('<country_code>AE</country_code>');
  });

  it('serialises a transaction', () => {
    const xml = serialiseGoamlXml(baseEnv({
      transactions: [{
        transactionNumber: 'TX-0001',
        date: '2026-04-20T10:15:00Z',
        amountLocal: 51_000,
        currency: 'AED',
        type: 'cash',
      }],
    }));
    expect(xml).toContain('<transaction>');
    expect(xml).toContain('<transactionnumber>TX-0001</transactionnumber>');
    expect(xml).toContain('<amount_local>51000</amount_local>');
    expect(xml).toContain('<transmode_code>cash</transmode_code>');
  });

  it('serialises report indicators', () => {
    const xml = serialiseGoamlXml(baseEnv({ reportIndicators: ['SMURFING', 'NEAR_THRESHOLD'] }));
    expect(xml).toContain('<report_indicators>SMURFING</report_indicators>');
    expect(xml).toContain('<report_indicators>NEAR_THRESHOLD</report_indicators>');
  });
});

describe('goaml-xml — serialiseBatch', () => {
  it('orders by internalReference deterministically', () => {
    const a = baseEnv({ internalReference: 'HWK-01F-0002' });
    const b = baseEnv({ internalReference: 'HWK-01F-0001' });
    const batch = serialiseBatch([a, b]);
    const idxA = batch.indexOf('HWK-01F-0002');
    const idxB = batch.indexOf('HWK-01F-0001');
    expect(idxB).toBeLessThan(idxA);
  });

  it('is stable across invocations', () => {
    const envs = [baseEnv({ internalReference: 'R-B' }), baseEnv({ internalReference: 'R-A' })];
    expect(serialiseBatch(envs)).toBe(serialiseBatch(envs));
  });
});
