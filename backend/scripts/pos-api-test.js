/**
 * POS Backend API Smoke Test
 * Tests all critical POS endpoints to verify backend is working
 */
require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3001';
let token = null;
let userId = null;

function request(method, path, body, useToken = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    };
    if (useToken && token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data.substring(0, 300) });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  function log(pass, name, detail = '') {
    if (pass) {
      results.passed++;
      console.log(`  PASS  ${name}${detail ? ' - ' + detail : ''}`);
    } else {
      results.failed++;
      console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`);
      results.errors.push({ name, detail });
    }
  }

  // =========================================================================
  console.log('\n=== 1. AUTHENTICATION ===');
  // =========================================================================
  try {
    const login = await request('POST', '/api/auth/login', {
      email: 'admin@yourcompany.com',
      password: 'TestPass123!'
    }, false);
    token = login.data?.data?.accessToken || login.data?.token;
    userId = login.data?.data?.user?.id;
    log(!!token, 'Login', token ? `User ID: ${userId}` : 'No token returned');
  } catch (e) {
    log(false, 'Login', e.message);
  }

  if (!token) {
    console.log('\nCannot continue without auth token!');
    return results;
  }

  try {
    const me = await request('GET', '/api/auth/me');
    log(me.status === 200, 'Auth /me', `${me.data?.data?.email || me.data?.email || 'unknown'}`);
  } catch (e) {
    log(false, 'Auth /me', e.message);
  }

  // =========================================================================
  console.log('\n=== 2. PRODUCTS & CATEGORIES ===');
  // =========================================================================
  let productId = null;
  try {
    const products = await request('GET', '/api/products?limit=5');
    const items = products.data?.data?.products || products.data?.data || products.data?.products || [];
    productId = items[0]?.id;
    log(products.status === 200 && items.length > 0, 'Products list', `${items.length} products, first ID: ${productId}`);
  } catch (e) {
    log(false, 'Products list', e.message);
  }

  try {
    const cats = await request('GET', '/api/products/categories');
    const catList = cats.data?.data || cats.data?.categories || [];
    log(cats.status === 200, 'Categories', `${Array.isArray(catList) ? catList.length : 'N/A'} categories`);
  } catch (e) {
    log(false, 'Categories', e.message);
  }

  try {
    const search = await request('GET', '/api/products?search=test&limit=3');
    log(search.status === 200, 'Product search', 'Search works');
  } catch (e) {
    log(false, 'Product search', e.message);
  }

  if (productId) {
    try {
      const detail = await request('GET', `/api/products/${productId}`);
      log(detail.status === 200, 'Product detail', `ID ${productId}`);
    } catch (e) {
      log(false, 'Product detail', e.message);
    }
  }

  // =========================================================================
  console.log('\n=== 3. CUSTOMERS ===');
  // =========================================================================
  let customerId = null;
  try {
    const customers = await request('GET', '/api/customers?limit=5');
    const custs = customers.data?.data?.customers || customers.data?.data || [];
    customerId = custs[0]?.id;
    log(customers.status === 200 && custs.length > 0, 'Customer list', `${custs.length} customers, first ID: ${customerId}`);
  } catch (e) {
    log(false, 'Customer list', e.message);
  }

  try {
    const search = await request('GET', '/api/customers?search=test&limit=3');
    log(search.status === 200, 'Customer search', 'Search works');
  } catch (e) {
    log(false, 'Customer search', e.message);
  }

  if (customerId) {
    try {
      const detail = await request('GET', `/api/customers/${customerId}`);
      log(detail.status === 200, 'Customer detail', `ID ${customerId}`);
    } catch (e) {
      log(false, 'Customer detail', e.message);
    }
  }

  // =========================================================================
  console.log('\n=== 4. REGISTER & SHIFT ===');
  // =========================================================================
  try {
    const status = await request('GET', '/api/registers/status');
    log(status.status === 200 || status.status === 404, 'Register status', `Status: ${status.status}`);
  } catch (e) {
    log(false, 'Register status', e.message);
  }

  try {
    const shifts = await request('GET', '/api/registers/shifts?limit=3');
    log(shifts.status === 200 || shifts.status === 404, 'Shift history', `Status: ${shifts.status}`);
  } catch (e) {
    log(false, 'Shift history', e.message);
  }

  // =========================================================================
  console.log('\n=== 5. TRANSACTIONS (POS) ===');
  // =========================================================================
  try {
    const txns = await request('GET', '/api/transactions?limit=5');
    const list = txns.data?.data?.transactions || txns.data?.data || [];
    log(txns.status === 200, 'Transaction list', `${Array.isArray(list) ? list.length : '?'} transactions`);
  } catch (e) {
    log(false, 'Transaction list', e.message);
  }

  try {
    const daily = await request('GET', '/api/transactions/daily-summary');
    log(daily.status === 200, 'Daily summary', 'OK');
  } catch (e) {
    log(false, 'Daily summary', e.message);
  }

  // =========================================================================
  console.log('\n=== 6. QUOTATIONS (POS integration) ===');
  // =========================================================================
  try {
    const quotes = await request('GET', '/api/quotations?limit=3');
    log(quotes.status === 200, 'Quotation list', 'OK');
  } catch (e) {
    log(false, 'Quotation list', e.message);
  }

  try {
    const posQuotes = await request('GET', '/api/pos-quotes?limit=3');
    log(posQuotes.status === 200 || posQuotes.status === 404, 'POS quotes endpoint', `Status: ${posQuotes.status}`);
  } catch (e) {
    log(false, 'POS quotes', e.message);
  }

  // =========================================================================
  console.log('\n=== 7. PAYMENTS ===');
  // =========================================================================
  try {
    const payments = await request('GET', '/api/pos-payments/methods');
    log(payments.status === 200 || payments.status === 404, 'Payment methods', `Status: ${payments.status}`);
  } catch (e) {
    log(false, 'Payment methods', e.message);
  }

  // =========================================================================
  console.log('\n=== 8. RECEIPTS ===');
  // =========================================================================
  try {
    const receipt = await request('GET', '/api/receipts/config');
    log(receipt.status === 200 || receipt.status === 404, 'Receipt config', `Status: ${receipt.status}`);
  } catch (e) {
    log(false, 'Receipt config', e.message);
  }

  // =========================================================================
  console.log('\n=== 9. TAX ===');
  // =========================================================================
  try {
    const tax = await request('GET', '/api/tax/rates');
    log(tax.status === 200, 'Tax rates', 'OK');
  } catch (e) {
    log(false, 'Tax rates', e.message);
  }

  // =========================================================================
  console.log('\n=== 10. FINANCING ===');
  // =========================================================================
  try {
    const plans = await request('GET', '/api/financing/plans?amount=100000');
    log(plans.status === 200, 'Financing plans', 'OK');
  } catch (e) {
    log(false, 'Financing plans', e.message);
  }

  // =========================================================================
  console.log('\n=== 11. RETURNS & STORE CREDITS ===');
  // =========================================================================
  try {
    const returns = await request('GET', '/api/returns?limit=3');
    log(returns.status === 200 || returns.status === 404, 'Returns list', `Status: ${returns.status}`);
  } catch (e) {
    log(false, 'Returns list', e.message);
  }

  try {
    const credits = await request('GET', '/api/store-credits?limit=3');
    log(credits.status === 200 || credits.status === 404, 'Store credits', `Status: ${credits.status}`);
  } catch (e) {
    log(false, 'Store credits', e.message);
  }

  // =========================================================================
  console.log('\n=== 12. SALES REPS ===');
  // =========================================================================
  try {
    const reps = await request('GET', '/api/pos/sales-reps');
    log(reps.status === 200 || reps.status === 404, 'Sales reps', `Status: ${reps.status}`);
  } catch (e) {
    log(false, 'Sales reps', e.message);
  }

  // =========================================================================
  console.log('\n=== 13. PROMOTIONS ===');
  // =========================================================================
  try {
    const promos = await request('GET', '/api/pos-promotions/active');
    log(promos.status === 200 || promos.status === 404, 'Active promotions', `Status: ${promos.status}`);
  } catch (e) {
    log(false, 'Active promotions', e.message);
  }

  // =========================================================================
  console.log('\n=== 14. COMMISSIONS ===');
  // =========================================================================
  try {
    const comm = await request('GET', '/api/commissions/my');
    log(comm.status === 200 || comm.status === 404, 'My commissions', `Status: ${comm.status}`);
  } catch (e) {
    log(false, 'My commissions', e.message);
  }

  // =========================================================================
  console.log('\n=== 15. REPORTS ===');
  // =========================================================================
  try {
    const shift = await request('GET', '/api/reports/shift/current');
    log(shift.status === 200 || shift.status === 404, 'Current shift report', `Status: ${shift.status}`);
  } catch (e) {
    log(false, 'Current shift report', e.message);
  }

  // =========================================================================
  console.log('\n=== 16. DRAFTS (Offline Sync) ===');
  // =========================================================================
  try {
    const drafts = await request('GET', '/api/drafts');
    log(drafts.status === 200, 'Drafts list', 'OK');
  } catch (e) {
    log(false, 'Drafts list', e.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  POS API TEST RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log(`${'='.repeat(55)}`);

  if (results.errors.length > 0) {
    console.log('\n  Failed endpoints:');
    results.errors.forEach(e => console.log(`    - ${e.name}: ${e.detail}`));
  }

  console.log('');
  return results;
}

runTests().catch(e => console.error('Fatal:', e));
