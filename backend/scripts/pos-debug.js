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
  const token = loginData.data.accessToken;

  // Check products response shape
  console.log('=== Products Response Shape ===');
  const prod = await request('GET', '/api/products?limit=2', token);
  const prodData = JSON.parse(prod.body);
  console.log('Status:', prod.status);
  console.log('Top keys:', Object.keys(prodData));
  if (prodData.data) console.log('data keys:', Object.keys(prodData.data));
  console.log('Sample:', JSON.stringify(prodData).substring(0, 300));

  // Check customers response shape
  console.log('\n=== Customers Response Shape ===');
  const cust = await request('GET', '/api/customers?limit=2', token);
  const custData = JSON.parse(cust.body);
  console.log('Status:', cust.status);
  console.log('Top keys:', Object.keys(custData));
  if (custData.data) console.log('data keys:', typeof custData.data === 'object' && !Array.isArray(custData.data) ? Object.keys(custData.data) : 'is array, length: ' + custData.data.length);
  console.log('Sample:', JSON.stringify(custData).substring(0, 300));

  // Check transactions response shape
  console.log('\n=== Transactions Response Shape ===');
  const txn = await request('GET', '/api/transactions?limit=2', token);
  const txnData = JSON.parse(txn.body);
  console.log('Status:', txn.status);
  console.log('Top keys:', Object.keys(txnData));
  console.log('Sample:', JSON.stringify(txnData).substring(0, 300));

  // Check returns 500 error
  console.log('\n=== Returns (500 error) ===');
  const ret = await request('GET', '/api/returns?limit=2', token);
  console.log('Status:', ret.status);
  console.log('Response:', ret.body.substring(0, 500));

  // Check drafts
  console.log('\n=== Drafts ===');
  const drafts = await request('GET', '/api/drafts', token);
  const draftsData = JSON.parse(drafts.body);
  console.log('Status:', drafts.status);
  console.log('Sample:', JSON.stringify(draftsData).substring(0, 300));
}

run().catch(e => console.error(e));
