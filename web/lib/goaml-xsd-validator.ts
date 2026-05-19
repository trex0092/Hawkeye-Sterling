// src/lib/goaml-xsd-validator.ts
// Structural validator for goAML XML documents.
// Validates against UNODC goAML schema rules without requiring the full XSD file.
// Returns array of validation errors (empty = valid).

export interface XsdValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateGoamlXmlStructure(xml: string): XsdValidationError[] {
  const errors: XsdValidationError[] = [];

  // Check XML declaration
  if (!xml.startsWith('<?xml')) {
    errors.push({ path: '/report', message: 'Missing XML declaration', severity: 'error' });
  }

  // Check root element
  if (!xml.includes('<report')) {
    errors.push({ path: '/', message: 'Missing root <report> element', severity: 'error' });
    return errors; // Can't continue without root
  }

  // Required top-level elements
  const required = [
    ['rentity_id', '/report/rentity_id'],
    ['submission_code', '/report/submission_code'],
    ['report_code', '/report/report_code'],
    ['currency_code_local', '/report/currency_code_local'],
    ['reporting_person', '/report/reporting_person'],
    ['internal_reference', '/report/internal_reference'],
  ] as const;

  for (const [tag, path] of required) {
    if (!xml.includes(`<${tag}>`)) {
      errors.push({ path, message: `Required element <${tag}> is missing`, severity: 'error' });
    }
  }

  // Validate report_code is one of the valid values
  const reportCodeMatch = xml.match(/<report_code>([^<]+)<\/report_code>/);
  const validCodes = ['STR', 'SAR', 'AIF', 'RFI', 'FFR', 'PNMR', 'CTR', 'EFT', 'HRC'];
  if (reportCodeMatch && !validCodes.includes(reportCodeMatch[1] ?? '')) {
    errors.push({ path: '/report/report_code', message: `Invalid report_code: ${reportCodeMatch[1]}. Must be one of: ${validCodes.join(', ')}`, severity: 'error' });
  }

  // Validate currency_code_local is AED for UAE FIU
  if (xml.includes('<currency_code_local>') && !xml.includes('<currency_code_local>AED</currency_code_local>')) {
    errors.push({ path: '/report/currency_code_local', message: 'currency_code_local must be AED for UAE FIU submissions', severity: 'error' });
  }

  // Validate submission_code
  const submissionMatch = xml.match(/<submission_code>([^<]+)<\/submission_code>/);
  if (submissionMatch && !['E', 'M'].includes(submissionMatch[1] ?? '')) {
    errors.push({ path: '/report/submission_code', message: `Invalid submission_code: ${submissionMatch[1]}. Must be E (electronic) or M (manual)`, severity: 'error' });
  }

  // Validate reporting_person has required sub-elements
  const rpSection = xml.match(/<reporting_person>([\s\S]*?)<\/reporting_person>/);
  if (rpSection) {
    const rpContent = rpSection[1] ?? '';
    if (!rpContent.includes('<last_name>')) {
      errors.push({ path: '/report/reporting_person/last_name', message: 'reporting_person must have last_name', severity: 'error' });
    }
    if (!rpContent.includes('<email>')) {
      errors.push({ path: '/report/reporting_person/email', message: 'reporting_person must have email', severity: 'error' });
    }
    if (!rpContent.includes('<occupation>')) {
      errors.push({ path: '/report/reporting_person/occupation', message: 'reporting_person must have occupation', severity: 'warning' });
    }
  }

  // Validate crypto transactions have wallet info
  const transactions = xml.match(/<transaction>[\s\S]*?<\/transaction>/g) ?? [];
  transactions.forEach((tx, i) => {
    const typeMatch = tx.match(/<transmode_code>([^<]+)<\/transmode_code>/);
    if (typeMatch?.[1] === 'crypto') {
      if (!tx.includes('<crypto_wallet>')) {
        errors.push({
          path: `/report/transaction[${i + 1}]`,
          message: 'Crypto transaction must include crypto_wallet details (goAML v5.0)',
          severity: 'error',
        });
      }
    }
  });

  // Validate wallet addresses are non-empty when present
  const walletMatches = xml.match(/<wallet_address>([^<]*)<\/wallet_address>/g) ?? [];
  walletMatches.forEach((w, i) => {
    const addr = w.replace(/<\/?wallet_address>/g, '').trim();
    if (!addr) {
      errors.push({ path: `/report/crypto_wallet[${i + 1}]/wallet_address`, message: 'wallet_address must not be empty', severity: 'error' });
    }
  });

  // Validate country codes are 2 characters (ISO 3166-1 alpha-2)
  const countryMatches = xml.match(/<country_code>([^<]+)<\/country_code>/g) ?? [];
  countryMatches.forEach((c) => {
    const code = c.replace(/<\/?country_code>/g, '').trim();
    if (code.length !== 2) {
      errors.push({ path: '/report//country_code', message: `Country code "${code}" must be 2 characters (ISO 3166-1 alpha-2)`, severity: 'error' });
    }
  });

  return errors;
}

export function isGoamlXmlValid(xml: string): boolean {
  return validateGoamlXmlStructure(xml).filter(e => e.severity === 'error').length === 0;
}
