const http = require('http');

function post(path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = { hostname:'localhost', port:3001, path, method:'POST', headers:{ 'Content-Type':'application/json', ...headers } };
    const req = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(d)})); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname:'localhost', port:3001, path, method:'GET', headers };
    const req = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(d)})); });
    req.on('error', reject);
    req.end();
  });
}

function put(path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = { hostname:'localhost', port:3001, path, method:'PUT', headers:{ 'Content-Type':'application/json', ...headers } };
    const req = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(d)})); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  // Login as admin
  const login = await post('/api/auth/login', { email:'admin@yourcompany.com', password:'TestPass123!' });
  console.log('Login:', login.status);
  const token = login.body.token || (login.body.data && login.body.data.accessToken);
  if (!token) { console.log('No token:', JSON.stringify(login.body).substring(0,300)); process.exit(1); }
  console.log('Token obtained');

  const AUTH = { Authorization: 'Bearer ' + token };

  // Test 1: GET /my-tier
  console.log('\n--- Test 1: GET /my-tier ---');
  const t1 = await get('/api/discount-authority/my-tier', AUTH);
  console.log('Status:', t1.status, 'Tier:', t1.body.data && t1.body.data.tier && t1.body.data.tier.role_name, 'Budget:', t1.body.data && t1.body.data.budget);

  // Test 2: GET /tiers (admin)
  console.log('\n--- Test 2: GET /tiers (admin) ---');
  const t2 = await get('/api/discount-authority/tiers', AUTH);
  console.log('Status:', t2.status, 'Count:', t2.body.data && t2.body.data.length);
  if (t2.body.data) t2.body.data.forEach(t => console.log('  -', t.role_name, '| std:', t.max_discount_pct_standard, '| hi:', t.max_discount_pct_high_margin));

  // Test 3: POST /validate (3% discount on 40% margin item - should approve for admin/master)
  console.log('\n--- Test 3: POST /validate (3% discount) ---');
  const t3 = await post('/api/discount-authority/validate', { productId:1, originalPrice:1000, cost:600, discountPct:3 }, AUTH);
  console.log('Status:', t3.status, 'Approved:', t3.body.data && t3.body.data.approved, 'Reason:', t3.body.data && t3.body.data.reason);

  // Test 4: POST /validate (8% discount on low-margin item)
  console.log('\n--- Test 4: POST /validate (8% discount, low margin) ---');
  const t4 = await post('/api/discount-authority/validate', { productId:1, originalPrice:1000, cost:700, discountPct:8 }, AUTH);
  console.log('Status:', t4.status, 'Approved:', t4.body.data && t4.body.data.approved, 'RequiresManager:', t4.body.data && t4.body.data.requiresManagerApproval);

  // Test 5: POST /budget/initialize
  console.log('\n--- Test 5: POST /budget/initialize ---');
  const t5 = await post('/api/discount-authority/budget/initialize', {}, AUTH);
  console.log('Status:', t5.status, 'Created:', t5.body.data && t5.body.data.created, 'Budget:', t5.body.data && t5.body.data.budget && t5.body.data.budget.total_budget_dollars);

  // Test 6: POST /apply (valid 3%)
  console.log('\n--- Test 6: POST /apply (valid 3%) ---');
  const t6 = await post('/api/discount-authority/apply', { productId:1, originalPrice:1000, cost:600, discountPct:3 }, AUTH);
  console.log('Status:', t6.status, 'Approved:', t6.body.data && t6.body.data.approved, 'TxId:', t6.body.data && t6.body.data.transactionId);

  // Test 7: PUT /tiers/staff (admin update)
  console.log('\n--- Test 7: PUT /tiers/staff (admin update) ---');
  const t7 = await put('/api/discount-authority/tiers/staff', { max_discount_pct_standard: '6.00' }, AUTH);
  console.log('Status:', t7.status, 'Updated std:', t7.body.data && t7.body.data.max_discount_pct_standard);
  // Revert
  await put('/api/discount-authority/tiers/staff', { max_discount_pct_standard: '5.00' }, AUTH);

  console.log('\n=== All 7 tests complete ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
