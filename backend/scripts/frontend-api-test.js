require('dotenv').config();
const http = require('http');

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3001');
    const options = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  // Login
  const login = await request('POST', '/api/auth/login', null, {
    email: 'admin@yourcompany.com', password: 'TestPass123!'
  });
  const loginData = JSON.parse(login.body);
  if (!loginData.data || !loginData.data.accessToken) {
    console.error('Login failed:', login.body.substring(0, 200));
    return;
  }
  const token = loginData.data.accessToken;
  console.log('Login: OK\n');

  // Frontend-facing API endpoints (correct paths from frontend code)
  const endpoints = [
    // Auth
    ['GET', '/api/auth/me', 'Auth Me'],

    // Dashboard
    ['GET', '/api/quotations/stats/dashboard', 'Dashboard Stats'],
    ['GET', '/api/activities/recent?limit=5', 'Recent Activity'],
    ['GET', '/api/dashboard/stats', 'Dashboard General Stats'],

    // Products
    ['GET', '/api/products?limit=2', 'Products List'],
    ['GET', '/api/products/categories', 'Product Categories'],
    ['GET', '/api/categories', 'Categories'],

    // Customers
    ['GET', '/api/customers?limit=2', 'Customers List'],
    ['GET', '/api/customers/stats/overview', 'Customer Stats'],

    // CLV
    ['GET', '/api/customers/lifetime-value?limit=5', 'CLV Analytics'],

    // Quotes/Quotations
    ['GET', '/api/quotations?limit=2', 'Quotations List'],
    ['GET', '/api/quotations/stats/summary', 'Quotation Stats Summary'],

    // Leads
    ['GET', '/api/leads?limit=2', 'Leads List'],
    ['GET', '/api/leads/stats', 'Lead Stats'],

    // Insights
    ['GET', '/api/insights?limit=5', 'AI Insights'],

    // Notifications
    ['GET', '/api/notifications/unread-count', 'Notifications Count'],

    // API Keys (admin)
    ['GET', '/api/api-keys', 'API Keys'],

    // Scheduled Reports
    ['GET', '/api/scheduled-reports', 'Scheduled Reports'],

    // Locations (with pickup type fix)
    ['GET', '/api/locations', 'Locations'],
    ['GET', '/api/locations?type=pickup', 'Locations (pickup)'],
    ['GET', '/api/locations?type=store', 'Locations (store)'],

    // Webhooks
    ['GET', '/api/webhooks', 'Webhooks'],

    // Delivery
    ['GET', '/api/delivery/pending', 'Delivery Pending'],
  ];

  let pass = 0, fail = 0;
  const failures = [];

  for (const [method, path, label] of endpoints) {
    try {
      const res = await request(method, path, token);
      const status = res.status;
      const icon = status < 400 ? '✓' : '✗';
      console.log(`${icon} ${label}: ${status}`);
      if (status >= 500) {
        fail++;
        let errMsg = '';
        try {
          const parsed = JSON.parse(res.body);
          errMsg = parsed.error?.message || parsed.error || JSON.stringify(parsed.error);
        } catch(e) {
          errMsg = res.body.substring(0, 100);
        }
        failures.push({ label, path, status, error: errMsg });
      } else {
        pass++;
      }
    } catch (err) {
      console.log(`✗ ${label}: ERROR - ${err.message}`);
      fail++;
      failures.push({ label, path, status: 'ERR', error: err.message });
    }
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed out of ${pass + fail} ===`);

  if (failures.length > 0) {
    console.log('\nFailed endpoints:');
    for (const f of failures) {
      console.log(`  ${f.status} ${f.path} - ${f.error}`);
    }
  }
}

run().catch(e => console.error(e));
