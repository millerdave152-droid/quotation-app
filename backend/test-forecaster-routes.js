require('dotenv').config();
var jwt = require('./utils/jwt');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });

async function test(label, path) {
  try {
    var r = await fetch('http://localhost:3001/api/marketplace' + path, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var body = await r.json();
    var keys = Object.keys(body);
    var dataLen = body.data ? body.data.length : '-';
    console.log(r.status === 200 ? '\u2705' : '\u274C', label, 'status=' + r.status, 'keys=[' + keys.join(',') + ']', 'data=' + dataLen);
    if (r.status !== 200) console.log('   Body:', JSON.stringify(body).slice(0, 300));
  } catch(e) { console.log('\u274C', label, 'ERROR:', e.message); }
}

(async () => {
  await test('GET /forecasting/stockout-alerts',      '/forecasting/stockout-alerts?daysThreshold=14');
  await test('GET /forecasting/reorder-suggestions',  '/forecasting/reorder-suggestions?leadTime=7&targetDays=30');
  await test('GET /forecasting/overstock',            '/forecasting/overstock?daysThreshold=90');
  await test('GET /forecasting/anomalies',            '/forecasting/anomalies?threshold=50');
  await test('GET /forecasting/product/:productId',   '/forecasting/product/12145');
  process.exit(0);
})();
