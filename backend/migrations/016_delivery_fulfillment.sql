-- ============================================================================
-- Migration 016: Delivery & Fulfillment Options
-- TeleTime POS - Pickup and Delivery Management
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Fulfillment option types
DO $$ BEGIN
  CREATE TYPE fulfillment_option_type AS ENUM (
    'pickup_now',           -- In-store pickup, immediate
    'pickup_scheduled',     -- In-store pickup, scheduled
    'local_delivery',       -- Local delivery within zone
    'shipping'              -- Carrier shipping (Canada Post, UPS, etc.)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Fulfillment status
DO $$ BEGIN
  CREATE TYPE fulfillment_status AS ENUM (
    'pending',              -- Order placed, not yet processed
    'processing',           -- Being prepared
    'ready_for_pickup',     -- Ready for customer pickup
    'out_for_delivery',     -- On delivery vehicle
    'in_transit',           -- Shipped, in carrier transit
    'delivered',            -- Successfully delivered/picked up
    'failed_delivery',      -- Delivery attempt failed
    'returned',             -- Returned to store
    'cancelled'             -- Fulfillment cancelled
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Delivery zone type
DO $$ BEGIN
  CREATE TYPE delivery_zone_type AS ENUM (
    'radius',               -- Distance-based (km from store)
    'postal_code',          -- Postal code patterns
    'city',                 -- City/municipality names
    'custom'                -- Custom polygon (future)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- DELIVERY ZONES TABLE
-- Defines geographic areas for local delivery
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,

  -- Zone identification
  zone_name VARCHAR(100) NOT NULL,
  zone_code VARCHAR(20) UNIQUE,
  zone_type delivery_zone_type DEFAULT 'postal_code',

  -- Geographic definition
  radius_km DECIMAL(6,2),                    -- For radius-based zones
  center_lat DECIMAL(10,7),                  -- Center latitude
  center_lng DECIMAL(10,7),                  -- Center longitude

  -- Pricing
  base_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  per_km_fee DECIMAL(6,2) DEFAULT 0.00,      -- Additional per-km charge
  min_order_for_free DECIMAL(10,2),          -- Min order for free delivery

  -- Timing
  estimated_days_min INTEGER DEFAULT 0,       -- Minimum estimated days
  estimated_days_max INTEGER DEFAULT 1,       -- Maximum estimated days
  same_day_cutoff TIME,                       -- Cutoff time for same-day
  same_day_available BOOLEAN DEFAULT FALSE,

  -- Availability
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100,               -- Lower = higher priority for overlap

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- ============================================================================
-- DELIVERY ZONE POSTAL CODES
-- Postal code patterns for each zone
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_zone_postal_codes (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,

  -- Postal code pattern (supports wildcards)
  -- Examples: 'M5V', 'M5V 1A1', 'M5*', 'M%'
  postal_code_pattern VARCHAR(10) NOT NULL,

  -- Override pricing for specific postal codes
  delivery_fee_override DECIMAL(10,2),
  min_order_override DECIMAL(10,2),

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(zone_id, postal_code_pattern)
);

-- ============================================================================
-- DELIVERY ZONE CITIES
-- City names for city-based zones
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_zone_cities (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,

  city_name VARCHAR(100) NOT NULL,
  province_code CHAR(2) DEFAULT 'ON',

  -- Override pricing for specific cities
  delivery_fee_override DECIMAL(10,2),
  min_order_override DECIMAL(10,2),

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(zone_id, city_name, province_code)
);

-- ============================================================================
-- DELIVERY OPTIONS TABLE
-- Global delivery/fulfillment options configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_options (
  id SERIAL PRIMARY KEY,

  -- Option type
  option_type fulfillment_option_type NOT NULL UNIQUE,
  option_name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Pricing
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  min_order_amount DECIMAL(10,2),             -- Min order to offer this option
  free_threshold DECIMAL(10,2),               -- Order amount for free delivery

  -- Availability
  is_available BOOLEAN DEFAULT TRUE,
  requires_address BOOLEAN DEFAULT FALSE,
  requires_scheduled_time BOOLEAN DEFAULT FALSE,

  -- For pickup options
  pickup_location_id INTEGER,                  -- References registers/locations

  -- For shipping
  default_carrier VARCHAR(50),

  -- For local delivery
  default_zone_id INTEGER REFERENCES delivery_zones(id),

  -- Display
  display_order INTEGER DEFAULT 100,
  icon_name VARCHAR(50),                       -- Icon identifier for UI

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- DELIVERY SCHEDULES
-- Available time slots for scheduled pickup/delivery
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_schedules (
  id SERIAL PRIMARY KEY,

  -- Link to option or zone
  delivery_option_id INTEGER REFERENCES delivery_options(id),
  delivery_zone_id INTEGER REFERENCES delivery_zones(id),

  -- Day of week (0 = Sunday, 6 = Saturday)
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),

  -- Time slot
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  -- Capacity
  max_orders INTEGER,                          -- Max orders per slot

  -- Pricing
  slot_surcharge DECIMAL(10,2) DEFAULT 0.00,   -- Extra fee for this slot

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- ============================================================================
-- CARRIER SHIPPING RATES
-- For carrier-based shipping options
-- ============================================================================

CREATE TABLE IF NOT EXISTS shipping_carriers (
  id SERIAL PRIMARY KEY,

  carrier_code VARCHAR(20) NOT NULL UNIQUE,    -- 'canada_post', 'ups', 'fedex'
  carrier_name VARCHAR(100) NOT NULL,

  -- API configuration
  api_endpoint VARCHAR(255),
  api_key_encrypted TEXT,
  account_number VARCHAR(50),

  -- Default settings
  default_package_type VARCHAR(50),
  weight_unit VARCHAR(10) DEFAULT 'kg',
  dimension_unit VARCHAR(10) DEFAULT 'cm',

  -- Markup
  rate_markup_percent DECIMAL(5,2) DEFAULT 0.00,
  rate_markup_flat DECIMAL(10,2) DEFAULT 0.00,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id SERIAL PRIMARY KEY,

  carrier_id INTEGER NOT NULL REFERENCES shipping_carriers(id),

  -- Service level
  service_code VARCHAR(50) NOT NULL,           -- 'expedited', 'priority', 'regular'
  service_name VARCHAR(100) NOT NULL,

  -- Zone/destination
  destination_zone VARCHAR(50),                -- Carrier zone code
  destination_country CHAR(2) DEFAULT 'CA',

  -- Weight-based pricing
  min_weight_kg DECIMAL(8,3) DEFAULT 0,
  max_weight_kg DECIMAL(8,3),
  base_rate DECIMAL(10,2) NOT NULL,
  per_kg_rate DECIMAL(10,2) DEFAULT 0.00,

  -- Timing
  estimated_days_min INTEGER,
  estimated_days_max INTEGER,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(carrier_id, service_code, destination_zone)
);

-- ============================================================================
-- ORDER FULFILLMENT TABLE
-- Tracks fulfillment for each order/transaction
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_fulfillment (
  id SERIAL PRIMARY KEY,

  -- Order reference (link to either transactions or unified_orders)
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  order_id INTEGER,                            -- Future: unified_orders FK
  quotation_id INTEGER REFERENCES quotations(id),

  -- Fulfillment type
  fulfillment_type fulfillment_option_type NOT NULL,
  delivery_option_id INTEGER REFERENCES delivery_options(id),
  delivery_zone_id INTEGER REFERENCES delivery_zones(id),

  -- Status tracking
  status fulfillment_status DEFAULT 'pending',
  status_updated_at TIMESTAMP,
  status_updated_by INTEGER REFERENCES users(id),

  -- Scheduling
  scheduled_date DATE,
  scheduled_time_start TIME,
  scheduled_time_end TIME,

  -- Delivery address (JSON for flexibility)
  delivery_address JSONB,
  /*
    {
      "name": "John Doe",
      "company": "Acme Inc",
      "street1": "123 Main St",
      "street2": "Suite 100",
      "city": "Toronto",
      "province": "ON",
      "postal_code": "M5V 1A1",
      "country": "CA",
      "phone": "416-555-1234",
      "email": "john@example.com",
      "instructions": "Leave at door"
    }
  */

  -- Pickup details (for pickup options)
  pickup_location_id INTEGER,
  pickup_ready_at TIMESTAMP,
  pickup_expires_at TIMESTAMP,
  pickup_code VARCHAR(20),                     -- Customer pickup code

  -- Shipping details (for carrier shipping)
  carrier_id INTEGER REFERENCES shipping_carriers(id),
  shipping_service VARCHAR(50),
  tracking_number VARCHAR(100),
  tracking_url VARCHAR(500),
  label_url VARCHAR(500),
  ship_date DATE,

  -- Pricing
  delivery_fee DECIMAL(10,2) DEFAULT 0.00,
  fee_waived BOOLEAN DEFAULT FALSE,
  waive_reason VARCHAR(255),

  -- Weight/dimensions (for shipping)
  total_weight_kg DECIMAL(8,3),
  package_count INTEGER DEFAULT 1,

  -- Notes
  customer_notes TEXT,
  internal_notes TEXT,

  -- Delivery confirmation
  delivered_at TIMESTAMP,
  delivered_to VARCHAR(100),                   -- Name of person who received
  signature_image_url VARCHAR(500),
  proof_of_delivery_url VARCHAR(500),

  -- Failed delivery tracking
  failed_attempts INTEGER DEFAULT 0,
  last_failed_at TIMESTAMP,
  failure_reason TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- ============================================================================
-- FULFILLMENT STATUS HISTORY
-- Audit trail for status changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS fulfillment_status_history (
  id SERIAL PRIMARY KEY,

  fulfillment_id INTEGER NOT NULL REFERENCES order_fulfillment(id) ON DELETE CASCADE,

  previous_status fulfillment_status,
  new_status fulfillment_status NOT NULL,

  changed_at TIMESTAMP DEFAULT NOW(),
  changed_by INTEGER REFERENCES users(id),

  -- Additional context
  location_lat DECIMAL(10,7),
  location_lng DECIMAL(10,7),
  notes TEXT,

  -- External events
  carrier_event_code VARCHAR(50),
  carrier_event_message TEXT
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Delivery zones
CREATE INDEX IF NOT EXISTS idx_delivery_zones_active
  ON delivery_zones(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_delivery_zones_type
  ON delivery_zones(zone_type);

-- Postal codes
CREATE INDEX IF NOT EXISTS idx_zone_postal_codes_pattern
  ON delivery_zone_postal_codes(postal_code_pattern);

CREATE INDEX IF NOT EXISTS idx_zone_postal_codes_zone
  ON delivery_zone_postal_codes(zone_id);

-- Cities
CREATE INDEX IF NOT EXISTS idx_zone_cities_name
  ON delivery_zone_cities(city_name, province_code);

-- Order fulfillment
CREATE INDEX IF NOT EXISTS idx_fulfillment_transaction
  ON order_fulfillment(transaction_id);

CREATE INDEX IF NOT EXISTS idx_fulfillment_status
  ON order_fulfillment(status);

CREATE INDEX IF NOT EXISTS idx_fulfillment_type
  ON order_fulfillment(fulfillment_type);

CREATE INDEX IF NOT EXISTS idx_fulfillment_scheduled
  ON order_fulfillment(scheduled_date, scheduled_time_start);

CREATE INDEX IF NOT EXISTS idx_fulfillment_tracking
  ON order_fulfillment(tracking_number) WHERE tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fulfillment_pickup_code
  ON order_fulfillment(pickup_code) WHERE pickup_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fulfillment_created
  ON order_fulfillment(created_at);

-- Status history
CREATE INDEX IF NOT EXISTS idx_status_history_fulfillment
  ON fulfillment_status_history(fulfillment_id);

CREATE INDEX IF NOT EXISTS idx_status_history_changed
  ON fulfillment_status_history(changed_at);

-- Delivery schedules
CREATE INDEX IF NOT EXISTS idx_schedules_day
  ON delivery_schedules(day_of_week, start_time);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Find delivery zone for a postal code
 * Searches through postal code patterns to find matching zone
 */
CREATE OR REPLACE FUNCTION find_delivery_zone_by_postal_code(
  p_postal_code VARCHAR(10)
) RETURNS TABLE (
  zone_id INTEGER,
  zone_name VARCHAR(100),
  delivery_fee DECIMAL(10,2),
  min_order_for_free DECIMAL(10,2),
  estimated_days_min INTEGER,
  estimated_days_max INTEGER,
  same_day_available BOOLEAN
) AS $$
DECLARE
  v_normalized VARCHAR(10);
BEGIN
  -- Normalize postal code (uppercase, no spaces)
  v_normalized := UPPER(REPLACE(p_postal_code, ' ', ''));

  RETURN QUERY
  SELECT
    dz.id AS zone_id,
    dz.zone_name,
    COALESCE(dzpc.delivery_fee_override, dz.base_delivery_fee) AS delivery_fee,
    COALESCE(dzpc.min_order_override, dz.min_order_for_free) AS min_order_for_free,
    dz.estimated_days_min,
    dz.estimated_days_max,
    dz.same_day_available
  FROM delivery_zones dz
  JOIN delivery_zone_postal_codes dzpc ON dz.id = dzpc.zone_id
  WHERE dz.is_active = TRUE
    AND dzpc.is_active = TRUE
    AND (
      -- Exact match
      UPPER(REPLACE(dzpc.postal_code_pattern, ' ', '')) = v_normalized
      -- Prefix match (e.g., 'M5V' matches 'M5V1A1')
      OR v_normalized LIKE UPPER(REPLACE(dzpc.postal_code_pattern, ' ', '')) || '%'
      -- Wildcard match with %
      OR v_normalized LIKE REPLACE(UPPER(dzpc.postal_code_pattern), '*', '%')
    )
  ORDER BY
    -- Prefer more specific matches
    LENGTH(dzpc.postal_code_pattern) DESC,
    dz.priority ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

/**
 * Calculate delivery fee for an order
 */
CREATE OR REPLACE FUNCTION calculate_delivery_fee(
  p_fulfillment_type fulfillment_option_type,
  p_zone_id INTEGER,
  p_order_total DECIMAL(10,2),
  p_distance_km DECIMAL(6,2) DEFAULT NULL
) RETURNS TABLE (
  delivery_fee DECIMAL(10,2),
  is_free BOOLEAN,
  free_threshold DECIMAL(10,2),
  estimated_days_min INTEGER,
  estimated_days_max INTEGER
) AS $$
DECLARE
  v_option delivery_options%ROWTYPE;
  v_zone delivery_zones%ROWTYPE;
  v_fee DECIMAL(10,2);
  v_free_threshold DECIMAL(10,2);
BEGIN
  -- Get delivery option
  SELECT * INTO v_option
  FROM delivery_options
  WHERE option_type = p_fulfillment_type
    AND is_available = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery option not available: %', p_fulfillment_type;
  END IF;

  -- Start with base price
  v_fee := v_option.base_price;
  v_free_threshold := v_option.free_threshold;

  -- For local delivery, apply zone-specific pricing
  IF p_fulfillment_type = 'local_delivery' AND p_zone_id IS NOT NULL THEN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE id = p_zone_id
      AND is_active = TRUE;

    IF FOUND THEN
      v_fee := v_zone.base_delivery_fee;
      v_free_threshold := COALESCE(v_zone.min_order_for_free, v_option.free_threshold);

      -- Add per-km fee if applicable
      IF p_distance_km IS NOT NULL AND v_zone.per_km_fee > 0 THEN
        v_fee := v_fee + (p_distance_km * v_zone.per_km_fee);
      END IF;

      RETURN QUERY SELECT
        CASE
          WHEN v_free_threshold IS NOT NULL AND p_order_total >= v_free_threshold
          THEN 0.00
          ELSE ROUND(v_fee, 2)
        END,
        v_free_threshold IS NOT NULL AND p_order_total >= v_free_threshold,
        v_free_threshold,
        v_zone.estimated_days_min,
        v_zone.estimated_days_max;
      RETURN;
    END IF;
  END IF;

  -- Default return for pickup and shipping
  RETURN QUERY SELECT
    CASE
      WHEN v_free_threshold IS NOT NULL AND p_order_total >= v_free_threshold
      THEN 0.00
      ELSE v_fee
    END,
    v_free_threshold IS NOT NULL AND p_order_total >= v_free_threshold,
    v_free_threshold,
    CASE
      WHEN p_fulfillment_type = 'pickup_now' THEN 0
      WHEN p_fulfillment_type = 'pickup_scheduled' THEN 0
      ELSE 1
    END,
    CASE
      WHEN p_fulfillment_type = 'pickup_now' THEN 0
      WHEN p_fulfillment_type = 'pickup_scheduled' THEN 0
      ELSE 5
    END;
END;
$$ LANGUAGE plpgsql;

/**
 * Generate unique pickup code
 */
CREATE OR REPLACE FUNCTION generate_pickup_code()
RETURNS VARCHAR(20) AS $$
DECLARE
  v_code VARCHAR(20);
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 6-character alphanumeric code
    v_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 6));

    -- Check if exists
    SELECT EXISTS(
      SELECT 1 FROM order_fulfillment WHERE pickup_code = v_code
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

/**
 * Update fulfillment status with history tracking
 */
CREATE OR REPLACE FUNCTION update_fulfillment_status(
  p_fulfillment_id INTEGER,
  p_new_status fulfillment_status,
  p_user_id INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_lat DECIMAL(10,7) DEFAULT NULL,
  p_lng DECIMAL(10,7) DEFAULT NULL
) RETURNS order_fulfillment AS $$
DECLARE
  v_old_status fulfillment_status;
  v_fulfillment order_fulfillment;
BEGIN
  -- Get current status
  SELECT status INTO v_old_status
  FROM order_fulfillment
  WHERE id = p_fulfillment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fulfillment not found: %', p_fulfillment_id;
  END IF;

  -- Update fulfillment
  UPDATE order_fulfillment
  SET
    status = p_new_status,
    status_updated_at = NOW(),
    status_updated_by = p_user_id,
    updated_at = NOW(),
    -- Set delivered_at for delivered status
    delivered_at = CASE
      WHEN p_new_status = 'delivered' THEN NOW()
      ELSE delivered_at
    END,
    -- Set pickup_ready_at for ready status
    pickup_ready_at = CASE
      WHEN p_new_status = 'ready_for_pickup' THEN NOW()
      ELSE pickup_ready_at
    END
  WHERE id = p_fulfillment_id
  RETURNING * INTO v_fulfillment;

  -- Log status change
  INSERT INTO fulfillment_status_history (
    fulfillment_id,
    previous_status,
    new_status,
    changed_by,
    notes,
    location_lat,
    location_lng
  ) VALUES (
    p_fulfillment_id,
    v_old_status,
    p_new_status,
    p_user_id,
    p_notes,
    p_lat,
    p_lng
  );

  RETURN v_fulfillment;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

/**
 * Active delivery options view
 */
CREATE OR REPLACE VIEW v_delivery_options_active AS
SELECT
  do.id,
  do.option_type,
  do.option_name,
  do.description,
  do.base_price,
  do.min_order_amount,
  do.free_threshold,
  do.requires_address,
  do.requires_scheduled_time,
  do.display_order,
  do.icon_name,
  dz.zone_name AS default_zone_name
FROM delivery_options do
LEFT JOIN delivery_zones dz ON do.default_zone_id = dz.id
WHERE do.is_available = TRUE
ORDER BY do.display_order;

/**
 * Pending fulfillments view
 */
CREATE OR REPLACE VIEW v_pending_fulfillments AS
SELECT
  of.id,
  of.transaction_id,
  of.fulfillment_type,
  of.status,
  of.scheduled_date,
  of.scheduled_time_start,
  of.scheduled_time_end,
  of.delivery_address->>'name' AS customer_name,
  of.delivery_address->>'city' AS city,
  of.delivery_address->>'postal_code' AS postal_code,
  of.pickup_code,
  of.pickup_location_id,
  of.delivery_fee,
  of.customer_notes,
  of.created_at,
  t.transaction_number,
  CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
FROM order_fulfillment of
LEFT JOIN transactions t ON of.transaction_id = t.transaction_id
LEFT JOIN users u ON of.created_by = u.id
WHERE of.status IN ('pending', 'processing', 'ready_for_pickup', 'out_for_delivery')
ORDER BY
  of.scheduled_date NULLS LAST,
  of.scheduled_time_start NULLS LAST,
  of.created_at;

/**
 * Today's deliveries view
 */
CREATE OR REPLACE VIEW v_todays_deliveries AS
SELECT
  of.*,
  t.transaction_number,
  t.total_amount AS order_total,
  dz.zone_name
FROM order_fulfillment of
LEFT JOIN transactions t ON of.transaction_id = t.transaction_id
LEFT JOIN delivery_zones dz ON of.delivery_zone_id = dz.id
WHERE of.fulfillment_type IN ('local_delivery', 'shipping')
  AND of.scheduled_date = CURRENT_DATE
  AND of.status NOT IN ('delivered', 'cancelled', 'returned')
ORDER BY of.scheduled_time_start NULLS LAST;

/**
 * Ready for pickup view
 */
CREATE OR REPLACE VIEW v_ready_for_pickup AS
SELECT
  of.id,
  of.transaction_id,
  of.pickup_code,
  of.pickup_ready_at,
  of.pickup_expires_at,
  of.customer_notes,
  of.delivery_address->>'name' AS customer_name,
  of.delivery_address->>'phone' AS customer_phone,
  t.transaction_number,
  t.total_amount,
  EXTRACT(EPOCH FROM (NOW() - of.pickup_ready_at)) / 3600 AS hours_waiting
FROM order_fulfillment of
LEFT JOIN transactions t ON of.transaction_id = t.transaction_id
WHERE of.fulfillment_type IN ('pickup_now', 'pickup_scheduled')
  AND of.status = 'ready_for_pickup'
ORDER BY of.pickup_ready_at;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

/**
 * Auto-generate pickup code for pickup orders
 */
CREATE OR REPLACE FUNCTION trigger_generate_pickup_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fulfillment_type IN ('pickup_now', 'pickup_scheduled')
     AND NEW.pickup_code IS NULL THEN
    NEW.pickup_code := generate_pickup_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_pickup_code ON order_fulfillment;
CREATE TRIGGER trg_generate_pickup_code
  BEFORE INSERT ON order_fulfillment
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_pickup_code();

/**
 * Update timestamp trigger
 */
CREATE OR REPLACE FUNCTION trigger_update_fulfillment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fulfillment_updated ON order_fulfillment;
CREATE TRIGGER trg_fulfillment_updated
  BEFORE UPDATE ON order_fulfillment
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_fulfillment_timestamp();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Default delivery options
INSERT INTO delivery_options (
  option_type, option_name, description, base_price,
  min_order_amount, free_threshold, is_available,
  requires_address, requires_scheduled_time, display_order, icon_name
) VALUES
  (
    'pickup_now',
    'In-Store Pickup (Now)',
    'Pick up your order immediately at the store',
    0.00, NULL, NULL, TRUE, FALSE, FALSE, 1, 'store'
  ),
  (
    'pickup_scheduled',
    'In-Store Pickup (Scheduled)',
    'Schedule a convenient pickup time',
    0.00, NULL, NULL, TRUE, FALSE, TRUE, 2, 'calendar'
  ),
  (
    'local_delivery',
    'Local Delivery',
    'Delivery within our service area',
    9.99, 25.00, 100.00, TRUE, TRUE, TRUE, 3, 'truck'
  ),
  (
    'shipping',
    'Shipping',
    'Ship anywhere in Canada',
    14.99, 25.00, 150.00, TRUE, TRUE, FALSE, 4, 'package'
  )
ON CONFLICT (option_type) DO UPDATE SET
  option_name = EXCLUDED.option_name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Example delivery zones
INSERT INTO delivery_zones (
  zone_name, zone_code, zone_type, base_delivery_fee,
  min_order_for_free, estimated_days_min, estimated_days_max,
  same_day_available, same_day_cutoff, is_active, priority
) VALUES
  (
    'Downtown Core',
    'DT',
    'postal_code',
    5.99,
    75.00,
    0,
    0,
    TRUE,
    '14:00:00',
    TRUE,
    10
  ),
  (
    'Greater Toronto Area',
    'GTA',
    'postal_code',
    9.99,
    100.00,
    0,
    1,
    TRUE,
    '12:00:00',
    TRUE,
    20
  ),
  (
    'Extended Delivery Area',
    'EXT',
    'postal_code',
    14.99,
    150.00,
    1,
    2,
    FALSE,
    NULL,
    TRUE,
    30
  )
ON CONFLICT DO NOTHING;

-- Example postal codes for zones
INSERT INTO delivery_zone_postal_codes (zone_id, postal_code_pattern, is_active)
SELECT id, 'M5V', TRUE FROM delivery_zones WHERE zone_code = 'DT'
ON CONFLICT DO NOTHING;

INSERT INTO delivery_zone_postal_codes (zone_id, postal_code_pattern, is_active)
SELECT id, 'M5H', TRUE FROM delivery_zones WHERE zone_code = 'DT'
ON CONFLICT DO NOTHING;

INSERT INTO delivery_zone_postal_codes (zone_id, postal_code_pattern, is_active)
SELECT id, 'M5G', TRUE FROM delivery_zones WHERE zone_code = 'DT'
ON CONFLICT DO NOTHING;

INSERT INTO delivery_zone_postal_codes (zone_id, postal_code_pattern, is_active)
SELECT id, 'M*', TRUE FROM delivery_zones WHERE zone_code = 'GTA'
ON CONFLICT DO NOTHING;

INSERT INTO delivery_zone_postal_codes (zone_id, postal_code_pattern, is_active)
SELECT id, 'L*', TRUE FROM delivery_zones WHERE zone_code = 'GTA'
ON CONFLICT DO NOTHING;

-- Default shipping carrier (placeholder)
INSERT INTO shipping_carriers (
  carrier_code, carrier_name, is_active,
  rate_markup_percent, rate_markup_flat
) VALUES
  ('canada_post', 'Canada Post', TRUE, 0, 0),
  ('ups', 'UPS', FALSE, 0, 0),
  ('fedex', 'FedEx', FALSE, 0, 0)
ON CONFLICT (carrier_code) DO NOTHING;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant access (adjust based on your role setup)
-- GRANT SELECT, INSERT, UPDATE ON delivery_zones TO pos_user;
-- GRANT SELECT, INSERT, UPDATE ON delivery_zone_postal_codes TO pos_user;
-- GRANT SELECT ON delivery_options TO pos_user;
-- GRANT SELECT, INSERT, UPDATE ON order_fulfillment TO pos_user;
-- GRANT SELECT, INSERT ON fulfillment_status_history TO pos_user;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE delivery_zones IS 'Geographic zones for local delivery with pricing and timing';
COMMENT ON TABLE delivery_zone_postal_codes IS 'Postal code patterns mapped to delivery zones';
COMMENT ON TABLE delivery_options IS 'Available fulfillment options (pickup, delivery, shipping)';
COMMENT ON TABLE order_fulfillment IS 'Fulfillment tracking for orders/transactions';
COMMENT ON TABLE fulfillment_status_history IS 'Audit trail of fulfillment status changes';
COMMENT ON TABLE shipping_carriers IS 'Carrier configuration for shipping options';

COMMENT ON FUNCTION find_delivery_zone_by_postal_code IS 'Find matching delivery zone for a postal code';
COMMENT ON FUNCTION calculate_delivery_fee IS 'Calculate delivery fee with free threshold logic';
COMMENT ON FUNCTION update_fulfillment_status IS 'Update status with automatic history logging';
