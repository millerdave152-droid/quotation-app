const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api' + path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (global.token) {
      options.headers.Authorization = 'Bearer ' + global.token;
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  const login = await request('POST', '/auth/login', { email: 'manager@test.com', password: 'TestPass123!' });
  if (!login.success) { console.error('Login failed:', login.message); process.exit(1); }
  global.token = login.data.accessToken;
  console.log('Logged in as manager');

  // Test GET /reports/shifts
  console.log('\n--- GET /reports/shifts?date=2026-02-10 ---');
  const shifts = await request('GET', '/reports/shifts?date=2026-02-10');
  console.log('Response:', JSON.stringify(shifts, null, 2));

  // Test POST /reports/reconciliation
  console.log('\n--- POST /reports/reconciliation ---');
  const recon = await request('POST', '/reports/reconciliation', {
    date: '2026-02-10',
    countedCash: 500.00,
    notes: 'Test reconciliation'
  });
  console.log('Response:', JSON.stringify(recon, null, 2));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
