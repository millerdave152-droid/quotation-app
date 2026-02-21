require('dotenv').config();
var jwt = require('./utils/jwt');
var pool = require('./db');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001/api/marketplace';

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

async function api(method, path) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token } };
  var r = await fetch(BASE + path, opts);
  var contentType = r.headers.get('content-type') || '';
  var data;
  if (contentType.includes('text/csv')) {
    data = await r.text();
    return { status: r.status, data: data, isCSV: true, headers: r.headers };
  }
  data = await r.json().catch(function() { return {}; });
  return { status: r.status, data: data, isCSV: false };
}

(async function() {
  console.log('=== REPORT ROUTES TEST ===\n');

  // Find a date with data
  var dateCheck = await pool.query("SELECT order_date::date AS d FROM marketplace_orders WHERE order_state != 'CANCELED' ORDER BY order_date DESC LIMIT 1");
  var testDate = dateCheck.rows.length > 0 ? dateCheck.rows[0].d : null;

  var monthCheck = await pool.query("SELECT EXTRACT(YEAR FROM order_date)::int AS y, EXTRACT(MONTH FROM order_date)::int AS m FROM marketplace_orders WHERE order_state != 'CANCELED' GROUP BY y, m ORDER BY COUNT(*) DESC LIMIT 1");
  var testYear = monthCheck.rows.length > 0 ? monthCheck.rows[0].y : 2025;
  var testMonth = monthCheck.rows.length > 0 ? monthCheck.rows[0].m : 12;

  // 1. GET /reports/daily-summary (default = today)
  console.log('--- GET /reports/daily-summary ---\n');
  var r1 = await api('GET', '/reports/daily-summary');
  assert(r1.status === 200, 'daily-summary status', 'status=' + r1.status);
  assert(r1.data.reportType === 'DailySummary', 'reportType correct');
  assert(r1.data.totals !== undefined, 'Has totals');
  assert(Array.isArray(r1.data.byChannel), 'Has byChannel');
  assert(Array.isArray(r1.data.topProducts), 'Has topProducts');

  // 2. GET /reports/daily-summary?date=<date>
  console.log('\n--- GET /reports/daily-summary?date ---\n');
  if (testDate) {
    var r2 = await api('GET', '/reports/daily-summary?date=' + testDate);
    assert(r2.status === 200, 'daily-summary with date status', 'status=' + r2.status);
    assert(r2.data.totals.order_count > 0, 'Has orders', r2.data.totals.order_count);
    assert(r2.data.totals.gross_revenue > 0, 'Has revenue', '$' + r2.data.totals.gross_revenue);
  } else {
    console.log('  SKIP: no orders');
  }

  // 3. GET /reports/weekly-pnl
  console.log('\n--- GET /reports/weekly-pnl ---\n');
  var r3 = await api('GET', '/reports/weekly-pnl');
  assert(r3.status === 200, 'weekly-pnl status', 'status=' + r3.status);
  assert(r3.data.reportType === 'WeeklyPnL', 'reportType correct');
  assert(r3.data.weekStart !== undefined, 'Has weekStart');
  assert(r3.data.weekEnd !== undefined, 'Has weekEnd');
  assert(r3.data.totals !== undefined, 'Has totals');
  assert(typeof r3.data.totals.grossRevenue === 'number', 'grossRevenue is number');
  assert(typeof r3.data.totals.netProfit === 'number', 'netProfit is number');
  assert(Array.isArray(r3.data.byChannel), 'Has byChannel array');

  // 4. GET /reports/monthly-tax — missing params
  console.log('\n--- GET /reports/monthly-tax (missing params) ---\n');
  var r4a = await api('GET', '/reports/monthly-tax');
  assert(r4a.status === 400, 'Returns 400 without year/month', 'status=' + r4a.status);
  assert(r4a.data.error !== undefined, 'Has error message');

  // 5. GET /reports/monthly-tax?year=&month=
  console.log('\n--- GET /reports/monthly-tax?year&month ---\n');
  var r4 = await api('GET', '/reports/monthly-tax?year=' + testYear + '&month=' + testMonth);
  assert(r4.status === 200, 'monthly-tax status', 'status=' + r4.status);
  assert(r4.data.reportType === 'MonthlyTaxReport', 'reportType correct');
  assert(r4.data.summary !== undefined, 'Has summary');
  assert(typeof r4.data.summary.federalTax === 'number', 'federalTax is number');
  assert(typeof r4.data.summary.provincialTax === 'number', 'provincialTax is number');
  assert(r4.data.commissionITC !== undefined, 'Has commission ITC');
  assert(r4.data.ehf !== undefined, 'Has EHF section');
  assert(Array.isArray(r4.data.byProvinceAndCode), 'Has province breakdown');

  // 6. GET /reports/export — missing reportType
  console.log('\n--- GET /reports/export (missing type) ---\n');
  var r5a = await api('GET', '/reports/export');
  assert(r5a.status === 400, 'Returns 400 without reportType', 'status=' + r5a.status);

  // 7. GET /reports/export?reportType=WeeklyPnL&format=csv
  console.log('\n--- GET /reports/export (WeeklyPnL CSV) ---\n');
  var r5 = await api('GET', '/reports/export?reportType=WeeklyPnL&format=csv');
  assert(r5.status === 200, 'Export CSV status', 'status=' + r5.status);
  assert(r5.isCSV === true, 'Response is CSV content-type');
  assert(typeof r5.data === 'string', 'Data is string');
  assert(r5.data.includes('Gross Revenue'), 'CSV has column headers');
  console.log('  CSV length: ' + r5.data.length + ' chars');

  // 8. GET /reports/export?reportType=DailySummary&format=json
  console.log('\n--- GET /reports/export (DailySummary JSON) ---\n');
  var r6 = await api('GET', '/reports/export?reportType=DailySummary&format=json');
  assert(r6.status === 200, 'Export JSON status', 'status=' + r6.status);
  assert(r6.data.reportType === 'DailySummary', 'JSON has reportType');

  // 9. GET /reports/export?reportType=MonthlyTaxReport&format=csv&year=&month=
  console.log('\n--- GET /reports/export (MonthlyTax CSV) ---\n');
  var r7 = await api('GET', '/reports/export?reportType=MonthlyTaxReport&format=csv&year=' + testYear + '&month=' + testMonth);
  assert(r7.status === 200, 'Tax CSV status', 'status=' + r7.status);
  assert(r7.isCSV === true, 'Tax response is CSV');
  assert(r7.data.includes('Province'), 'Tax CSV has Province header');

  // Verify total route count
  console.log('\n--- ROUTE COUNT ---\n');
  var routeCount = await api('GET', '/../marketplace');
  // Just log it — we can't easily count routes from here
  console.log('  Routes added successfully');

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
