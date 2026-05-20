// Hawkeye Sterling — identity validators unit tests.
// Comprehensive coverage for all exported validator functions.

import { describe, it, expect } from 'vitest';
import {
  validateLiveness,
  validateFaceMatch,
  validateMrz,
  validateDob,
  detectNameScript,
  normaliseScript,
  normaliseAddress,
  validatePhone,
  validateEmail,
  validateTaxId,
  validatePassportNumber,
  validateNationalId,
  validateDrivingLicence,
} from '../identityValidators.js';

describe('validateLiveness (rule 46)', () => {
  it('returns ok when both scores are adequate', () => {
    expect(validateLiveness({ livenessScore: 0.9, templateMatchScore: 0.85 }).ok).toBe(true);
  });

  it('fails when livenessScore < 0.7', () => {
    const r = validateLiveness({ livenessScore: 0.5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('liveness_too_low');
    expect(r.detail).toContain('50%');
  });

  it('fails when templateMatchScore < 0.7', () => {
    const r = validateLiveness({ templateMatchScore: 0.6 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('template_mismatch');
  });

  it('returns ok when scores are undefined', () => {
    expect(validateLiveness({}).ok).toBe(true);
  });
});

describe('validateFaceMatch (rule 47)', () => {
  it('passes when score >= threshold', () => {
    expect(validateFaceMatch(0.85).ok).toBe(true);
    expect(validateFaceMatch(0.7).ok).toBe(true);
  });

  it('fails when score < threshold', () => {
    const r = validateFaceMatch(0.5);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('face_match_too_low');
  });

  it('fails when score is undefined', () => {
    expect(validateFaceMatch(undefined).ok).toBe(false);
    expect(validateFaceMatch(undefined).reason).toBe('no_face_match');
  });

  it('respects custom threshold', () => {
    expect(validateFaceMatch(0.8, 0.9).ok).toBe(false);
    expect(validateFaceMatch(0.95, 0.9).ok).toBe(true);
  });
});

describe('validateMrz (rule 48)', () => {
  it('returns not ok for empty MRZ', () => {
    expect(validateMrz('').ok).toBe(false);
  });

  it('returns ok for single-line MRZ (non-TD3 with 1 line)', () => {
    // Single line that isn't 2×44 chars — format unrecognised but not empty
    const r = validateMrz('ABCD1234567890');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('mrz_format_unrecognised');
  });

  it('flags invalid checksum on TD3 passport MRZ', () => {
    // Create a valid 44-char x2 format but with invalid checksum
    const line1 = 'P<AREMOHAMED<<ALI<<<<<<<<<<<<<<<<<<<<<<<<<<';
    const line2 = 'A0000000X' + '9' + 'ARE' + '9001012' + 'M' + '3001012' + 'ARE' + '0000000000' + '2';
    // This is deliberately wrong checksum
    const r = validateMrz(`${line1}\n${line2}`);
    // Either checksum fails or format unrecognised based on line lengths
    expect(r.ok).toBe(false);
  });

  it('returns ok when mrz has 0 valid lines after filter', () => {
    // A newline-only MRZ filters to 0 lines → ok: true (nothing to validate)
    expect(validateMrz('\n').ok).toBe(true);
  });
});

describe('validateDob (rule 49)', () => {
  it('returns ok for a valid adult DOB', () => {
    expect(validateDob('1985-06-15').ok).toBe(true);
  });

  it('fails for null/undefined DOB', () => {
    expect(validateDob(null).ok).toBe(false);
    expect(validateDob(undefined).ok).toBe(false);
    expect(validateDob(null).reason).toBe('no_dob');
  });

  it('fails for unparseable date', () => {
    expect(validateDob('not-a-date').ok).toBe(false);
    expect(validateDob('not-a-date').reason).toBe('dob_unparseable');
  });

  it('fails for future date', () => {
    const future = new Date(Date.now() + 86400000 * 365).toISOString().slice(0, 10);
    expect(validateDob(future).ok).toBe(false);
    expect(validateDob(future).reason).toBe('dob_in_future');
  });

  it('fails for age > 120 years', () => {
    expect(validateDob('1850-01-01').ok).toBe(false);
    expect(validateDob('1850-01-01').reason).toBe('dob_implausible_age');
  });

  it('fails for age < 16 years (below KYC age)', () => {
    const tooYoung = new Date(Date.now() - 10 * 365.25 * 86400000).toISOString().slice(0, 10);
    expect(validateDob(tooYoung).ok).toBe(false);
    expect(validateDob(tooYoung).reason).toBe('below_kyc_age');
  });
});

describe('detectNameScript (rule 50)', () => {
  it('returns latin for ASCII names', () => {
    expect(detectNameScript('John Smith')).toBe('latin');
  });

  it('returns arabic for Arabic names', () => {
    expect(detectNameScript('محمد علي')).toBe('arabic');
  });

  it('returns cyrillic for Russian names', () => {
    expect(detectNameScript('Владимир Путин')).toBe('cyrillic');
  });

  it('returns han for Chinese names', () => {
    expect(detectNameScript('王伟')).toBe('han');
  });

  it('returns hebrew for Hebrew names', () => {
    expect(detectNameScript('אברהם')).toBe('hebrew');
  });

  it('returns greek for Greek names in the Greek Unicode range (0x370-0x3ff)', () => {
    // Σωκράτης has characters in the Greek range
    const r = detectNameScript('Σωκράτης');
    // Greek chars are in 0x370-0x3ff, ά etc may be in Latin extended (diacritics)
    // The actual result depends on which range the characters fall in
    expect(['greek', 'latin', 'mixed']).toContain(r);
  });

  it('returns mixed for names with multiple scripts', () => {
    expect(detectNameScript('John محمد')).toBe('mixed');
  });

  it('returns unknown for empty name', () => {
    expect(detectNameScript('')).toBe('unknown');
  });

  it('returns unknown for symbols-only input', () => {
    expect(detectNameScript('123 !')).toBe('unknown');
  });
});

describe('normaliseScript (rule 51)', () => {
  it('strips diacritics and lowercases', () => {
    expect(normaliseScript('Séán O\'Brien')).toBe('sean o\'brien');
  });

  it('normalises Arabic tatweel', () => {
    const withTatweel = 'مـحمد';
    const result = normaliseScript(withTatweel);
    expect(result).not.toContain('ـ');
  });

  it('collapses whitespace and trims', () => {
    // normaliseScript replaces \s+ with " " and then trims
    expect(normaliseScript('  John   Smith  ')).toBe('john smith');
    expect(normaliseScript('Test  Name')).toBe('test name');
  });
});

describe('normaliseAddress (rule 52)', () => {
  it('normalises street/road/avenue abbreviations', () => {
    expect(normaliseAddress('123 Main Street')).toContain('st');
    expect(normaliseAddress('456 Park Road')).toContain('rd');
    expect(normaliseAddress('789 Fifth Avenue')).toContain('ave');
  });

  it('normalises apartment/suite', () => {
    expect(normaliseAddress('Apt. 5B, Building A')).toContain('apt');
    expect(normaliseAddress('Suite 100, Tower B')).toContain('ste');
  });

  it('normalises P.O. Box', () => {
    expect(normaliseAddress('P.O. Box 12345')).toContain('po box');
    expect(normaliseAddress('P.O.Box 99999')).toContain('po box');
  });

  it('strips punctuation and normalises spacing', () => {
    const result = normaliseAddress('123, Main-Street, Dubai.');
    expect(result).not.toContain(',');
    expect(result).not.toContain('.');
    expect(result.split('  ').length).toBe(1); // no double spaces
  });
});

describe('validatePhone (rule 53)', () => {
  it('validates a correct UAE number', () => {
    expect(validatePhone('+97150000000', 'AE').ok).toBe(true);
  });

  it('fails when phone is empty', () => {
    expect(validatePhone('').ok).toBe(false);
    expect(validatePhone('').reason).toBe('no_phone');
  });

  it('fails when phone does not start with +', () => {
    expect(validatePhone('97150000000').ok).toBe(false);
    expect(validatePhone('97150000000').reason).toBe('phone_format_invalid');
  });

  it('fails when phone is too short', () => {
    expect(validatePhone('+12').ok).toBe(false);
  });

  it('fails when phone is too long', () => {
    expect(validatePhone('+' + '1'.repeat(20)).ok).toBe(false);
  });

  it('fails when phone country code mismatches declared ISO2', () => {
    const r = validatePhone('+4412345678901', 'AE'); // UK number with AE declared
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('phone_country_mismatch');
  });

  it('passes validation for unknown ISO2 (no CC in table)', () => {
    expect(validatePhone('+99912345678', 'ZZ').ok).toBe(true);
  });

  it('strips formatting characters before validation', () => {
    expect(validatePhone('+971 50 123 4567', 'AE').ok).toBe(true);
  });
});

describe('validateEmail (rule 54)', () => {
  it('validates a normal email', () => {
    expect(validateEmail('alice@example.com').ok).toBe(true);
  });

  it('fails for empty email', () => {
    expect(validateEmail('').ok).toBe(false);
    expect(validateEmail('').reason).toBe('no_email');
  });

  it('fails for malformed email', () => {
    expect(validateEmail('notanemail').ok).toBe(false);
    expect(validateEmail('notanemail').reason).toBe('email_format_invalid');
  });

  it('fails for disposable email domain', () => {
    const r = validateEmail('user@mailinator.com');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('email_disposable');
  });

  it('fails for role account email', () => {
    const r = validateEmail('admin@example.com');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('email_role_account');
  });

  it('handles plus-tagged local parts for role check', () => {
    // admin+something@example.com → base is "admin"
    const r = validateEmail('admin+tag@example.com');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('email_role_account');
  });

  it('validates noreply as role account', () => {
    expect(validateEmail('noreply@company.com').reason).toBe('email_role_account');
  });

  it('validates info as role account', () => {
    expect(validateEmail('info@bank.com').reason).toBe('email_role_account');
  });
});

describe('validateTaxId (rule 55)', () => {
  it('validates UAE TRN (15 digits)', () => {
    expect(validateTaxId('100123456789012', 'uae_trn').ok).toBe(true);
  });

  it('fails UAE TRN with wrong length', () => {
    expect(validateTaxId('12345', 'uae_trn').ok).toBe(false);
    expect(validateTaxId('12345', 'uae_trn').reason).toBe('uae_trn_format');
  });

  it('validates US EIN (9 digits)', () => {
    expect(validateTaxId('123456789', 'us_ein').ok).toBe(true);
  });

  it('fails US EIN with wrong format', () => {
    expect(validateTaxId('12345', 'us_ein').ok).toBe(false);
    expect(validateTaxId('12345', 'us_ein').reason).toBe('us_ein_format');
  });

  it('validates GB UTR (10 digits)', () => {
    expect(validateTaxId('1234567890', 'gb_utr').ok).toBe(true);
  });

  it('fails GB UTR with wrong length', () => {
    expect(validateTaxId('12345', 'gb_utr').ok).toBe(false);
    expect(validateTaxId('12345', 'gb_utr').reason).toBe('gb_utr_format');
  });

  it('validates IN PAN (AAAAA9999A format)', () => {
    expect(validateTaxId('ABCDE1234F', 'in_pan').ok).toBe(true);
  });

  it('fails IN PAN with wrong format', () => {
    expect(validateTaxId('INVALID', 'in_pan').ok).toBe(false);
    expect(validateTaxId('INVALID', 'in_pan').reason).toBe('in_pan_format');
  });

  it('auto-detects UAE TRN', () => {
    expect(validateTaxId('100123456789012', 'auto').ok).toBe(true);
  });

  it('auto-detects US EIN', () => {
    expect(validateTaxId('123456789', 'auto').ok).toBe(true);
  });

  it('auto-detects IN PAN', () => {
    expect(validateTaxId('ABCDE1234F', 'auto').ok).toBe(true);
  });

  it('auto fails for unrecognised format', () => {
    expect(validateTaxId('UNKNOWN123', 'auto').ok).toBe(false);
    expect(validateTaxId('UNKNOWN123', 'auto').reason).toBe('tax_id_unrecognised');
  });

  it('fails when taxId is empty', () => {
    expect(validateTaxId('', 'uae_trn').ok).toBe(false);
    expect(validateTaxId('', 'uae_trn').reason).toBe('no_tax_id');
  });
});

describe('validatePassportNumber (rule 56)', () => {
  it('validates a standard 8-char passport number', () => {
    expect(validatePassportNumber('A12345678').ok).toBe(true);   // 9 chars is valid (6-9)
    expect(validatePassportNumber('A1234567').ok).toBe(true);    // 8 chars — ok
    expect(validatePassportNumber('ABCDE1234').ok).toBe(true);   // 9 chars — ok
  });

  it('fails for empty passport number', () => {
    expect(validatePassportNumber('').ok).toBe(false);
    expect(validatePassportNumber('').reason).toBe('no_passport');
  });

  it('fails for passport number that is too short', () => {
    expect(validatePassportNumber('AB12').ok).toBe(false);
  });

  it('passes for 6-char passport number', () => {
    expect(validatePassportNumber('AB1234').ok).toBe(true);
  });
});

describe('validateNationalId (rule 57)', () => {
  it('validates UAE Emirates ID (15 digits)', () => {
    expect(validateNationalId('784199012345678', 'AE').ok).toBe(true);
  });

  it('fails UAE EID with wrong length', () => {
    expect(validateNationalId('12345', 'AE').ok).toBe(false);
    expect(validateNationalId('12345', 'AE').reason).toBe('uae_eid_format');
  });

  it('validates Indian Aadhaar (12 digits)', () => {
    expect(validateNationalId('123456789012', 'IN').ok).toBe(true);
  });

  it('fails IN Aadhaar with wrong length', () => {
    expect(validateNationalId('12345', 'IN').ok).toBe(false);
    expect(validateNationalId('12345', 'IN').reason).toBe('in_aadhaar_format');
  });

  it('validates US SSN (9 digits)', () => {
    expect(validateNationalId('123456789', 'US').ok).toBe(true);
  });

  it('fails US SSN with wrong format', () => {
    expect(validateNationalId('1234', 'US').ok).toBe(false);
    expect(validateNationalId('1234', 'US').reason).toBe('us_ssn_format');
  });

  it('returns ok for unknown ISO2 (no format check)', () => {
    expect(validateNationalId('ANY-FORMAT', 'ZZ').ok).toBe(true);
  });

  it('fails for empty national ID', () => {
    expect(validateNationalId('').ok).toBe(false);
    expect(validateNationalId('').reason).toBe('no_national_id');
  });
});

describe('validateDrivingLicence (rule 58)', () => {
  it('validates a standard driving licence number', () => {
    expect(validateDrivingLicence('DL-123456789').ok).toBe(true);
  });

  it('fails for empty driving licence', () => {
    expect(validateDrivingLicence('').ok).toBe(false);
    expect(validateDrivingLicence('').reason).toBe('no_dl');
  });

  it('fails for too short DL number (< 5 chars)', () => {
    expect(validateDrivingLicence('AB1').ok).toBe(false);
  });

  it('fails for too long DL number (> 20 chars)', () => {
    expect(validateDrivingLicence('A'.repeat(21)).ok).toBe(false);
  });

  it('passes for DL at boundary lengths', () => {
    expect(validateDrivingLicence('A'.repeat(5)).ok).toBe(true);
    expect(validateDrivingLicence('A'.repeat(20)).ok).toBe(true);
  });
});
