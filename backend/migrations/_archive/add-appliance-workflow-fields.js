/**
 * Migration: Add Appliance/Furniture/TV/AV Workflow Fields
 *
 * Adds comprehensive fields for appliance retail workflow:
 * - Delivery scheduling and address
 * - Installation options
 * - Sales rep tracking and commission
 * - Customer priority and special instructions
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Starting appliance workflow fields migration...\n');

    // ================================================
    // DELIVERY FIELDS
    // ================================================
    console.log('Adding delivery fields...');

    const deliveryFields = [
      { name: 'delivery_address', type: 'TEXT', comment: 'Delivery address if different from customer' },
      { name: 'delivery_city', type: 'VARCHAR(100)', comment: 'Delivery city' },
      { name: 'delivery_postal_code', type: 'VARCHAR(20)', comment: 'Delivery postal code' },
      { name: 'delivery_date', type: 'DATE', comment: 'Scheduled delivery date' },
      { name: 'delivery_time_slot', type: 'VARCHAR(50)', comment: 'Preferred time slot (morning, afternoon, evening)' },
      { name: 'delivery_instructions', type: 'TEXT', comment: 'Special delivery instructions (stairs, elevator, access codes)' },
      { name: 'installation_required', type: 'BOOLEAN DEFAULT false', comment: 'Whether installation is required' },
      { name: 'installation_type', type: 'VARCHAR(50)', comment: 'Type of installation (basic, premium, wall-mount, built-in)' },
      { name: 'haul_away_required', type: 'BOOLEAN DEFAULT false', comment: 'Whether old appliance removal is needed' },
      { name: 'haul_away_items', type: 'TEXT', comment: 'Description of items to haul away' }
    ];

    for (const field of deliveryFields) {
      try {
        await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}`);
        console.log(`  ✓ Added ${field.name}`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`  - ${field.name} already exists`);
        } else {
          throw err;
        }
      }
    }

    // ================================================
    // SALES REP FIELDS
    // ================================================
    console.log('\nAdding sales rep fields...');

    const salesFields = [
      { name: 'sales_rep_id', type: 'INTEGER', comment: 'ID of assigned sales rep' },
      { name: 'sales_rep_name', type: 'VARCHAR(100)', comment: 'Name of sales rep' },
      { name: 'commission_percent', type: 'DECIMAL(5,2) DEFAULT 0', comment: 'Commission percentage' },
      { name: 'commission_amount_cents', type: 'INTEGER DEFAULT 0', comment: 'Calculated commission amount' },
      { name: 'referral_source', type: 'VARCHAR(100)', comment: 'How customer found us (walk-in, online, referral, ad)' },
      { name: 'referral_name', type: 'VARCHAR(100)', comment: 'Name of referrer if applicable' }
    ];

    for (const field of salesFields) {
      try {
        await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}`);
        console.log(`  ✓ Added ${field.name}`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`  - ${field.name} already exists`);
        } else {
          throw err;
        }
      }
    }

    // ================================================
    // CUSTOMER EXPERIENCE FIELDS
    // ================================================
    console.log('\nAdding customer experience fields...');

    const customerFields = [
      { name: 'priority_level', type: "VARCHAR(20) DEFAULT 'standard'", comment: 'Customer priority (VIP, preferred, standard)' },
      { name: 'special_instructions', type: 'TEXT', comment: 'Special handling instructions for this quote' },
      { name: 'payment_method', type: 'VARCHAR(50)', comment: 'Expected payment method (cash, credit, financing, check)' },
      { name: 'deposit_required', type: 'BOOLEAN DEFAULT false', comment: 'Whether deposit is required' },
      { name: 'deposit_amount_cents', type: 'INTEGER DEFAULT 0', comment: 'Required deposit amount' },
      { name: 'deposit_paid', type: 'BOOLEAN DEFAULT false', comment: 'Whether deposit has been paid' },
      { name: 'deposit_paid_date', type: 'DATE', comment: 'Date deposit was paid' }
    ];

    for (const field of customerFields) {
      try {
        await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}`);
        console.log(`  ✓ Added ${field.name}`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`  - ${field.name} already exists`);
        } else {
          throw err;
        }
      }
    }

    // ================================================
    // QUOTE ITEM FIELDS (for serial numbers, etc.)
    // ================================================
    console.log('\nAdding quote item fields...');

    const itemFields = [
      { name: 'serial_number', type: 'VARCHAR(100)', comment: 'Product serial number (for sold items)' },
      { name: 'color_finish', type: 'VARCHAR(100)', comment: 'Color or finish selection' },
      { name: 'warranty_term', type: 'VARCHAR(50)', comment: 'Warranty term selected' },
      { name: 'special_order', type: 'BOOLEAN DEFAULT false', comment: 'Whether this is a special order item' },
      { name: 'eta_date', type: 'DATE', comment: 'Expected arrival date for special orders' },
      { name: 'location', type: 'VARCHAR(50)', comment: 'Room/location for installation (kitchen, basement, etc.)' }
    ];

    for (const field of itemFields) {
      try {
        await client.query(`ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}`);
        console.log(`  ✓ Added ${field.name} to quotation_items`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`  - ${field.name} already exists in quotation_items`);
        } else {
          throw err;
        }
      }
    }

    // ================================================
    // CREATE SALES REPS TABLE (if not exists)
    // ================================================
    console.log('\nCreating sales_reps table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_reps (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        commission_rate DECIMAL(5,2) DEFAULT 5.00,
        is_active BOOLEAN DEFAULT true,
        hire_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('  ✓ sales_reps table ready');

    // ================================================
    // CREATE REFERRAL SOURCES TABLE
    // ================================================
    console.log('\nCreating referral_sources table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Insert default referral sources
    await client.query(`
      INSERT INTO referral_sources (name, category)
      SELECT * FROM (VALUES
        ('Walk-in', 'direct'),
        ('Website', 'online'),
        ('Google Search', 'online'),
        ('Facebook', 'social'),
        ('Instagram', 'social'),
        ('Referral - Customer', 'referral'),
        ('Referral - Builder/Contractor', 'referral'),
        ('Referral - Designer', 'referral'),
        ('Newspaper Ad', 'advertising'),
        ('Flyer/Mailer', 'advertising'),
        ('TV Commercial', 'advertising'),
        ('Radio', 'advertising'),
        ('Repeat Customer', 'existing'),
        ('Trade Show/Event', 'events'),
        ('Other', 'other')
      ) AS v(name, category)
      WHERE NOT EXISTS (SELECT 1 FROM referral_sources LIMIT 1)
    `);
    console.log('  ✓ referral_sources table ready with defaults');

    // ================================================
    // CREATE DELIVERY TIME SLOTS TABLE
    // ================================================
    console.log('\nCreating delivery_time_slots table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_time_slots (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        start_time TIME,
        end_time TIME,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Insert default time slots
    await client.query(`
      INSERT INTO delivery_time_slots (name, start_time, end_time)
      SELECT name, start_time::TIME, end_time::TIME FROM (VALUES
        ('Morning (8am-12pm)', '08:00:00', '12:00:00'),
        ('Afternoon (12pm-4pm)', '12:00:00', '16:00:00'),
        ('Evening (4pm-8pm)', '16:00:00', '20:00:00'),
        ('All Day', '08:00:00', '20:00:00')
      ) AS v(name, start_time, end_time)
      WHERE NOT EXISTS (SELECT 1 FROM delivery_time_slots LIMIT 1)
    `);

    // Insert "First Available" with NULL times separately
    await client.query(`
      INSERT INTO delivery_time_slots (name, start_time, end_time)
      SELECT 'First Available', NULL, NULL
      WHERE NOT EXISTS (SELECT 1 FROM delivery_time_slots WHERE name = 'First Available')
    `);
    console.log('  ✓ delivery_time_slots table ready with defaults');

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
    console.log('\nNew fields available:');
    console.log('  - Delivery: address, date, time slot, instructions, installation options');
    console.log('  - Sales: rep tracking, commission, referral source');
    console.log('  - Customer: priority level, special instructions, deposit tracking');
    console.log('  - Items: serial number, color/finish, warranty, special order tracking');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
