/**
 * HP-08 Returns End-to-End Test
 * 1. Login
 * 2. Search transactions (GET /api/returns)
 * 3. Create a return from the first transaction (POST /api/returns)
 * 4. Get reason codes (GET /api/returns/reason-codes)
 * 5. Get return items (GET /api/returns/:id/items)
 * 6. Add return items with reason codes (POST /api/returns/:id/items)
 * 7. Get payment info (GET /api/returns/:id/payment-info)
 * 8. Process refund (POST /api/returns/:id/process-refund)
 */

const http = require('http');

const BASE = 'http://localhost:3001';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const errors = [];
  let token;

  // Step 1: Login
  console.log('=== STEP 1: LOGIN ===');
  const login = await request('POST', '/api/auth/login', {
    email: 'admin@yourcompany.com',
    password: 'TestPass123!',
  });
  token = login.body.token || login.body.data?.accessToken;
  if (!token) {
    console.error('LOGIN FAILED', login.body);
    process.exit(1);
  }
  console.log('Login OK');

  // Step 2: Search transactions
  console.log('\n=== STEP 2: SEARCH TRANSACTIONS ===');
  const search = await request('GET', '/api/returns?limit=5', null, token);
  console.log(`Status: ${search.status}, Success: ${search.body.success}`);
  console.log(`Transactions found: ${search.body.data?.length || 0} (total: ${search.body.pagination?.total})`);

  if (!search.body.data || search.body.data.length === 0) {
    console.error('ERROR: No completed transactions found to test returns');
    errors.push('No transactions available');
    report(errors);
    return;
  }

  const tx = search.body.data[0];
  console.log(`Using transaction: ${tx.transaction_number} (ID: ${tx.transaction_id}), Amount: $${tx.total_amount}, Items: ${tx.item_count}`);
  console.log(`Customer: ${tx.customer_name || 'Walk-in'}`);

  // Step 3: Create return
  console.log('\n=== STEP 3: CREATE RETURN ===');
  const createReturn = await request('POST', '/api/returns', {
    originalTransactionId: tx.transaction_id,
    returnType: 'full',
    notes: 'HP-08 E2E test return',
  }, token);
  console.log(`Status: ${createReturn.status}, Success: ${createReturn.body.success}`);

  if (!createReturn.body.success) {
    console.error('CREATE RETURN FAILED:', createReturn.body.error);
    errors.push(`Create return failed: ${createReturn.body.error}`);
    report(errors);
    return;
  }

  const returnId = createReturn.body.data.id;
  const returnNumber = createReturn.body.data.return_number;
  console.log(`Return created: ${returnNumber} (ID: ${returnId})`);

  // Step 4: Get reason codes
  console.log('\n=== STEP 4: GET REASON CODES ===');
  const reasonCodes = await request('GET', '/api/returns/reason-codes', null, token);
  console.log(`Status: ${reasonCodes.status}, Success: ${reasonCodes.body.success}`);
  console.log(`Reason codes: ${reasonCodes.body.data?.length || 0}`);

  if (!reasonCodes.body.data || reasonCodes.body.data.length === 0) {
    console.error('ERROR: No reason codes found');
    errors.push('No reason codes available');
    report(errors);
    return;
  }
  const firstReasonCode = reasonCodes.body.data[0];
  console.log(`Using reason: ${firstReasonCode.code} - ${firstReasonCode.description}`);

  // Step 5: Get return items (original transaction items)
  console.log('\n=== STEP 5: GET RETURN ITEMS ===');
  const returnItems = await request('GET', `/api/returns/${returnId}/items`, null, token);
  console.log(`Status: ${returnItems.status}, Success: ${returnItems.body.success}`);

  if (!returnItems.body.success) {
    console.error('GET ITEMS FAILED:', returnItems.body.error);
    errors.push(`Get items failed: ${returnItems.body.error}`);
    report(errors);
    return;
  }

  const txItems = returnItems.body.data.transactionItems;
  console.log(`Transaction items: ${txItems.length}`);
  txItems.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.product_name} (ID: ${item.item_id}) qty: ${item.quantity} @ $${item.unit_price}`);
  });

  if (txItems.length === 0) {
    console.error('ERROR: No transaction items to return');
    errors.push('No transaction items');
    report(errors);
    return;
  }

  // Step 6: Add return items
  console.log('\n=== STEP 6: ADD RETURN ITEMS ===');
  const itemsToReturn = txItems.map((item) => ({
    transactionItemId: item.item_id,
    quantity: item.quantity,
    reasonCodeId: firstReasonCode.id,
    reasonNotes: 'E2E test',
    condition: 'resellable',
  }));

  const addItems = await request('POST', `/api/returns/${returnId}/items`, { items: itemsToReturn }, token);
  console.log(`Status: ${addItems.status}, Success: ${addItems.body.success}`);

  if (!addItems.body.success) {
    console.error('ADD ITEMS FAILED:', addItems.body.error);
    errors.push(`Add items failed: ${addItems.body.error}`);
    report(errors);
    return;
  }
  console.log(`Added ${addItems.body.data.length} items to return`);

  // Step 7: Get payment info
  console.log('\n=== STEP 7: GET PAYMENT INFO ===');
  const paymentInfo = await request('GET', `/api/returns/${returnId}/payment-info`, null, token);
  console.log(`Status: ${paymentInfo.status}, Success: ${paymentInfo.body.success}`);

  if (!paymentInfo.body.success) {
    console.error('GET PAYMENT INFO FAILED:', paymentInfo.body.error);
    errors.push(`Get payment info failed: ${paymentInfo.body.error}`);
    report(errors);
    return;
  }

  const refund = paymentInfo.body.data.refundBreakdown;
  console.log(`Refund breakdown:`);
  console.log(`  Subtotal: $${(refund.subtotalCents / 100).toFixed(2)}`);
  console.log(`  Tax:      $${(refund.taxCents / 100).toFixed(2)}`);
  console.log(`  Total:    $${(refund.totalCents / 100).toFixed(2)}`);
  console.log(`Original payments: ${paymentInfo.body.data.originalPayments.length}`);
  paymentInfo.body.data.originalPayments.forEach((p) => {
    console.log(`  ${p.payment_method}: $${p.amount}`);
  });

  // Step 8: Process refund (as store credit to avoid Stripe)
  console.log('\n=== STEP 8: PROCESS REFUND ===');
  const processRefund = await request('POST', `/api/returns/${returnId}/process-refund`, {
    refundMethod: 'store_credit',
    restockingFeeCents: 0,
  }, token);
  console.log(`Status: ${processRefund.status}, Success: ${processRefund.body.success}`);

  if (!processRefund.body.success) {
    console.error('PROCESS REFUND FAILED:', processRefund.body.error);
    errors.push(`Process refund failed: ${processRefund.body.error}`);
    report(errors);
    return;
  }

  const result = processRefund.body.data;
  console.log(`Refund completed!`);
  console.log(`  Return ID:    ${result.returnId}`);
  console.log(`  Status:       ${result.status}`);
  console.log(`  Method:       ${result.refundMethod}`);
  console.log(`  Refund total: $${(result.refundTotalCents / 100).toFixed(2)}`);
  if (result.storeCredit) {
    console.log(`  Store credit: ${result.storeCredit.code} ($${(result.storeCredit.amountCents / 100).toFixed(2)})`);
  }

  report(errors);
}

function report(errors) {
  console.log('\n' + '='.repeat(60));
  console.log('HP-08 RETURNS E2E TEST REPORT');
  console.log('='.repeat(60));
  if (errors.length === 0) {
    console.log('STATUS: ALL STEPS PASSED');
    console.log('Refund completed successfully via store credit');
  } else {
    console.log(`STATUS: FAILED (${errors.length} error(s))`);
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
  console.log('='.repeat(60));
}

run().catch((err) => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});
