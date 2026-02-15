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
  // Login as admin
  const login = await req('POST', '/api/auth/login', { email:'admin@yourcompany.com', password:'TestPass123!' });
  const token = login.body.token || (login.body.data && login.body.data.accessToken);
  if (!token) { console.log('No token:', JSON.stringify(login.body).substring(0,200)); process.exit(1); }
  const AUTH = { Authorization: 'Bearer ' + token };
  console.log('Logged in as admin');

  // Initialize budget
  await req('POST', '/api/discount-authority/budget/initialize', {}, AUTH);

  // Test 1: Admin (master tier, unrestricted) - 10% on product 1
  console.log('\n--- Test 1: Admin validates 10% discount on product 1 ---');
  const t1 = await req('POST', '/api/discount-authority/validate', {
    product_id: 1, proposed_discount_pct: 10
  }, AUTH);
  console.log('Status:', t1.status);
  if (t1.body.calculations) {
    console.log('  allowed:', t1.body.allowed, '| reason:', t1.body.reason);
    const c = t1.body.calculations;
    console.log('  original_price:', c.original_price, '| cost:', c.product_cost);
    console.log('  margin_before:', c.margin_before_discount_pct + '%', '($' + c.margin_before_discount_dollars + ')');
    console.log('  discount_amount:', c.discount_amount, '| price_after:', c.price_after_discount);
    console.log('  margin_after:', c.margin_after_discount_pct + '%', '($' + c.margin_after_discount_dollars + ')');
    console.log('  cost_floor_price:', c.cost_floor_price);
    console.log('  max_allowed:', c.max_allowed_discount_pct + '%', '($' + c.max_allowed_discount_dollars + ')');
    console.log('  commission_before:', c.commission_before_discount, '| after:', c.commission_after_discount, '| impact:', c.commission_impact);
    console.log('  budget_before:', c.budget_remaining_before, '| after:', c.budget_remaining_after);
    console.log('  escalation_required:', t1.body.escalation_required, '| reason:', t1.body.escalation_reason);
  } else {
    console.log('  Response:', JSON.stringify(t1.body).substring(0, 500));
  }

  // Test 2: Validate for a different employee (staff) - should show tier limits
  console.log('\n--- Test 2: Admin validates 10% for employee 2 (staff tier) ---');
  const t2 = await req('POST', '/api/discount-authority/validate', {
    product_id: 1, proposed_discount_pct: 10, employee_id: 2
  }, AUTH);
  console.log('Status:', t2.status);
  if (t2.body.calculations) {
    console.log('  allowed:', t2.body.allowed, '| reason:', t2.body.reason);
    const c = t2.body.calculations;
    console.log('  max_allowed:', c.max_allowed_discount_pct + '%');
    console.log('  cost_floor_price:', c.cost_floor_price);
    console.log('  escalation_required:', t2.body.escalation_required, '| reason:', t2.body.escalation_reason);
  } else {
    console.log('  Response:', JSON.stringify(t2.body).substring(0, 500));
  }

  // Test 3: Small discount within staff limits
  console.log('\n--- Test 3: Admin validates 3% for employee 2 (within staff limits) ---');
  const t3 = await req('POST', '/api/discount-authority/validate', {
    product_id: 1, proposed_discount_pct: 3, employee_id: 2
  }, AUTH);
  console.log('Status:', t3.status);
  if (t3.body.calculations) {
    console.log('  allowed:', t3.body.allowed, '| reason:', t3.body.reason);
    console.log('  escalation_required:', t3.body.escalation_required);
  } else {
    console.log('  Response:', JSON.stringify(t3.body).substring(0, 500));
  }

  // Test 4: Missing product_id
  console.log('\n--- Test 4: Missing product_id (should 400) ---');
  const t4 = await req('POST', '/api/discount-authority/validate', {
    proposed_discount_pct: 5
  }, AUTH);
  console.log('Status:', t4.status, 'Error:', t4.body.error && t4.body.error.message);

  // Test 5: Non-existent product
  console.log('\n--- Test 5: Non-existent product (should show not found) ---');
  const t5 = await req('POST', '/api/discount-authority/validate', {
    product_id: 99999, proposed_discount_pct: 5
  }, AUTH);
  console.log('Status:', t5.status, 'allowed:', t5.body.allowed, 'reason:', t5.body.reason);

  console.log('\n=== All 5 validate tests complete ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
