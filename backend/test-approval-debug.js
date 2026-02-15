const http = require('http');
const TEST_PORT = 3098;
const BASE = `http://localhost:${TEST_PORT}/api`;
let TOKEN = '';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) } };
    const r = http.request(opts, res => { let d=''; res.on('data', c => d+=c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  process.env.PORT = TEST_PORT;
  require('./server');
  await new Promise(r => setTimeout(r, 3000));

  const login = await req('POST', '/auth/login', { email: 'admin@yourcompany.com', password: 'TestPass123!' });
  TOKEN = JSON.parse(login.body).data.accessToken;

  // Create a Tier 2 request
  const r1 = await req('POST', '/pos-approvals/request', { cartId: 998, cartItemId: 9998, productId: 12145, requestedPrice: 7224.15 });
  console.log('CREATE:', r1.body);
  const reqId = JSON.parse(r1.body).data?.id;

  // GET pending — dump full response
  const r2 = await req('GET', '/pos-approvals/pending');
  console.log('\nPENDING:', r2.body.substring(0, 500));

  // Approve — dump full response
  const r3 = await req('POST', `/pos-approvals/${reqId}/approve`, { method: 'remote' });
  console.log('\nAPPROVE:', r3.body.substring(0, 500));

  // Cleanup
  const pool = require('./db');
  await pool.query('DELETE FROM approval_requests WHERE cart_id = 998');
  pool.end();
  process.exit(0);
})();
