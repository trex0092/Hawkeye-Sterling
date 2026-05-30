// Hawkeye Sterling — STIX 2.1 export endpoint.
// GET /api/stix-export?format=bundle|navigator
// Exports AML typologies as STIX 2.1 bundle or ATT&CK Navigator layer.

import { NextRequest, NextResponse } from 'next/server';
import { enforce } from "@/lib/server/enforce";
import { buildStixBundle, buildNavigatorLayer, type AmlTypology } from '../../../../src/integrations/stix-export';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Core AML typologies mapped to AMLTRIX domains
const HAWKEYE_TYPOLOGIES: AmlTypology[] = [
  {
    id: 'dpms_structuring',
    name: 'DPMS Cash Structuring',
    domain: 'dpms',
    description: 'Splitting precious metal purchases below AED 55,000 threshold to avoid KYC/CDD triggers',
    indicators: [
      'Multiple transactions below reporting threshold within short timeframe',
      'Same buyer across multiple transactions with cumulative value above threshold',
      'Cash payments only with no electronic trace',
    ],
    mitigations: [
      'Aggregate transaction monitoring across 30-day rolling window',
      'Mandatory CDD for cumulative cash transactions exceeding AED 55,000',
      'Real-time threshold alert to MLRO',
    ],
    amltrixTacticId: 'ML0001',
    fatfCategory: 'ML',
  },
  {
    id: 'vasp_sanctioned_wallet',
    name: 'VASP Sanctioned Wallet Inflow',
    domain: 'vasp',
    description: 'Direct receipt of crypto assets from OFAC/UN-designated wallet addresses',
    indicators: [
      'Sending wallet flagged by two or more chain analytics vendors',
      'Transaction amount above 0.5 BTC equivalent',
      'Sender claims innocent ownership of flagged wallet',
    ],
    mitigations: [
      'Real-time blockchain address screening against OFAC SDN crypto addresses',
      'Immediate transaction blocking and SAR filing',
      'Customer EDD and relationship termination review',
    ],
    amltrixTacticId: 'ML0003',
    fatfCategory: 'ML',
  },
  {
    id: 'tbml_over_invoicing',
    name: 'Trade-Based ML — Over-Invoicing',
    domain: 'tbml',
    description: 'Goods invoiced at multiples of fair-market value to transfer value across borders',
    indicators: [
      'Invoice price deviates >30% from TRADEMAP/ITC fair market band',
      'Third-country payment routing not matching trade flow',
      'Correspondent bank in high-risk jurisdiction',
    ],
    mitigations: [
      'Price verification against WCO/ITC commodity price databases',
      'Trade finance document analysis (BoL, invoice, LoC consistency)',
      'Enhanced due diligence on correspondent banking relationships',
    ],
    amltrixTacticId: 'ML0002',
    fatfCategory: 'ML',
  },
  {
    id: 'pep_concealment',
    name: 'PEP Wealth Concealment',
    domain: 'pep',
    description: 'Politically Exposed Person using nominee structures to conceal beneficial ownership',
    indicators: [
      'Nominee director with no apparent business connection to entity',
      'Complex ownership chain through multiple jurisdictions',
      'Source of wealth inconsistent with public salary/assets',
    ],
    mitigations: [
      'Enhanced due diligence for all PEP relationships',
      'Mandatory senior management approval for PEP onboarding',
      'Annual re-screening and source-of-wealth verification',
    ],
    amltrixTacticId: 'ML0006',
    fatfCategory: 'ML',
  },
  {
    id: 'real_estate_layering',
    name: 'Real Estate Layering',
    domain: 'real_estate',
    description: 'Using property transactions to layer illicit funds through price manipulation',
    indicators: [
      'Property purchase price significantly above/below market value',
      'Cash payment for high-value property without mortgage',
      'Rapid resale at loss (round-trip transaction)',
    ],
    mitigations: [
      'Mandatory source of funds verification for cash property purchases',
      'DLD registry cross-check for rapid resale patterns',
      'Enhanced monitoring of off-plan property transactions',
    ],
    amltrixTacticId: 'ML0004',
    fatfCategory: 'ML',
  },
  {
    id: 'sanctions_evasion_front',
    name: 'Sanctions Evasion via Front Company',
    domain: 'sanctions',
    description: 'Using shell or front companies to conduct transactions on behalf of sanctioned parties',
    indicators: [
      'UBO nationality matches sanctioned jurisdiction',
      'Transaction counterparty in high-risk jurisdiction with sanctioned entity',
      'Correspondent bank previously involved in sanctions violations',
    ],
    mitigations: [
      'UBO screening against all sanctions lists including beneficial ownership chains',
      'Counterparty jurisdiction risk assessment',
      'Enhanced correspondent banking due diligence',
    ],
    amltrixTacticId: 'ML0007',
    fatfCategory: 'ML',
  },
  {
    id: 'terrorism_financing_hawala',
    name: 'Terrorist Financing via Hawala',
    domain: 'terrorism',
    description: 'Using informal value transfer systems to finance terrorist activities',
    indicators: [
      'Frequent small transfers to high-risk jurisdiction without business rationale',
      'Hawala operator receiving large cash deposits and making electronic transfers',
      'Recipient in FATF high-risk or non-cooperative jurisdiction',
    ],
    mitigations: [
      'Mandatory registration and licensing of hawala operators',
      'Transaction reporting for cross-border transfers above threshold',
      'Intelligence sharing with UAE Central Bank',
    ],
    amltrixTacticId: 'TF0001',
    fatfCategory: 'TF',
  },
];

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const format = req.nextUrl.searchParams.get('format') ?? 'bundle';

  if (format === 'navigator') {
    const layer = buildNavigatorLayer(HAWKEYE_TYPOLOGIES);
    return new NextResponse(JSON.stringify(layer, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="hawkeye-navigator-layer.json"',
        ...gate.headers,
      },
    });
  }

  const bundle = buildStixBundle(HAWKEYE_TYPOLOGIES);
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/stix+json',
      'Content-Disposition': 'attachment; filename="hawkeye-stix-bundle.json"',
      ...gate.headers,
    },
  });
}
