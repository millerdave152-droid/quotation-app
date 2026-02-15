const http = require('http');

function req(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname:'localhost', port:3001, path, method, headers:{ 'Content-Type':'application/json', ...headers } };
    const r = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(d)})); });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const login = await req('POST', '/api/auth/login', { email:'admin@yourcompany.com', password:'TestPass123!' });
  const token = login.body.token || (login.body.data && login.body.data.accessToken);
  if (!token) { console.log('No token:', JSON.stringify(login.body).substring(0,200)); process.exit(1); }
  const AUTH = { Authorization: 'Bearer ' + token };
  console.log('Logged in as admin');

  // Test 1: POST /api/discount-escalations
  console.log('\n--- Test 1: POST /api/discount-escalations (submit) ---');
  const t1 = await req('POST', '/api/discount-escalations', {
    productId: 1, discountPct: 20, reason: 'Customer loyalty - repeat buyer',
    marginAfter: 12.5, commissionImpact: 2.50
  }, AUTH);
  console.log('Status:', t1.status, 'ID:', t1.body.data && t1.body.data.id, 'EscStatus:', t1.body.data && t1.body.data.status);
  const escId = t1.body.data && t1.body.data.id;

  // Test 2: GET /api/discount-escalations/pending
  console.log('\n--- Test 2: GET /api/discount-escalations/pending ---');
  const t2 = await req('GET', '/api/discount-escalations/pending', null, AUTH);
  console.log('Status:', t2.status, 'Count:', t2.body.data && t2.body.data.length);
  if (t2.body.data && t2.body.data.length > 0) {
    const e = t2.body.data[0];
    console.log('  First:', 'id=' + e.id, 'employee=' + e.employee_name, 'product=' + e.product_name, 'pct=' + e.requested_discount_pct);
  }

  // Test 3: PUT deny without reason (should 400)
  console.log('\n--- Test 3: PUT deny without reason (should 400) ---');
  const t3 = await req('PUT', '/api/discount-escalations/' + escId + '/deny', {}, AUTH);
  console.log('Status:', t3.status, 'Error:', t3.body.error && t3.body.error.message);

  // Test 4: PUT deny with reason
  console.log('\n--- Test 4: PUT deny with reason ---');
  const t4 = await req('PUT', '/api/discount-escalations/' + escId + '/deny', { reason: 'Margin too low for this product category' }, AUTH);
  console.log('Status:', t4.status, 'NewStatus:', t4.body.data && t4.body.data.status, 'ReviewedBy:', t4.body.data && t4.body.data.reviewed_by);

  // Test 5: Submit another then approve
  console.log('\n--- Test 5: Submit + approve ---');
  const t5a = await req('POST', '/api/discount-escalations', {
    productId: 1, discountPct: 8, reason: 'Price match competitor',
    marginAfter: 22.0, commissionImpact: 1.00
  }, AUTH);
  const escId2 = t5a.body.data && t5a.body.data.id;
  console.log('Created escalation:', escId2);

  const t5b = await req('PUT', '/api/discount-escalations/' + escId2 + '/approve', { notes: 'Approved - competitor price verified' }, AUTH);
  console.log('Status:', t5b.status, 'NewStatus:', t5b.body.data && t5b.body.data.status, 'Notes:', t5b.body.data && t5b.body.data.review_notes);

  // Test 6: Approve already-resolved (should 404)
  console.log('\n--- Test 6: Approve already-resolved (should 404) ---');
  const t6 = await req('PUT', '/api/discount-escalations/' + escId2 + '/approve', {}, AUTH);
  console.log('Status:', t6.status, 'Error:', t6.body.error && t6.body.error.message);

  // Test 7: Pending list should be empty
  console.log('\n--- Test 7: Pending list after resolving all ---');
  const t7 = await req('GET', '/api/discount-escalations/pending', null, AUTH);
  console.log('Status:', t7.status, 'Pending count:', t7.body.data && t7.body.data.length);

  console.log('\n=== All 7 escalation tests complete ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
