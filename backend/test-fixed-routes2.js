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

  const routes = [
    'GET /api/reports/ar-aging',
    'GET /api/insights',
    'GET /api/insights/summary',
  ];

  let pass = 0, fail = 0;
  for (const route of routes) {
    const [method, path] = route.split(' ');
    const res = await apiCall(method, path, token);
    const ok = res.status >= 200 && res.status < 300;
    if (ok) pass++; else fail++;
    console.log((ok ? 'PASS' : 'FAIL') + ' [' + res.status + '] ' + route);
    if (!ok) {
      try {
        const parsed = JSON.parse(res.data);
        console.log('  Error:', parsed.error?.message || parsed.message || res.data.substring(0, 300));
      } catch { console.log('  Body:', res.data.substring(0, 300)); }
    } else {
      console.log('  OK - ' + res.data.substring(0, 200));
    }
  }

  console.log('\nSummary: ' + pass + ' PASS, ' + fail + ' FAIL');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
