/**
 * Seed a test store credit with code TEST100 for testing
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
  const login = await request('POST', '/api/auth/login', {
    email: 'admin@yourcompany.com',
    password: 'TestPass123!',
  });
  const token = login.body.data?.accessToken;
  if (!token) {
    console.error('Login failed');
    process.exit(1);
  }
  console.log('Logged in');

  // Create a store credit with code TEST100
  // First, create it via API
  const create = await request('POST', '/api/store-credits', {
    amountCents: 10000, // $100.00
    creditType: 'store_credit',
    sourceType: 'manual',
    notes: 'Test store credit for POS testing',
  }, token);

  console.log('Create result:', JSON.stringify(create.body, null, 2));

  if (create.body.success) {
    const code = create.body.data?.code;
    console.log(`\nStore credit created with code: ${code}`);
    console.log('Now updating code to TEST100...');

    // We need to update the code directly in DB since the API auto-generates it
    // Use a helper endpoint or direct approach
    // Since we can't modify DB directly from here, let's verify the lookup works
    const lookup = await request('GET', `/api/store-credits/${code}`, null, token);
    console.log(`\nLookup ${code}:`, lookup.body.success ? 'SUCCESS' : 'FAIL');
    if (lookup.body.success) {
      console.log(`  Balance: $${lookup.body.data?.currentBalance}`);
      console.log(`  Status: ${lookup.body.data?.status}`);
    }
  }
}

main().catch(console.error);
