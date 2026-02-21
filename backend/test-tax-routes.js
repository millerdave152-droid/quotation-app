require('dotenv').config();
var jwt = require('./utils/jwt');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001/api/marketplace';

async function test(label, path) {
  try {
    var r = await fetch(BASE + path, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var body = await r.json();
    var keys = Object.keys(body);
    console.log(r.status === 200 ? '\u2705' : '\u274C', label, 'status=' + r.status, 'keys=[' + keys.join(',') + ']');
    if (r.status !== 200) console.log('   Body:', JSON.stringify(body).slice(0, 300));
  } catch(e) { console.log('\u274C', label, 'ERROR:', e.message); }
}

(async function() {
  console.log('=== TAX ENGINE ROUTES TEST ===\n');
  await test('GET /tax/calculate',        '/tax/calculate?subtotal=1000&province=ON');
  await test('GET /tax/ehf/:cat/:prov',   '/tax/ehf/TVs/ON');
  await test('GET /tax/reconciliation',   '/tax/reconciliation?dateFrom=2025-01-01&dateTo=2026-12-31');
  await test('GET /tax/commission-report', '/tax/commission-report?dateFrom=2025-01-01&dateTo=2026-12-31');
  process.exit(0);
})();
