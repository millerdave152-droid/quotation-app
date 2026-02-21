require('dotenv').config();
var taxEngine = require('./services/TaxEngine');

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

(async function() {
  console.log('=== TAX ENGINE TEST ===\n');

  // 1. Tax rates
  console.log('--- TAX RATES ---\n');
  var rates = taxEngine.getTaxRates();
  assert(Object.keys(rates).length === 13, '13 provinces/territories', Object.keys(rates).join(', '));
  assert(rates['ON'].type === 'HST' && rates['ON'].rate === 0.13, 'Ontario HST 13%');
  assert(rates['AB'].type === 'GST' && rates['AB'].rate === 0.05, 'Alberta GST only 5%');
  assert(rates['QC'].type === 'GST+QST' && rates['QC'].rate === 0.14975, 'Quebec GST+QST 14.975%');
  assert(rates['BC'].type === 'GST+PST' && rates['BC'].rate === 0.12, 'BC GST+PST 12%');

  // 2. Calculate tax
  console.log('\n--- CALCULATE TAX ---\n');
  var on = taxEngine.calculateTax(1000, 'ON');
  assert(on.gstAmount === 50, 'ON GST $50', '$' + on.gstAmount);
  assert(on.pstAmount === 80, 'ON PST $80', '$' + on.pstAmount);
  assert(on.totalTax === 130, 'ON total $130', '$' + on.totalTax);
  assert(on.grandTotal === 1130, 'ON grand total $1130', '$' + on.grandTotal);

  var ab = taxEngine.calculateTax(1000, 'AB');
  assert(ab.gstAmount === 50, 'AB GST $50', '$' + ab.gstAmount);
  assert(ab.pstAmount === 0, 'AB PST $0', '$' + ab.pstAmount);
  assert(ab.totalTax === 50, 'AB total $50', '$' + ab.totalTax);

  var qc = taxEngine.calculateTax(1000, 'QC');
  assert(qc.gstAmount === 50, 'QC GST $50', '$' + qc.gstAmount);
  assert(qc.pstAmount === 99.75, 'QC QST $99.75', '$' + qc.pstAmount);
  assert(qc.totalTax === 149.75, 'QC total $149.75', '$' + qc.totalTax);

  // Fallback to ON for unknown province
  var unknown = taxEngine.calculateTax(100, 'XX');
  assert(unknown.totalTax === 13, 'Unknown province falls back to ON', '$' + unknown.totalTax);

  // 3. EHF
  console.log('\n--- EHF LOOKUP ---\n');
  var ehfTV = taxEngine.getEHF('TVs', 'ON');
  assert(ehfTV.ehfAmount === 26.39, 'ON TVs EHF $26.39', '$' + ehfTV.ehfAmount);

  var ehfFridge = taxEngine.getEHF('Refrigerators', 'BC');
  assert(ehfFridge.ehfAmount === 24.00, 'BC Refrigerators EHF $24', '$' + ehfFridge.ehfAmount);

  var ehfNone = taxEngine.getEHF('TVs', 'NU');
  assert(ehfNone.ehfAmount === 0, 'NU no EHF program', ehfNone.note);

  var ehfUnknownCat = taxEngine.getEHF('Drones', 'ON');
  assert(ehfUnknownCat.ehfAmount === 0, 'Unknown category no EHF', ehfUnknownCat.note);

  // 4. Tax reconciliation
  console.log('\n--- TAX RECONCILIATION ---\n');
  var recon = await taxEngine.getTaxReconciliation('2025-01-01', '2026-12-31');
  assert(recon.period.from === '2025-01-01', 'Period from correct');
  assert(recon.period.to === '2026-12-31', 'Period to correct');
  assert(typeof recon.summary.total_orders === 'number', 'Summary has total_orders', recon.summary.total_orders);
  assert(recon.summary.federal_tax_gst_hst !== undefined, 'Federal tax calculated', '$' + recon.summary.federal_tax_gst_hst);
  assert(recon.summary.provincial_tax_pst_qst !== undefined, 'Provincial tax calculated', '$' + recon.summary.provincial_tax_pst_qst);
  assert(Array.isArray(recon.by_province_and_code), 'Province breakdown is array', recon.by_province_and_code.length + ' rows');
  assert(Array.isArray(recon.by_channel), 'Channel breakdown is array');
  if (recon.by_province_and_code.length > 0) {
    var sample = recon.by_province_and_code[0];
    console.log('  Sample:', JSON.stringify(sample));
    assert(sample.province, 'Has province');
    assert(sample.tax_code, 'Has tax_code');
    assert(sample.product_tax, 'Has product_tax');
    assert(sample.total_tax, 'Has total_tax');
  }

  // 5. Commission tax report
  console.log('\n--- COMMISSION TAX REPORT ---\n');
  var commReport = await taxEngine.getCommissionTaxReport('2025-01-01', '2026-12-31');
  assert(commReport.summary.total_commission_paid !== undefined, 'Total commission', '$' + commReport.summary.total_commission_paid);
  assert(commReport.summary.total_itc_claimable !== undefined, 'ITC claimable', '$' + commReport.summary.total_itc_claimable);
  assert(commReport.summary.note.indexOf('13% HST') >= 0, 'ITC note mentions HST rate');
  assert(Array.isArray(commReport.by_province), 'By province breakdown');
  assert(Array.isArray(commReport.monthly), 'Monthly breakdown');
  if (commReport.by_province.length > 0) {
    console.log('  Sample:', JSON.stringify(commReport.by_province[0]));
  }

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
