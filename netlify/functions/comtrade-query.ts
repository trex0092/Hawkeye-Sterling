// Netlify serverless function — proxies UN Comtrade public preview API.
// No API key required. 500 records/call, unlimited calls/day.

import type { Config } from '@netlify/functions';

const COMTRADE_BASE_URL =
  process.env['COMTRADE_BASE_URL'] ?? 'https://comtradeapi.un.org/public/v1/preview';

interface ComtradeRequestBody {
  reporterCode: number | string;
  cmdCode: string;
  flowCode: string;
  period: string;
  partnerCode?: number | string;
}

interface ComtradeApiResponse {
  count: number | null;
  data: unknown[] | null;
  error: string | null;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: CORS_HEADERS },
    );
  }

  let body: ComtradeRequestBody;
  try {
    body = await req.json() as ComtradeRequestBody;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { reporterCode, cmdCode, flowCode, period, partnerCode } = body;
  if (!reporterCode || !cmdCode || !flowCode || !period) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing required fields: reporterCode, cmdCode, flowCode, period' }),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const params = new URLSearchParams({
    reporterCode: String(reporterCode),
    cmdCode: String(cmdCode),
    flowCode: String(flowCode),
    period: String(period),
    maxRecords: '500',
    includeDesc: 'true',
  });
  if (partnerCode !== undefined && partnerCode !== null && partnerCode !== '') {
    params.set('partnerCode', String(partnerCode));
  }

  const url = `${COMTRADE_BASE_URL}/C/A/HS?${params.toString()}`;

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    let apiRes: Response;
    try {
      apiRes = await fetch(url, {
        signal: ctl.signal,
        headers: { accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '');
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Comtrade API returned HTTP ${apiRes.status}`,
          detail: errText.slice(0, 200),
        }),
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const apiData = await apiRes.json() as ComtradeApiResponse;
    return new Response(
      JSON.stringify({ ok: true, count: apiData.count ?? 0, data: apiData.data ?? [] }),
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: `Comtrade fetch failed — ${msg}` }),
      { status: 502, headers: CORS_HEADERS },
    );
  }
};

export const config: Config = {};
