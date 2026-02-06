-- ============================================================================
-- Migration 015: Manager Override/Approval System
-- ============================================================================
-- Creates tables for:
-- 1. Override thresholds (configurable rules for when approval is needed)
-- 2. Manager PINs (secure PIN verification for approvals)
-- 3. Override log (complete audit trail of all overrides)
-- ============================================================================

BEGIN;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Override threshold types
DO $$ BEGIN
  CREATE TYPE override_threshold_type AS ENUM (
    'discount_percent',      -- Discount exceeds X% of item/order
    'discount_amount',       -- Discount exceeds $X amount
    'margin_below',          -- Margin falls below X%
    'price_below_cost',      -- Selling below cost
    'price_override',        -- Any manual price change
    'void_transaction',      -- Voiding a completed transaction
    'void_item',             -- Voiding an item from transaction
    'refund_amount',         -- Refund exceeds $X
    'refund_no_receipt',     -- Refund without original receipt
    'drawer_adjustment',     -- Cash drawer adjustment
    'time_punch_edit',       -- Editing employee time punches
    'negative_inventory',    -- Selling into negative inventory
    'custom'                 -- Custom threshold type
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Approval levels (hierarchical)
DO $$ BEGIN
  CREATE TYPE approval_level AS ENUM (
    'shift_lead',    -- Basic supervisory approval
    'manager',       -- Store manager level
    'area_manager',  -- Multi-store manager
    'admin'          -- System administrator
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Override request status
DO $$ BEGIN
  CREATE TYPE override_status AS ENUM (
    'pending',       -- Awaiting approval
    'approved',      -- Approved by authorized user
    'denied',        -- Denied by authorized user
    'expired',       -- Request timed out
    'cancelled'      -- Cancelled by requestor
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TABLE: override_thresholds
-- ============================================================================
-- Configurable rules that determine when manager approval is required

CREATE TABLE IF NOT EXISTS override_thresholds (
  id SERIAL PRIMARY KEY,

  -- Threshold identification
  threshold_type override_threshold_type NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Threshold values (use appropriate field based on type)
  threshold_value DECIMAL(10, 2),           -- For percent or amount thresholds
  threshold_value_cents INTEGER,            -- For amount in cents (precision)

  -- Approval requirements
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approval_level approval_level NOT NULL DEFAULT 'manager',

  -- Allow multiple approvers or just one
  require_reason BOOLEAN NOT NULL DEFAULT FALSE,
  reason_required_length INTEGER DEFAULT 0,  -- Minimum character length for reason

  -- Scope limitations
  applies_to_quotes BOOLEAN NOT NULL DEFAULT TRUE,
  applies_to_pos BOOLEAN NOT NULL DEFAULT TRUE,
  applies_to_online BOOLEAN NOT NULL DEFAULT FALSE,

  -- Time-based rules (optional)
  active_start_time TIME,                   -- Only active during certain hours
  active_end_time TIME,
  active_days INTEGER[],                    -- Array of days (0=Sun, 6=Sat)

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,    -- Higher priority = checked first

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),

  -- Constraints
  CONSTRAINT valid_threshold_value CHECK (
    threshold_value IS NOT NULL OR threshold_value_cents IS NOT NULL
  ),
  CONSTRAINT valid_time_range CHECK (
    (active_start_time IS NULL AND active_end_time IS NULL) OR
    (active_start_time IS NOT NULL AND active_end_time IS NOT NULL)
  )
);

-- Indexes for override_thresholds
CREATE INDEX IF NOT EXISTS idx_override_thresholds_type
  ON override_thresholds(threshold_type);
CREATE INDEX IF NOT EXISTS idx_override_thresholds_active
  ON override_thresholds(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_override_thresholds_level
  ON override_thresholds(approval_level);

-- ============================================================================
-- TABLE: manager_pins
-- ============================================================================
-- Secure PIN storage for manager override authentication

CREATE TABLE IF NOT EXISTS manager_pins (
  id SERIAL PRIMARY KEY,

  -- User reference
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- PIN security
  pin_hash VARCHAR(255) NOT NULL,           -- bcrypt hashed PIN
  pin_salt VARCHAR(255),                    -- Additional salt if needed

  -- Authorization level
  approval_level approval_level NOT NULL DEFAULT 'manager',

  -- Security settings
  max_daily_overrides INTEGER,              -- NULL = unlimited
  override_count_today INTEGER DEFAULT 0,
  last_override_date DATE,

  -- Failed attempt tracking
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  max_failed_attempts INTEGER DEFAULT 3,
  lockout_duration_minutes INTEGER DEFAULT 15,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Validity period
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,     -- NULL = no expiration

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Only one active PIN per user
  CONSTRAINT unique_active_pin_per_user UNIQUE (user_id, is_active)
);

-- Indexes for manager_pins
CREATE INDEX IF NOT EXISTS idx_manager_pins_user
  ON manager_pins(user_id);
CREATE INDEX IF NOT EXISTS idx_manager_pins_active
  ON manager_pins(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_manager_pins_level
  ON manager_pins(approval_level);
CREATE INDEX IF NOT EXISTS idx_manager_pins_locked
  ON manager_pins(locked_until) WHERE locked_until IS NOT NULL;

-- ============================================================================
-- TABLE: override_requests
-- ============================================================================
-- Pending override requests awaiting approval

CREATE TABLE IF NOT EXISTS override_requests (
  id SERIAL PRIMARY KEY,

  -- Request identification
  request_code VARCHAR(20) UNIQUE NOT NULL,  -- Short code for verbal communication

  -- What triggered the request
  threshold_id INTEGER REFERENCES override_thresholds(id),
  override_type override_threshold_type NOT NULL,

  -- Context
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  quotation_id INTEGER REFERENCES quotations(quotation_id),
  shift_id INTEGER REFERENCES shifts(id),
  register_id INTEGER,

  -- Requesting user
  requested_by INTEGER NOT NULL REFERENCES users(id),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Values
  original_value DECIMAL(12, 4),
  requested_value DECIMAL(12, 4),
  difference_value DECIMAL(12, 4),
  difference_percent DECIMAL(8, 4),

  -- Item context (if item-level override)
  item_id INTEGER,
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(255),
  quantity INTEGER,

  -- Request details
  reason TEXT,
  notes TEXT,

  -- Status
  status override_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE,       -- Auto-expire pending requests

  -- Resolution
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_reason TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_context CHECK (
    transaction_id IS NOT NULL OR quotation_id IS NOT NULL OR
    override_type IN ('drawer_adjustment', 'time_punch_edit')
  )
);

-- Indexes for override_requests
CREATE INDEX IF NOT EXISTS idx_override_requests_status
  ON override_requests(status);
CREATE INDEX IF NOT EXISTS idx_override_requests_pending
  ON override_requests(status, requested_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_override_requests_transaction
  ON override_requests(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_override_requests_quotation
  ON override_requests(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_override_requests_requested_by
  ON override_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_override_requests_code
  ON override_requests(request_code);
CREATE INDEX IF NOT EXISTS idx_override_requests_expires
  ON override_requests(expires_at) WHERE status = 'pending';

-- ============================================================================
-- TABLE: override_log
-- ============================================================================
-- Complete audit trail of all override actions (approved or denied)

CREATE TABLE IF NOT EXISTS override_log (
  id SERIAL PRIMARY KEY,

  -- Reference to request (if from request flow)
  request_id INTEGER REFERENCES override_requests(id),

  -- Override identification
  override_type override_threshold_type NOT NULL,
  threshold_id INTEGER REFERENCES override_thresholds(id),

  -- Context references
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  quotation_id INTEGER REFERENCES quotations(quotation_id),
  shift_id INTEGER REFERENCES shifts(id),
  register_id INTEGER,

  -- Who was involved
  cashier_id INTEGER REFERENCES users(id),        -- Who initiated the action
  approved_by INTEGER NOT NULL REFERENCES users(id), -- Who approved/denied
  approval_level approval_level NOT NULL,

  -- Values
  original_value DECIMAL(12, 4),
  override_value DECIMAL(12, 4),
  difference_value DECIMAL(12, 4),
  difference_percent DECIMAL(8, 4),

  -- Item details (if item-level)
  item_id INTEGER,
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(255),
  quantity INTEGER,

  -- Override details
  reason TEXT,
  notes TEXT,

  -- Outcome
  was_approved BOOLEAN NOT NULL,
  denial_reason TEXT,

  -- Timing
  requested_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Verification method
  verification_method VARCHAR(50) DEFAULT 'pin',  -- 'pin', 'password', 'biometric', 'remote'

  -- Additional audit fields
  ip_address INET,
  user_agent TEXT,
  device_id VARCHAR(100),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Store snapshot of threshold at time of override
  threshold_snapshot JSONB
);

-- Indexes for override_log
CREATE INDEX IF NOT EXISTS idx_override_log_type
  ON override_log(override_type);
CREATE INDEX IF NOT EXISTS idx_override_log_approved_by
  ON override_log(approved_by);
CREATE INDEX IF NOT EXISTS idx_override_log_approved_at
  ON override_log(approved_at);
CREATE INDEX IF NOT EXISTS idx_override_log_transaction
  ON override_log(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_override_log_quotation
  ON override_log(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_override_log_cashier
  ON override_log(cashier_id) WHERE cashier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_override_log_date
  ON override_log(DATE(approved_at));
CREATE INDEX IF NOT EXISTS idx_override_log_outcome
  ON override_log(was_approved);

-- Composite index for audit reports
CREATE INDEX IF NOT EXISTS idx_override_log_audit
  ON override_log(approved_at, override_type, was_approved);

-- ============================================================================
-- TABLE: override_threshold_exceptions
-- ============================================================================
-- Exceptions to thresholds (e.g., specific products, customers, or users)

CREATE TABLE IF NOT EXISTS override_threshold_exceptions (
  id SERIAL PRIMARY KEY,

  threshold_id INTEGER NOT NULL REFERENCES override_thresholds(id) ON DELETE CASCADE,

  -- Exception type
  exception_type VARCHAR(50) NOT NULL,  -- 'product', 'category', 'customer', 'customer_tier', 'user'

  -- Reference values (use appropriate field)
  product_id INTEGER REFERENCES products(id),
  category_name VARCHAR(100),
  customer_id INTEGER REFERENCES customers(id),
  customer_tier VARCHAR(50),
  user_id INTEGER REFERENCES users(id),

  -- Override the threshold for this exception
  override_threshold_value DECIMAL(10, 2),
  override_requires_approval BOOLEAN,
  override_approval_level approval_level,

  -- Or completely exempt
  is_exempt BOOLEAN DEFAULT FALSE,

  -- Validity
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  reason TEXT,

  -- Constraints
  CONSTRAINT valid_exception_reference CHECK (
    (exception_type = 'product' AND product_id IS NOT NULL) OR
    (exception_type = 'category' AND category_name IS NOT NULL) OR
    (exception_type = 'customer' AND customer_id IS NOT NULL) OR
    (exception_type = 'customer_tier' AND customer_tier IS NOT NULL) OR
    (exception_type = 'user' AND user_id IS NOT NULL)
  )
);

-- Indexes for exceptions
CREATE INDEX IF NOT EXISTS idx_override_exceptions_threshold
  ON override_threshold_exceptions(threshold_id);
CREATE INDEX IF NOT EXISTS idx_override_exceptions_active
  ON override_threshold_exceptions(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate unique request code
CREATE OR REPLACE FUNCTION generate_override_request_code()
RETURNS VARCHAR(20) AS $$
DECLARE
  new_code VARCHAR(20);
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 6-character alphanumeric code
    new_code := 'OVR-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 6));

    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM override_requests WHERE request_code = new_code) INTO code_exists;

    EXIT WHEN NOT code_exists;
  END LOOP;

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Function to check if override is required
CREATE OR REPLACE FUNCTION check_override_required(
  p_override_type override_threshold_type,
  p_value DECIMAL,
  p_context VARCHAR DEFAULT 'pos'
) RETURNS TABLE (
  requires_override BOOLEAN,
  threshold_id INTEGER,
  required_level approval_level,
  threshold_name VARCHAR,
  threshold_value DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE as requires_override,
    ot.id as threshold_id,
    ot.approval_level as required_level,
    ot.name as threshold_name,
    COALESCE(ot.threshold_value, ot.threshold_value_cents / 100.0) as threshold_value
  FROM override_thresholds ot
  WHERE ot.threshold_type = p_override_type
    AND ot.is_active = TRUE
    AND ot.requires_approval = TRUE
    AND (
      (p_context = 'pos' AND ot.applies_to_pos = TRUE) OR
      (p_context = 'quote' AND ot.applies_to_quotes = TRUE) OR
      (p_context = 'online' AND ot.applies_to_online = TRUE)
    )
    AND (
      (p_override_type IN ('discount_percent', 'margin_below') AND p_value > ot.threshold_value) OR
      (p_override_type IN ('discount_amount', 'refund_amount') AND p_value > COALESCE(ot.threshold_value, ot.threshold_value_cents / 100.0)) OR
      (p_override_type IN ('price_below_cost', 'negative_inventory') AND TRUE) OR
      (p_override_type IN ('void_transaction', 'void_item', 'refund_no_receipt', 'drawer_adjustment', 'time_punch_edit', 'price_override') AND TRUE)
    )
    AND (
      ot.active_start_time IS NULL OR
      (CURRENT_TIME BETWEEN ot.active_start_time AND ot.active_end_time)
    )
    AND (
      ot.active_days IS NULL OR
      EXTRACT(DOW FROM CURRENT_DATE)::INTEGER = ANY(ot.active_days)
    )
  ORDER BY ot.priority DESC, ot.approval_level DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to verify manager PIN
CREATE OR REPLACE FUNCTION verify_manager_pin(
  p_user_id INTEGER,
  p_pin_hash VARCHAR,
  p_required_level approval_level DEFAULT 'manager'
) RETURNS TABLE (
  is_valid BOOLEAN,
  error_message VARCHAR,
  approval_level approval_level,
  remaining_overrides INTEGER
) AS $$
DECLARE
  v_pin_record RECORD;
  v_level_rank INTEGER;
  v_required_rank INTEGER;
BEGIN
  -- Get rank of approval levels
  SELECT CASE p_required_level
    WHEN 'shift_lead' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'area_manager' THEN 3
    WHEN 'admin' THEN 4
  END INTO v_required_rank;

  -- Get the PIN record
  SELECT * INTO v_pin_record
  FROM manager_pins
  WHERE user_id = p_user_id AND is_active = TRUE;

  -- Check if PIN exists
  IF v_pin_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No active PIN found for user'::VARCHAR, NULL::approval_level, NULL::INTEGER;
    RETURN;
  END IF;

  -- Check if locked out
  IF v_pin_record.locked_until IS NOT NULL AND v_pin_record.locked_until > NOW() THEN
    RETURN QUERY SELECT FALSE,
      ('Account locked until ' || TO_CHAR(v_pin_record.locked_until, 'HH24:MI'))::VARCHAR,
      NULL::approval_level, NULL::INTEGER;
    RETURN;
  END IF;

  -- Check validity period
  IF v_pin_record.valid_until IS NOT NULL AND v_pin_record.valid_until < NOW() THEN
    RETURN QUERY SELECT FALSE, 'PIN has expired'::VARCHAR, NULL::approval_level, NULL::INTEGER;
    RETURN;
  END IF;

  -- Verify PIN hash (actual verification done in application layer)
  IF v_pin_record.pin_hash != p_pin_hash THEN
    -- Increment failed attempts
    UPDATE manager_pins
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE
          WHEN failed_attempts + 1 >= max_failed_attempts
          THEN NOW() + (lockout_duration_minutes || ' minutes')::INTERVAL
          ELSE NULL
        END,
        updated_at = NOW()
    WHERE id = v_pin_record.id;

    RETURN QUERY SELECT FALSE, 'Invalid PIN'::VARCHAR, NULL::approval_level, NULL::INTEGER;
    RETURN;
  END IF;

  -- Get level rank
  SELECT CASE v_pin_record.approval_level
    WHEN 'shift_lead' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'area_manager' THEN 3
    WHEN 'admin' THEN 4
  END INTO v_level_rank;

  -- Check authorization level
  IF v_level_rank < v_required_rank THEN
    RETURN QUERY SELECT FALSE,
      ('Requires ' || p_required_level || ' level or higher')::VARCHAR,
      v_pin_record.approval_level, NULL::INTEGER;
    RETURN;
  END IF;

  -- Check daily override limit
  IF v_pin_record.max_daily_overrides IS NOT NULL THEN
    IF v_pin_record.last_override_date = CURRENT_DATE AND
       v_pin_record.override_count_today >= v_pin_record.max_daily_overrides THEN
      RETURN QUERY SELECT FALSE, 'Daily override limit reached'::VARCHAR,
        v_pin_record.approval_level, 0::INTEGER;
      RETURN;
    END IF;
  END IF;

  -- Reset failed attempts and update last used
  UPDATE manager_pins
  SET failed_attempts = 0,
      locked_until = NULL,
      last_used_at = NOW(),
      override_count_today = CASE
        WHEN last_override_date = CURRENT_DATE THEN override_count_today + 1
        ELSE 1
      END,
      last_override_date = CURRENT_DATE,
      updated_at = NOW()
  WHERE id = v_pin_record.id;

  -- Return success
  RETURN QUERY SELECT TRUE, NULL::VARCHAR, v_pin_record.approval_level,
    CASE
      WHEN v_pin_record.max_daily_overrides IS NULL THEN NULL::INTEGER
      ELSE v_pin_record.max_daily_overrides - COALESCE(
        CASE WHEN v_pin_record.last_override_date = CURRENT_DATE
          THEN v_pin_record.override_count_today + 1
          ELSE 1
        END, 0)
    END;
END;
$$ LANGUAGE plpgsql;

-- Function to log an override
CREATE OR REPLACE FUNCTION log_override(
  p_override_type override_threshold_type,
  p_threshold_id INTEGER,
  p_transaction_id INTEGER,
  p_quotation_id INTEGER,
  p_cashier_id INTEGER,
  p_approved_by INTEGER,
  p_original_value DECIMAL,
  p_override_value DECIMAL,
  p_was_approved BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_request_id INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_log_id INTEGER;
  v_approval_level approval_level;
  v_threshold_snapshot JSONB;
BEGIN
  -- Get approval level
  SELECT mp.approval_level INTO v_approval_level
  FROM manager_pins mp
  WHERE mp.user_id = p_approved_by AND mp.is_active = TRUE;

  -- Get threshold snapshot
  IF p_threshold_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', id,
      'name', name,
      'threshold_type', threshold_type,
      'threshold_value', threshold_value,
      'approval_level', approval_level
    ) INTO v_threshold_snapshot
    FROM override_thresholds
    WHERE id = p_threshold_id;
  END IF;

  -- Insert log entry
  INSERT INTO override_log (
    request_id,
    override_type,
    threshold_id,
    transaction_id,
    quotation_id,
    cashier_id,
    approved_by,
    approval_level,
    original_value,
    override_value,
    difference_value,
    difference_percent,
    reason,
    was_approved,
    threshold_snapshot
  ) VALUES (
    p_request_id,
    p_override_type,
    p_threshold_id,
    p_transaction_id,
    p_quotation_id,
    p_cashier_id,
    p_approved_by,
    COALESCE(v_approval_level, 'manager'),
    p_original_value,
    p_override_value,
    p_override_value - p_original_value,
    CASE WHEN p_original_value != 0
      THEN ((p_override_value - p_original_value) / p_original_value * 100)
      ELSE NULL
    END,
    p_reason,
    p_was_approved,
    v_threshold_snapshot
  )
  RETURNING id INTO v_log_id;

  -- Update request if provided
  IF p_request_id IS NOT NULL THEN
    UPDATE override_requests
    SET status = CASE WHEN p_was_approved THEN 'approved' ELSE 'denied' END,
        resolved_by = p_approved_by,
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;
  END IF;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-generate request code
CREATE OR REPLACE FUNCTION trigger_generate_request_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.request_code IS NULL THEN
    NEW.request_code := generate_override_request_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_override_request_code ON override_requests;
CREATE TRIGGER trg_override_request_code
  BEFORE INSERT ON override_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_request_code();

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION trigger_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_override_thresholds_updated ON override_thresholds;
CREATE TRIGGER trg_override_thresholds_updated
  BEFORE UPDATE ON override_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_timestamp();

DROP TRIGGER IF EXISTS trg_manager_pins_updated ON manager_pins;
CREATE TRIGGER trg_manager_pins_updated
  BEFORE UPDATE ON manager_pins
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_timestamp();

DROP TRIGGER IF EXISTS trg_override_requests_updated ON override_requests;
CREATE TRIGGER trg_override_requests_updated
  BEFORE UPDATE ON override_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_timestamp();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active thresholds view
CREATE OR REPLACE VIEW v_active_override_thresholds AS
SELECT
  id,
  threshold_type,
  name,
  description,
  COALESCE(threshold_value, threshold_value_cents / 100.0) as threshold_value,
  requires_approval,
  approval_level,
  require_reason,
  applies_to_pos,
  applies_to_quotes
FROM override_thresholds
WHERE is_active = TRUE
ORDER BY priority DESC, threshold_type;

-- Pending overrides view
CREATE OR REPLACE VIEW v_pending_overrides AS
SELECT
  r.id,
  r.request_code,
  r.override_type,
  r.original_value,
  r.requested_value,
  r.reason,
  r.requested_at,
  r.expires_at,
  u.name as requested_by_name,
  t.transaction_number,
  q.quotation_number,
  ot.approval_level as required_level
FROM override_requests r
LEFT JOIN users u ON r.requested_by = u.id
LEFT JOIN transactions t ON r.transaction_id = t.transaction_id
LEFT JOIN quotations q ON r.quotation_id = q.quotation_id
LEFT JOIN override_thresholds ot ON r.threshold_id = ot.id
WHERE r.status = 'pending'
  AND (r.expires_at IS NULL OR r.expires_at > NOW())
ORDER BY r.requested_at ASC;

-- Override audit summary view
CREATE OR REPLACE VIEW v_override_audit_summary AS
SELECT
  DATE(ol.approved_at) as date,
  ol.override_type,
  COUNT(*) as total_overrides,
  SUM(CASE WHEN ol.was_approved THEN 1 ELSE 0 END) as approved_count,
  SUM(CASE WHEN NOT ol.was_approved THEN 1 ELSE 0 END) as denied_count,
  ROUND(AVG(ABS(ol.difference_value))::NUMERIC, 2) as avg_difference,
  ROUND(SUM(ABS(ol.difference_value))::NUMERIC, 2) as total_difference
FROM override_log ol
GROUP BY DATE(ol.approved_at), ol.override_type
ORDER BY date DESC, total_overrides DESC;

-- Manager activity view
CREATE OR REPLACE VIEW v_manager_override_activity AS
SELECT
  u.id as user_id,
  u.name as manager_name,
  mp.approval_level,
  COUNT(ol.id) as total_overrides,
  SUM(CASE WHEN ol.was_approved THEN 1 ELSE 0 END) as approvals,
  SUM(CASE WHEN NOT ol.was_approved THEN 1 ELSE 0 END) as denials,
  ROUND(AVG(ABS(ol.difference_value))::NUMERIC, 2) as avg_override_value,
  MAX(ol.approved_at) as last_override_at
FROM users u
JOIN manager_pins mp ON u.id = mp.user_id AND mp.is_active = TRUE
LEFT JOIN override_log ol ON u.id = ol.approved_by
GROUP BY u.id, u.name, mp.approval_level
ORDER BY total_overrides DESC;

-- ============================================================================
-- SEED DATA: Default Thresholds
-- ============================================================================

INSERT INTO override_thresholds (threshold_type, name, description, threshold_value, requires_approval, approval_level, require_reason, applies_to_pos, applies_to_quotes)
VALUES
  -- Discount thresholds
  ('discount_percent', 'High Discount Percentage', 'Discount exceeds 15% of item or order value', 15.00, TRUE, 'manager', TRUE, TRUE, TRUE),
  ('discount_percent', 'Very High Discount', 'Discount exceeds 25% - requires area manager', 25.00, TRUE, 'area_manager', TRUE, TRUE, TRUE),
  ('discount_amount', 'Large Dollar Discount', 'Discount exceeds $50', 50.00, TRUE, 'manager', TRUE, TRUE, TRUE),
  ('discount_amount', 'Very Large Discount', 'Discount exceeds $200', 200.00, TRUE, 'area_manager', TRUE, TRUE, TRUE),

  -- Margin thresholds
  ('margin_below', 'Low Margin Sale', 'Sale margin falls below 10%', 10.00, TRUE, 'manager', TRUE, TRUE, TRUE),
  ('margin_below', 'Zero Margin Sale', 'Sale at or below cost', 0.00, TRUE, 'area_manager', TRUE, TRUE, TRUE),

  -- Price overrides
  ('price_below_cost', 'Below Cost Sale', 'Selling item below cost', 0, TRUE, 'area_manager', TRUE, TRUE, TRUE),
  ('price_override', 'Manual Price Change', 'Any manual price override', 0, TRUE, 'shift_lead', FALSE, TRUE, FALSE),

  -- Void/Refund thresholds
  ('void_transaction', 'Void Transaction', 'Voiding a completed transaction', 0, TRUE, 'manager', TRUE, TRUE, FALSE),
  ('void_item', 'Void Item', 'Voiding item from transaction', 0, TRUE, 'shift_lead', FALSE, TRUE, FALSE),
  ('refund_amount', 'Large Refund', 'Refund exceeds $100', 100.00, TRUE, 'manager', TRUE, TRUE, FALSE),
  ('refund_no_receipt', 'No Receipt Refund', 'Processing refund without original receipt', 0, TRUE, 'manager', TRUE, TRUE, FALSE),

  -- Cash management
  ('drawer_adjustment', 'Drawer Adjustment', 'Manual cash drawer adjustment', 0, TRUE, 'manager', TRUE, TRUE, FALSE),

  -- Inventory
  ('negative_inventory', 'Negative Inventory Sale', 'Selling item with negative inventory', 0, TRUE, 'shift_lead', FALSE, TRUE, FALSE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE override_thresholds IS 'Configurable rules that determine when manager approval is required for actions';
COMMENT ON TABLE manager_pins IS 'Secure PIN storage for manager override authentication with lockout protection';
COMMENT ON TABLE override_requests IS 'Pending override requests awaiting manager approval';
COMMENT ON TABLE override_log IS 'Complete audit trail of all override actions for compliance and review';
COMMENT ON TABLE override_threshold_exceptions IS 'Exceptions to thresholds for specific products, customers, or users';

COMMENT ON FUNCTION check_override_required IS 'Check if an action requires manager override based on configured thresholds';
COMMENT ON FUNCTION verify_manager_pin IS 'Verify manager PIN and check authorization level with lockout protection';
COMMENT ON FUNCTION log_override IS 'Record an override action in the audit log';

COMMIT;
