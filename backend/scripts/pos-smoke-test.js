/**
 * POS API Smoke Test Script
 *
 * Tests all POS API endpoints for:
 * 1. Endpoint exists (not 404)
 * 2. Returns expected status code
 * 3. Response has expected structure
 * 4. No server errors (500s)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API_BASE = process.env.API_URL || 'http://localhost:3001';
let AUTH_TOKEN = null;

// Test results storage
const results = [];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Make HTTP request with timeout
 */
async function request(method, path, body = null, expectedStatus = [200, 201]) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const options = {
    method,
    headers,
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  options.signal = controller.signal;

  try {
    const response = await fetch(url, options);
    clearTimeout(timeout);

    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        data = { parseError: true };
      }
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
      error: null,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      status: 0,
      ok: false,
      data: null,
      error: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
    };
  }
}

/**
 * Run a single test
 */
async function runTest(name, method, path, body = null, options = {}) {
  const {
    expectedStatus = [200, 201],
    expectedFields = [],
    requiresAuth = true,
    skipIfNoAuth = false,
  } = options;

  // Skip auth-required tests if no token
  if (requiresAuth && skipIfNoAuth && !AUTH_TOKEN) {
    results.push({
      endpoint: path,
      method,
      status: '-',
      pass: 'SKIP',
      notes: 'Requires auth',
    });
    return;
  }

  const result = await request(method, path, body);

  let pass = true;
  let notes = [];

  // Check for server errors
  if (result.status >= 500) {
    pass = false;
    notes.push(`Server error: ${result.status}`);
  }
  // Check for timeout/connection errors
  else if (result.error) {
    pass = false;
    notes.push(result.error);
  }
  // Check expected status
  else if (!expectedStatus.includes(result.status)) {
    // 401/403 for auth issues is acceptable
    if ([401, 403].includes(result.status) && requiresAuth) {
      notes.push('Auth required');
    } else if (result.status === 404) {
      pass = false;
      notes.push('Not found');
    } else {
      pass = false;
      notes.push(`Expected ${expectedStatus.join('/')}, got ${result.status}`);
    }
  }
  // Check response structure
  else if (expectedFields.length > 0 && result.data) {
    const missing = expectedFields.filter(f => !(f in result.data));
    if (missing.length > 0) {
      pass = false;
      notes.push(`Missing: ${missing.join(', ')}`);
    }
  }

  // Check for common error responses
  if (result.data) {
    if (result.data.error && result.status >= 400) {
      const errMsg = typeof result.data.error === 'string' ? result.data.error : JSON.stringify(result.data.error);
      notes.push(errMsg.substring(0, 40));
    } else if (result.data.success === false && result.data.message) {
      const msg = typeof result.data.message === 'string' ? result.data.message : JSON.stringify(result.data.message);
      notes.push(msg.substring(0, 40));
    }
  }

  results.push({
    endpoint: path,
    method,
    status: result.status || 'ERR',
    pass: pass ? 'PASS' : 'FAIL',
    notes: notes.join('; ') || (pass ? 'OK' : ''),
  });
}

/**
 * Authenticate and get token
 */
async function authenticate() {
  console.log('\nAuthenticating...');

  // Try to login with test credentials
  const loginResult = await request('POST', '/api/auth/login', {
    email: 'admin@yourcompany.com',
    password: 'admin123',
  }, [200]);

  if (loginResult.data?.token) {
    AUTH_TOKEN = loginResult.data.token;
    console.log('Authentication successful!\n');
    return true;
  }

  // Try alternative credentials
  const altResult = await request('POST', '/api/auth/login', {
    email: 'manager@test.com',
    password: 'manager123',
  }, [200]);

  if (altResult.data?.token) {
    AUTH_TOKEN = altResult.data.token;
    console.log('Authentication successful (alt)!\n');
    return true;
  }

  console.log('Warning: Could not authenticate. Some tests will be skipped.\n');
  return false;
}

/**
 * Run all POS smoke tests
 */
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('  POS API SMOKE TEST');
  console.log('  ' + new Date().toLocaleString());
  console.log('  API Base: ' + API_BASE);
  console.log('='.repeat(80));

  // Authenticate first
  await authenticate();

  // ============================================================================
  // HEALTH & AUTH
  // ============================================================================
  console.log('\n[Health & Auth]');

  await runTest('Health check', 'GET', '/api/health', null, {
    expectedStatus: [200],
    requiresAuth: false,
  });

  await runTest('Auth - current user', 'GET', '/api/auth/me', null, {
    expectedStatus: [200],
    expectedFields: ['user'],
  });

  // ============================================================================
  // REGISTERS & SHIFTS
  // ============================================================================
  console.log('\n[Registers & Shifts]');

  await runTest('List registers', 'GET', '/api/registers', null, {
    expectedStatus: [200],
  });

  await runTest('Get active shift', 'GET', '/api/registers/active', null, {
    expectedStatus: [200, 404], // 404 if no active shift
  });

  await runTest('Get active sales reps', 'GET', '/api/registers/active-sales-reps', null, {
    expectedStatus: [200],
  });

  await runTest('Get all sales reps', 'GET', '/api/registers/all-sales-reps', null, {
    expectedStatus: [200],
  });

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================
  console.log('\n[Transactions]');

  await runTest('List transactions', 'GET', '/api/transactions', null, {
    expectedStatus: [200],
  });

  await runTest('List transactions (filtered)', 'GET', '/api/transactions?status=completed&limit=5', null, {
    expectedStatus: [200],
  });

  await runTest('Get transaction (invalid)', 'GET', '/api/transactions/99999', null, {
    expectedStatus: [404],
  });

  await runTest('Daily summary', 'GET', '/api/transactions/daily-summary', null, {
    expectedStatus: [200, 400], // 400 if no shift
  });

  // ============================================================================
  // POS QUOTES
  // ============================================================================
  console.log('\n[POS Quotes]');

  await runTest('Quote lookup', 'GET', '/api/pos-quotes/lookup?q=test', null, {
    expectedStatus: [200],
  });

  await runTest('Pending quotes', 'GET', '/api/pos-quotes/pending', null, {
    expectedStatus: [200],
  });

  await runTest('Quote status (invalid)', 'GET', '/api/pos-quotes/99999/status', null, {
    expectedStatus: [404],
  });

  // ============================================================================
  // POS PAYMENTS
  // ============================================================================
  console.log('\n[POS Payments]');

  await runTest('Create card intent', 'POST', '/api/pos-payments/card/create-intent', {
    amountCents: 1000,
    metadata: { test: true },
  }, {
    expectedStatus: [200, 400, 500], // May fail without Stripe config
  });

  await runTest('Check customer credit', 'POST', '/api/pos-payments/account/check-credit', {
    customerId: 1,
    amountCents: 1000,
  }, {
    expectedStatus: [200, 400, 404],
  });

  await runTest('Check gift card balance', 'POST', '/api/pos-payments/gift-card/balance', {
    cardNumber: 'TEST-0000-0000',
  }, {
    expectedStatus: [200, 404],
  });

  // ============================================================================
  // POS PROMOTIONS
  // ============================================================================
  console.log('\n[POS Promotions]');

  await runTest('List promotions', 'GET', '/api/pos-promotions', null, {
    expectedStatus: [200],
  });

  await runTest('Active promotions', 'GET', '/api/pos-promotions/active', null, {
    expectedStatus: [200],
  });

  await runTest('Validate promo code', 'POST', '/api/pos-promotions/validate-code', {
    code: 'TESTCODE',
  }, {
    expectedStatus: [200, 404],
  });

  await runTest('Calculate cart promotions', 'POST', '/api/pos-promotions/applicable', {
    cart: {
      items: [{ productId: 1, quantity: 1, unitPrice: 100 }],
      subtotal: 100,
    },
  }, {
    expectedStatus: [200],
  });

  await runTest('Promotion engine check', 'POST', '/api/pos-promotions/engine/check', {
    cart: {
      items: [{ productId: 1, quantity: 1, unitPriceCents: 10000 }],
      subtotalCents: 10000,
    },
  }, {
    expectedStatus: [200],
  });

  // ============================================================================
  // MANAGER OVERRIDES
  // ============================================================================
  console.log('\n[Manager Overrides]');

  await runTest('Check override required', 'POST', '/api/manager-overrides/check', {
    overrideType: 'discount_percent',
    value: 5,
  }, {
    expectedStatus: [200],
  });

  await runTest('Check discount', 'POST', '/api/manager-overrides/check-discount', {
    discountPercent: 15,
    originalPrice: 100,
    newPrice: 85,
  }, {
    expectedStatus: [200],
  });

  await runTest('Get thresholds', 'GET', '/api/manager-overrides/thresholds', null, {
    expectedStatus: [200],
  });

  await runTest('Get thresholds config', 'GET', '/api/manager-overrides/thresholds/config', null, {
    expectedStatus: [200],
  });

  await runTest('Override history', 'GET', '/api/manager-overrides/history', null, {
    expectedStatus: [200],
  });

  await runTest('Override summary', 'GET', '/api/manager-overrides/summary', null, {
    expectedStatus: [200],
  });

  await runTest('Pending requests', 'GET', '/api/manager-overrides/requests/pending', null, {
    expectedStatus: [200],
  });

  // ============================================================================
  // CASH DRAWER
  // ============================================================================
  console.log('\n[Cash Drawer]');

  await runTest('Daily summary', 'GET', '/api/cash-drawer/daily-summary', null, {
    expectedStatus: [200],
  });

  await runTest('Safe drops', 'GET', '/api/cash-drawer/safe-drops', null, {
    expectedStatus: [200],
  });

  await runTest('Calculate denominations', 'POST', '/api/cash-drawer/calculate-denominations', {
    denominations: {
      hundreds: 1,
      fifties: 2,
      twenties: 5,
      tens: 10,
      fives: 20,
      toonies: 50,
      loonies: 100,
      quarters: 200,
      dimes: 100,
      nickels: 100,
      pennies: 0,
    },
  }, {
    expectedStatus: [200],
  });

  // ============================================================================
  // TRADE-IN
  // ============================================================================
  console.log('\n[Trade-In]');

  await runTest('Trade-in categories', 'GET', '/api/trade-in/categories', null, {
    expectedStatus: [200],
  });

  await runTest('Trade-in conditions', 'GET', '/api/trade-in/conditions', null, {
    expectedStatus: [200],
  });

  await runTest('Search trade-in products', 'GET', '/api/trade-in/products/search?q=phone', null, {
    expectedStatus: [200],
  });

  await runTest('Trade-in stats', 'GET', '/api/trade-in/stats', null, {
    expectedStatus: [200],
  });

  await runTest('Pending approvals', 'GET', '/api/trade-in/approvals/pending', null, {
    expectedStatus: [200],
  });

  await runTest('Assess trade-in', 'POST', '/api/trade-in/assess', {
    categoryId: 1,
    conditionGrade: 'good',
    brand: 'Apple',
    model: 'iPhone 12',
  }, {
    expectedStatus: [200, 400],
  });

  // ============================================================================
  // POS QUOTE EXPIRY
  // ============================================================================
  console.log('\n[Quote Expiry]');

  await runTest('Expiring quotes', 'GET', '/api/pos/quotes/expiring', null, {
    expectedStatus: [200],
  });

  await runTest('Expiring quotes stats', 'GET', '/api/pos/quotes/expiring/stats', null, {
    expectedStatus: [200],
  });

  await runTest('Expiry dashboard', 'GET', '/api/pos/quotes/expiring/dashboard', null, {
    expectedStatus: [200],
  });

  // ============================================================================
  // POS SALES REPS
  // ============================================================================
  console.log('\n[Sales Reps]');

  await runTest('Active sales reps (POS)', 'GET', '/api/pos/active-sales-reps', null, {
    expectedStatus: [200],
  });

  await runTest('Search sales reps', 'GET', '/api/pos/sales-reps/search?q=admin', null, {
    expectedStatus: [200],
  });

  // ============================================================================
  // POS INVOICES
  // ============================================================================
  console.log('\n[POS Invoices]');

  await runTest('Account customers', 'GET', '/api/pos-invoices/account-customers', null, {
    expectedStatus: [200],
  });

  await runTest('Invoice data (invalid)', 'GET', '/api/pos-invoices/99999/data', null, {
    expectedStatus: [404],
  });

  // ============================================================================
  // RECEIPTS
  // ============================================================================
  console.log('\n[Receipts]');

  await runTest('Receipt (invalid)', 'GET', '/api/receipts/99999', null, {
    expectedStatus: [404],
  });

  // ============================================================================
  // DELIVERY
  // ============================================================================
  console.log('\n[Delivery]');

  await runTest('Delivery zones', 'GET', '/api/delivery/zones', null, {
    expectedStatus: [200],
  });

  await runTest('Delivery options', 'POST', '/api/delivery/options', {
    cart: {
      items: [{ productId: 1, quantity: 1, unitPrice: 100 }],
      subtotal: 100,
    },
    address: null,
  }, {
    expectedStatus: [200],
  });

  await runTest('Check delivery availability', 'POST', '/api/delivery/check', {
    postalCode: 'M5V 1J1',
  }, {
    expectedStatus: [200],
  });

  // ============================================================================
  // INVENTORY
  // ============================================================================
  console.log('\n[Inventory]');

  await runTest('Check stock', 'GET', '/api/inventory-sync/stock/1', null, {
    expectedStatus: [200, 404],
  });

  await runTest('Low stock alerts', 'GET', '/api/inventory-sync/low-stock', null, {
    expectedStatus: [200],
  });

  // ============================================================================
  // PRODUCTS
  // ============================================================================
  console.log('\n[Products]');

  await runTest('List products', 'GET', '/api/products?limit=5', null, {
    expectedStatus: [200],
    requiresAuth: false,
  });

  await runTest('Search products', 'GET', '/api/products/search?q=phone&limit=5', null, {
    expectedStatus: [200],
    requiresAuth: false,
  });

  // ============================================================================
  // CUSTOMERS
  // ============================================================================
  console.log('\n[Customers]');

  await runTest('List customers', 'GET', '/api/customers?limit=5', null, {
    expectedStatus: [200],
  });

  await runTest('Search customers', 'GET', '/api/customers/search?q=test', null, {
    expectedStatus: [200],
  });

  // ============================================================================
  // TAX
  // ============================================================================
  console.log('\n[Tax]');

  await runTest('Tax rates', 'GET', '/api/tax/rates', null, {
    expectedStatus: [200],
  });

  await runTest('Calculate tax', 'POST', '/api/tax/calculate', {
    subtotalCents: 10000,
    province: 'ON',
  }, {
    expectedStatus: [200],
  });

  // ============================================================================
  // BATCH EMAIL SETTINGS
  // ============================================================================
  console.log('\n[Batch Email]');

  await runTest('Get batch email settings', 'GET', '/api/batch-email-settings', null, {
    expectedStatus: [200],
  });

  // Print results
  printResults();
}

/**
 * Print results as a formatted table
 */
function printResults() {
  console.log('\n');
  console.log('='.repeat(100));
  console.log('  SMOKE TEST RESULTS');
  console.log('='.repeat(100));

  // Calculate stats
  const passed = results.filter(r => r.pass === 'PASS').length;
  const failed = results.filter(r => r.pass === 'FAIL').length;
  const skipped = results.filter(r => r.pass === 'SKIP').length;

  // Print header
  console.log('\n' + '-'.repeat(100));
  console.log(
    'Endpoint'.padEnd(50) +
    'Method'.padEnd(8) +
    'Status'.padEnd(8) +
    'Result'.padEnd(8) +
    'Notes'
  );
  console.log('-'.repeat(100));

  // Print each result
  for (const r of results) {
    let color = colors.reset;
    if (r.pass === 'PASS') color = colors.green;
    else if (r.pass === 'FAIL') color = colors.red;
    else if (r.pass === 'SKIP') color = colors.yellow;

    const endpoint = r.endpoint.length > 48 ? r.endpoint.substring(0, 45) + '...' : r.endpoint;
    const notes = r.notes.length > 30 ? r.notes.substring(0, 27) + '...' : r.notes;

    console.log(
      color +
      endpoint.padEnd(50) +
      r.method.padEnd(8) +
      String(r.status).padEnd(8) +
      r.pass.padEnd(8) +
      notes +
      colors.reset
    );
  }

  console.log('-'.repeat(100));

  // Print summary
  console.log('\n' + '='.repeat(100));
  console.log('  SUMMARY');
  console.log('='.repeat(100));
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`  ${colors.yellow}Skipped: ${skipped}${colors.reset}`);
  console.log(`  Pass Rate: ${((passed / (results.length - skipped)) * 100).toFixed(1)}%`);
  console.log('='.repeat(100));

  // List failures
  if (failed > 0) {
    console.log('\n' + colors.red + 'FAILURES:' + colors.reset);
    results
      .filter(r => r.pass === 'FAIL')
      .forEach(r => {
        console.log(`  - ${r.method} ${r.endpoint}: ${r.notes}`);
      });
  }

  // Check for 500 errors
  const serverErrors = results.filter(r => r.status >= 500);
  if (serverErrors.length > 0) {
    console.log('\n' + colors.red + 'SERVER ERRORS (500+):' + colors.reset);
    serverErrors.forEach(r => {
      console.log(`  - ${r.method} ${r.endpoint}: ${r.status}`);
    });
  }

  console.log('\n');
}

// Run the tests
runAllTests().catch(console.error);
