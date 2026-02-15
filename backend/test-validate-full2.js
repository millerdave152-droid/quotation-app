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

function printResult(label, r) {
  console.log('\n--- ' + label + ' ---');
  console.log('Status:', r.status);
  if (r.body.calculations) {
    const b = r.body;
    const c = b.calculations;
    console.log('  allowed:', b.allowed, '| reason:', b.reason);
    console.log('  original_price:', c.original_price, '| cost:', c.product_cost);
    console.log('  margin_before:', c.margin_before_discount_pct + '%', '($' + c.margin_before_discount_dollars + ')');
    console.log('  discount_amount:', c.discount_amount, '| price_after:', c.price_after_discount);
    console.log('  margin_after:', c.margin_after_discount_pct + '%', '($' + c.margin_after_discount_dollars + ')');
    console.log('  cost_floor:', c.cost_floor_price, '| max_allowed:', c.max_allowed_discount_pct + '% ($' + c.max_allowed_discount_dollars + ')');
    console.log('  commission: before=' + c.commission_before_discount, 'after=' + c.commission_after_discount, 'impact=' + c.commission_impact);
    console.log('  budget: before=' + c.budget_remaining_before, 'after=' + c.budget_remaining_after);
    console.log('  escalation:', b.escalation_required, '|', b.escalation_reason);
  } else {
    console.log('  Body:', JSON.stringify(r.body).substring(0, 400));
  }
}

(async () => {
  const login = await req('POST', '/api/auth/login', { email:'admin@yourcompany.com', password:'TestPass123!' });
  const token = login.body.token || (login.body.data && login.body.data.accessToken);
  if (!token) { console.log('No token'); process.exit(1); }
  const AUTH = { Authorization: 'Bearer ' + token };
  console.log('Logged in as admin (id=1)');

  // Product 1780: AGR6603SMS, price=1649.99, cost=1122.00 → margin ~32%

  // Test 1: Admin (master/unrestricted) - 10% on product 1780
  printResult('Admin 10% on $1649.99 appliance (unrestricted)',
    await req('POST', '/api/discount-authority/validate', { product_id: 1780, proposed_discount_pct: 10 }, AUTH));

  // Test 2: Staff employee 5 - 3% (within staff standard limit of 5%)
  printResult('Staff 3% (within limit)',
    await req('POST', '/api/discount-authority/validate', { product_id: 1780, proposed_discount_pct: 3, employee_id: 5 }, AUTH));

  // Test 3: Staff employee 5 - 8% (exceeds staff standard 5% but product is ~32% margin = high-margin, limit is 10%)
  printResult('Staff 8% (high-margin product, within 10% limit)',
    await req('POST', '/api/discount-authority/validate', { product_id: 1780, proposed_discount_pct: 8, employee_id: 5 }, AUTH));

  // Test 4: Staff employee 5 - 15% (exceeds even high-margin 10% limit → escalation)
  printResult('Staff 15% (exceeds tier limit → escalation)',
    await req('POST', '/api/discount-authority/validate', { product_id: 1780, proposed_discount_pct: 15, employee_id: 5 }, AUTH));

  // Test 5: Staff employee 5 - 30% (would drop below cost floor)
  printResult('Staff 30% (below cost floor → escalation)',
    await req('POST', '/api/discount-authority/validate', { product_id: 1780, proposed_discount_pct: 30, employee_id: 5 }, AUTH));

  // Test 6: Manager employee 4 - 20% (within manager 25% high-margin limit)
  printResult('Manager 20% on high-margin product (within limit)',
    await req('POST', '/api/discount-authority/validate', { product_id: 1780, proposed_discount_pct: 20, employee_id: 4 }, AUTH));

  // Test 7: Lower-margin product (233: $69.99 price, $48 cost → ~31% margin)
  printResult('Staff 4% on $69.99 accessory',
    await req('POST', '/api/discount-authority/validate', { product_id: 233, proposed_discount_pct: 4, employee_id: 5 }, AUTH));

  console.log('\n=== All 7 validate tests complete ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
