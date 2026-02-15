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

  // Seed a couple more discount transactions for richer analytics
  await req('POST', '/api/discount-authority/budget/initialize', {}, AUTH);
  await req('POST', '/api/discount-authority/apply', { productId:1, originalPrice:500, cost:300, discountPct:5 }, AUTH);
  await req('POST', '/api/discount-authority/apply', { productId:2, originalPrice:800, cost:500, discountPct:4 }, AUTH);
  console.log('Seeded extra transactions');

  // Test 1: GET /api/discount-analytics/by-employee
  console.log('\n--- Test 1: GET /by-employee ---');
  const t1 = await req('GET', '/api/discount-analytics/by-employee', null, AUTH);
  console.log('Status:', t1.status, 'Employees:', t1.body.data && t1.body.data.length);
  if (t1.body.data) t1.body.data.forEach(e =>
    console.log('  -', e.employee_name, '| count:', e.total_discounts, '| avg%:', e.avg_discount_pct, '| total$:', e.total_discount_dollars)
  );
  if (t1.body.error) console.log('  Error:', t1.body.error.message);

  // Test 2: GET /api/discount-analytics/by-product
  console.log('\n--- Test 2: GET /by-product ---');
  const t2 = await req('GET', '/api/discount-analytics/by-product', null, AUTH);
  console.log('Status:', t2.status, 'Products:', t2.body.data && t2.body.data.length);
  if (t2.body.data) t2.body.data.forEach(p =>
    console.log('  -', p.product_name, '('+p.sku+')', '| times:', p.times_discounted, '| avg%:', p.avg_discount_pct, '| total$:', p.total_discount_dollars)
  );
  if (t2.body.error) console.log('  Error:', t2.body.error.message);

  // Test 3: GET /api/discount-analytics/summary
  console.log('\n--- Test 3: GET /summary ---');
  const t3 = await req('GET', '/api/discount-analytics/summary', null, AUTH);
  console.log('Status:', t3.status);
  if (t3.body.data) {
    const k = t3.body.data.kpis;
    console.log('  KPIs:', 'txns:', k.total_transactions, '| avg%:', k.avg_discount_pct, '| total$:', k.total_discount_dollars, '| commission$:', k.total_commission_impact);
    console.log('  Daily trend rows:', t3.body.data.dailyTrend && t3.body.data.dailyTrend.length);
    console.log('  Close rate correlation:', JSON.stringify(t3.body.data.closeRateCorrelation));
  }
  if (t3.body.error) console.log('  Error:', t3.body.error.message);

  // Test 4: GET /api/discount-analytics/commission-impact
  console.log('\n--- Test 4: GET /commission-impact ---');
  const t4 = await req('GET', '/api/discount-analytics/commission-impact', null, AUTH);
  console.log('Status:', t4.status);
  if (t4.body.data) {
    console.log('  Totals:', JSON.stringify(t4.body.data.totals));
    if (t4.body.data.byEmployee) t4.body.data.byEmployee.forEach(e =>
      console.log('  -', e.employee_name, '| lost$:', e.total_commission_lost, '| avg$/disc:', e.avg_commission_lost_per_discount, '| count:', e.discount_count)
    );
  }
  if (t4.body.error) console.log('  Error:', t4.body.error.message);

  // Test 5: Date range filtering
  console.log('\n--- Test 5: Date range filter ---');
  const t5 = await req('GET', '/api/discount-analytics/by-employee?startDate=2026-02-11&endDate=2026-02-11', null, AUTH);
  console.log('Status:', t5.status, 'Employees:', t5.body.data && t5.body.data.length);
  if (t5.body.error) console.log('  Error:', t5.body.error.message);

  console.log('\n=== All 5 analytics tests complete ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
