/**
 * Migration: Add Delivery Scheduling System
 * Creates delivery zones, schedule config, slots, and bookings tables
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Starting Delivery Scheduling Migration...\n');

    // =====================================================
    // 1. CREATE DELIVERY ZONES TABLE
    // =====================================================
    console.log('1. Creating delivery_zones table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id SERIAL PRIMARY KEY,
        zone_name VARCHAR(100) NOT NULL,
        zone_code VARCHAR(20) UNIQUE,
        description TEXT,

        -- Geographic coverage
        postal_codes TEXT[],           -- Array of postal code prefixes (e.g., L5C, L5B)
        cities TEXT[],                 -- Array of city names
        regions TEXT[],                -- Array of region names

        -- Pricing
        base_delivery_fee_cents INTEGER DEFAULT 0,
        per_km_fee_cents INTEGER DEFAULT 0,
        minimum_order_cents INTEGER DEFAULT 0,
        free_delivery_threshold_cents INTEGER,

        -- Capacity & Lead time
        default_capacity INTEGER DEFAULT 10,
        lead_time_days INTEGER DEFAULT 2,
        max_lead_time_days INTEGER DEFAULT 14,

        -- Status
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,    -- Higher = checked first for postal code matching

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ delivery_zones table created\n');

    // =====================================================
    // 2. CREATE DELIVERY SCHEDULE CONFIG TABLE
    // =====================================================
    console.log('2. Creating delivery_schedule_config table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_schedule_config (
        id SERIAL PRIMARY KEY,
        zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE CASCADE,

        -- Day of week (0=Sunday, 6=Saturday)
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),

        -- Availability
        is_available BOOLEAN DEFAULT true,

        -- Time slots
        slot_1_start TIME,
        slot_1_end TIME,
        slot_1_capacity INTEGER DEFAULT 5,

        slot_2_start TIME,
        slot_2_end TIME,
        slot_2_capacity INTEGER DEFAULT 5,

        slot_3_start TIME,
        slot_3_end TIME,
        slot_3_capacity INTEGER DEFAULT 5,

        -- Override pricing for specific days
        day_surcharge_cents INTEGER DEFAULT 0,

        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(zone_id, day_of_week)
      )
    `);
    console.log('   ✓ delivery_schedule_config table created\n');

    // =====================================================
    // 3. CREATE DELIVERY SLOTS TABLE
    // =====================================================
    console.log('3. Creating delivery_slots table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_slots (
        id SERIAL PRIMARY KEY,
        zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,

        -- Slot timing
        slot_date DATE NOT NULL,
        slot_start TIME NOT NULL,
        slot_end TIME NOT NULL,

        -- Capacity management
        capacity INTEGER DEFAULT 10,
        booked INTEGER DEFAULT 0,
        available INTEGER GENERATED ALWAYS AS (capacity - booked) STORED,

        -- Blocking
        is_blocked BOOLEAN DEFAULT false,
        block_reason VARCHAR(255),
        blocked_by VARCHAR(255),
        blocked_at TIMESTAMP,

        -- Pricing
        surcharge_cents INTEGER DEFAULT 0,

        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(zone_id, slot_date, slot_start)
      )
    `);
    console.log('   ✓ delivery_slots table created\n');

    // =====================================================
    // 4. CREATE DELIVERY BOOKINGS TABLE
    // =====================================================
    console.log('4. Creating delivery_bookings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_bookings (
        id SERIAL PRIMARY KEY,
        booking_number VARCHAR(50) UNIQUE,

        -- References
        slot_id INTEGER NOT NULL REFERENCES delivery_slots(id) ON DELETE RESTRICT,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

        -- Delivery details
        delivery_address TEXT NOT NULL,
        delivery_city VARCHAR(100),
        delivery_postal_code VARCHAR(20),
        delivery_instructions TEXT,
        access_code VARCHAR(50),
        floor_level INTEGER,
        has_elevator BOOLEAN DEFAULT false,

        -- Contact
        contact_name VARCHAR(255),
        contact_phone VARCHAR(20),
        contact_email VARCHAR(255),
        alternate_phone VARCHAR(20),

        -- Status tracking
        status VARCHAR(30) DEFAULT 'scheduled',
        -- Values: pending, scheduled, confirmed, in_transit, delivered, failed, cancelled, rescheduled

        -- Timing
        scheduled_date DATE NOT NULL,
        scheduled_start TIME,
        scheduled_end TIME,
        actual_arrival TIMESTAMP,
        actual_departure TIMESTAMP,

        -- Delivery execution
        driver_id INTEGER,
        driver_name VARCHAR(255),
        vehicle_id VARCHAR(50),
        route_order INTEGER,

        -- Customer interaction
        customer_notified_at TIMESTAMP,
        customer_confirmed_at TIMESTAMP,
        signature_captured BOOLEAN DEFAULT false,
        signature_data TEXT,
        delivery_photo_url TEXT,

        -- Notes & issues
        notes TEXT,
        internal_notes TEXT,
        issue_reported TEXT,
        issue_resolved BOOLEAN,

        -- Pricing
        delivery_fee_cents INTEGER DEFAULT 0,
        surcharge_cents INTEGER DEFAULT 0,
        tip_cents INTEGER DEFAULT 0,

        -- Audit
        booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        booked_by VARCHAR(255),
        confirmed_at TIMESTAMP,
        completed_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancellation_reason TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ delivery_bookings table created\n');

    // =====================================================
    // 5. CREATE BLOCKED DATES TABLE (for holidays, etc.)
    // =====================================================
    console.log('5. Creating delivery_blocked_dates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_blocked_dates (
        id SERIAL PRIMARY KEY,
        zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE CASCADE,
        -- If zone_id is NULL, applies to all zones

        blocked_date DATE NOT NULL,
        reason VARCHAR(255),
        is_recurring BOOLEAN DEFAULT false, -- For annual holidays
        recurring_month INTEGER,
        recurring_day INTEGER,

        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ delivery_blocked_dates table created\n');

    // =====================================================
    // 6. CREATE INDEXES
    // =====================================================
    console.log('6. Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON delivery_zones(is_active);
      CREATE INDEX IF NOT EXISTS idx_delivery_zones_postal ON delivery_zones USING GIN(postal_codes);

      CREATE INDEX IF NOT EXISTS idx_delivery_config_zone ON delivery_schedule_config(zone_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_config_day ON delivery_schedule_config(day_of_week);

      CREATE INDEX IF NOT EXISTS idx_delivery_slots_zone ON delivery_slots(zone_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_slots_date ON delivery_slots(slot_date);
      CREATE INDEX IF NOT EXISTS idx_delivery_slots_available ON delivery_slots(slot_date, zone_id) WHERE is_blocked = false AND (capacity - booked) > 0;

      CREATE INDEX IF NOT EXISTS idx_delivery_bookings_slot ON delivery_bookings(slot_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_bookings_order ON delivery_bookings(order_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_bookings_quote ON delivery_bookings(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_bookings_customer ON delivery_bookings(customer_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_bookings_status ON delivery_bookings(status);
      CREATE INDEX IF NOT EXISTS idx_delivery_bookings_date ON delivery_bookings(scheduled_date);

      CREATE INDEX IF NOT EXISTS idx_blocked_dates_date ON delivery_blocked_dates(blocked_date);
      CREATE INDEX IF NOT EXISTS idx_blocked_dates_zone ON delivery_blocked_dates(zone_id);
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 7. CREATE BOOKING NUMBER SEQUENCE
    // =====================================================
    console.log('7. Creating booking number sequence...');
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS delivery_booking_seq START WITH 1001;
    `);
    console.log('   ✓ Booking number sequence created\n');

    // =====================================================
    // 8. CREATE TRIGGER TO UPDATE SLOT BOOKED COUNT
    // =====================================================
    console.log('8. Creating slot booking trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_slot_booked_count()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Update the slot's booked count
        UPDATE delivery_slots
        SET booked = (
          SELECT COUNT(*)
          FROM delivery_bookings
          WHERE slot_id = COALESCE(NEW.slot_id, OLD.slot_id)
          AND status NOT IN ('cancelled', 'rescheduled')
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = COALESCE(NEW.slot_id, OLD.slot_id);

        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_update_slot_booked ON delivery_bookings;
      CREATE TRIGGER trg_update_slot_booked
      AFTER INSERT OR UPDATE OR DELETE ON delivery_bookings
      FOR EACH ROW
      EXECUTE FUNCTION update_slot_booked_count();
    `);
    console.log('   ✓ Slot booking trigger created\n');

    // =====================================================
    // 9. INSERT DEFAULT ZONE (GTA)
    // =====================================================
    console.log('9. Inserting default delivery zone...');
    await client.query(`
      INSERT INTO delivery_zones (zone_name, zone_code, postal_codes, cities, base_delivery_fee_cents, lead_time_days, is_active)
      VALUES (
        'Greater Toronto Area',
        'GTA',
        ARRAY['L5', 'L4', 'L6', 'L7', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M9'],
        ARRAY['Mississauga', 'Toronto', 'Brampton', 'Oakville', 'Burlington'],
        9900,
        2,
        true
      )
      ON CONFLICT DO NOTHING;
    `);
    console.log('   ✓ Default zone inserted\n');

    await client.query('COMMIT');
    console.log('✅ Delivery Scheduling migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate().catch(console.error);
