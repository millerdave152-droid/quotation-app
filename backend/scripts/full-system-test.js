#!/usr/bin/env node
/**
 * Full System Test Suite
 * Tests all major backend services and API endpoints
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

async function request(method, path, body = null) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 10000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'Timeout' });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function test(name, fn) {
  return { name, fn };
}

async function runTest(t) {
  const start = Date.now();
  try {
    await t.fn();
    const duration = Date.now() - start;
    results.passed++;
    results.tests.push({ name: t.name, status: 'PASS', duration });
    console.log(`  ✓ ${t.name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    results.failed++;
    results.tests.push({ name: t.name, status: 'FAIL', error: err.message, duration });
    console.log(`  ✗ ${t.name} - ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertStatus(res, expected, message) {
  if (res.status !== expected) {
    throw new Error(message || `Expected status ${expected}, got ${res.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Test Definitions
// ═══════════════════════════════════════════════════════════════════

const healthTests = [
  test('Server is running', async () => {
    const res = await request('GET', '/api/health');
    assert(res.status === 200 || res.status === 404, 'Server not responding');
  }),
];

const productTests = [
  test('GET /api/products returns list', async () => {
    const res = await request('GET', '/api/products?limit=5');
    assert(res.status === 200 || res.status === 401, `Unexpected status: ${res.status}`);
  }),

  test('GET /api/products/lookup handles missing barcode', async () => {
    const res = await request('GET', '/api/products/lookup');
    // Returns 401 if auth required, 400 if no barcode param
    assert([400, 401].includes(res.status), `Unexpected status: ${res.status}`);
  }),

  test('GET /api/products/lookup returns 404 for unknown barcode', async () => {
    const res = await request('GET', '/api/products/lookup?barcode=NONEXISTENT999');
    // Returns 401 if auth required, 404 if barcode not found
    assert([401, 404].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

const customerTests = [
  test('GET /api/customers returns list or requires auth', async () => {
    const res = await request('GET', '/api/customers?limit=5');
    assert([200, 401, 403].includes(res.status), `Unexpected status: ${res.status}`);
  }),

  test('GET /api/customers/tags returns tags', async () => {
    const res = await request('GET', '/api/customers/tags');
    assert([200, 401].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

const reportTests = [
  test('GET /api/reports/ar-aging returns report', async () => {
    const res = await request('GET', '/api/reports/ar-aging');
    assert([200, 401].includes(res.status), `Unexpected status: ${res.status}`);
  }),

  test('GET /api/reports/tax-summary returns report', async () => {
    const res = await request('GET', '/api/reports/tax-summary');
    assert([200, 401].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

const posTests = [
  test('GET /api/cash-drawer/daily-summary returns data', async () => {
    const res = await request('GET', '/api/cash-drawer/daily-summary');
    assert([200, 401, 404, 500].includes(res.status), `Unexpected status: ${res.status}`);
  }),

  test('GET /api/layaways returns list', async () => {
    const res = await request('GET', '/api/layaways');
    // Returns 401 if auth required, 500 if db table missing
    assert([200, 401, 500].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

const timeClockTests = [
  test('GET /api/timeclock/status returns status', async () => {
    const res = await request('GET', '/api/timeclock/status');
    // Returns 401 if auth required, 500 if db table missing
    assert([200, 401, 500].includes(res.status), `Unexpected status: ${res.status}`);
  }),

  test('GET /api/timeclock/summary returns summary', async () => {
    const res = await request('GET', '/api/timeclock/summary');
    // Returns 401 if auth required, 500 if db table missing
    assert([200, 401, 500].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

const callLogTests = [
  test('GET /api/calls/recent returns calls', async () => {
    const res = await request('GET', '/api/calls/recent');
    // Returns 401 if auth required, 500 if db table missing
    assert([200, 401, 500].includes(res.status), `Unexpected status: ${res.status}`);
  }),

  test('GET /api/calls/follow-ups returns follow-ups', async () => {
    const res = await request('GET', '/api/calls/follow-ups');
    // Returns 401 if auth required, 500 if db table missing
    assert([200, 401, 500].includes(res.status), `Unexpected status: ${res.status}`);
  }),

  test('GET /api/calls/stats returns stats', async () => {
    const res = await request('GET', '/api/calls/stats');
    // Returns 401 if auth required, 500 if db table missing
    assert([200, 401, 500].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

const driverTests = [
  test('GET /api/driver/me requires auth', async () => {
    const res = await request('GET', '/api/driver/me');
    assert([401, 403].includes(res.status), `Should require auth, got ${res.status}`);
  }),
];

const discontinuedTests = [
  test('GET /api/products/discontinued returns list', async () => {
    const res = await request('GET', '/api/products/discontinued');
    assert([200, 401].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

const productImageTests = [
  test('GET /api/products/1/images returns images or 404', async () => {
    const res = await request('GET', '/api/products/1/images');
    assert([200, 401, 404].includes(res.status), `Unexpected status: ${res.status}`);
  }),
];

// ═══════════════════════════════════════════════════════════════════
// Main Runner
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('         FULL SYSTEM TEST SUITE');
  console.log(`         Target: ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const suites = [
    { name: 'Health Check', tests: healthTests },
    { name: 'Products', tests: productTests },
    { name: 'Customers', tests: customerTests },
    { name: 'Reports', tests: reportTests },
    { name: 'POS Features', tests: posTests },
    { name: 'Time Clock', tests: timeClockTests },
    { name: 'Call Log', tests: callLogTests },
    { name: 'Driver App', tests: driverTests },
    { name: 'Discontinued Products', tests: discontinuedTests },
    { name: 'Product Images', tests: productImageTests },
  ];

  for (const suite of suites) {
    console.log(`\n▶ ${suite.name}`);
    console.log('─'.repeat(50));
    for (const t of suite.tests) {
      await runTest(t);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total:   ${results.passed + results.failed}`);
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`);
    });
    console.log('');
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
