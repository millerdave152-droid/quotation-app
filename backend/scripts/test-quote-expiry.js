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
  const login = await request('POST', '/api/auth/login', null, {
    email: 'admin@yourcompany.com', password: 'TestPass123!'
  });
  const token = JSON.parse(login.body).data.accessToken;

  console.log('=== Quote Expiry ===');
  const r1 = await request('GET', '/api/pos/quotes/expiring?days=7', token);
  console.log('Status:', r1.status);
  console.log('Response:', r1.body.substring(0, 300));

  console.log('\n=== Quote Expiry Stats ===');
  const r2 = await request('GET', '/api/pos/quotes/expiring/stats', token);
  console.log('Status:', r2.status);
  console.log('Response:', r2.body.substring(0, 300));
}

run().catch(e => console.error(e));
