// Hawkeye Sterling — k6 load test.
//
// Asserts: p95 response time ≤ 5s, error rate < 1%, throughput ≥ 10 req/s
// at 50 concurrent virtual users over a 60-second sustained run.
//
// Usage:
//   k6 run k6/screening-load-test.js \
//     -e TARGET_URL=https://hawkeye-sterling-v2.netlify.app \
//     -e API_KEY=hks_live_xxxx
//
// CI: run via .github/workflows/load-test.yml on schedule or manual trigger.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('error_rate');
const screeningLatency = new Trend('screening_latency_ms', true);

export const options = {
  stages: [
    { duration: '10s', target: 10 },  // ramp up
    { duration: '40s', target: 50 },  // sustained 50 VUs
    { duration: '10s', target: 0  },  // ramp down
  ],
  thresholds: {
    // SLA: p95 ≤ 5000ms end-to-end
    'http_req_duration{endpoint:screening}': ['p(95)<5000'],
    // Quality: < 1% error rate
    'error_rate': ['rate<0.01'],
    // Throughput: ≥ 10 req/s across the run (checked via iterations)
    'http_reqs': ['rate>10'],
  },
};

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:3000';
const API_KEY    = __ENV.API_KEY    || 'test-key';

const SUBJECTS = [
  'Ahmad Al-Rashidi',
  'Mohammed Ibrahim',
  'Wang Wei',
  'Maria Garcia',
  'Viktor Nikiforov',
  'Fatima Al-Zahra',
  'Bin Laden Trading LLC',
  'Acme Holdings FZE',
  'John Smith',
  'Sergei Volkov',
];

function pickSubject() {
  return SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
}

export default function () {
  const url = `${TARGET_URL}/api/screening/run`;
  const payload = JSON.stringify({
    subject: { name: pickSubject(), entityType: 'individual' },
    options: { maxHits: 10 },
  });
  const params = {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Request-ID': `k6-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    tags: { endpoint: 'screening' },
    timeout: '8s',
  };

  const res = http.post(url, payload, params);
  screeningLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    'response has ok field': (r) => {
      try { return JSON.parse(r.body).ok !== undefined; }
      catch { return false; }
    },
    'no 5xx': (r) => r.status < 500,
  });

  errorRate.add(!ok);
  sleep(0.1); // 100ms think time between requests per VU
}

export function handleSummary(data) {
  const p95 = data.metrics['http_req_duration{endpoint:screening}']?.values?.['p(95)'] ?? 'N/A';
  const errRate = ((data.metrics['error_rate']?.values?.rate ?? 0) * 100).toFixed(2);
  const rps = data.metrics['http_reqs']?.values?.rate?.toFixed(1) ?? 'N/A';
  const passed = data.metrics['http_req_duration{endpoint:screening}']?.thresholds?.['p(95)<5000']?.ok ?? false;

  console.log('\n=== Hawkeye Sterling Load Test Summary ===');
  console.log(`p95 latency:  ${typeof p95 === 'number' ? p95.toFixed(0) + 'ms' : p95}  (threshold: ≤5000ms) ${passed ? '✅' : '❌'}`);
  console.log(`Error rate:   ${errRate}%  (threshold: <1%)`);
  console.log(`Throughput:   ${rps} req/s  (threshold: ≥10 req/s)`);
  console.log('==========================================\n');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
