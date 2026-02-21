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

  for (const path of ['/api/reports/ar-aging', '/api/insights', '/api/insights/summary']) {
    const res = await apiCall('GET', path, token);
    console.log(`\n=== ${path} [${res.status}] ===`);
    console.log(res.data);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
