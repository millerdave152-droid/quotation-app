/**
 * Fix migration 004 - Create unified_orders and related tables
 * Runs each section individually to avoid transactional rollback from conflicts
 */
process.env.DATABASE_SSL = 'false';
const db = require('../config/database');
const fs = require('fs');

async function run() {
  const client = await db.connect();

  // 1. Create enums
  const enums = [
    ["order_status", "('draft','quote_sent','quote_viewed','quote_expired','quote_rejected','quote_approved','order_pending','order_processing','order_ready','order_completed','invoice_sent','invoice_overdue','paid','partial_refund','refunded','void','archived')"],
    ["order_source", "('quote','pos','online','phone','import','api')"],
    ["payment_method_type", "('cash','credit_card','debit_card','gift_card','store_credit','check','bank_transfer','financing','other')"],
    ["payment_status", "('pending','authorized','captured','completed','failed','refunded','partially_refunded','voided')"],
    ["discount_type", "('percent','fixed_amount','buy_x_get_y','bundle')"],
  ];

  for (const [name, values] of enums) {
    try {
      await client.query(`DO $$ BEGIN CREATE TYPE ${name} AS ENUM ${values}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
      console.log(`✓ Enum ${name}`);
    } catch (e) {
      console.log(`  Enum ${name}: ${e.message}`);
    }
  }

  // 2. Create unified_orders
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS unified_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      legacy_quote_id INTEGER,
      legacy_transaction_id INTEGER,
      source order_source NOT NULL DEFAULT 'pos',
      status order_status NOT NULL DEFAULT 'draft',
      customer_id INTEGER REFERENCES customers(id),
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      customer_phone VARCHAR(50),
      customer_address TEXT,
      created_by INTEGER REFERENCES users(id),
      salesperson_id INTEGER REFERENCES users(id),
      register_id INTEGER REFERENCES registers(register_id),
      shift_id INTEGER REFERENCES register_shifts(shift_id),
      quote_expiry_date DATE,
      quote_valid_days INTEGER DEFAULT 30,
      quote_revision INTEGER DEFAULT 1,
      quote_sent_at TIMESTAMP,
      quote_viewed_at TIMESTAMP,
      quote_approved_at TIMESTAMP,
      quote_approved_by VARCHAR(255),
      quote_rejection_reason TEXT,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      item_discount_cents INTEGER NOT NULL DEFAULT 0,
      order_discount_cents INTEGER NOT NULL DEFAULT 0,
      order_discount_type discount_type,
      order_discount_reason VARCHAR(255),
      order_discount_code VARCHAR(50),
      taxable_amount_cents INTEGER NOT NULL DEFAULT 0,
      tax_province VARCHAR(2) DEFAULT 'ON',
      hst_rate DECIMAL(5,4) DEFAULT 0,
      hst_cents INTEGER NOT NULL DEFAULT 0,
      gst_rate DECIMAL(5,4) DEFAULT 0,
      gst_cents INTEGER NOT NULL DEFAULT 0,
      pst_rate DECIMAL(5,4) DEFAULT 0,
      pst_cents INTEGER NOT NULL DEFAULT 0,
      tax_exempt BOOLEAN DEFAULT FALSE,
      tax_exempt_number VARCHAR(50),
      delivery_cents INTEGER NOT NULL DEFAULT 0,
      delivery_method VARCHAR(50),
      delivery_address TEXT,
      delivery_instructions TEXT,
      delivery_date DATE,
      delivery_time_slot VARCHAR(50),
      total_cents INTEGER NOT NULL DEFAULT 0,
      amount_paid_cents INTEGER NOT NULL DEFAULT 0,
      amount_due_cents INTEGER GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED,
      deposit_required_cents INTEGER DEFAULT 0,
      deposit_paid_cents INTEGER DEFAULT 0,
      invoice_number VARCHAR(50) UNIQUE,
      invoice_date DATE,
      invoice_due_date DATE,
      invoice_terms VARCHAR(100),
      internal_notes TEXT,
      customer_notes TEXT,
      metadata JSONB DEFAULT '{}',
      tags TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      voided_at TIMESTAMP,
      voided_by INTEGER REFERENCES users(id),
      void_reason TEXT,
      CONSTRAINT valid_totals CHECK (
        subtotal_cents >= 0 AND item_discount_cents >= 0 AND order_discount_cents >= 0 AND total_cents >= 0 AND amount_paid_cents >= 0
      )
    )`);
    console.log('✓ unified_orders table');
  } catch (e) {
    console.error('✗ unified_orders:', e.message);
  }

  // 3. Create unified_order_items
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS unified_order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_sku VARCHAR(100),
      product_name VARCHAR(255) NOT NULL,
      product_description TEXT,
      manufacturer VARCHAR(255),
      model VARCHAR(255),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      unit_cost_cents INTEGER,
      discount_type discount_type,
      discount_percent DECIMAL(5,2) DEFAULT 0,
      discount_cents INTEGER DEFAULT 0,
      discount_reason VARCHAR(255),
      line_subtotal_cents INTEGER GENERATED ALWAYS AS (unit_price_cents * quantity) STORED,
      line_discount_cents INTEGER GENERATED ALWAYS AS (
        CASE
          WHEN discount_type = 'percent' THEN ROUND((unit_price_cents * quantity * discount_percent / 100))::INTEGER
          WHEN discount_type = 'fixed_amount' THEN discount_cents
          ELSE 0
        END
      ) STORED,
      line_total_cents INTEGER NOT NULL,
      taxable BOOLEAN DEFAULT TRUE,
      tax_cents INTEGER DEFAULT 0,
      serial_number VARCHAR(100),
      lot_number VARCHAR(100),
      fulfilled_quantity INTEGER DEFAULT 0,
      backordered_quantity INTEGER DEFAULT 0,
      fulfillment_status VARCHAR(30) DEFAULT 'pending',
      is_special_order BOOLEAN DEFAULT FALSE,
      special_order_eta DATE,
      special_order_notes TEXT,
      warranty_id INTEGER,
      warranty_expires DATE,
      sort_order INTEGER DEFAULT 0,
      notes TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT valid_item_quantities CHECK (quantity > 0 AND fulfilled_quantity >= 0 AND backordered_quantity >= 0)
    )`);
    console.log('✓ unified_order_items table');
  } catch (e) {
    console.error('✗ unified_order_items:', e.message);
  }

  // 4. Create unified_order_payments
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS unified_order_payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,
      payment_method payment_method_type NOT NULL,
      amount_cents INTEGER NOT NULL,
      status payment_status NOT NULL DEFAULT 'pending',
      cash_tendered_cents INTEGER,
      change_given_cents INTEGER,
      card_brand VARCHAR(20),
      card_last_four VARCHAR(4),
      card_expiry VARCHAR(7),
      authorization_code VARCHAR(50),
      processor_reference VARCHAR(100),
      processor_response JSONB,
      check_number VARCHAR(50),
      check_bank VARCHAR(100),
      gift_card_number VARCHAR(50),
      gift_card_balance_cents INTEGER,
      financing_provider VARCHAR(100),
      financing_account VARCHAR(50),
      financing_terms VARCHAR(100),
      is_refund BOOLEAN DEFAULT FALSE,
      refund_reason TEXT,
      original_payment_id INTEGER REFERENCES unified_order_payments(id),
      processed_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      voided_at TIMESTAMP,
      notes TEXT,
      metadata JSONB DEFAULT '{}',
      CONSTRAINT valid_payment_amount CHECK (amount_cents != 0),
      CONSTRAINT valid_cash_payment CHECK (
        payment_method != 'cash' OR (cash_tendered_cents IS NOT NULL AND cash_tendered_cents >= amount_cents)
      )
    )`);
    console.log('✓ unified_order_payments table');
  } catch (e) {
    console.error('✗ unified_order_payments:', e.message);
  }

  // 5. Create unified_order_status_history
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS unified_order_status_history (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,
      from_status order_status,
      to_status order_status NOT NULL,
      changed_by INTEGER REFERENCES users(id),
      changed_by_name VARCHAR(255),
      reason TEXT,
      notes TEXT,
      metadata JSONB DEFAULT '{}',
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('✓ unified_order_status_history table');
  } catch (e) {
    console.error('✗ unified_order_status_history:', e.message);
  }

  // 6. Create indexes (use IF NOT EXISTS and unique names to avoid conflicts)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_number ON unified_orders(order_number)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_status ON unified_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_source ON unified_orders(source)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_customer ON unified_orders(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_salesperson ON unified_orders(salesperson_id)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_shift ON unified_orders(shift_id)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_created ON unified_orders(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_invoice_number ON unified_orders(invoice_number)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_tags ON unified_orders USING GIN(tags)',
    'CREATE INDEX IF NOT EXISTS idx_unified_orders_metadata ON unified_orders USING GIN(metadata)',
    'CREATE INDEX IF NOT EXISTS idx_uoi_order ON unified_order_items(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_uoi_product ON unified_order_items(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_uoi_sku ON unified_order_items(product_sku)',
    'CREATE INDEX IF NOT EXISTS idx_uoi_serial ON unified_order_items(serial_number)',
    'CREATE INDEX IF NOT EXISTS idx_uop_order ON unified_order_payments(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_uop_status ON unified_order_payments(status)',
    'CREATE INDEX IF NOT EXISTS idx_uop_method ON unified_order_payments(payment_method)',
    'CREATE INDEX IF NOT EXISTS idx_uop_created ON unified_order_payments(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_uosh_order ON unified_order_status_history(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_uosh_timestamp ON unified_order_status_history(changed_at)',
  ];
  for (const idx of indexes) {
    try { await client.query(idx); } catch (e) { console.log(`  idx: ${e.message}`); }
  }
  console.log('✓ All indexes');

  // 7. Create functions
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_order_number(prefix VARCHAR DEFAULT 'ORD')
      RETURNS VARCHAR AS $$
      DECLARE new_number VARCHAR;
      BEGIN
        new_number := prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
        RETURN new_number;
      END;
      $$ LANGUAGE plpgsql
    `);
    console.log('✓ generate_order_number function');
  } catch (e) { console.error('✗ generate_order_number:', e.message); }

  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION update_unified_order_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    await client.query('DROP TRIGGER IF EXISTS trg_unified_orders_timestamp ON unified_orders');
    await client.query('CREATE TRIGGER trg_unified_orders_timestamp BEFORE UPDATE ON unified_orders FOR EACH ROW EXECUTE FUNCTION update_unified_order_timestamp()');
    await client.query('DROP TRIGGER IF EXISTS trg_unified_order_items_timestamp ON unified_order_items');
    await client.query('CREATE TRIGGER trg_unified_order_items_timestamp BEFORE UPDATE ON unified_order_items FOR EACH ROW EXECUTE FUNCTION update_unified_order_timestamp()');
    console.log('✓ Timestamp triggers');
  } catch (e) { console.error('✗ triggers:', e.message); }

  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION recalculate_order_totals(p_order_id INTEGER)
      RETURNS void AS $$
      DECLARE
        v_subtotal INTEGER;
        v_item_discount INTEGER;
        v_taxable INTEGER;
        v_order unified_orders%ROWTYPE;
        v_hst INTEGER;
        v_gst INTEGER;
        v_pst INTEGER;
      BEGIN
        SELECT * INTO v_order FROM unified_orders WHERE id = p_order_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Order not found: %', p_order_id; END IF;
        SELECT COALESCE(SUM(line_subtotal_cents), 0), COALESCE(SUM(line_discount_cents), 0)
        INTO v_subtotal, v_item_discount FROM unified_order_items WHERE order_id = p_order_id;
        v_taxable := v_subtotal - v_item_discount - COALESCE(v_order.order_discount_cents, 0);
        IF NOT v_order.tax_exempt THEN
          SELECT COALESCE(SUM(line_total_cents), 0) INTO v_taxable
          FROM unified_order_items WHERE order_id = p_order_id AND taxable = TRUE;
          v_taxable := v_taxable - COALESCE(v_order.order_discount_cents, 0);
          IF v_taxable < 0 THEN v_taxable := 0; END IF;
          v_hst := ROUND(v_taxable * COALESCE(v_order.hst_rate, 0))::INTEGER;
          v_gst := ROUND(v_taxable * COALESCE(v_order.gst_rate, 0))::INTEGER;
          v_pst := ROUND(v_taxable * COALESCE(v_order.pst_rate, 0))::INTEGER;
        ELSE
          v_hst := 0; v_gst := 0; v_pst := 0;
        END IF;
        UPDATE unified_orders SET
          subtotal_cents = v_subtotal, item_discount_cents = v_item_discount,
          taxable_amount_cents = v_taxable, hst_cents = v_hst, gst_cents = v_gst, pst_cents = v_pst,
          total_cents = v_subtotal - v_item_discount - COALESCE(order_discount_cents, 0) + v_hst + v_gst + v_pst + COALESCE(delivery_cents, 0),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = p_order_id;
        UPDATE unified_orders SET
          amount_paid_cents = (
            SELECT COALESCE(SUM(amount_cents), 0) FROM unified_order_payments
            WHERE order_id = p_order_id AND status = 'completed' AND is_refund = FALSE
          ) - (
            SELECT COALESCE(SUM(amount_cents), 0) FROM unified_order_payments
            WHERE order_id = p_order_id AND status = 'completed' AND is_refund = TRUE
          )
        WHERE id = p_order_id;
      END;
      $$ LANGUAGE plpgsql
    `);
    console.log('✓ recalculate_order_totals function');
  } catch (e) { console.error('✗ recalculate_order_totals:', e.message); }

  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_recalculate_order()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM recalculate_order_totals(OLD.order_id);
          RETURN OLD;
        ELSE
          PERFORM recalculate_order_totals(NEW.order_id);
          RETURN NEW;
        END IF;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query('DROP TRIGGER IF EXISTS trg_recalculate_on_item_change ON unified_order_items');
    await client.query('CREATE TRIGGER trg_recalculate_on_item_change AFTER INSERT OR UPDATE OR DELETE ON unified_order_items FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_order()');
    console.log('✓ Recalculate trigger');
  } catch (e) { console.error('✗ recalculate trigger:', e.message); }

  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION transition_order_status(
        p_order_id INTEGER,
        p_new_status order_status,
        p_user_id INTEGER DEFAULT NULL,
        p_reason TEXT DEFAULT NULL,
        p_notes TEXT DEFAULT NULL
      )
      RETURNS unified_orders AS $$
      DECLARE
        v_order unified_orders%ROWTYPE;
        v_old_status order_status;
      BEGIN
        SELECT * INTO v_order FROM unified_orders WHERE id = p_order_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Order not found: %', p_order_id; END IF;
        v_old_status := v_order.status;
        INSERT INTO unified_order_status_history (order_id, from_status, to_status, changed_by, reason, notes)
        VALUES (p_order_id, v_old_status, p_new_status, p_user_id, p_reason, p_notes);
        UPDATE unified_orders SET
          status = p_new_status, updated_at = CURRENT_TIMESTAMP,
          quote_sent_at = CASE WHEN p_new_status = 'quote_sent' THEN CURRENT_TIMESTAMP ELSE quote_sent_at END,
          quote_viewed_at = CASE WHEN p_new_status = 'quote_viewed' THEN CURRENT_TIMESTAMP ELSE quote_viewed_at END,
          quote_approved_at = CASE WHEN p_new_status = 'quote_approved' THEN CURRENT_TIMESTAMP ELSE quote_approved_at END,
          completed_at = CASE WHEN p_new_status IN ('paid', 'order_completed') THEN CURRENT_TIMESTAMP ELSE completed_at END,
          voided_at = CASE WHEN p_new_status = 'void' THEN CURRENT_TIMESTAMP ELSE voided_at END,
          voided_by = CASE WHEN p_new_status = 'void' THEN p_user_id ELSE voided_by END,
          void_reason = CASE WHEN p_new_status = 'void' THEN p_reason ELSE void_reason END
        WHERE id = p_order_id RETURNING * INTO v_order;
        RETURN v_order;
      END;
      $$ LANGUAGE plpgsql
    `);
    console.log('✓ transition_order_status function');
  } catch (e) { console.error('✗ transition_order_status:', e.message); }

  // 8. Create views
  try {
    await client.query(`
      CREATE OR REPLACE VIEW active_quotes AS
      SELECT o.*, c.name as customer_display_name, c.email as customer_display_email,
        u.first_name || ' ' || u.last_name as salesperson_name,
        (SELECT COUNT(*) FROM unified_order_items WHERE order_id = o.id) as item_count,
        CASE
          WHEN o.quote_expiry_date < CURRENT_DATE THEN 'expired'
          WHEN o.quote_expiry_date = CURRENT_DATE THEN 'expires_today'
          WHEN o.quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expires_soon'
          ELSE 'active'
        END as expiry_status
      FROM unified_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.salesperson_id = u.id
      WHERE o.source = 'quote' AND o.status IN ('draft', 'quote_sent', 'quote_viewed')
    `);
    console.log('✓ active_quotes view');
  } catch (e) { console.error('✗ active_quotes view:', e.message); }

  try {
    await client.query(`
      CREATE OR REPLACE VIEW pos_transactions AS
      SELECT o.*, c.name as customer_display_name, r.register_name,
        rs.opened_at as shift_opened_at,
        u.first_name || ' ' || u.last_name as cashier_name,
        sp.first_name || ' ' || sp.last_name as salesperson_name,
        (SELECT COUNT(*) FROM unified_order_items WHERE order_id = o.id) as item_count,
        (SELECT json_agg(json_build_object('method', p.payment_method, 'amount', p.amount_cents, 'status', p.status))
         FROM unified_order_payments p WHERE p.order_id = o.id) as payments
      FROM unified_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN registers r ON o.register_id = r.register_id
      LEFT JOIN register_shifts rs ON o.shift_id = rs.shift_id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN users sp ON o.salesperson_id = sp.id
      WHERE o.source = 'pos'
    `);
    console.log('✓ pos_transactions view');
  } catch (e) { console.error('✗ pos_transactions view:', e.message); }

  try {
    await client.query(`
      CREATE OR REPLACE VIEW unpaid_invoices AS
      SELECT o.*, c.name as customer_display_name, c.email as customer_display_email,
        c.phone as customer_display_phone,
        CURRENT_DATE - o.invoice_due_date as days_overdue
      FROM unified_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.status IN ('invoice_sent', 'invoice_overdue') AND o.amount_due_cents > 0
      ORDER BY o.invoice_due_date ASC
    `);
    console.log('✓ unpaid_invoices view');
  } catch (e) { console.error('✗ unpaid_invoices view:', e.message); }

  // Verify final state
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'unified_%' ORDER BY tablename");
  console.log('\n=== Final unified tables ===');
  tables.rows.forEach(r => console.log(' ', r.tablename));

  client.release();
  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
