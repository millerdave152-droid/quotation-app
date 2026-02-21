#!/usr/bin/env node
'use strict';

const BASE = 'http://localhost:3001/api';

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@yourcompany.com', password: 'TestPass123!' }),
  });
  const json = await res.json();
  if (!json.success) throw new Error('Login failed: ' + JSON.stringify(json));
  return json.data.accessToken;
}

async function test(name, method, url, token, body) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`${method} ${url}`);
  console.log('='.repeat(60));

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const json = await res.json();

  console.log(`Status: ${res.status}`);
  console.log('Response:', JSON.stringify(json, null, 2));

  const pass = (res.status >= 200 && res.status < 300) || res.status === 202 || res.status === 409;
  console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
  return { name, status: res.status, pass, data: json };
}

(async () => {
  try {
    console.log('Logging in as admin...');
    const token = await login();
    console.log('Authenticated OK\n');

    const results = [];

    // 1. GET /sync/status — should work even with no runs
    results.push(await test(
      'Sync Status (no runs)',
      'GET',
      `${BASE}/admin/skulytics/sync/status`,
      token
    ));

    // 2. GET /sync/history — paginated list
    results.push(await test(
      'Sync History (page 1)',
      'GET',
      `${BASE}/admin/skulytics/sync/history?page=1&pageSize=5`,
      token
    ));

    // 3. GET /sync/history with filters
    results.push(await test(
      'Sync History (filtered by type=incremental)',
      'GET',
      `${BASE}/admin/skulytics/sync/history?type=incremental`,
      token
    ));

    // 4. POST /match/auto — auto-matching engine
    results.push(await test(
      'Auto-Match Engine',
      'POST',
      `${BASE}/admin/skulytics/match/auto`,
      token
    ));

    // 5. POST /sync/trigger — incremental sync
    //    Note: This will likely fail with SKULYTICS_API_KEY not set,
    //    but should return 202 (fire-and-forget) or an error we can check
    results.push(await test(
      'Sync Trigger (incremental)',
      'POST',
      `${BASE}/admin/skulytics/sync/trigger`,
      token,
      { type: 'incremental' }
    ));

    // Brief pause to let sync attempt start
    await new Promise(r => setTimeout(r, 1000));

    // 6. GET /sync/status — check the triggered run
    results.push(await test(
      'Sync Status (after trigger)',
      'GET',
      `${BASE}/admin/skulytics/sync/status`,
      token
    ));

    // 7. POST /sync/trigger again — should get 409 if still running, or 202
    results.push(await test(
      'Sync Trigger (duplicate check)',
      'POST',
      `${BASE}/admin/skulytics/sync/trigger`,
      token,
      { type: 'incremental' }
    ));

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));
    for (const r of results) {
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  [${r.status}]  ${r.name}`);
    }
    const passed = results.filter(r => r.pass).length;
    console.log(`\n${passed}/${results.length} tests passed`);

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
})();
