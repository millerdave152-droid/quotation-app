/**
 * End-to-End Test: Quote Creation → POS Lookup → Checkout
 *
 * This script:
 * 1. Logs in to get an auth token
 * 2. Finds/creates a test customer
 * 3. Gets a product to quote
 * 4. Creates a quote in the Quotation App
 * 5. Looks up the quote in the POS
 * 6. Loads the quote for sale
 * 7. Outputs all details needed for manual POS checkout testing
 */

require('dotenv').config();
const http = require('http');

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      { hostname: 'localhost', port: 3001, path, method, headers },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try { resolve(JSON.parse(b)); }
          catch (e) { resolve({ raw: b, statusCode: res.statusCode }); }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('\n========================================');
  console.log('  QUOTE-TO-POS END-TO-END TEST');
  console.log('========================================\n');

  // Step 1: Login
  console.log('--- STEP 1: LOGIN ---');
  const login = await apiCall('POST', '/api/auth/login', {
    email: 'admin@yourcompany.com',
    password: 'TestPass123!',
  });

  if (!login.success) {
    console.error('Login FAILED:', login.message || JSON.stringify(login));
    return;
  }

  const token = login.data?.accessToken || login.accessToken || login.token;
  const user = login.data?.user || login.user;
  console.log('Login: SUCCESS');
  console.log('User:', user?.email, '| Role:', user?.role);
  console.log('Token:', token?.substring(0, 40) + '...');
  console.log('');

  // Step 2: Find or list customers
  console.log('--- STEP 2: FIND CUSTOMER ---');
  const customers = await apiCall('GET', '/api/customers?search=test&limit=5', null, token);
  let customerId;
  let customerName;

  if (customers.customers && customers.customers.length > 0) {
    const cust = customers.customers[0];
    customerId = cust.id || cust.customer_id;
    customerName = cust.name || cust.customer_name;
    console.log('Found customer:', customerName, '| ID:', customerId);
  } else if (customers.data && customers.data.length > 0) {
    const cust = customers.data[0];
    customerId = cust.id || cust.customer_id;
    customerName = cust.name || cust.customer_name;
    console.log('Found customer:', customerName, '| ID:', customerId);
  } else {
    // Create a test customer
    console.log('No customers found, creating test customer...');
    const newCust = await apiCall('POST', '/api/customers', {
      name: 'Test Customer - POS Flow',
      email: 'testcustomer@example.com',
      phone: '416-555-9999',
      company: 'Test Corp',
    }, token);

    if (newCust.success || newCust.data) {
      const cust = newCust.data || newCust;
      customerId = cust.id || cust.customer_id;
      customerName = cust.name || cust.customer_name || 'Test Customer - POS Flow';
      console.log('Created customer:', customerName, '| ID:', customerId);
    } else {
      console.error('Failed to create customer:', JSON.stringify(newCust));
      return;
    }
  }
  console.log('');

  // Step 3: Find a product (use direct DB query via API)
  console.log('--- STEP 3: FIND PRODUCT ---');
  const products = await apiCall('GET', '/api/v1/products?limit=5', null, token);
  let productList = products.data || products.products || [];

  // Fallback to other endpoints
  if (productList.length === 0) {
    const p2 = await apiCall('GET', '/api/products?limit=5', null, token);
    productList = p2.data || p2.products || [];
  }

  let productId, productName, productPrice;

  if (productList.length > 0) {
    // Find one with a price
    const product = productList.find(p => p.price || p.unit_price || p.base_price) || productList[0];
    productId = product.id || product.product_id;
    productName = product.name || product.product_name;
    productPrice = parseFloat(product.price || product.unit_price || product.base_price) || 549;
  } else {
    // Use known product from DB
    console.log('API returned no products, using known product ID 12633');
    productId = 12633;
    productName = 'Frigidaire Microwave FMOS1846BS';
    productPrice = 549.00;
  }

  console.log('Product:', productName);
  console.log('Product ID:', productId, '| Price: $' + productPrice);
  console.log('');

  // Step 4: Create a quote via v1 API
  console.log('--- STEP 4: CREATE QUOTE ---');
  const quotePayload = {
    customerId: customerId,
    taxProvince: 'ON',
    notes: 'TEST QUOTE - End-to-end POS flow test',
    internalNotes: 'Created by automated test script',
    items: [
      {
        productId: productId,
        quantity: 2,
        unitPriceCents: Math.round(productPrice * 100),
        discountPercent: 0,
      },
    ],
  };

  let quote = await apiCall('POST', '/api/v1/quotes', quotePayload, token);
  console.log('v1 API response:', quote.success ? 'SUCCESS' : JSON.stringify(quote).substring(0, 300));

  if (!quote.success && !quote.data) {
    console.log('Trying legacy /api/quotations...');
    const legacyPayload = {
      customer_id: customerId,
      notes: 'TEST QUOTE - End-to-end POS flow test',
      internal_notes: 'Created by automated test script',
      tax_rate: 13,
      discount_percent: 0,
      status: 'pending',
      items: [
        {
          product_id: productId,
          product_name: productName,
          quantity: 2,
          unit_price: productPrice,
          discount_percent: 0,
        },
      ],
    };
    quote = await apiCall('POST', '/api/quotations', legacyPayload, token);
    console.log('Legacy response:', quote.success ? 'SUCCESS' : JSON.stringify(quote).substring(0, 300));
  }

  if (!quote.success && !quote.data) {
    console.log('Trying /api/quotes...');
    quote = await apiCall('POST', '/api/quotes', {
      customer_id: customerId,
      notes: 'TEST QUOTE - End-to-end POS flow test',
      tax_rate: 13,
      items: [{ product_id: productId, product_name: productName, quantity: 2, unit_price: productPrice }],
    }, token);
    console.log('Quotes response:', quote.success ? 'SUCCESS' : JSON.stringify(quote).substring(0, 300));
  }

  const quoteData = quote.data || quote;
  const quoteId = quoteData.id || quoteData.quoteId || quoteData.quote_id;
  const quoteNumber = quoteData.quotation_number || quoteData.quotationNumber || quoteData.quoteNumber || quoteData.number;

  if (!quoteId) {
    console.error('Failed to create quote:', JSON.stringify(quote).substring(0, 500));
    return;
  }

  console.log('Quote Created: SUCCESS');
  console.log('Quote ID:', quoteId);
  console.log('Quote Number:', quoteNumber);
  console.log('Status:', quoteData.status);
  console.log('Total:', quoteData.total_amount || quoteData.totalAmount || quoteData.totalCents);
  console.log('');

  // Step 5: POS Quote Lookup
  console.log('--- STEP 5: POS QUOTE LOOKUP ---');
  const searchTerm = quoteNumber || customerName;
  const lookup = await apiCall('GET', `/api/pos-quotes/lookup?query=${encodeURIComponent(searchTerm)}`, null, token);
  const lookupResults = lookup.data || [];

  console.log('Search term:', searchTerm);
  console.log('Results found:', lookupResults.length);

  if (lookupResults.length > 0) {
    const found = lookupResults[0];
    console.log('Found quote:', found.quoteNumber || found.quotation_number, '| Status:', found.status);
    console.log('Customer:', found.customerName || found.customer_name);
    console.log('Total:', found.totalAmount || found.total_amount);
  }
  console.log('');

  // Step 6: Load quote for sale
  console.log('--- STEP 6: LOAD QUOTE FOR SALE ---');
  const forSale = await apiCall('GET', `/api/pos-quotes/${quoteId}/for-sale`, null, token);

  if (forSale.success || forSale.data) {
    const saleData = forSale.data || forSale;
    console.log('Quote loaded for sale: SUCCESS');
    console.log('Items:', JSON.stringify(saleData.items?.length || 0));
    console.log('Stock warnings:', saleData.stockWarning ? 'YES' : 'None');
  } else {
    console.log('For-sale load result:', JSON.stringify(forSale).substring(0, 300));
  }
  console.log('');

  // Summary
  console.log('========================================');
  console.log('  TEST SCENARIO READY');
  console.log('========================================');
  console.log('');
  console.log('QUOTATION APP (http://localhost:3000):');
  console.log('  Login: admin@yourcompany.com / TestPass123!');
  console.log('  Quote created: ' + (quoteNumber || 'ID: ' + quoteId));
  console.log('');
  console.log('POS APP (http://localhost:5173):');
  console.log('  Login: admin@yourcompany.com / TestPass123!');
  console.log('  Press F5 or click "Quote" to open Quote Lookup');
  console.log('  Search for: "' + searchTerm + '"');
  console.log('  Or search by customer: "' + customerName + '"');
  console.log('  Select the quote → Load into cart → Proceed to Checkout');
  console.log('');
  console.log('QUOTE DETAILS:');
  console.log('  Quote ID: ' + quoteId);
  console.log('  Quote #: ' + quoteNumber);
  console.log('  Customer: ' + customerName + ' (ID: ' + customerId + ')');
  console.log('  Product: ' + productName + ' x2');
  console.log('  Price: $' + (parseFloat(productPrice) || 100) + ' each');
  console.log('========================================\n');
}

run().catch(console.error);
