const http = require('http');

function apiCall(method, path, token, body) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request({hostname:'localhost',port:3001,path,method,headers}, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const login = await apiCall('POST', '/api/auth/login', null, {
    email: 'admin@yourcompany.com',
    password: 'TestPass123!'
  });
  const token = JSON.parse(login.data).data.accessToken;

  // Use the admin SQL endpoint if available, or check via API
  // Let's check customers columns
  const custRes = await apiCall('GET', '/api/customers?page=1&limit=1', token);
  const custData = JSON.parse(custRes.data);
  const cust = custData.data?.customers?.[0] || custData.data?.[0];
  if (cust) {
    const keys = Object.keys(cust).sort();
    console.log('=== customers (' + keys.length + ' cols) ===');
    console.log(keys.join(', '));
    console.log('has name:', keys.includes('name'));
    console.log('has phone:', keys.includes('phone'));
    console.log('has email:', keys.includes('email'));
  } else {
    console.log('No customer:', JSON.stringify(custData).substring(0, 300));
  }

  // Try to check payments - maybe via transactions
  const txnRes = await apiCall('GET', '/api/transactions?page=1&limit=1', token);
  const txnData = JSON.parse(txnRes.data);
  console.log('\n=== transactions response ===');
  console.log(JSON.stringify(txnData).substring(0, 800));

  // Check if there's a payments route
  const payRes = await apiCall('GET', '/api/payments?page=1&limit=1', token);
  console.log('\n=== payments response (' + payRes.status + ') ===');
  console.log(payRes.data.substring(0, 500));

  // Try to do a simple query through an existing endpoint
  // Let's also check if the ar-aging query has issues with the customers.phone column
  // by checking the actual error detail
  const arRes = await apiCall('GET', '/api/reports/ar-aging', token);
  console.log('\n=== ar-aging response (' + arRes.status + ') ===');
  console.log(arRes.data.substring(0, 500));
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
