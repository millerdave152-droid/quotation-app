require('dotenv').config();
var pool = require('./db');
var reportGenerator = require('./services/ReportGenerator');

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

(async function() {
  console.log('=== REPORT GENERATOR TEST ===\n');

  // 1. generateDailySummary — today
  console.log('--- 1. generateDailySummary (today) ---\n');
  var daily = await reportGenerator.generateDailySummary();
  assert(daily.reportType === 'DailySummary', 'Report type', daily.reportType);
  assert(daily.date !== undefined, 'Date present', daily.date);
  assert(daily.generatedAt !== undefined, 'Generated timestamp present');
  assert(daily.totals !== undefined, 'Totals present');
  assert(typeof daily.totals.order_count === 'number', 'order_count is number', daily.totals.order_count);
  assert(typeof daily.totals.gross_revenue === 'number', 'gross_revenue is number', '$' + daily.totals.gross_revenue);
  assert(typeof daily.totals.commission === 'number', 'commission is number', '$' + daily.totals.commission);
  assert(typeof daily.totals.net_revenue === 'number', 'net_revenue is number', '$' + daily.totals.net_revenue);
  assert(Array.isArray(daily.byChannel), 'byChannel is array');
  assert(Array.isArray(daily.topProducts), 'topProducts is array');
  assert(daily.issues !== undefined, 'Issues object present');
  assert(typeof daily.issues.acceptanceUrgent === 'number', 'acceptanceUrgent is number');
  assert(typeof daily.issues.awaitingAcceptance === 'number', 'awaitingAcceptance is number');
  assert(typeof daily.issues.awaitingShipment === 'number', 'awaitingShipment is number');
  assert(daily.returns !== undefined, 'Returns object present');
  assert(typeof daily.returns.count === 'number', 'returns count is number');
  console.log('  Date: ' + daily.date + ', Orders: ' + daily.totals.order_count + ', Revenue: $' + daily.totals.gross_revenue);
  if (daily.byChannel.length > 0) {
    console.log('  Channel: ' + daily.byChannel[0].channelCode + ' = $' + daily.byChannel[0].grossRevenue);
  }

  // 2. generateDailySummary — specific past date with known data
  console.log('\n--- 2. generateDailySummary (past date) ---\n');
  // Find a date that actually has orders
  var dateCheck = await pool.query("SELECT order_date::date AS d, COUNT(*) AS cnt FROM marketplace_orders WHERE order_state != 'CANCELED' GROUP BY d ORDER BY cnt DESC LIMIT 1");
  if (dateCheck.rows.length > 0) {
    var busyDate = dateCheck.rows[0].d;
    var dailyPast = await reportGenerator.generateDailySummary(busyDate);
    assert(dailyPast.totals.order_count > 0, 'Past date has orders', dailyPast.totals.order_count);
    assert(dailyPast.totals.gross_revenue > 0, 'Past date has revenue', '$' + dailyPast.totals.gross_revenue);
    assert(dailyPast.byChannel.length >= 1, 'Has channel data', dailyPast.byChannel.length + ' channels');
    assert(dailyPast.topProducts.length >= 1, 'Has top products', dailyPast.topProducts.length + ' products');
    console.log('  Busy date: ' + dailyPast.date + ', Orders: ' + dailyPast.totals.order_count + ', Revenue: $' + dailyPast.totals.gross_revenue);
    console.log('  Top product: ' + dailyPast.topProducts[0].sku + ' ($' + dailyPast.topProducts[0].revenue + ')');
  } else {
    console.log('  SKIP: no orders in DB');
  }

  // 3. generateWeeklyPnL — current week
  console.log('\n--- 3. generateWeeklyPnL (current week) ---\n');
  var weekly = await reportGenerator.generateWeeklyPnL();
  assert(weekly.reportType === 'WeeklyPnL', 'Report type', weekly.reportType);
  assert(weekly.weekStart !== undefined, 'weekStart present', weekly.weekStart);
  assert(weekly.weekEnd !== undefined, 'weekEnd present', weekly.weekEnd);
  assert(weekly.totals !== undefined, 'Totals present');
  assert(typeof weekly.totals.orderCount === 'number', 'orderCount is number');
  assert(typeof weekly.totals.grossRevenue === 'number', 'grossRevenue is number');
  assert(typeof weekly.totals.cogs === 'number', 'COGS is number');
  assert(typeof weekly.totals.commission === 'number', 'commission is number');
  assert(typeof weekly.totals.shippingCosts === 'number', 'shippingCosts is number');
  assert(typeof weekly.totals.returnCosts === 'number', 'returnCosts is number');
  assert(typeof weekly.totals.netProfit === 'number', 'netProfit is number');
  assert(typeof weekly.totals.marginPercent === 'number', 'marginPercent is number');
  assert(Array.isArray(weekly.byChannel), 'byChannel is array');
  console.log('  Week: ' + weekly.weekStart + ' to ' + weekly.weekEnd);
  console.log('  Revenue: $' + weekly.totals.grossRevenue + ', COGS: $' + weekly.totals.cogs + ', Profit: $' + weekly.totals.netProfit + ' (' + weekly.totals.marginPercent + '%)');

  // 4. generateWeeklyPnL — specific week with data
  console.log('\n--- 4. generateWeeklyPnL (past week with data) ---\n');
  var weekCheck = await pool.query("SELECT date_trunc('week', order_date)::date AS w, COUNT(*) AS cnt FROM marketplace_orders WHERE order_state != 'CANCELED' GROUP BY w ORDER BY cnt DESC LIMIT 1");
  if (weekCheck.rows.length > 0) {
    var busyWeek = weekCheck.rows[0].w;
    var weeklyPast = await reportGenerator.generateWeeklyPnL(busyWeek);
    assert(weeklyPast.totals.orderCount > 0, 'Past week has orders', weeklyPast.totals.orderCount);
    assert(weeklyPast.totals.grossRevenue > 0, 'Past week has revenue', '$' + weeklyPast.totals.grossRevenue);
    if (weeklyPast.byChannel.length > 0) {
      var ch = weeklyPast.byChannel[0];
      assert(ch.channelCode !== undefined, 'Channel code present');
      assert(typeof ch.netProfit === 'number', 'Channel netProfit present');
      assert(typeof ch.marginPercent === 'number', 'Channel margin % present');
      console.log('  ' + ch.channelCode + ': Rev=$' + ch.grossRevenue + ' COGS=$' + ch.cogs + ' Comm=$' + ch.commission + ' Net=$' + ch.netProfit + ' (' + ch.marginPercent + '%)');
    }
  } else {
    console.log('  SKIP: no orders in DB');
  }

  // 5. generateMonthlyTaxReport
  console.log('\n--- 5. generateMonthlyTaxReport ---\n');
  // Find a month with data
  var monthCheck = await pool.query("SELECT EXTRACT(YEAR FROM order_date)::int AS y, EXTRACT(MONTH FROM order_date)::int AS m, COUNT(*) AS cnt FROM marketplace_orders WHERE order_state != 'CANCELED' GROUP BY y, m ORDER BY cnt DESC LIMIT 1");
  if (monthCheck.rows.length > 0) {
    var taxYear = monthCheck.rows[0].y;
    var taxMonth = monthCheck.rows[0].m;
    var tax = await reportGenerator.generateMonthlyTaxReport(taxYear, taxMonth);
    assert(tax.reportType === 'MonthlyTaxReport', 'Report type', tax.reportType);
    assert(tax.period.year === taxYear, 'Year correct', taxYear);
    assert(tax.period.month === taxMonth, 'Month correct', taxMonth);
    assert(tax.summary !== undefined, 'Summary present');
    assert(typeof tax.summary.totalOrders === 'number', 'totalOrders', tax.summary.totalOrders);
    assert(typeof tax.summary.totalSales === 'number', 'totalSales', '$' + tax.summary.totalSales);
    assert(typeof tax.summary.totalTaxCollected === 'number', 'totalTaxCollected', '$' + tax.summary.totalTaxCollected);
    assert(typeof tax.summary.federalTax === 'number', 'federalTax', '$' + tax.summary.federalTax);
    assert(typeof tax.summary.provincialTax === 'number', 'provincialTax', '$' + tax.summary.provincialTax);
    assert(tax.commissionITC !== undefined, 'Commission ITC present');
    assert(typeof tax.commissionITC.totalCommissionPaid === 'number', 'Commission total', '$' + tax.commissionITC.totalCommissionPaid);
    assert(typeof tax.commissionITC.itcClaimable === 'number', 'ITC claimable', '$' + tax.commissionITC.itcClaimable);
    assert(tax.ehf !== undefined, 'EHF section present');
    assert(typeof tax.ehf.totalCollected === 'number', 'EHF collected', '$' + tax.ehf.totalCollected);
    assert(Array.isArray(tax.byProvinceAndCode), 'Province breakdown is array');
    console.log('  Period: ' + taxYear + '-' + String(taxMonth).padStart(2, '0'));
    console.log('  Sales: $' + tax.summary.totalSales + ', Tax: $' + tax.summary.totalTaxCollected);
    console.log('  Federal: $' + tax.summary.federalTax + ', Provincial: $' + tax.summary.provincialTax);
    console.log('  Commission ITC: $' + tax.commissionITC.itcClaimable + ', EHF: $' + tax.ehf.totalCollected);
    if (tax.byProvinceAndCode.length > 0) {
      console.log('  Top province: ' + tax.byProvinceAndCode[0].province + '/' + tax.byProvinceAndCode[0].taxCode + ' = $' + tax.byProvinceAndCode[0].totalTax);
    }
  } else {
    console.log('  SKIP: no orders in DB');
  }

  // 6. exportReport — CSV for DailySummary
  console.log('\n--- 6. exportReport (DailySummary, CSV) ---\n');
  if (dateCheck.rows.length > 0) {
    var csvExport = await reportGenerator.exportReport('DailySummary', { date: dateCheck.rows[0].d }, 'csv');
    assert(csvExport.format === 'csv', 'Format = csv');
    assert(csvExport.filename !== undefined, 'Filename present', csvExport.filename);
    assert(csvExport.filename.startsWith('daily-summary-'), 'Filename starts with daily-summary-');
    assert(typeof csvExport.content === 'string', 'Content is string');
    assert(csvExport.content.length > 0, 'Content not empty', csvExport.content.length + ' chars');
    assert(csvExport.content.includes('Section'), 'CSV has header');
    assert(csvExport.content.includes('Channel'), 'CSV has channel data');
    console.log('  File: ' + csvExport.filename + ', ' + csvExport.content.length + ' chars');
    console.log('  First 200 chars: ' + csvExport.content.slice(0, 200));
  }

  // 7. exportReport — CSV for WeeklyPnL
  console.log('\n--- 7. exportReport (WeeklyPnL, CSV) ---\n');
  if (weekCheck.rows.length > 0) {
    var pnlCsv = await reportGenerator.exportReport('WeeklyPnL', { weekStartDate: weekCheck.rows[0].w }, 'csv');
    assert(pnlCsv.format === 'csv', 'Format = csv');
    assert(pnlCsv.filename.startsWith('weekly-pnl-'), 'Filename correct', pnlCsv.filename);
    assert(pnlCsv.content.includes('Gross Revenue'), 'Has revenue header');
    assert(pnlCsv.content.includes('COGS'), 'Has COGS header');
    assert(pnlCsv.content.includes('Net Profit'), 'Has net profit header');
    assert(pnlCsv.content.includes('TOTAL'), 'Has totals row');
    console.log('  File: ' + pnlCsv.filename + ', ' + pnlCsv.content.length + ' chars');
  }

  // 8. exportReport — CSV for MonthlyTaxReport
  console.log('\n--- 8. exportReport (MonthlyTaxReport, CSV) ---\n');
  if (monthCheck.rows.length > 0) {
    var taxCsv = await reportGenerator.exportReport('MonthlyTaxReport', { year: monthCheck.rows[0].y, month: monthCheck.rows[0].m }, 'csv');
    assert(taxCsv.format === 'csv', 'Format = csv');
    assert(taxCsv.filename.startsWith('monthly-tax-'), 'Filename correct', taxCsv.filename);
    assert(taxCsv.content.includes('Province'), 'Has Province header');
    assert(taxCsv.content.includes('Tax Code'), 'Has Tax Code header');
    assert(taxCsv.content.includes('Commission ITC'), 'Has ITC row');
    assert(taxCsv.content.includes('EHF'), 'Has EHF row');
    console.log('  File: ' + taxCsv.filename + ', ' + taxCsv.content.length + ' chars');
  }

  // 9. exportReport — JSON format
  console.log('\n--- 9. exportReport (JSON format) ---\n');
  var jsonExport = await reportGenerator.exportReport('DailySummary', {}, 'json');
  assert(jsonExport.format === 'json', 'Format = json');
  assert(jsonExport.data !== undefined, 'Data present');
  assert(jsonExport.data.reportType === 'DailySummary', 'Report data correct');

  // 10. exportReport — unknown type
  console.log('\n--- 10. exportReport (unknown type) ---\n');
  try {
    await reportGenerator.exportReport('FakeReport', {});
    assert(false, 'Should throw for unknown type');
  } catch (err) {
    assert(err.message.includes('Unknown report type'), 'Throws for unknown type', err.message);
  }

  // 11. _toCSV edge cases
  console.log('\n--- 11. _toCSV edge cases ---\n');
  var csv1 = reportGenerator._toCSV([]);
  assert(csv1 === '', 'Empty array returns empty string');

  var csv2 = reportGenerator._toCSV([{ Name: 'Hello, World', Value: 'has "quotes"' }]);
  assert(csv2.includes('"Hello, World"'), 'Escapes commas');
  assert(csv2.includes('"has ""quotes"""'), 'Escapes quotes');

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
