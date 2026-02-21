const http = require('http');

function apiCall(method, path, token, body) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const opts = { hostname: 'localhost', port: 3001, path, method, headers };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  const login = await apiCall('POST', '/api/auth/login', null, {
    email: 'admin@yourcompany.com',
    password: 'TestPass123!'
  });
  const token = JSON.parse(login.data).data.accessToken;

  // Helper to find first array item in nested response
  function findFirstItem(parsed) {
    // Try various common patterns
    if (parsed.data?.quotations?.[0]) return parsed.data.quotations[0];
    if (parsed.data?.products?.[0]) return parsed.data.products[0];
    if (parsed.data?.orders?.[0]) return parsed.data.orders[0];
    if (parsed.quotations?.[0]) return parsed.quotations[0];
    if (parsed.products?.[0]) return parsed.products[0];
    if (parsed.orders?.[0]) return parsed.orders[0];
    if (Array.isArray(parsed.data) && parsed.data[0]) return parsed.data[0];
    if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    return null;
  }

  for (const [label, path] of [
    ['quotations', '/api/quotes?page=1&limit=1'],
    ['products', '/api/inventory/products?page=1&limit=1'],
    ['orders', '/api/orders?page=1&limit=1']
  ]) {
    const res = await apiCall('GET', path, token);
    const parsed = JSON.parse(res.data);
    const item = findFirstItem(parsed);
    console.log('=== ' + label + ' (status ' + res.status + ') ===');
    if (item) {
      console.log(Object.keys(item).sort().join(', '));
    } else {
      console.log('No item found. Top keys:', Object.keys(parsed).join(', '));
    }
    console.log('');
  }
}

main().then(() => {
  console.log('DONE');
  process.exit(0);
}).catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
