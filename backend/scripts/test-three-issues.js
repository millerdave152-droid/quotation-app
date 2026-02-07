/**
 * Test script for 3 failing features: returns, store credits, warranty upsell
 */
const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  console.log('=== LOGIN ===');
  const login = await request('POST', '/api/auth/login', {
    email: 'admin@yourcompany.com',
    password: 'TestPass123!',
  });
  const token = login.body.data?.accessToken;
  console.log('Login success:', login.body.success, '- Token:', token ? 'YES' : 'NO');

  if (!token) {
    console.error('Cannot proceed without token');
    process.exit(1);
  }

  // TEST 21: Returns search
  console.log('\n=== TEST 21: Returns/Transaction Search ===');
  const returns1 = await request('GET', '/api/returns', null, token);
  console.log('Empty search - Status:', returns1.status, 'Success:', returns1.body.success);
  if (!returns1.body.success) {
    console.log('Error:', returns1.body.message || returns1.body.error);
  } else {
    console.log('Results:', returns1.body.data?.length, 'Total:', returns1.body.pagination?.total);
  }

  const returns2 = await request('GET', '/api/returns?search=Samsung', null, token);
  console.log('Samsung search - Status:', returns2.status, 'Success:', returns2.body.success);
  if (!returns2.body.success) {
    console.log('Error:', returns2.body.message || returns2.body.error);
  } else {
    console.log('Results:', returns2.body.data?.length, 'Total:', returns2.body.pagination?.total);
  }

  // TEST 14: Store credit lookup
  console.log('\n=== TEST 14: Store Credit Lookup ===');
  const sc = await request('GET', '/api/store-credits/TEST100', null, token);
  console.log('TEST100 - Status:', sc.status, 'Success:', sc.body.success);
  if (!sc.body.success) {
    console.log('Error:', sc.body.message || sc.body.error);
  }

  // List all store credits to see what exists
  const scList = await request('GET', '/api/store-credits/customer/1', null, token);
  console.log('Customer 1 credits - Status:', scList.status, 'Success:', scList.body.success);
  if (scList.body.success) {
    console.log('Credits found:', scList.body.data?.length);
    scList.body.data?.forEach(c => console.log(`  - ${c.code}: $${c.currentBalance} (${c.status})`));
  }

  // TEST 19: Warranty batch eligibility (simulating POS flow)
  console.log('\n=== TEST 19: Warranty Batch Eligibility ===');
  const warranty = await request('POST', '/api/warranty/eligible', {
    products: [
      { productId: 1, price: 500 },
      { productId: 2, price: 300 },
    ],
  }, token);
  console.log('Batch - Status:', warranty.status, 'Success:', warranty.body.success);
  if (warranty.body.success) {
    console.log('Results:', JSON.stringify(warranty.body.data || warranty.body.results, null, 2)?.substring(0, 500));
  } else {
    console.log('Error:', warranty.body.message || warranty.body.error);
  }

  // Check warranty single product eligibility (non-auth since it worked before)
  const w1 = await request('GET', '/api/warranty/eligible/1?price=500', null, token);
  console.log('Single product 1 - Status:', w1.status, 'Success:', w1.body.success);
  console.log('Eligible:', w1.body.eligible, 'Warranties:', w1.body.warranties?.length);
}

main().catch(console.error);
