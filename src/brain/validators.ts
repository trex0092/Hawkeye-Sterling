// Hawkeye Sterling — deterministic format + checksum validators.
// IBAN (MOD-97), BIC/SWIFT, IMO number, Emirates ID (Luhn-style checksum
// commonly used for 784-YYYY-NNNNNNN-C), ISO-2 country, passport-ish
// shape. Every validator is pure + deterministic and returns a typed
// result with the specific failure reason (never 'invalid' alone).

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  normalised?: string;
}

// --------- IBAN (MOD-97 = 1 per ISO 13616)
export function validateIban(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return { valid: false, reason: 'format' };
  // Move first 4 chars to end.
  const rearranged = s.slice(4) + s.slice(0, 4);
  // Convert letters to numbers: A=10 ... Z=35.
  let numeric = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) numeric += ch;
    else if (code >= 65 && code <= 90) numeric += String(code - 55);
    else return { valid: false, reason: 'character' };
  }
  // Compute mod 97 incrementally to avoid BigInt.
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + (ch.charCodeAt(0) - 48)) % 97;
  }
  if (remainder !== 1) return { valid: false, reason: 'mod97' };
  return { valid: true, normalised: s };
}

// --------- BIC / SWIFT (8 or 11 chars)
export function validateBic(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s)) return { valid: false, reason: 'format' };
  return { valid: true, normalised: s };
}

// --------- IMO number (vessel): 7 digits, last digit = mod 10 of sum of d1..d6 weighted 7..2
export function validateImo(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.replace(/\s+/g, '').replace(/^IMO/i, '');
  if (!/^\d{7}$/.test(s)) return { valid: false, reason: 'format' };
  const digits = s.split('').map((c) => c.charCodeAt(0) - 48);
  const expectedCheck = digits[6]!;
  const sum = digits[0]! * 7 + digits[1]! * 6 + digits[2]! * 5 + digits[3]! * 4 + digits[4]! * 3 + digits[5]! * 2;
  if (sum % 10 !== expectedCheck) return { valid: false, reason: 'checksum' };
  return { valid: true, normalised: `IMO${s}` };
}

// --------- Emirates ID: 784-YYYY-NNNNNNN-C  (with Luhn-style check)
export function validateEmiratesId(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.replace(/[\s-]/g, '');
  if (!/^784\d{12}$/.test(s)) return { valid: false, reason: 'format' };
  const digits = s.split('').map((c) => c.charCodeAt(0) - 48);
  const body = digits.slice(0, 14);
  const check = digits[14]!;
  // Luhn-style over 14 body digits with standard doubling from the rightmost body.
  let sum = 0;
  let double = true;
  for (let i = body.length - 1; i >= 0; i--) {
    let d = body[i]!;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  const computed = (10 - (sum % 10)) % 10;
  if (computed !== check) return { valid: false, reason: 'checksum' };
  return { valid: true, normalised: `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7, 14)}-${s.slice(14)}` };
}

// --------- ISO-3166-1 alpha-2 (shape only)
export function validateIso2(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return { valid: false, reason: 'format' };
  return { valid: true, normalised: s };
}

// --------- Passport number (loose structural validation, country-specific in Phase 3)
export function validatePassportLoose(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(s)) return { valid: false, reason: 'format' };
  return { valid: true, normalised: s };
}

// --------- Email (pragmatic)
export function validateEmail(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { valid: false, reason: 'format' };
  return { valid: true, normalised: s.toLowerCase() };
}

// --------- E.164 phone (simple)
export function validatePhoneE164(input: string): ValidationResult {
  if (!input) return { valid: false, reason: 'empty' };
  const s = input.replace(/[\s()\-]/g, '');
  if (!/^\+?[1-9]\d{6,14}$/.test(s)) return { valid: false, reason: 'format' };
  return { valid: true, normalised: s.startsWith('+') ? s : `+${s}` };
}
