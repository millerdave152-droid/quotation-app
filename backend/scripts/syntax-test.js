#!/usr/bin/env node
/**
 * Syntax and Import Test
 * Verifies all new services and routes can be loaded without errors
 */

const path = require('path');

const results = { passed: 0, failed: 0, tests: [] };

function testRequire(name, modulePath) {
  try {
    require(modulePath);
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message.split('\n')[0]}`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('         SYNTAX AND IMPORT TEST');
console.log('═══════════════════════════════════════════════════════════\n');

// Services
console.log('▶ Services');
console.log('─'.repeat(50));
testRequire('ProductImageService', '../services/ProductImageService');
testRequire('DiscontinuedProductService', '../services/DiscontinuedProductService');
testRequire('CallLogService', '../services/CallLogService');
testRequire('ARAgingService', '../services/ARAgingService');
testRequire('TaxSummaryService', '../services/TaxSummaryService');
testRequire('TimeClockService', '../services/TimeClockService');
testRequire('LayawayService', '../services/LayawayService');

// Routes
console.log('\n▶ Routes');
console.log('─'.repeat(50));
testRequire('product-images', '../routes/product-images');
testRequire('discontinued-products', '../routes/discontinued-products');
testRequire('call-log', '../routes/call-log');
testRequire('ar-aging', '../routes/ar-aging');
testRequire('tax-summary', '../routes/tax-summary');
testRequire('timeclock', '../routes/timeclock');
testRequire('layaways', '../routes/layaways');
testRequire('product-lookup', '../routes/product-lookup');

// Jobs
console.log('\n▶ Jobs');
console.log('─'.repeat(50));
testRequire('discontinuedProductJob', '../jobs/discontinuedProductJob');
testRequire('autoTagJob', '../jobs/autoTagJob');

// Existing core services (verify no regressions)
console.log('\n▶ Core Services (regression check)');
console.log('─'.repeat(50));
testRequire('EmailService', '../services/EmailService');
testRequire('FinancingService', '../services/FinancingService');
testRequire('ReceiptService', '../services/ReceiptService');
testRequire('ProductService', '../services/ProductService');
testRequire('PricingService', '../services/PricingService');
testRequire('CustomerService', '../services/CustomerService');
testRequire('CashDrawerService', '../services/CashDrawerService');

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
console.log('                    SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Total:   ${results.passed + results.failed}`);
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log('═══════════════════════════════════════════════════════════\n');

if (results.failed > 0) {
  console.log('Failed imports:');
  results.tests.filter(t => t.status === 'FAIL').forEach(t => {
    console.log(`  - ${t.name}: ${t.error}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('All imports successful!\n');
  process.exit(0);
}
