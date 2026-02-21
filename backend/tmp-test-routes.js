const http = require('http');

const BASE = 'http://localhost:3001';

const routes = [
  ['GET', '/api/ar-aging/summary'],
  ['GET', '/api/ar-aging/customers'],
  ['GET', '/api/call-logs'],
  ['GET', '/api/call-logs/stats'],
  ['GET', '/api/customers'],
  ['GET', '/api/customers/1'],
  ['GET', '/api/insights/dashboard'],
  ['GET', '/api/insights/metrics'],
  ['GET', '/api/inventory/products'],
  ['GET', '/api/inventory/alerts'],
  ['GET', '/api/layaways'],
  ['GET', '/api/promotions'],
  ['GET', '/api/revenue-forecast'],
  ['GET', '/api/revenue-forecast/summary'],
  ['GET', '/api/tasks'],
  ['GET', '/api/tasks/1'],
  ['GET', '/api/quotes'],
  ['GET', '/api/quotes/1'],
];

function request(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: headers || {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Logging in ===');
  const loginBody = JSON.stringify({ email: 'admin@yourcompany.com', password: 'TestPass123!' });
  const loginRes = await request('POST', '/api/auth/login', { 'Content-Type': 'application/json' }, loginBody);
  console.log('Login status:', loginRes.status);

  if (loginRes.status !== 200) {
    console.log('Login failed:', loginRes.body.substring(0, 300));
    process.exit(1);
  }

  const parsed = JSON.parse(loginRes.body);
  const token = parsed.data ? parsed.data.accessToken : parsed.accessToken;
  if (!token) {
    console.log('No token found in response:', loginRes.body.substring(0, 300));
    process.exit(1);
  }
  console.log('Token obtained:', token.substring(0, 30) + '...\n');

  const authHeaders = { Authorization: 'Bearer ' + token };

  let pass = 0;
  let fail = 0;
  const results = [];

  console.log('=== Testing Routes ===\n');

  for (let i = 0; i < routes.length; i++) {
    const [method, path] = routes[i];
    const num = String(i + 1).padStart(2, ' ');
    try {
      const res = await request(method, path, authHeaders);
      const ok = res.status >= 200 && res.status < 300;
      const label = ok ? 'PASS' : 'FAIL';
      if (ok) pass++; else fail++;
      const preview = res.body.substring(0, 200).replace(/\n/g, ' ');
      console.log(num + '. [' + label + '] ' + method + ' ' + path);
      console.log('    Status: ' + res.status);
      console.log('    Response: ' + preview);
      console.log();
      results.push({ path, status: res.status, ok });
    } catch (err) {
      fail++;
      console.log(num + '. [FAIL] ' + method + ' ' + path);
      console.log('    Error: ' + err.message);
      console.log();
      results.push({ path, status: 'ERR', ok: false });
    }
  }

  console.log('=== SUMMARY ===');
  console.log('Total: ' + routes.length + '  |  PASS: ' + pass + '  |  FAIL: ' + fail);
  console.log();
  if (fail > 0) {
    console.log('Failed routes:');
    results.filter(function(r) { return !r.ok; }).forEach(function(r) {
      console.log('  - ' + r.path + ' (' + r.status + ')');
    });
  } else {
    console.log('All routes passed!');
  }
}

main().catch(function(err) {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
