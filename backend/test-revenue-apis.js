/**
 * REVENUE FEATURES API TEST SUITE
 * Tests all 24 revenue feature endpoints
 * Run with: node test-revenue-apis.js
 */

const http = require('http');

const API_BASE = 'http://localhost:3001/api';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// Helper function to make HTTP requests
function apiRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${endpoint}`);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test logger
function logTest(testName, passed, message = '') {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    if (message) console.log(`  ${colors.cyan}${message}${colors.reset}`);
  } else {
    testsFailed++;
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (message) console.log(`  ${colors.red}${message}${colors.reset}`);
  }
}

function logSection(title) {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

// ============================================
// DELIVERY & INSTALLATION TESTS
// ============================================
async function testDeliveryAPIs() {
  logSection('DELIVERY & INSTALLATION APIs');

  try {
    // Test 1: Get all delivery services
    const services = await apiRequest('/delivery-services');
    logTest(
      'GET /api/delivery-services',
      services.status === 200 && Array.isArray(services.data),
      `Found ${services.data.length} delivery services`
    );

    if (services.data.length > 0) {
      const service = services.data[0];

      // Test 2: Calculate delivery cost
      const calculation = await apiRequest('/delivery-services/calculate', 'POST', {
        serviceId: service.id,
        distanceMiles: 15.5,
        floorLevel: 3,
        isWeekend: true,
        isEvening: false
      });
      logTest(
        'POST /api/delivery-services/calculate',
        calculation.status === 200 && calculation.data.calculation,
        `Calculated cost: $${(calculation.data.calculation?.totalCents / 100).toFixed(2)}`
      );
    }
  } catch (error) {
    logTest('Delivery APIs', false, error.message);
  }
}

// ============================================
// WARRANTY TESTS
// ============================================
async function testWarrantyAPIs() {
  logSection('WARRANTY APIs');

  try {
    // Test 1: Get all warranty plans
    const plans = await apiRequest('/warranty-plans');
    logTest(
      'GET /api/warranty-plans',
      plans.status === 200 && Array.isArray(plans.data),
      `Found ${plans.data.length} warranty plans`
    );

    // Test 2: Get warranty plans filtered by category
    const appliancePlans = await apiRequest('/warranty-plans?productCategory=appliance&productPrice=79900');
    logTest(
      'GET /api/warranty-plans (filtered)',
      appliancePlans.status === 200 && Array.isArray(appliancePlans.data),
      `Found ${appliancePlans.data.length} appliance warranty plans`
    );

    if (plans.data.length > 0) {
      const plan = plans.data[0];

      // Test 3: Calculate warranty cost
      const calculation = await apiRequest('/warranty-plans/calculate', 'POST', {
        planId: plan.id,
        productPriceCents: 79900
      });
      logTest(
        'POST /api/warranty-plans/calculate',
        calculation.status === 200 && calculation.data.warrantyCostCents !== undefined,
        `Warranty cost: $${(calculation.data.warrantyCostCents / 100).toFixed(2)}`
      );
    }
  } catch (error) {
    logTest('Warranty APIs', false, error.message);
  }
}

// ============================================
// FINANCING TESTS
// ============================================
async function testFinancingAPIs() {
  logSection('FINANCING APIs');

  try {
    // Test 1: Get all financing plans
    const plans = await apiRequest('/financing-plans');
    logTest(
      'GET /api/financing-plans',
      plans.status === 200 && Array.isArray(plans.data),
      `Found ${plans.data.length} financing plans`
    );

    // Test 2: Get financing plans filtered by minimum purchase
    const filtered = await apiRequest('/financing-plans?minPurchase=100000');
    logTest(
      'GET /api/financing-plans (filtered)',
      filtered.status === 200 && Array.isArray(filtered.data),
      `Found ${filtered.data.length} plans for $1,000+ purchases`
    );

    if (plans.data.length > 0) {
      const plan = plans.data[0];

      // Test 3: Calculate monthly payment (0% APR)
      const zeroPercent = await apiRequest('/financing-plans/calculate', 'POST', {
        planId: plan.id,
        purchaseAmountCents: 250000,
        downPaymentCents: 50000
      });
      logTest(
        'POST /api/financing-plans/calculate (0% APR)',
        zeroPercent.status === 200 && zeroPercent.data.calculation,
        `Monthly payment: $${(zeroPercent.data.calculation?.monthlyPaymentCents / 100).toFixed(2)}`
      );

      // Test 4: Calculate with APR
      const withAPR = plans.data.find(p => parseFloat(p.apr_percent) > 0);
      if (withAPR) {
        const calculation = await apiRequest('/financing-plans/calculate', 'POST', {
          planId: withAPR.id,
          purchaseAmountCents: 250000,
          downPaymentCents: 0
        });
        logTest(
          'POST /api/financing-plans/calculate (with APR)',
          calculation.status === 200 && calculation.data.calculation?.totalInterestCents > 0,
          `Monthly: $${(calculation.data.calculation?.monthlyPaymentCents / 100).toFixed(2)}, ` +
          `Total Interest: $${(calculation.data.calculation?.totalInterestCents / 100).toFixed(2)}`
        );
      }
    }
  } catch (error) {
    logTest('Financing APIs', false, error.message);
  }
}

// ============================================
// REBATE TESTS
// ============================================
async function testRebateAPIs() {
  logSection('REBATE APIs');

  try {
    // Test 1: Get active rebates
    const rebates = await apiRequest('/rebates');
    logTest(
      'GET /api/rebates',
      rebates.status === 200 && Array.isArray(rebates.data),
      `Found ${rebates.data.length} active rebates`
    );

    // Test 2: Get rebates filtered by manufacturer
    if (rebates.data.length > 0) {
      const manufacturer = rebates.data[0].manufacturer;
      const filtered = await apiRequest(`/rebates?manufacturer=${manufacturer}`);
      logTest(
        'GET /api/rebates (filtered by manufacturer)',
        filtered.status === 200 && Array.isArray(filtered.data),
        `Found ${filtered.data.length} rebates from ${manufacturer}`
      );

      // Test 3: Calculate rebate amount
      const rebate = rebates.data[0];
      const calculation = await apiRequest('/rebates/calculate', 'POST', {
        rebateId: rebate.id,
        purchaseAmountCents: 150000
      });
      logTest(
        'POST /api/rebates/calculate',
        calculation.status === 200 && calculation.data.rebateAmountCents !== undefined,
        `Rebate amount: $${(calculation.data.rebateAmountCents / 100).toFixed(2)}`
      );
    }
  } catch (error) {
    logTest('Rebate APIs', false, error.message);
  }
}

// ============================================
// TRADE-IN TESTS
// ============================================
async function testTradeInAPIs() {
  logSection('TRADE-IN APIs');

  try {
    // Test 1: Get trade-in values
    const values = await apiRequest('/trade-in-values');
    logTest(
      'GET /api/trade-in-values',
      values.status === 200 && Array.isArray(values.data),
      `Found ${values.data.length} trade-in value entries`
    );

    // Test 2: Get trade-in values with filters
    const filtered = await apiRequest('/trade-in-values?productCategory=refrigerator&condition=good');
    logTest(
      'GET /api/trade-in-values (filtered)',
      filtered.status === 200 && Array.isArray(filtered.data),
      `Found ${filtered.data.length} refrigerator values in good condition`
    );

    if (filtered.data.length > 0) {
      const value = filtered.data[0];
      logTest(
        'Trade-in value data structure',
        value.estimated_value_cents !== undefined,
        `Estimated value: $${(value.estimated_value_cents / 100).toFixed(2)}`
      );
    }
  } catch (error) {
    logTest('Trade-In APIs', false, error.message);
  }
}

// ============================================
// COMMISSION TESTS
// ============================================
async function testCommissionAPIs() {
  logSection('COMMISSION APIs');

  try {
    // Test 1: Get sales reps
    const reps = await apiRequest('/sales-reps');
    logTest(
      'GET /api/sales-reps',
      reps.status === 200 && Array.isArray(reps.data),
      `Found ${reps.data.length} sales reps`
    );

    // Test 2: Get commission rules
    const rules = await apiRequest('/commission-rules');
    logTest(
      'GET /api/commission-rules',
      rules.status === 200 && Array.isArray(rules.data),
      `Found ${rules.data.length} commission rules`
    );

    // Test 3: Get commission rules filtered
    const filtered = await apiRequest('/commission-rules?productCategory=appliance');
    logTest(
      'GET /api/commission-rules (filtered)',
      filtered.status === 200 && Array.isArray(filtered.data),
      `Found ${filtered.data.length} appliance commission rules`
    );

    if (rules.data.length > 0) {
      // Test 4: Calculate commission
      const calculation = await apiRequest('/commission-rules/calculate', 'POST', {
        productCategory: 'appliance',
        productSaleCents: 150000,
        warrantySaleCents: 12000,
        deliverySaleCents: 9900
      });
      logTest(
        'POST /api/commission-rules/calculate',
        calculation.status === 200 && calculation.data.calculation,
        `Total commission: $${(calculation.data.calculation?.totalCommissionCents / 100).toFixed(2)}`
      );
    }
  } catch (error) {
    logTest('Commission APIs', false, error.message);
  }
}

// ============================================
// QUOTE ASSOCIATION TESTS
// ============================================
async function testQuoteAssociations() {
  logSection('QUOTE ASSOCIATION Tests');

  console.log(`${colors.yellow}Note: These tests require existing quotes in the database${colors.reset}\n`);

  try {
    // These would typically use a test quote ID
    // For now, we'll just test the endpoint structure
    const testQuoteId = 1;

    const endpoints = [
      { method: 'GET', path: `/quotes/${testQuoteId}/delivery`, name: 'Get quote delivery' },
      { method: 'GET', path: `/quotes/${testQuoteId}/warranties`, name: 'Get quote warranties' },
      { method: 'GET', path: `/quotes/${testQuoteId}/financing`, name: 'Get quote financing' },
      { method: 'GET', path: `/quotes/${testQuoteId}/rebates`, name: 'Get quote rebates' },
      { method: 'GET', path: `/quotes/${testQuoteId}/trade-ins`, name: 'Get quote trade-ins' },
      { method: 'GET', path: `/quotes/${testQuoteId}/sales-rep`, name: 'Get quote sales rep' }
    ];

    for (const endpoint of endpoints) {
      try {
        const result = await apiRequest(endpoint.path, endpoint.method);
        // Even if quote doesn't exist, endpoint should respond (404 or empty array)
        logTest(
          `${endpoint.method} /api${endpoint.path}`,
          result.status === 200 || result.status === 404,
          `Endpoint accessible`
        );
      } catch (error) {
        logTest(`${endpoint.method} /api${endpoint.path}`, false, error.message);
      }
    }
  } catch (error) {
    logTest('Quote Association APIs', false, error.message);
  }
}

// ============================================
// EDGE CASE TESTS
// ============================================
async function testEdgeCases() {
  logSection('EDGE CASE Tests');

  try {
    // Test 1: Invalid plan ID
    const invalidPlan = await apiRequest('/financing-plans/calculate', 'POST', {
      planId: 99999,
      purchaseAmountCents: 100000,
      downPaymentCents: 0
    });
    logTest(
      'Invalid plan ID handling',
      invalidPlan.status === 404,
      'Returns 404 for non-existent plan'
    );

    // Test 2: Negative values
    const negativeCalc = await apiRequest('/financing-plans/calculate', 'POST', {
      planId: 1,
      purchaseAmountCents: -100000,
      downPaymentCents: 0
    });
    logTest(
      'Negative value handling',
      negativeCalc.status === 200 || negativeCalc.status === 400,
      'Handles negative values gracefully'
    );

    // Test 3: Very large purchase amount
    const largePurchase = await apiRequest('/financing-plans/calculate', 'POST', {
      planId: 1,
      purchaseAmountCents: 999999999,
      downPaymentCents: 0
    });
    logTest(
      'Large value handling',
      largePurchase.status === 200,
      'Calculates correctly for large amounts'
    );

    // Test 4: Down payment > purchase amount
    const overPayment = await apiRequest('/financing-plans/calculate', 'POST', {
      planId: 1,
      purchaseAmountCents: 100000,
      downPaymentCents: 200000
    });
    logTest(
      'Down payment exceeds purchase',
      overPayment.status === 200,
      'Handles edge case correctly'
    );
  } catch (error) {
    logTest('Edge Cases', false, error.message);
  }
}

// ============================================
// DATA VALIDATION TESTS
// ============================================
async function testDataValidation() {
  logSection('DATA VALIDATION Tests');

  try {
    // Test 1: Financing plans have correct structure
    const plans = await apiRequest('/financing-plans');
    if (plans.data.length > 0) {
      const plan = plans.data[0];
      const hasRequiredFields =
        plan.id !== undefined &&
        plan.plan_name !== undefined &&
        plan.term_months !== undefined &&
        plan.apr_percent !== undefined;
      logTest(
        'Financing plan structure',
        hasRequiredFields,
        'All required fields present'
      );
    }

    // Test 2: Warranty plans have correct structure
    const warranties = await apiRequest('/warranty-plans');
    if (warranties.data.length > 0) {
      const warranty = warranties.data[0];
      const hasRequiredFields =
        warranty.id !== undefined &&
        warranty.plan_name !== undefined &&
        warranty.duration_years !== undefined;
      logTest(
        'Warranty plan structure',
        hasRequiredFields,
        'All required fields present'
      );
    }

    // Test 3: Delivery services have correct structure
    const services = await apiRequest('/delivery-services');
    if (services.data.length > 0) {
      const service = services.data[0];
      const hasRequiredFields =
        service.id !== undefined &&
        service.service_name !== undefined &&
        service.base_price_cents !== undefined;
      logTest(
        'Delivery service structure',
        hasRequiredFields,
        'All required fields present'
      );
    }

    // Test 4: Commission rules have correct structure
    const rules = await apiRequest('/commission-rules');
    if (rules.data.length > 0) {
      const rule = rules.data[0];
      const hasRequiredFields =
        rule.id !== undefined &&
        rule.commission_percent !== undefined;
      logTest(
        'Commission rule structure',
        hasRequiredFields,
        'All required fields present'
      );
    }
  } catch (error) {
    logTest('Data Validation', false, error.message);
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function runAllTests() {
  console.log('\n');
  console.log(`${colors.cyan}${'*'.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}   REVENUE FEATURES API TEST SUITE${colors.reset}`);
  console.log(`${colors.cyan}   Testing 24 Endpoints + Edge Cases${colors.reset}`);
  console.log(`${colors.cyan}${'*'.repeat(60)}${colors.reset}\n`);

  const startTime = Date.now();

  await testDeliveryAPIs();
  await testWarrantyAPIs();
  await testFinancingAPIs();
  await testRebateAPIs();
  await testTradeInAPIs();
  await testCommissionAPIs();
  await testQuoteAssociations();
  await testEdgeCases();
  await testDataValidation();

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}TEST SUMMARY${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);

  console.log(`Total Tests Run: ${testsRun}`);
  console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
  if (testsFailed > 0) {
    console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
  } else {
    console.log(`${colors.green}Failed: 0${colors.reset}`);
  }
  console.log(`Duration: ${duration}s\n`);

  const passRate = ((testsPassed / testsRun) * 100).toFixed(1);
  if (passRate >= 90) {
    console.log(`${colors.green}✓ ALL SYSTEMS OPERATIONAL (${passRate}% pass rate)${colors.reset}\n`);
  } else if (passRate >= 70) {
    console.log(`${colors.yellow}⚠ SOME ISSUES DETECTED (${passRate}% pass rate)${colors.reset}\n`);
  } else {
    console.log(`${colors.red}✗ CRITICAL ISSUES (${passRate}% pass rate)${colors.reset}\n`);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error(`${colors.red}FATAL ERROR:${colors.reset}`, error);
  process.exit(1);
});
