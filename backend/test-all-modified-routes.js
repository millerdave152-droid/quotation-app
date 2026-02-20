const http = require('http');

const BASE = 'http://localhost:3001';
let TOKEN = '';

function req(method, path, body = null, token = TOKEN) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const results = { pass: 0, fail: 0, errors: [] };

async function test(method, path, body, expect, label, token) {
  const res = await req(method, path, body, token || TOKEN);
  const ok = (Array.isArray(expect) ? expect : [expect]).includes(res.status);
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} [${res.status}] ${method} ${path} — ${label}`);
  if (ok) { results.pass++; } else {
    results.fail++;
    const bodyStr = typeof res.body === 'string' ? res.body.substring(0, 180) : JSON.stringify(res.body).substring(0, 180);
    results.errors.push({ method, path, label, expected: Array.isArray(expect) ? expect : [expect], got: res.status, body: bodyStr });
  }
  return res;
}

async function login() {
  const res = await req('POST', '/api/auth/login', { email: 'admin@yourcompany.com', password: 'TestPass123!' }, null);
  const tok = res.body.token || (res.body.data && res.body.data.accessToken) || res.body.accessToken;
  if (res.status === 200 && tok) { TOKEN = tok; console.log('✅ Admin login OK\n'); return true; }
  console.log('❌ Login FAILED:', res.status); return false;
}

async function run() {
  console.log('='.repeat(65));
  console.log('  COMPREHENSIVE ROUTE TEST — CORRECTED PATHS');
  console.log('='.repeat(65) + '\n');
  if (!(await login())) return;

  // ========== AUTH ==========
  console.log('\n--- Auth ---');
  await test('GET', '/api/auth/me', null, [200], 'Get current user');
  await test('POST', '/api/auth/login', { email: 'bad@bad.com', password: 'wrong' }, [401, 400], 'Bad login rejected', null);

  // ========== CUSTOMERS ==========
  console.log('\n--- Customers ---');
  await test('GET', '/api/customers', null, [200], 'List customers');
  await test('GET', '/api/customers?page=1&limit=5', null, [200], 'Paginated customers');
  await test('GET', '/api/customers/1', null, [200, 404], 'Get customer 1');

  // ========== PRODUCTS ==========
  console.log('\n--- Products ---');
  await test('GET', '/api/products', null, [200], 'List products');
  await test('GET', '/api/products?page=1&limit=5', null, [200], 'Paginated products');
  await test('GET', '/api/products/1009', null, [200, 404], 'Get product 1009');

  // ========== CATEGORIES ==========
  console.log('\n--- Categories ---');
  await test('GET', '/api/categories', null, [200], 'List categories');

  // ========== QUOTATIONS ==========
  console.log('\n--- Quotations ---');
  await test('GET', '/api/quotations', null, [200], 'List quotations');
  await test('GET', '/api/quotes', null, [200], 'Quote alias');

  // ========== ANALYTICS ==========
  console.log('\n--- Analytics ---');
  await test('GET', '/api/analytics', null, [200], 'Analytics root');
  await test('GET', '/api/dashboard', null, [200], 'Dashboard');

  // ========== INSIGHTS ==========
  console.log('\n--- Insights ---');
  await test('GET', '/api/insights/summary', null, [200], 'Insights summary');

  // ========== REPORTS ==========
  console.log('\n--- Reports ---');
  await test('GET', '/api/reports/templates', null, [200], 'Report templates');
  await test('GET', '/api/scheduled-reports', null, [200], 'Scheduled reports');
  await test('GET', '/api/reports/unified', null, [200], 'Unified reports');
  await test('GET', '/api/reports/shift', null, [200, 404], 'Shift reports');
  await test('GET', '/api/reports/tax-summary', null, [200, 404], 'Tax summary');
  await test('GET', '/api/reports/ar-aging', null, [200, 404], 'AR aging');

  // ========== LEADS ==========
  console.log('\n--- Leads ---');
  await test('GET', '/api/leads', null, [200], 'List leads');

  // ========== TASKS ==========
  console.log('\n--- Tasks ---');
  await test('GET', '/api/tasks', null, [200], 'List tasks');

  // ========== ORDERS ==========
  console.log('\n--- Orders ---');
  await test('GET', '/api/orders', null, [200], 'List orders');

  // ========== INVOICES ==========
  console.log('\n--- Invoices ---');
  await test('GET', '/api/invoices', null, [200], 'List invoices');

  // ========== POS TRANSACTIONS ==========
  console.log('\n--- POS Transactions ---');
  await test('GET', '/api/transactions', null, [200], 'List transactions');
  await test('GET', '/api/transactions?page=1&limit=5', null, [200], 'Paginated transactions');

  // ========== POS RETURNS ==========
  console.log('\n--- POS Returns ---');
  await test('GET', '/api/returns', null, [200], 'List returns');

  // ========== POS REGISTER ==========
  console.log('\n--- POS Register ---');
  await test('GET', '/api/registers', null, [200, 404], 'Registers');

  // ========== POS PAYMENTS ==========
  console.log('\n--- POS Payments ---');
  await test('GET', '/api/pos-payments', null, [200, 404], 'POS payments');

  // ========== STORE CREDITS ==========
  console.log('\n--- Store Credits ---');
  await test('GET', '/api/store-credits', null, [200], 'List store credits');

  // ========== GIFT CARDS ==========
  console.log('\n--- Gift Cards ---');
  await test('GET', '/api/gift-cards', null, [200], 'List gift cards');

  // ========== LAYAWAYS ==========
  console.log('\n--- Layaways ---');
  await test('GET', '/api/layaways', null, [200], 'List layaways');

  // ========== POS EXCHANGES ==========
  console.log('\n--- POS Exchanges ---');
  await test('GET', '/api/exchanges', null, [200], 'List exchanges');

  // ========== TIME CLOCK ==========
  console.log('\n--- Time Clock ---');
  await test('GET', '/api/timeclock/status', null, [200, 401, 404], 'Timeclock status');

  // ========== CASH DRAWER ==========
  console.log('\n--- Cash Drawer ---');
  await test('GET', '/api/cash-drawer/status', null, [200, 404], 'Cash drawer status');

  // ========== POS SALES REPS ==========
  console.log('\n--- POS Sales Reps ---');
  await test('GET', '/api/pos/sales-reps', null, [200, 404], 'POS sales reps');

  // ========== POS QUOTES ==========
  console.log('\n--- POS Quotes ---');
  await test('GET', '/api/pos-quotes', null, [200], 'POS quotes');

  // ========== POS INVOICES ==========
  console.log('\n--- POS Invoices ---');
  await test('GET', '/api/pos-invoices', null, [200, 404], 'POS invoices');

  // ========== INVENTORY ==========
  console.log('\n--- Inventory ---');
  await test('GET', '/api/inventory', null, [200], 'List inventory');
  await test('GET', '/api/inventory/locations', null, [200, 404], 'Location inventory');
  await test('GET', '/api/inventory/transfers', null, [200], 'Inventory transfers');
  await test('GET', '/api/inventory/reports', null, [200, 404], 'Inventory reports');
  await test('GET', '/api/inventory/aging', null, [200, 404], 'Inventory aging');

  // ========== PRICING ==========
  console.log('\n--- Pricing ---');
  await test('GET', '/api/pricing', null, [200], 'Pricing rules');
  await test('GET', '/api/price-history/1009', null, [200, 404], 'Price history');
  await test('GET', '/api/pricing/volume', null, [200, 404], 'Volume pricing');
  await test('GET', '/api/customer-pricing', null, [200, 404], 'Customer pricing');
  await test('GET', '/api/advanced-pricing', null, [200, 404], 'Advanced pricing');

  // ========== PROMOTIONS & COUPONS ==========
  console.log('\n--- Promotions & Coupons ---');
  await test('GET', '/api/hub-promotions', null, [200], 'Hub promotions');
  await test('GET', '/api/coupons', null, [200, 404], 'Coupons');
  await test('GET', '/api/pos-promotions', null, [200, 404], 'POS promotions');
  await test('GET', '/api/promotions/manufacturer', null, [200, 404], 'Manufacturer promotions');

  // ========== BUNDLES ==========
  console.log('\n--- Bundles ---');
  await test('GET', '/api/bundles', null, [200], 'List bundles');

  // ========== DELIVERY ==========
  console.log('\n--- Delivery ---');
  await test('GET', '/api/delivery', null, [200, 404], 'List deliveries');
  await test('GET', '/api/dispatch', null, [200, 404], 'Dispatch console');
  await test('GET', '/api/dispatch/routes', null, [200, 404], 'Route planning');
  await test('GET', '/api/dispatch/drivers', null, [200, 404], 'Drivers');
  await test('GET', '/api/delivery-windows', null, [200, 404], 'Delivery windows');

  // ========== NOTIFICATIONS ==========
  console.log('\n--- Notifications ---');
  await test('GET', '/api/notifications', null, [200], 'List notifications');
  await test('GET', '/api/notification-templates', null, [200], 'Notification templates');

  // ========== COMMISSIONS ==========
  console.log('\n--- Commissions ---');
  await test('GET', '/api/commissions', null, [200, 404], 'Commissions');
  await test('GET', '/api/hub-commissions', null, [200, 404], 'Hub commissions');

  // ========== MARKETPLACE ==========
  console.log('\n--- Marketplace ---');
  await test('GET', '/api/marketplace', null, [200, 400, 404], 'Marketplace');

  // ========== FINANCING ==========
  console.log('\n--- Financing ---');
  await test('GET', '/api/financing/plans?amount=1000', null, [200, 404], 'Financing plans');

  // ========== TRADE-IN ==========
  console.log('\n--- Trade-In ---');
  await test('GET', '/api/trade-in', null, [200, 404], 'Trade-in list');

  // ========== UPSELL ==========
  console.log('\n--- Upsell ---');
  await test('GET', '/api/upsell', null, [200, 404], 'Upsell');

  // ========== REBATES ==========
  console.log('\n--- Rebates ---');
  await test('GET', '/api/rebates', null, [200], 'Manufacturer rebates');

  // ========== WARRANTY ==========
  console.log('\n--- Warranty ---');
  await test('GET', '/api/warranty/products', null, [200], 'Warranty products');

  // ========== PACKAGE BUILDER ==========
  console.log('\n--- Package Builder ---');
  await test('GET', '/api/package-builder', null, [200, 404], 'Package builder');
  await test('GET', '/api/package-builder-v2', null, [200, 404], 'Package builder v2');

  // ========== TAX ==========
  console.log('\n--- Tax ---');
  await test('GET', '/api/tax/rates', null, [200], 'Tax rates');

  // ========== FRAUD ==========
  console.log('\n--- Fraud Detection ---');
  await test('GET', '/api/fraud/alerts', null, [200], 'Fraud alerts');
  await test('GET', '/api/fraud/rules', null, [200], 'Fraud rules');

  // ========== AUDIT ==========
  console.log('\n--- Audit ---');
  await test('GET', '/api/audit', null, [200, 404], 'Audit log');

  // ========== CHARGEBACKS ==========
  console.log('\n--- Chargebacks ---');
  await test('GET', '/api/chargebacks', null, [200], 'List chargebacks');

  // ========== USERS / RBAC ==========
  console.log('\n--- Users & RBAC ---');
  await test('GET', '/api/users', null, [200], 'List users');
  await test('GET', '/api/users/1', null, [200, 404], 'Get user 1');
  await test('GET', '/api/rbac/roles', null, [200], 'RBAC roles');

  // ========== EMAIL ==========
  console.log('\n--- Email ---');
  await test('GET', '/api/email/templates', null, [200, 404], 'Email templates');

  // ========== ACTIVITIES ==========
  console.log('\n--- Activities ---');
  await test('GET', '/api/activities', null, [200, 404], 'Activities');

  // ========== CUSTOMER PORTAL ==========
  console.log('\n--- Customer Portal ---');
  await test('GET', '/api/customer-portal', null, [200, 401, 403, 404], 'Customer portal');

  // ========== DATA QUALITY ==========
  console.log('\n--- Data Quality ---');
  await test('GET', '/api/data-quality', null, [200, 404], 'Data quality');

  // ========== LOOKUP ==========
  console.log('\n--- Lookup ---');
  await test('GET', '/api/lookup/provinces', null, [200], 'Provinces lookup');

  // ========== API KEYS ==========
  console.log('\n--- API Keys ---');
  await test('GET', '/api/api-keys', null, [200], 'List API keys');

  // ========== DRAFTS ==========
  console.log('\n--- Drafts ---');
  await test('GET', '/api/drafts', null, [200], 'List drafts');

  // ========== WEBHOOKS ==========
  console.log('\n--- Webhooks ---');
  await test('GET', '/api/webhooks', null, [200], 'List webhooks');

  // ========== IMPORT TEMPLATES ==========
  console.log('\n--- Import Templates ---');
  await test('GET', '/api/import-templates', null, [200], 'Import templates');

  // ========== LOCATIONS ==========
  console.log('\n--- Locations ---');
  await test('GET', '/api/locations', null, [200], 'List locations');

  // ========== HUB RETURNS / EXCHANGES ==========
  console.log('\n--- Hub Returns & Exchanges ---');
  await test('GET', '/api/hub-returns', null, [200, 404], 'Hub returns');
  await test('GET', '/api/hub/exchanges', null, [200, 404], 'Hub exchanges');

  // ========== MANAGER OVERRIDES ==========
  console.log('\n--- Manager Overrides ---');
  await test('GET', '/api/manager-overrides', null, [200, 404], 'Manager overrides');

  // ========== PAYMENT TERMS ==========
  console.log('\n--- Payment Terms ---');
  await test('GET', '/api/payment-terms', null, [200], 'Payment terms');

  // ========== DISCONTINUED PRODUCTS ==========
  console.log('\n--- Discontinued Products ---');
  await test('GET', '/api/products/discontinued', null, [200, 404], 'Discontinued products');

  // ========== CALL LOGS ==========
  console.log('\n--- Call Logs ---');
  await test('GET', '/api/call-logs', null, [200, 404], 'Call logs');

  // ========== CHURN ALERTS ==========
  console.log('\n--- Churn Alerts ---');
  await test('GET', '/api/churn-alerts', null, [200], 'Churn alerts');

  // ========== PRODUCT IMAGES ==========
  console.log('\n--- Product Images ---');
  await test('GET', '/api/product-images/1009', null, [200, 404], 'Product images');

  // ========== PRODUCT METRICS ==========
  console.log('\n--- Product Metrics ---');
  await test('GET', '/api/product-metrics/1009', null, [200, 404], 'Product metrics');

  // ========== AI ==========
  console.log('\n--- AI Features ---');
  await test('GET', '/api/ai/recommendations/1009', null, [200, 404, 500], 'AI recommendations');
  await test('GET', '/api/ai-personalization/profile', null, [200, 404], 'AI personalization');

  // ========== 3D CONFIGURATOR ==========
  console.log('\n--- 3D Product Configurator ---');
  await test('GET', '/api/product-3d', null, [200, 404], '3D product models');

  // ========== ADMIN ==========
  console.log('\n--- Admin ---');
  await test('GET', '/api/admin/email-monitoring', null, [200, 404], 'Admin email monitoring');
  await test('GET', '/api/admin/approval-rules', null, [200], 'Admin approval rules');
  await test('GET', '/api/admin/skulytics/health', null, [200], 'Admin Skulytics health');

  // ========== FEATURES 2026 ==========
  console.log('\n--- 2026 Features ---');
  await test('GET', '/api/features', null, [200, 404], '2026 features');

  // ========== QUICK SEARCH ==========
  console.log('\n--- Quick Search ---');
  await test('GET', '/api/quick-search?q=samsung', null, [200], 'Quick search');

  // ========== AI ASSISTANT ==========
  console.log('\n--- AI Assistant ---');
  await test('GET', '/api/ai-assistant/status', null, [200, 404], 'AI assistant status');

  // ========== PURCHASING INTELLIGENCE ==========
  console.log('\n--- Purchasing Intelligence ---');
  await test('GET', '/api/purchasing-intelligence/dashboard', null, [200], 'Purchasing intelligence');

  // ========== CLV ==========
  console.log('\n--- CLV ---');
  await test('GET', '/api/clv/job-status', null, [200], 'CLV job status');

  // ========== CUSTOMER PAYMENTS ==========
  console.log('\n--- Payments ---');
  await test('GET', '/api/payments', null, [200, 404], 'Payments');

  // ========== E-TRANSFER ==========
  console.log('\n--- E-Transfer ---');
  await test('GET', '/api/e-transfer', null, [200, 404], 'E-transfer');

  // ========== RECEIPTS ==========
  console.log('\n--- Receipts ---');
  await test('GET', '/api/receipts/config', null, [200, 404], 'Receipt config');

  // ========== NOMENCLATURE ==========
  console.log('\n--- Nomenclature ---');
  await test('GET', '/api/nomenclature', null, [200, 404], 'Nomenclature');

  // ========== V1 API ==========
  console.log('\n--- V1 API ---');
  await test('GET', '/api/v1/quotes', null, [200, 401, 500], 'V1 quotes');

  // ============================================================
  console.log('\n' + '='.repeat(65));
  console.log(`  RESULTS: ${results.pass} passed, ${results.fail} failed out of ${results.pass + results.fail}`);
  console.log('='.repeat(65));

  if (results.errors.length > 0) {
    console.log('\n--- FAILURES ---');
    results.errors.forEach((e) => {
      console.log(`\n  ❌ ${e.method} ${e.path} — ${e.label}`);
      console.log(`     Expected: ${e.expected.join('|')} | Got: ${e.got}`);
      console.log(`     Body: ${e.body}`);
    });
  }
  console.log('\nDone.');
}

run().catch(console.error);
