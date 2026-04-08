/**
 * HRC/HRCA High-Risk Country Reporting Module.
 *
 * UAE FIU requires ALL cross-border transfers involving high-risk countries
 * to be reported via goAML as either:
 *   - HRC (High-Risk Country Report) — full transaction details available
 *   - HRCA (High-Risk Country Activity Report) — insufficient details
 *
 * After filing, the entity must HOLD the transaction for 3 business days
 * from the date of submission before execution.
 *
 * High-risk countries: FATF blacklist + greylist + EU high-risk third countries.
 *
 * Regulatory basis:
 *   - FDL No.10/2025 Art.35
 *   - Cabinet Resolution 134/2025 Art.16
 *   - UAE FIU goAML Report Types Guide (Apr 2024)
 *   - EOCN TFS Guidance (July 2025)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname || '.', '..');
const HISTORY_DIR = resolve(PROJECT_ROOT, 'history', 'filings');

/** FATF Blacklist — High-Risk Jurisdictions Subject to Call for Action. */
const FATF_BLACKLIST = ['IR', 'KP', 'MM'];

/** FATF Greylist — Jurisdictions Under Increased Monitoring (Feb 2026). */
const FATF_GREYLIST = [
  'AL', 'BG', 'BF', 'CM', 'HR', 'CD', 'EG', 'HT', 'KE', 'LB',
  'MG', 'MC', 'MZ', 'NA', 'NG', 'PH', 'SN', 'ZA', 'SS', 'SY',
  'VE', 'YE',
];

/** EU High-Risk Third Countries (Commission Delegated Regulation). */
const EU_HIGH_RISK = [
  'AF', 'BB', 'BF', 'MM', 'KH', 'KY', 'CD', 'GI', 'HT', 'JM',
  'JO', 'ML', 'MZ', 'NG', 'PA', 'PH', 'SN', 'ZA', 'SS', 'SY', 'TT',
];

/** Combined unique high-risk countries. */
const ALL_HIGH_RISK = [...new Set([...FATF_BLACKLIST, ...FATF_GREYLIST, ...EU_HIGH_RISK])];

/** 3-day transaction hold requirement after HRC/HRCA filing. */
const HOLD_BUSINESS_DAYS = 3;

/**
 * Check if a transaction requires HRC/HRCA reporting.
 *
 * @param {object} tx - Transaction details.
 * @param {string} tx.originCountry    - ISO 2-letter origin country.
 * @param {string} tx.destinationCountry - ISO 2-letter destination country.
 * @param {number} tx.amount           - Transaction amount in AED.
 * @param {boolean} tx.isCrossBorder   - Whether the transaction is cross-border.
 * @returns {{ required, reportType, country, riskLevel, holdUntil, actions }}
 */
export function checkHrcRequirement(tx) {
  if (!tx.isCrossBorder) {
    return { required: false, reason: 'Domestic transaction — HRC/HRCA not applicable' };
  }

  const originRisk = getCountryRisk(tx.originCountry);
  const destRisk = getCountryRisk(tx.destinationCountry);

  // Either origin or destination being high-risk triggers reporting
  const triggerCountry = originRisk.isHighRisk ? tx.originCountry : destRisk.isHighRisk ? tx.destinationCountry : null;
  const triggerRisk = originRisk.isHighRisk ? originRisk : destRisk;

  if (!triggerCountry) {
    return { required: false, reason: 'Neither origin nor destination is a high-risk country' };
  }

  // Determine report type: HRC if full details available, HRCA if not
  const hasFullDetails = tx.amount && tx.originCountry && tx.destinationCountry &&
    tx.senderName && tx.receiverName;

  const reportType = hasFullDetails ? 'HRC' : 'HRCA';

  // Calculate hold expiry (3 business days from filing)
  const holdUntil = addBusinessDays(new Date(), HOLD_BUSINESS_DAYS);

  return {
    required: true,
    reportType,
    country: triggerCountry,
    riskLevel: triggerRisk.level,
    lists: triggerRisk.lists,
    holdUntil: holdUntil.toISOString().split('T')[0],
    holdDays: HOLD_BUSINESS_DAYS,
    actions: [
      `File ${reportType} via goAML portal immediately`,
      `HOLD transaction execution for ${HOLD_BUSINESS_DAYS} business days from filing date`,
      `Hold expires: ${holdUntil.toISOString().split('T')[0]}`,
      triggerRisk.level === 'BLACKLIST'
        ? 'CRITICAL: FATF blacklist country — apply maximum enhanced due diligence'
        : 'Apply enhanced due diligence for high-risk jurisdiction',
      'Document rationale for proceeding or rejecting the transaction',
      'Retain all records for minimum 10 years',
    ],
    regulation: 'FDL No.10/2025 Art.35 | Cabinet Res 134/2025 Art.16 | UAE FIU goAML Report Types Guide',
  };
}

/**
 * Generate HRC/HRCA goAML XML report.
 */
export function generateHrcXml(tx, reportType = 'HRC') {
  const reportId = `${reportType}-${Date.now().toString(36).toUpperCase()}`;
  const today = new Date().toISOString().split('T')[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<goAMLMessage xmlns="http://www.uaefiu.gov.ae/goaml" version="4.0">
  <reportHeader>
    <reportCode>${reportType}</reportCode>
    <reportId>${reportId}</reportId>
    <reportStatus>DRAFT</reportStatus>
    <reportDate>${today}</reportDate>
    <reportingEntity>
      <entityType>DPMS</entityType>
      <entityName>Hawkeye Sterling</entityName>
      <supervisoryAuthority>Ministry of Economy</supervisoryAuthority>
    </reportingEntity>
  </reportHeader>
  <reportBody>
    <transactionDetails>
      <originCountry>${esc(tx.originCountry)}</originCountry>
      <destinationCountry>${esc(tx.destinationCountry)}</destinationCountry>
      <amount>${tx.amount || ''}</amount>
      <currency>${tx.currency || 'AED'}</currency>
      <transactionDate>${tx.date || today}</transactionDate>
      <senderName>${esc(tx.senderName || '')}</senderName>
      <receiverName>${esc(tx.receiverName || '')}</receiverName>
      <paymentMethod>${esc(tx.method || '')}</paymentMethod>
    </transactionDetails>
    <highRiskIndicators>
      <triggerCountry>${tx.originCountry && getCountryRisk(tx.originCountry).isHighRisk ? tx.originCountry : tx.destinationCountry}</triggerCountry>
      <riskLevel>${getCountryRisk(tx.originCountry).level || getCountryRisk(tx.destinationCountry).level}</riskLevel>
    </highRiskIndicators>
  </reportBody>
  <reportFooter>
    <holdExpiry>${addBusinessDays(new Date(), HOLD_BUSINESS_DAYS).toISOString().split('T')[0]}</holdExpiry>
    <preparedBy>Automated Draft - Pending MLRO Review</preparedBy>
  </reportFooter>
</goAMLMessage>`;

  return { reportId, xml, reportType };
}

/**
 * Get risk classification for a country.
 */
function getCountryRisk(countryCode) {
  if (!countryCode) return { isHighRisk: false, level: 'UNKNOWN', lists: [] };

  const code = countryCode.toUpperCase();
  const lists = [];

  if (FATF_BLACKLIST.includes(code)) lists.push('FATF Blacklist');
  if (FATF_GREYLIST.includes(code)) lists.push('FATF Greylist');
  if (EU_HIGH_RISK.includes(code)) lists.push('EU High-Risk Third Country');

  if (lists.length === 0) {
    return { isHighRisk: false, level: 'STANDARD', lists: [] };
  }

  const level = lists.includes('FATF Blacklist') ? 'BLACKLIST'
    : lists.includes('FATF Greylist') ? 'GREYLIST' : 'EU_HIGH_RISK';

  return { isHighRisk: true, level, lists };
}

function addBusinessDays(from, days) {
  const d = new Date(from);
  let counted = 0;
  while (counted < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 5 && dow !== 6) counted++; // UAE weekends: Fri-Sat
  }
  return d;
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { ALL_HIGH_RISK, FATF_BLACKLIST, FATF_GREYLIST, EU_HIGH_RISK };
