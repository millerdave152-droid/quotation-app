const pool = require('./db');

async function testAnalytics() {
  try {
    const days = 30;
    const end = new Date();
    const start = new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));

    console.log('Testing analytics endpoint logic...\n');
    console.log(`Date range: ${start.toISOString()} to ${end.toISOString()}\n`);

    // Test total quotes query
    console.log('1. Testing total quotes query...');
    const totalQuotesResult = await pool.query(
      'SELECT COUNT(*) as count FROM quotations WHERE created_at >= $1 AND created_at <= $2',
      [start, end]
    );
    console.log(`   ✅ Total quotes: ${totalQuotesResult.rows[0].count}\n`);

    // Test financing query
    console.log('2. Testing financing query...');
    const financingResult = await pool.query(
      `SELECT COUNT(DISTINCT qf.quote_id) as count,
              SUM(qf.financed_amount_cents) as total_financed,
              SUM(qf.total_interest_cents) as total_interest
       FROM quote_financing qf
       JOIN quotations q ON qf.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );
    console.log(`   ✅ Financing count: ${financingResult.rows[0].count || 0}\n`);

    // Test warranties query
    console.log('3. Testing warranties query...');
    const warrantiesResult = await pool.query(
      `SELECT COUNT(DISTINCT qw.quote_id) as count,
              SUM(qw.warranty_cost_cents) as total_revenue
       FROM quote_warranties qw
       JOIN quotations q ON qw.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );
    console.log(`   ✅ Warranties count: ${warrantiesResult.rows[0].count || 0}\n`);

    // Test delivery query
    console.log('4. Testing delivery query...');
    const deliveryResult = await pool.query(
      `SELECT COUNT(DISTINCT qd.quote_id) as count,
              SUM(qd.total_delivery_cost_cents) as total_revenue
       FROM quote_delivery qd
       JOIN quotations q ON qd.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );
    console.log(`   ✅ Delivery count: ${deliveryResult.rows[0].count || 0}\n`);

    // Test rebates query
    console.log('5. Testing rebates query...');
    const rebatesResult = await pool.query(
      `SELECT COUNT(DISTINCT qr.quote_id) as count,
              SUM(qr.rebate_amount_cents) as total_rebates
       FROM quote_rebates qr
       JOIN quotations q ON qr.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );
    console.log(`   ✅ Rebates count: ${rebatesResult.rows[0].count || 0}\n`);

    // Test trade-ins query
    console.log('6. Testing trade-ins query...');
    const tradeInsResult = await pool.query(
      `SELECT COUNT(DISTINCT qt.quote_id) as count,
              SUM(qt.trade_in_value_cents) as total_value
       FROM quote_trade_ins qt
       JOIN quotations q ON qt.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );
    console.log(`   ✅ Trade-ins count: ${tradeInsResult.rows[0].count || 0}\n`);

    console.log('✅ All analytics queries succeeded!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Analytics test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testAnalytics();
