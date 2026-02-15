#!/usr/bin/env node
/**
 * WebSocket Event Verification Test
 *
 * Connects as manager + salesperson via WS, triggers approval actions
 * via HTTP, and verifies that the correct WS events arrive at the
 * correct recipients.
 *
 * Usage: node test-websocket-events.js
 */

const http = require('http');
const WebSocket = require('ws');
const pool = require('./db');

const BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/ws';

const results = { passed: 0, failed: 0, skipped: 0, errors: [] };

// ============================================================================
// HELPERS
// ============================================================================
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function test(name, passed, details = '') {
  if (passed) {
    results.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    results.failed++;
    results.errors.push(`${name}${details ? ': ' + details : ''}`);
    console.log(`  ❌ ${name}${details ? ' — ' + details : ''}`);
  }
}

function skip(name, reason) {
  results.skipped++;
  console.log(`  ⏭️  ${name} — SKIPPED: ${reason}`);
}

function section(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

async function login(email, password) {
  const res = await request('POST', '/auth/login', { email, password });
  if (res.status === 200 && res.data?.accessToken) {
    return { token: res.data.accessToken, user: res.data.user };
  }
  if (res.data?.data?.accessToken) {
    return { token: res.data.data.accessToken, user: res.data.data.user };
  }
  if (res.data?.token) {
    return { token: res.data.token, user: res.data.user };
  }
  throw new Error(`Login failed for ${email}: ${res.status}`);
}

/**
 * Connect a WebSocket client and return it with an event collector.
 */
function connectWS(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    const events = [];
    let connected = false;

    ws.on('open', () => { /* upgrade succeeded */ });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        events.push(msg);
        if (msg.event === 'connected') {
          connected = true;
          resolve({ ws, events });
        }
      } catch { /* ignore non-JSON */ }
    });

    ws.on('error', (err) => {
      if (!connected) reject(err);
    });

    // Timeout if 'connected' event doesn't arrive
    setTimeout(() => {
      if (!connected) {
        ws.close();
        reject(new Error('WS connected event timeout'));
      }
    }, 5000);
  });
}

/**
 * Wait for a specific event on a WS event collector.
 */
function waitForEvent(events, eventName, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const startLen = events.length;
    const start = Date.now();

    const check = () => {
      // Check all events (including ones that arrived before we started waiting)
      for (let i = 0; i < events.length; i++) {
        if (events[i].event === eventName) {
          return resolve(events[i]);
        }
      }
      if (Date.now() - start > timeoutMs) {
        return resolve(null);
      }
      setTimeout(check, 100);
    };
    check();
  });
}

/**
 * Wait for a specific event that arrives AFTER a given index.
 */
function waitForNewEvent(events, eventName, afterIndex, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();

    const check = () => {
      for (let i = afterIndex; i < events.length; i++) {
        if (events[i].event === eventName) {
          return resolve(events[i]);
        }
      }
      if (Date.now() - start > timeoutMs) {
        return resolve(null);
      }
      setTimeout(check, 100);
    };
    check();
  });
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  WEBSOCKET EVENT VERIFICATION TEST');
  console.log('  ' + new Date().toISOString());
  console.log('█'.repeat(70));

  // ---- Find users ----
  const { rows: users } = await pool.query(
    `SELECT id, email, role FROM users WHERE is_active = TRUE
     ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 3 WHEN 'salesperson' THEN 4 ELSE 5 END
     LIMIT 20`
  );
  const admin = users.find(u => u.role === 'admin');
  const manager = users.find(u => u.role === 'manager');
  const salesperson = users.find(u => u.role === 'salesperson');
  if (!admin || !manager || !salesperson) throw new Error('Need admin, manager, and salesperson');

  // ---- Login ----
  const adminLogin = await login(admin.email, 'TestPass123!');
  const mgrLogin = await login(manager.email, 'TestPass123!');
  const spLogin = await login(salesperson.email, 'TestPass123!');

  // Ensure manager availability
  await pool.query(
    `INSERT INTO manager_availability (user_id, status, last_heartbeat, pending_request_count, active_device_count, last_updated)
     VALUES ($1, 'online', NOW(), 0, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_heartbeat = NOW(), active_device_count = 1, last_updated = NOW()`,
    [manager.id]
  );

  // ---- Find product ----
  const { rows: [product] } = await pool.query(
    `SELECT id, name, price, cost FROM products WHERE price > 0 AND cost > 0 AND price > cost ORDER BY id LIMIT 1`
  );
  if (!product) throw new Error('No suitable product found');
  const price = parseFloat(product.price);

  // ==========================================================================
  // 1. WS CONNECTION & AUTH
  // ==========================================================================
  section('1. WS CONNECTION & AUTHENTICATION');

  // Valid connection
  let mgrWS, mgrEvents, spWS, spEvents;
  try {
    ({ ws: mgrWS, events: mgrEvents } = await connectWS(mgrLogin.token));
    test('Manager WS connection succeeds', true);
    const connEvent = mgrEvents.find(e => e.event === 'connected');
    test('Manager receives "connected" event', !!connEvent);
    test('Connected event has userId', connEvent?.data?.userId === manager.id,
      `got ${connEvent?.data?.userId}, expected ${manager.id}`);
    test('Connected event has role', connEvent?.data?.role === 'manager',
      `got ${connEvent?.data?.role}`);
  } catch (err) {
    test('Manager WS connection succeeds', false, err.message);
    console.log('\n  Cannot continue without WS connection.');
    await pool.end();
    process.exit(1);
  }

  try {
    ({ ws: spWS, events: spEvents } = await connectWS(spLogin.token));
    test('Salesperson WS connection succeeds', true);
  } catch (err) {
    test('Salesperson WS connection succeeds', false, err.message);
  }

  // Invalid token connection
  try {
    const badWS = new WebSocket(`${WS_URL}?token=invalid_token_abc`);
    await new Promise((resolve, reject) => {
      badWS.on('open', () => { badWS.close(); resolve('open'); });
      badWS.on('error', () => resolve('error'));
      badWS.on('unexpected-response', (req, res) => { resolve(`rejected:${res.statusCode}`); });
      setTimeout(() => resolve('timeout'), 3000);
    }).then(result => {
      test('Invalid token WS connection rejected', result.includes('rejected') || result === 'error',
        `result: ${result}`);
    });
  } catch {
    test('Invalid token WS connection rejected', true);
  }

  // No token connection
  try {
    const noTokenWS = new WebSocket(`${WS_URL}`);
    await new Promise((resolve) => {
      noTokenWS.on('open', () => { noTokenWS.close(); resolve('open'); });
      noTokenWS.on('error', () => resolve('error'));
      noTokenWS.on('unexpected-response', (req, res) => { resolve(`rejected:${res.statusCode}`); });
      setTimeout(() => resolve('timeout'), 3000);
    }).then(result => {
      test('No token WS connection rejected', result.includes('rejected') || result === 'error',
        `result: ${result}`);
    });
  } catch {
    test('No token WS connection rejected', true);
  }

  // ==========================================================================
  // 2. APPROVAL REQUEST → MANAGER RECEIVES EVENT
  // ==========================================================================
  section('2. APPROVAL REQUEST → MANAGER WS EVENT');

  const tier2Price = +(price * 0.85).toFixed(2);
  const mgrEvtIdx = mgrEvents.length; // track from this point

  const createRes = await request('POST', '/pos-approvals/request', {
    productId: product.id,
    requestedPrice: tier2Price,
    managerId: manager.id,
  }, spLogin.token);

  test('Create approval request succeeds', createRes.status === 201);
  const requestId = createRes.data?.data?.id;

  if (requestId) {
    const mgrEvt = await waitForNewEvent(mgrEvents, 'approval:request', mgrEvtIdx, 5000);
    test('Manager receives approval:request WS event', !!mgrEvt,
      mgrEvt ? `requestId=${mgrEvt.data?.requestId}` : 'no event received');

    if (mgrEvt) {
      test('Event has correct requestId', mgrEvt.data?.requestId === requestId);
      test('Event has productName', !!mgrEvt.data?.productName);
      test('Event has salespersonName', !!mgrEvt.data?.salespersonName);
      test('Event has tier info', !!mgrEvt.data?.tier);
      test('Event has originalPrice', mgrEvt.data?.originalPrice !== undefined);
      test('Event has requestedPrice', mgrEvt.data?.requestedPrice !== undefined);
    }
  } else {
    skip('Manager WS event check', 'No request created');
  }

  // ==========================================================================
  // 3. APPROVE → SALESPERSON RECEIVES EVENT
  // ==========================================================================
  section('3. APPROVE → SALESPERSON WS EVENT');

  if (requestId) {
    const spEvtIdx = spEvents.length;

    const approveRes = await request('POST', `/pos-approvals/${requestId}/approve`, {
      method: 'remote',
    }, mgrLogin.token);
    test('Approve succeeds', approveRes.status === 200);

    const spEvt = await waitForNewEvent(spEvents, 'approval:approved', spEvtIdx, 5000);
    test('Salesperson receives approval:approved WS event', !!spEvt,
      spEvt ? `requestId=${spEvt.data?.requestId}` : 'no event received');

    if (spEvt) {
      test('Approved event has correct requestId', spEvt.data?.requestId === requestId);
      test('Approved event has approvedPrice', spEvt.data?.approvedPrice !== undefined);
      test('Approved event has managerName', !!spEvt.data?.managerName);
      test('Approved event has approvalToken', !!spEvt.data?.approvalToken);
      test('Approved event has method', spEvt.data?.method === 'remote');
    }
  }

  // ==========================================================================
  // 4. DENY → SALESPERSON RECEIVES EVENT
  // ==========================================================================
  section('4. DENY → SALESPERSON WS EVENT');

  const mgrEvtIdx2 = mgrEvents.length;
  const spEvtIdx2 = spEvents.length;

  const createRes2 = await request('POST', '/pos-approvals/request', {
    productId: product.id,
    requestedPrice: tier2Price,
    managerId: manager.id,
  }, spLogin.token);
  const reqId2 = createRes2.data?.data?.id;

  if (reqId2) {
    // Wait for manager to get the request event first
    await waitForNewEvent(mgrEvents, 'approval:request', mgrEvtIdx2, 3000);

    const spEvtIdxBeforeDeny = spEvents.length;
    const denyRes = await request('POST', `/pos-approvals/${reqId2}/deny`, {
      reasonCode: 'margin_too_low',
      reasonNote: 'WS test denial',
    }, mgrLogin.token);
    test('Deny succeeds', denyRes.status === 200);

    const denyEvt = await waitForNewEvent(spEvents, 'approval:denied', spEvtIdxBeforeDeny, 5000);
    test('Salesperson receives approval:denied WS event', !!denyEvt,
      denyEvt ? `requestId=${denyEvt.data?.requestId}` : 'no event received');

    if (denyEvt) {
      test('Denied event has correct requestId', denyEvt.data?.requestId === reqId2);
      test('Denied event has reasonCode', denyEvt.data?.reasonCode === 'margin_too_low');
      test('Denied event has managerName', !!denyEvt.data?.managerName);
    }
  }

  // ==========================================================================
  // 5. COUNTER-OFFER → SALESPERSON RECEIVES EVENT, ACCEPT → MANAGER RECEIVES
  // ==========================================================================
  section('5. COUNTER-OFFER WS EVENTS');

  const mgrEvtIdx3 = mgrEvents.length;
  const createRes3 = await request('POST', '/pos-approvals/request', {
    productId: product.id,
    requestedPrice: tier2Price,
    managerId: manager.id,
  }, spLogin.token);
  const reqId3 = createRes3.data?.data?.id;

  if (reqId3) {
    await waitForNewEvent(mgrEvents, 'approval:request', mgrEvtIdx3, 3000);

    const spEvtIdxBeforeCounter = spEvents.length;
    const counterPrice = +(price * 0.90).toFixed(2);
    const counterRes = await request('POST', `/pos-approvals/${reqId3}/counter`, {
      counterPrice,
    }, mgrLogin.token);
    test('Counter-offer succeeds', counterRes.status === 200);
    const counterOfferId = counterRes.data?.data?.id;

    const counterEvt = await waitForNewEvent(spEvents, 'approval:countered', spEvtIdxBeforeCounter, 5000);
    test('Salesperson receives approval:countered WS event', !!counterEvt,
      counterEvt ? `requestId=${counterEvt.data?.requestId}` : 'no event received');

    if (counterEvt) {
      test('Countered event has counterPrice', counterEvt.data?.counterPrice !== undefined);
      test('Countered event has managerName', !!counterEvt.data?.managerName);
    }

    // Accept counter-offer → manager gets counter-accepted event
    if (counterOfferId) {
      const mgrEvtIdxBeforeAccept = mgrEvents.length;
      const acceptRes = await request('POST', `/pos-approvals/${reqId3}/accept-counter`, {
        counterOfferId,
      }, spLogin.token);
      test('Accept counter-offer succeeds', acceptRes.status === 200);

      const acceptEvt = await waitForNewEvent(mgrEvents, 'approval:counter-accepted', mgrEvtIdxBeforeAccept, 5000);
      test('Manager receives approval:counter-accepted WS event', !!acceptEvt,
        acceptEvt ? `requestId=${acceptEvt.data?.requestId}` : 'no event received');

      if (acceptEvt) {
        test('Counter-accepted event has approvedPrice', acceptEvt.data?.approvedPrice !== undefined);
        test('Counter-accepted event has salespersonName', !!acceptEvt.data?.salespersonName);
      }
    }
  }

  // ==========================================================================
  // 6. COUNTER-OFFER DECLINE → MANAGER RECEIVES EVENT
  // ==========================================================================
  section('6. COUNTER-OFFER DECLINE WS EVENT');

  const mgrEvtIdx4 = mgrEvents.length;
  const createRes4 = await request('POST', '/pos-approvals/request', {
    productId: product.id,
    requestedPrice: tier2Price,
    managerId: manager.id,
  }, spLogin.token);
  const reqId4 = createRes4.data?.data?.id;

  if (reqId4) {
    await waitForNewEvent(mgrEvents, 'approval:request', mgrEvtIdx4, 3000);

    const counterPrice2 = +(price * 0.92).toFixed(2);
    const counterRes2 = await request('POST', `/pos-approvals/${reqId4}/counter`, {
      counterPrice: counterPrice2,
    }, mgrLogin.token);
    const coId2 = counterRes2.data?.data?.id;

    if (coId2) {
      const mgrEvtIdxBeforeDecline = mgrEvents.length;
      await request('POST', `/pos-approvals/${reqId4}/decline-counter`, {
        counterOfferId: coId2,
      }, spLogin.token);

      const declineEvt = await waitForNewEvent(mgrEvents, 'approval:counter-declined', mgrEvtIdxBeforeDecline, 5000);
      test('Manager receives approval:counter-declined WS event', !!declineEvt,
        declineEvt ? `requestId=${declineEvt.data?.requestId}` : 'no event received');

      // Clean up
      await request('POST', `/pos-approvals/${reqId4}/cancel`, {}, spLogin.token);
    }
  }

  // ==========================================================================
  // 7. CANCELLATION → MANAGER RECEIVES EVENT
  // ==========================================================================
  section('7. CANCELLATION WS EVENT');

  const mgrEvtIdx5 = mgrEvents.length;
  const createRes5 = await request('POST', '/pos-approvals/request', {
    productId: product.id,
    requestedPrice: tier2Price,
    managerId: manager.id,
  }, spLogin.token);
  const reqId5 = createRes5.data?.data?.id;

  if (reqId5) {
    await waitForNewEvent(mgrEvents, 'approval:request', mgrEvtIdx5, 3000);

    const mgrEvtIdxBeforeCancel = mgrEvents.length;
    await request('POST', `/pos-approvals/${reqId5}/cancel`, {}, spLogin.token);

    const cancelEvt = await waitForNewEvent(mgrEvents, 'approval:cancelled', mgrEvtIdxBeforeCancel, 5000);
    test('Manager receives approval:cancelled WS event', !!cancelEvt,
      cancelEvt ? `requestId=${cancelEvt.data?.requestId}` : 'no event received');
  }

  // ==========================================================================
  // 8. BATCH APPROVAL → WS EVENTS
  // ==========================================================================
  section('8. BATCH APPROVAL WS EVENTS');

  const { rows: [product2] } = await pool.query(
    `SELECT id, price FROM products WHERE price > 0 AND cost > 0 AND price > cost AND id != $1 ORDER BY id LIMIT 1`,
    [product.id]
  );

  if (product2) {
    const mgrEvtIdx6 = mgrEvents.length;
    const batchRes = await request('POST', '/pos-approvals/batch-request', {
      managerId: manager.id,
      items: [
        { productId: product.id, requestedPrice: +(price * 0.88).toFixed(2) },
        { productId: product2.id, requestedPrice: +(parseFloat(product2.price) * 0.87).toFixed(2) },
      ],
    }, spLogin.token);
    test('Batch request created', batchRes.status === 201);
    const parentId = batchRes.data?.data?.parent?.id;

    if (parentId) {
      const batchReqEvt = await waitForNewEvent(mgrEvents, 'approval:batch-request', mgrEvtIdx6, 5000);
      test('Manager receives approval:batch-request WS event', !!batchReqEvt,
        batchReqEvt ? 'received' : 'no event');

      // Approve batch
      const spEvtIdxBeforeBatch = spEvents.length;
      await request('POST', `/pos-approvals/batch/${parentId}/approve`, { method: 'remote' }, mgrLogin.token);

      const batchApprovedEvt = await waitForNewEvent(spEvents, 'approval:batch-approved', spEvtIdxBeforeBatch, 5000);
      test('Salesperson receives approval:batch-approved WS event', !!batchApprovedEvt,
        batchApprovedEvt ? 'received' : 'no event');
    }
  } else {
    skip('Batch WS events', 'Need 2 products');
  }

  // ==========================================================================
  // 9. DELEGATION WS EVENTS
  // ==========================================================================
  section('9. DELEGATION WS EVENTS');

  const spEvtIdxBeforeDelegation = spEvents.length;
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const delRes = await request('POST', '/pos-approvals/delegations', {
    delegateId: salesperson.id,
    maxTier: 2,
    expiresAt,
    reason: 'WS test delegation',
  }, mgrLogin.token);

  const delegationId = delRes.data?.data?.id;
  test('Create delegation succeeds', !!delegationId);

  if (delegationId) {
    const grantedEvt = await waitForNewEvent(spEvents, 'delegation:granted', spEvtIdxBeforeDelegation, 5000);
    test('Delegate receives delegation:granted WS event', !!grantedEvt,
      grantedEvt ? `delegationId=${grantedEvt.data?.delegationId}` : 'no event');

    if (grantedEvt) {
      test('Granted event has delegatorName', !!grantedEvt.data?.delegatorName);
    }

    // Revoke and check for revoked event
    const spEvtIdxBeforeRevoke = spEvents.length;
    await request('DELETE', `/pos-approvals/delegations/${delegationId}`, null, mgrLogin.token);

    const revokedEvt = await waitForNewEvent(spEvents, 'delegation:revoked', spEvtIdxBeforeRevoke, 5000);
    test('Delegate receives delegation:revoked WS event', !!revokedEvt,
      revokedEvt ? `delegationId=${revokedEvt.data?.delegationId}` : 'no event');
  }

  // ==========================================================================
  // 10. MANAGER STATUS CHANGE EVENT
  // ==========================================================================
  section('10. MANAGER STATUS CHANGE');

  // When we opened the manager WS connection, a manager:status-change event
  // should have been broadcast to salesperson-role clients
  const statusEvt = spEvents.find(e => e.event === 'manager:status-change');
  test('Salesperson received manager:status-change event', !!statusEvt,
    statusEvt ? `managerId=${statusEvt.data?.managerId}, status=${statusEvt.data?.status}` : 'no event');

  // ==========================================================================
  // 11. HEARTBEAT / PING
  // ==========================================================================
  section('11. HEARTBEAT / PING');

  // ws library handles pong automatically; check we get a ping within 35s
  const pingReceived = await new Promise((resolve) => {
    mgrWS.on('ping', () => resolve(true));
    setTimeout(() => resolve(false), 35000);
  });
  test('Server sends heartbeat ping within 35 seconds', pingReceived);

  // ==========================================================================
  // CLEANUP
  // ==========================================================================
  section('CLEANUP');
  mgrWS.close();
  spWS.close();
  console.log('  WebSocket connections closed.');

  // Wait a moment for close events to propagate
  await new Promise(r => setTimeout(r, 1000));

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n' + '█'.repeat(70));
  console.log('  WEBSOCKET TEST RESULTS SUMMARY');
  console.log('█'.repeat(70));
  console.log(`  ✅ Passed:  ${results.passed}`);
  console.log(`  ❌ Failed:  ${results.failed}`);
  console.log(`  ⏭️  Skipped: ${results.skipped}`);
  console.log(`  📊 Total:   ${results.passed + results.failed + results.skipped}`);

  if (results.errors.length > 0) {
    console.log(`\n  FAILURES:`);
    results.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  const pct = results.passed + results.failed > 0
    ? ((results.passed / (results.passed + results.failed)) * 100).toFixed(1)
    : '0.0';
  console.log(`\n  Pass rate: ${pct}%`);
  console.log('█'.repeat(70) + '\n');

  await pool.end();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  pool.end().then(() => process.exit(1));
});
