const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api' + path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (global.token) {
      options.headers.Authorization = 'Bearer ' + global.token;
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login as manager
  const login = await request('POST', '/auth/login', {
    email: 'manager@test.com',
    password: 'TestPass123!'
  });
  if (!login.body.success) {
    console.error('Login failed:', login.body.message);
    process.exit(1);
  }
  global.token = login.body.data.accessToken;
  console.log('Logged in as manager\n');

  const rules = [
    {
      name: 'Standard Discount Limit (15%)',
      thresholdType: 'discount_percent',
      description: 'Requires approval when any discount exceeds 15% of item or order value',
      thresholdValue: 15,
      requiresApproval: true,
      defaultApprovalLevel: 'manager',
      requireReason: true,
      appliesToPos: true,
      appliesToQuotes: true,
      appliesToOnline: false,
      isActive: true,
      priority: 100,
      approvalLevels: [
        { level: 'shift_lead', maxValue: 20, isUnlimited: false, description: 'Shift lead can approve up to 20%' },
        { level: 'manager', maxValue: 35, isUnlimited: false, description: 'Manager can approve up to 35%' },
        { level: 'admin', maxValue: 999999.99, isUnlimited: true, description: 'Admin has unlimited approval' }
      ]
    },
    {
      name: 'Large Dollar Discount ($75+)',
      thresholdType: 'discount_amount',
      description: 'Requires approval for discounts over $75 in dollar amount',
      thresholdValue: 75,
      requiresApproval: true,
      defaultApprovalLevel: 'manager',
      requireReason: true,
      appliesToPos: true,
      appliesToQuotes: true,
      appliesToOnline: false,
      isActive: true,
      priority: 90,
      approvalLevels: [
        { level: 'shift_lead', maxValue: 100, isUnlimited: false, description: 'Shift lead can approve up to $100' },
        { level: 'manager', maxValue: 300, isUnlimited: false, description: 'Manager can approve up to $300' },
        { level: 'area_manager', maxValue: 500, isUnlimited: false, description: 'Area manager up to $500' },
        { level: 'admin', maxValue: 999999.99, isUnlimited: true, description: 'Admin unlimited' }
      ]
    },
    {
      name: 'Below Cost Sale Protection',
      thresholdType: 'price_below_cost',
      description: 'Triggers when selling any item below its cost price - requires area manager approval',
      requiresApproval: true,
      defaultApprovalLevel: 'area_manager',
      requireReason: true,
      appliesToPos: true,
      appliesToQuotes: true,
      appliesToOnline: false,
      isActive: true,
      priority: 200,
      approvalLevels: [
        { level: 'area_manager', maxValue: 500, isUnlimited: false, description: 'Area manager for below-cost up to $500 loss' },
        { level: 'admin', maxValue: 999999.99, isUnlimited: true, description: 'Admin unlimited' }
      ]
    },
    {
      name: 'Void Transaction Approval',
      thresholdType: 'void_transaction',
      description: 'Any voided transaction requires manager approval with documented reason',
      requiresApproval: true,
      defaultApprovalLevel: 'manager',
      requireReason: true,
      appliesToPos: true,
      appliesToQuotes: false,
      appliesToOnline: false,
      isActive: true,
      priority: 150,
      approvalLevels: [
        { level: 'manager', maxValue: 500, isUnlimited: false, description: 'Manager can void transactions up to $500' },
        { level: 'admin', maxValue: 999999.99, isUnlimited: true, description: 'Admin unlimited' }
      ]
    },
    {
      name: 'Large Refund ($150+)',
      thresholdType: 'refund_amount',
      description: 'Refunds exceeding $150 require manager approval',
      thresholdValue: 150,
      requiresApproval: true,
      defaultApprovalLevel: 'manager',
      requireReason: true,
      appliesToPos: true,
      appliesToQuotes: false,
      appliesToOnline: false,
      isActive: true,
      priority: 120,
      approvalLevels: [
        { level: 'manager', maxValue: 300, isUnlimited: false, description: 'Manager can approve refunds up to $300' },
        { level: 'area_manager', maxValue: 1000, isUnlimited: false, description: 'Area manager up to $1000' },
        { level: 'admin', maxValue: 999999.99, isUnlimited: true, description: 'Admin unlimited' }
      ]
    },
    {
      name: 'Low Margin Alert (Below 8%)',
      thresholdType: 'margin_below',
      description: 'Alerts when sale margin falls below 8% - requires manager review',
      thresholdValue: 8,
      requiresApproval: true,
      defaultApprovalLevel: 'manager',
      requireReason: false,
      appliesToPos: true,
      appliesToQuotes: true,
      appliesToOnline: true,
      isActive: true,
      priority: 110,
      approvalLevels: [
        { level: 'manager', maxValue: 8, isUnlimited: false, description: 'Manager can approve margins down to 0%' },
        { level: 'admin', maxValue: 999999.99, isUnlimited: true, description: 'Admin unlimited' }
      ]
    }
  ];

  for (const rule of rules) {
    console.log(`Creating rule: ${rule.name}...`);
    const result = await request('POST', '/admin/approval-rules', rule);
    if (result.status === 201 || result.status === 200) {
      console.log(`  -> Created (ID: ${result.body.data?.id || 'ok'})`);
    } else {
      console.log(`  -> Status ${result.status}: ${result.body.message || JSON.stringify(result.body).substring(0, 150)}`);
    }
  }

  // Verify by listing
  console.log('\n--- Verifying: GET /admin/approval-rules ---');
  const list = await request('GET', '/admin/approval-rules');
  console.log(`Total rules: ${list.body.data?.pagination?.total || list.body.data?.length || '?'}`);
  if (list.body.data?.rules) {
    list.body.data.rules.forEach(r => {
      console.log(`  [${r.id}] ${r.name} (${r.threshold_type}) - ${r.is_active ? 'Active' : 'Inactive'}`);
    });
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
