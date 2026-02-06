process.env.DATABASE_SSL = 'false';
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runSQL(label, sql) {
  try {
    await db.query(sql);
    console.log(`✓ ${label}`);
    return true;
  } catch (e) {
    const msg = e.message.split('\n')[0];
    if (msg.includes('already exists') || msg.includes('duplicate')) {
      console.log(`~ ${label} (exists)`);
      return true;
    }
    console.log(`✗ ${label}: ${msg}`);
    return false;
  }
}

async function run() {
  // Enums
  await runSQL('fulfillment_option_type', `DO $$ BEGIN CREATE TYPE fulfillment_option_type AS ENUM ('pickup_now','pickup_scheduled','local_delivery','shipping'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await runSQL('fulfillment_status', `DO $$ BEGIN CREATE TYPE fulfillment_status AS ENUM ('pending','processing','ready_for_pickup','out_for_delivery','in_transit','delivered','failed_delivery','returned','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await runSQL('delivery_zone_type', `DO $$ BEGIN CREATE TYPE delivery_zone_type AS ENUM ('radius','postal_code','city','custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // Add missing columns to existing delivery_zones
  await runSQL('delivery_zones: add base_delivery_fee', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS base_delivery_fee DECIMAL(10,2) DEFAULT 0`);
  await runSQL('delivery_zones: add per_km_fee', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS per_km_fee DECIMAL(6,2) DEFAULT 0`);
  await runSQL('delivery_zones: add min_order_for_free', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS min_order_for_free DECIMAL(10,2)`);
  await runSQL('delivery_zones: add estimated_days_min', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS estimated_days_min INTEGER DEFAULT 0`);
  await runSQL('delivery_zones: add estimated_days_max', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS estimated_days_max INTEGER DEFAULT 1`);
  await runSQL('delivery_zones: add radius_km', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS radius_km DECIMAL(6,2)`);
  await runSQL('delivery_zones: add center_lat', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS center_lat DECIMAL(10,7)`);
  await runSQL('delivery_zones: add center_lng', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS center_lng DECIMAL(10,7)`);
  await runSQL('delivery_zones: add notes', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS notes TEXT`);
  await runSQL('delivery_zones: add created_by', `ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)`);

  // Backfill base_delivery_fee from cents column if available
  await runSQL('delivery_zones: backfill fees', `UPDATE delivery_zones SET base_delivery_fee = COALESCE(base_delivery_fee_cents, 0) / 100.0 WHERE base_delivery_fee IS NULL OR base_delivery_fee = 0`);

  // delivery_options
  await runSQL('delivery_options', `CREATE TABLE IF NOT EXISTS delivery_options (
    id SERIAL PRIMARY KEY,
    option_type fulfillment_option_type NOT NULL UNIQUE,
    option_name VARCHAR(100) NOT NULL,
    description TEXT,
    base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    min_order_amount DECIMAL(10,2),
    free_threshold DECIMAL(10,2),
    is_available BOOLEAN DEFAULT TRUE,
    requires_address BOOLEAN DEFAULT FALSE,
    requires_scheduled_time BOOLEAN DEFAULT FALSE,
    pickup_location_id INTEGER,
    default_carrier VARCHAR(50),
    default_zone_id INTEGER REFERENCES delivery_zones(id),
    display_order INTEGER DEFAULT 100,
    icon_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // delivery_schedules
  await runSQL('delivery_schedules', `CREATE TABLE IF NOT EXISTS delivery_schedules (
    id SERIAL PRIMARY KEY,
    delivery_option_id INTEGER REFERENCES delivery_options(id),
    delivery_zone_id INTEGER REFERENCES delivery_zones(id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_orders INTEGER,
    slot_surcharge DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_time_range CHECK (start_time < end_time)
  )`);

  // order_fulfillment
  await runSQL('order_fulfillment', `CREATE TABLE IF NOT EXISTS order_fulfillment (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(transaction_id),
    order_id INTEGER,
    quotation_id INTEGER REFERENCES quotations(id),
    fulfillment_type fulfillment_option_type NOT NULL,
    delivery_option_id INTEGER REFERENCES delivery_options(id),
    delivery_zone_id INTEGER REFERENCES delivery_zones(id),
    status fulfillment_status DEFAULT 'pending',
    status_updated_at TIMESTAMP,
    status_updated_by INTEGER REFERENCES users(id),
    scheduled_date DATE,
    scheduled_time_start TIME,
    scheduled_time_end TIME,
    delivery_address JSONB,
    pickup_location_id INTEGER,
    pickup_ready_at TIMESTAMP,
    pickup_expires_at TIMESTAMP,
    pickup_code VARCHAR(20),
    carrier_id INTEGER REFERENCES shipping_carriers(id),
    shipping_service VARCHAR(50),
    tracking_number VARCHAR(100),
    tracking_url VARCHAR(500),
    label_url VARCHAR(500),
    ship_date DATE,
    delivery_fee DECIMAL(10,2) DEFAULT 0.00,
    fee_waived BOOLEAN DEFAULT FALSE,
    waive_reason VARCHAR(255),
    total_weight_kg DECIMAL(8,3),
    package_count INTEGER DEFAULT 1,
    customer_notes TEXT,
    internal_notes TEXT,
    delivered_at TIMESTAMP,
    delivered_to VARCHAR(100),
    signature_image_url VARCHAR(500),
    proof_of_delivery_url VARCHAR(500),
    failed_attempts INTEGER DEFAULT 0,
    last_failed_at TIMESTAMP,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id)
  )`);

  // fulfillment_status_history
  await runSQL('fulfillment_status_history', `CREATE TABLE IF NOT EXISTS fulfillment_status_history (
    id SERIAL PRIMARY KEY,
    fulfillment_id INTEGER NOT NULL REFERENCES order_fulfillment(id) ON DELETE CASCADE,
    previous_status fulfillment_status,
    new_status fulfillment_status NOT NULL,
    changed_at TIMESTAMP DEFAULT NOW(),
    changed_by INTEGER REFERENCES users(id),
    location_lat DECIMAL(10,7),
    location_lng DECIMAL(10,7),
    notes TEXT,
    carrier_event_code VARCHAR(50),
    carrier_event_message TEXT
  )`);

  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_fulfillment_transaction ON order_fulfillment(transaction_id)',
    'CREATE INDEX IF NOT EXISTS idx_fulfillment_status ON order_fulfillment(status)',
    'CREATE INDEX IF NOT EXISTS idx_fulfillment_type ON order_fulfillment(fulfillment_type)',
    'CREATE INDEX IF NOT EXISTS idx_fulfillment_scheduled ON order_fulfillment(scheduled_date, scheduled_time_start)',
    'CREATE INDEX IF NOT EXISTS idx_fulfillment_tracking ON order_fulfillment(tracking_number) WHERE tracking_number IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_fulfillment_pickup_code ON order_fulfillment(pickup_code) WHERE pickup_code IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_fulfillment_created ON order_fulfillment(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_fsh_fulfillment ON fulfillment_status_history(fulfillment_id)',
    'CREATE INDEX IF NOT EXISTS idx_fsh_changed ON fulfillment_status_history(changed_at)',
    'CREATE INDEX IF NOT EXISTS idx_schedules_day ON delivery_schedules(day_of_week, start_time)',
  ];
  for (const idx of indexes) {
    try { await db.query(idx); } catch(e) {}
  }
  console.log('✓ Indexes created');

  // Functions
  await runSQL('generate_pickup_code', `
    CREATE OR REPLACE FUNCTION generate_pickup_code()
    RETURNS VARCHAR(20) AS $$
    DECLARE v_code VARCHAR(20); v_exists BOOLEAN;
    BEGIN
      LOOP
        v_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 6));
        SELECT EXISTS(SELECT 1 FROM order_fulfillment WHERE pickup_code = v_code) INTO v_exists;
        EXIT WHEN NOT v_exists;
      END LOOP;
      RETURN v_code;
    END;
    $$ LANGUAGE plpgsql
  `);

  await runSQL('update_fulfillment_status func', `
    CREATE OR REPLACE FUNCTION update_fulfillment_status(
      p_fulfillment_id INTEGER, p_new_status fulfillment_status,
      p_user_id INTEGER DEFAULT NULL, p_notes TEXT DEFAULT NULL,
      p_lat DECIMAL(10,7) DEFAULT NULL, p_lng DECIMAL(10,7) DEFAULT NULL
    ) RETURNS order_fulfillment AS $$
    DECLARE v_old_status fulfillment_status; v_fulfillment order_fulfillment;
    BEGIN
      SELECT status INTO v_old_status FROM order_fulfillment WHERE id = p_fulfillment_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fulfillment not found: %', p_fulfillment_id; END IF;
      UPDATE order_fulfillment SET
        status = p_new_status, status_updated_at = NOW(), status_updated_by = p_user_id, updated_at = NOW(),
        delivered_at = CASE WHEN p_new_status = 'delivered' THEN NOW() ELSE delivered_at END,
        pickup_ready_at = CASE WHEN p_new_status = 'ready_for_pickup' THEN NOW() ELSE pickup_ready_at END
      WHERE id = p_fulfillment_id RETURNING * INTO v_fulfillment;
      INSERT INTO fulfillment_status_history (fulfillment_id, previous_status, new_status, changed_by, notes, location_lat, location_lng)
      VALUES (p_fulfillment_id, v_old_status, p_new_status, p_user_id, p_notes, p_lat, p_lng);
      RETURN v_fulfillment;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Triggers
  await runSQL('pickup code trigger', `
    CREATE OR REPLACE FUNCTION trigger_generate_pickup_code() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.fulfillment_type IN ('pickup_now', 'pickup_scheduled') AND NEW.pickup_code IS NULL THEN
        NEW.pickup_code := generate_pickup_code();
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await db.query('DROP TRIGGER IF EXISTS trg_generate_pickup_code ON order_fulfillment');
  await runSQL('pickup trigger', `CREATE TRIGGER trg_generate_pickup_code BEFORE INSERT ON order_fulfillment FOR EACH ROW EXECUTE FUNCTION trigger_generate_pickup_code()`);

  await runSQL('fulfillment timestamp trigger', `
    CREATE OR REPLACE FUNCTION trigger_update_fulfillment_timestamp() RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql
  `);
  await db.query('DROP TRIGGER IF EXISTS trg_fulfillment_updated ON order_fulfillment');
  await runSQL('fulfillment timestamp trigger bind', `CREATE TRIGGER trg_fulfillment_updated BEFORE UPDATE ON order_fulfillment FOR EACH ROW EXECUTE FUNCTION trigger_update_fulfillment_timestamp()`);

  // Seed delivery options
  await runSQL('seed delivery_options', `
    INSERT INTO delivery_options (option_type, option_name, description, base_price, min_order_amount, free_threshold, is_available, requires_address, requires_scheduled_time, display_order, icon_name)
    VALUES
      ('pickup_now', 'In-Store Pickup (Now)', 'Pick up your order immediately at the store', 0.00, NULL, NULL, TRUE, FALSE, FALSE, 1, 'store'),
      ('pickup_scheduled', 'In-Store Pickup (Scheduled)', 'Schedule a convenient pickup time', 0.00, NULL, NULL, TRUE, FALSE, TRUE, 2, 'calendar'),
      ('local_delivery', 'Local Delivery', 'Delivery within our service area', 9.99, 25.00, 100.00, TRUE, TRUE, TRUE, 3, 'truck'),
      ('shipping', 'Shipping', 'Ship anywhere in Canada', 14.99, 25.00, 150.00, TRUE, TRUE, FALSE, 4, 'package')
    ON CONFLICT (option_type) DO UPDATE SET option_name = EXCLUDED.option_name, description = EXCLUDED.description, updated_at = NOW()
  `);

  // Now run dependents
  console.log('\nRunning fulfillment dependents (033-042, 055)...');
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  for (let i = 33; i <= 42; i++) {
    const pad = String(i).padStart(3, '0');
    const files = fs.readdirSync(migrationsDir).filter(f => f.startsWith(pad));
    for (const f of files) {
      await runSQL(f, fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
    }
  }
  const f055 = fs.readdirSync(migrationsDir).filter(f => f.startsWith('055'));
  for (const f of f055) {
    await runSQL(f, fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
  }

  // Verify
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('order_fulfillment','delivery_options','delivery_schedules','fulfillment_status_history')");
  console.log('\n=== Delivery tables ===');
  tables.rows.forEach(r => console.log(`  ✓ ${r.tablename}`));

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
