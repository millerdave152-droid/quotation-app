/**
 * Migration: Add Customer Credit Limits and Payment Tracking
 * Adds credit limit fields to customers and creates payment tracking table
 */

const pool = require('../db');

async function addCustomerCreditSystem() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('📋 Adding customer credit system...');

    // 1. Add credit limit fields to customers table
    console.log('   ➜ Adding credit limit columns to customers...');
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS current_balance DECIMAL(15, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS available_credit DECIMAL(15, 2) GENERATED ALWAYS AS (credit_limit - current_balance) STORED,
      ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'Net 30',
      ADD COLUMN IF NOT EXISTS credit_status VARCHAR(20) DEFAULT 'good'
    `);

    // 2. Create customer_payments table
    console.log('   ➜ Creating customer_payments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        amount DECIMAL(15, 2) NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'Cash',
        payment_type VARCHAR(20) DEFAULT 'payment',
        reference_number VARCHAR(100),
        notes TEXT,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Create indexes for better performance
    console.log('   ➜ Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_payments_customer
      ON customer_payments(customer_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_payments_quotation
      ON customer_payments(quotation_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_payments_date
      ON customer_payments(payment_date);
    `);

    // 4. Create customer_transactions view for easy balance tracking
    console.log('   ➜ Creating customer_transactions view...');
    await client.query(`
      CREATE OR REPLACE VIEW customer_transactions AS
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        c.credit_limit,
        c.current_balance,
        c.available_credit,
        c.payment_terms,
        c.credit_status,
        COALESCE(SUM(CASE WHEN q.status IN ('Approved', 'Converted') THEN q.total_amount ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN q.status IN ('Approved', 'Converted') AND q.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN q.total_amount ELSE 0 END), 0) as sales_last_30_days,
        COUNT(DISTINCT q.id) as total_orders,
        MAX(q.created_at) as last_order_date,
        COALESCE((
          SELECT SUM(amount)
          FROM customer_payments
          WHERE customer_id = c.id
        ), 0) as total_payments
      FROM customers c
      LEFT JOIN quotations q ON c.id = q.customer_id
      GROUP BY c.id, c.name, c.credit_limit, c.current_balance, c.available_credit,
               c.payment_terms, c.credit_status
    `);

    // 5. Create function to update customer balance
    console.log('   ➜ Creating balance update function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_customer_balance()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Recalculate customer balance based on approved/converted quotes minus payments
        UPDATE customers
        SET current_balance = (
          COALESCE((
            SELECT SUM(total_amount)
            FROM quotations
            WHERE customer_id = NEW.customer_id
            AND status IN ('Approved', 'Converted')
          ), 0) - COALESCE((
            SELECT SUM(amount)
            FROM customer_payments
            WHERE customer_id = NEW.customer_id
            AND payment_type = 'payment'
          ), 0)
        ),
        credit_status = CASE
          WHEN (credit_limit - current_balance) < 0 THEN 'overlimit'
          WHEN (credit_limit - current_balance) < (credit_limit * 0.1) THEN 'warning'
          ELSE 'good'
        END
        WHERE id = NEW.customer_id;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 6. Create triggers to auto-update balances
    console.log('   ➜ Creating triggers...');
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_balance_on_payment ON customer_payments;
      CREATE TRIGGER trigger_update_balance_on_payment
      AFTER INSERT OR UPDATE OR DELETE ON customer_payments
      FOR EACH ROW
      EXECUTE FUNCTION update_customer_balance();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_balance_on_quote ON quotations;
      CREATE TRIGGER trigger_update_balance_on_quote
      AFTER INSERT OR UPDATE ON quotations
      FOR EACH ROW
      WHEN (NEW.status IN ('Approved', 'Converted'))
      EXECUTE FUNCTION update_customer_balance();
    `);

    await client.query('COMMIT');

    console.log('✅ Customer credit system added successfully!');
    console.log('\nFeatures added:');
    console.log('   • Credit limit tracking per customer');
    console.log('   • Current balance calculation');
    console.log('   • Available credit (auto-calculated)');
    console.log('   • Payment history table');
    console.log('   • Customer transactions view');
    console.log('   • Automatic balance updates via triggers');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding customer credit system:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration if called directly
if (require.main === module) {
  addCustomerCreditSystem()
    .then(() => {
      console.log('\n✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addCustomerCreditSystem;
