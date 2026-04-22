import { describe, expect, it } from 'vitest';
import { validateIban, validateBic, validateImo, validateEmiratesId, validateIso2, validateEmail, validatePhoneE164 } from '../validators.js';

describe('IBAN MOD-97', () => {
  it('accepts a known-good IBAN', () => {
    expect(validateIban('GB82 WEST 1234 5698 7654 32').valid).toBe(true);
    expect(validateIban('DE89 3704 0044 0532 0130 00').valid).toBe(true);
  });
  it('rejects bad checksums', () => {
    expect(validateIban('GB82WEST12345698765433').valid).toBe(false);
  });
  it('rejects bad shape', () => {
    expect(validateIban('not-an-iban').valid).toBe(false);
  });
});

describe('BIC', () => {
  it('accepts 8 and 11 char BICs', () => {
    expect(validateBic('DEUTDEFF').valid).toBe(true);
    expect(validateBic('DEUTDEFF500').valid).toBe(true);
  });
  it('rejects malformed BICs', () => {
    expect(validateBic('DEUT!EFF').valid).toBe(false);
  });
});

describe('IMO', () => {
  it('accepts a known-good IMO', () => {
    // Example: IMO 9074729 — sum 9*7+0*6+7*5+4*4+7*3+2*2 = 63+0+35+16+21+4 = 139 → 139 % 10 = 9 ✅
    expect(validateImo('IMO9074729').valid).toBe(true);
  });
  it('rejects bad checksum', () => {
    expect(validateImo('IMO9074720').valid).toBe(false);
  });
});

describe('Emirates ID (Luhn)', () => {
  it('passes a Luhn-valid 784 number', () => {
    // 784-1990-1234567-X where X is computed
    // Construct a valid one:
    const body = '78419901234567';
    const digits = body.split('').map(Number);
    let sum = 0, doubleNext = true;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits[i]!;
      if (doubleNext) { d *= 2; if (d > 9) d -= 9; }
      sum += d; doubleNext = !doubleNext;
    }
    const check = (10 - (sum % 10)) % 10;
    const valid = `${body}${check}`;
    expect(validateEmiratesId(valid).valid).toBe(true);
  });
  it('rejects non-784 prefix', () => {
    expect(validateEmiratesId('123-1990-1234567-0').valid).toBe(false);
  });
});

describe('ISO-2 / email / phone', () => {
  it('ISO-2 shape', () => {
    expect(validateIso2('ae').valid).toBe(true);
    expect(validateIso2('AEU').valid).toBe(false);
  });
  it('Email shape', () => {
    expect(validateEmail('x@y.z').valid).toBe(true);
    expect(validateEmail('nope').valid).toBe(false);
  });
  it('E.164 phone', () => {
    expect(validatePhoneE164('+971501234567').valid).toBe(true);
    expect(validatePhoneE164('abc').valid).toBe(false);
  });
});
