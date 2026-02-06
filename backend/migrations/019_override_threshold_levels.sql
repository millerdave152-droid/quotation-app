-- Migration 019: Override Threshold Levels
-- Extends manager override system with:
-- 1. Category-specific thresholds
-- 2. Time-limited rules (valid_from/valid_to)
-- 3. Multi-level approval tiers (shift_lead, manager, admin with different limits)
-- Preserves all existing threshold data

BEGIN;

-- ============================================================================
-- 1. ADD CATEGORY SUPPORT TO OVERRIDE_THRESHOLDS
-- ============================================================================

-- Add category_id column (nullable - null means applies to all categories)
ALTER TABLE override_thresholds
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- Add index for category lookups
CREATE INDEX IF NOT EXISTS idx_override_thresholds_category
ON override_thresholds(category_id) WHERE category_id IS NOT NULL;

-- ============================================================================
-- 2. ADD TIME-LIMITED RULE SUPPORT
-- ============================================================================

-- valid_from/valid_to define when a rule is valid (e.g., sale events)
-- Different from active_start_time/active_end_time which are time-of-day restrictions
ALTER TABLE override_thresholds
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITH TIME ZONE;

-- Add index for time-limited rule lookups
CREATE INDEX IF NOT EXISTS idx_override_thresholds_validity
ON override_thresholds(valid_from, valid_to)
WHERE valid_from IS NOT NULL OR valid_to IS NOT NULL;

-- Add constraint to ensure valid_from < valid_to when both are set
ALTER TABLE override_thresholds
ADD CONSTRAINT check_valid_date_range
CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to);

-- ============================================================================
-- 3. CREATE THRESHOLD APPROVAL LEVELS TABLE
-- ============================================================================

-- This table defines what each approval level can approve for each threshold
-- Example: For a "discount_percent" threshold:
--   shift_lead can approve up to 20%
--   manager can approve up to 40%
--   area_manager can approve up to 60%
--   admin has unlimited approval

CREATE TABLE IF NOT EXISTS threshold_approval_levels (
  id SERIAL PRIMARY KEY,
  threshold_id INTEGER NOT NULL REFERENCES override_thresholds(id) ON DELETE CASCADE,
  approval_level approval_level NOT NULL,
  max_value DECIMAL(10, 2) NOT NULL,
  max_value_cents INTEGER, -- For monetary thresholds
  description TEXT,
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE, -- True for admin level typically
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each threshold can only have one entry per approval level
  CONSTRAINT unique_threshold_approval_level UNIQUE (threshold_id, approval_level),

  -- max_value must be positive unless unlimited
  CONSTRAINT check_max_value_positive CHECK (is_unlimited = TRUE OR max_value > 0)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_threshold_approval_levels_threshold
ON threshold_approval_levels(threshold_id);

CREATE INDEX IF NOT EXISTS idx_threshold_approval_levels_level
ON threshold_approval_levels(approval_level);

-- ============================================================================
-- 4. ADD TRIGGER FOR UPDATED_AT ON NEW TABLE
-- ============================================================================

-- Trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_threshold_approval_levels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_threshold_approval_levels_updated_at ON threshold_approval_levels;
CREATE TRIGGER trigger_threshold_approval_levels_updated_at
BEFORE UPDATE ON threshold_approval_levels
FOR EACH ROW
EXECUTE FUNCTION update_threshold_approval_levels_updated_at();

-- ============================================================================
-- 5. SEED DEFAULT APPROVAL LEVELS FOR EXISTING THRESHOLDS
-- ============================================================================

-- Create default tiered approval levels for existing discount thresholds
-- This preserves existing behavior while enabling the new tiered system

INSERT INTO threshold_approval_levels (threshold_id, approval_level, max_value, description, is_unlimited)
SELECT
  ot.id,
  'shift_lead'::approval_level,
  CASE
    WHEN ot.threshold_type = 'discount_percent' THEN 15.00
    WHEN ot.threshold_type = 'discount_amount' THEN 50.00
    WHEN ot.threshold_type = 'price_override' THEN 10.00
    ELSE 10.00
  END,
  'Shift lead approval limit',
  FALSE
FROM override_thresholds ot
WHERE ot.is_active = TRUE
  AND ot.requires_approval = TRUE
ON CONFLICT (threshold_id, approval_level) DO NOTHING;

INSERT INTO threshold_approval_levels (threshold_id, approval_level, max_value, description, is_unlimited)
SELECT
  ot.id,
  'manager'::approval_level,
  CASE
    WHEN ot.threshold_type = 'discount_percent' THEN 35.00
    WHEN ot.threshold_type = 'discount_amount' THEN 200.00
    WHEN ot.threshold_type = 'price_override' THEN 25.00
    ELSE 25.00
  END,
  'Manager approval limit',
  FALSE
FROM override_thresholds ot
WHERE ot.is_active = TRUE
  AND ot.requires_approval = TRUE
ON CONFLICT (threshold_id, approval_level) DO NOTHING;

INSERT INTO threshold_approval_levels (threshold_id, approval_level, max_value, description, is_unlimited)
SELECT
  ot.id,
  'area_manager'::approval_level,
  CASE
    WHEN ot.threshold_type = 'discount_percent' THEN 50.00
    WHEN ot.threshold_type = 'discount_amount' THEN 500.00
    WHEN ot.threshold_type = 'price_override' THEN 40.00
    ELSE 40.00
  END,
  'Area manager approval limit',
  FALSE
FROM override_thresholds ot
WHERE ot.is_active = TRUE
  AND ot.requires_approval = TRUE
ON CONFLICT (threshold_id, approval_level) DO NOTHING;

INSERT INTO threshold_approval_levels (threshold_id, approval_level, max_value, description, is_unlimited)
SELECT
  ot.id,
  'admin'::approval_level,
  999999.99, -- Placeholder value, is_unlimited takes precedence
  'Admin has unlimited approval',
  TRUE
FROM override_thresholds ot
WHERE ot.is_active = TRUE
  AND ot.requires_approval = TRUE
ON CONFLICT (threshold_id, approval_level) DO NOTHING;

-- ============================================================================
-- 6. CREATE VIEW FOR THRESHOLD CONFIGURATION WITH LEVELS
-- ============================================================================

CREATE OR REPLACE VIEW override_threshold_config AS
SELECT
  ot.id,
  ot.threshold_type,
  ot.name,
  ot.description,
  ot.threshold_value,
  ot.threshold_value_cents,
  ot.requires_approval,
  ot.approval_level AS default_approval_level,
  ot.require_reason,
  ot.applies_to_quotes,
  ot.applies_to_pos,
  ot.applies_to_online,
  ot.category_id,
  c.name AS category_name,
  ot.valid_from,
  ot.valid_to,
  ot.active_start_time,
  ot.active_end_time,
  ot.active_days,
  ot.is_active,
  ot.priority,
  -- Aggregate approval levels as JSON array
  COALESCE(
    json_agg(
      json_build_object(
        'level', tal.approval_level,
        'max_value', tal.max_value,
        'max_value_cents', tal.max_value_cents,
        'is_unlimited', tal.is_unlimited,
        'description', tal.description
      )
      ORDER BY
        CASE tal.approval_level
          WHEN 'shift_lead' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'area_manager' THEN 3
          WHEN 'admin' THEN 4
        END
    ) FILTER (WHERE tal.id IS NOT NULL),
    '[]'::json
  ) AS approval_levels
FROM override_thresholds ot
LEFT JOIN categories c ON c.id = ot.category_id
LEFT JOIN threshold_approval_levels tal ON tal.threshold_id = ot.id
GROUP BY
  ot.id, ot.threshold_type, ot.name, ot.description,
  ot.threshold_value, ot.threshold_value_cents, ot.requires_approval,
  ot.approval_level, ot.require_reason, ot.applies_to_quotes,
  ot.applies_to_pos, ot.applies_to_online, ot.category_id,
  c.name, ot.valid_from, ot.valid_to, ot.active_start_time,
  ot.active_end_time, ot.active_days, ot.is_active, ot.priority;

-- ============================================================================
-- 7. HELPER FUNCTION TO GET REQUIRED APPROVAL LEVEL
-- ============================================================================

-- Function to determine what approval level is needed for a given value
CREATE OR REPLACE FUNCTION get_required_approval_level(
  p_threshold_id INTEGER,
  p_value DECIMAL(10, 2)
)
RETURNS approval_level AS $$
DECLARE
  v_level approval_level;
BEGIN
  -- Find the lowest approval level that can approve this value
  SELECT tal.approval_level INTO v_level
  FROM threshold_approval_levels tal
  WHERE tal.threshold_id = p_threshold_id
    AND (tal.is_unlimited = TRUE OR tal.max_value >= p_value)
  ORDER BY
    CASE tal.approval_level
      WHEN 'shift_lead' THEN 1
      WHEN 'manager' THEN 2
      WHEN 'area_manager' THEN 3
      WHEN 'admin' THEN 4
    END
  LIMIT 1;

  -- Default to admin if no matching level found
  RETURN COALESCE(v_level, 'admin'::approval_level);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FUNCTION TO CHECK IF USER CAN APPROVE
-- ============================================================================

CREATE OR REPLACE FUNCTION can_user_approve_override(
  p_user_approval_level approval_level,
  p_threshold_id INTEGER,
  p_value DECIMAL(10, 2)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_max_value DECIMAL(10, 2);
  v_is_unlimited BOOLEAN;
BEGIN
  -- Get the user's max approval value for this threshold
  SELECT tal.max_value, tal.is_unlimited
  INTO v_user_max_value, v_is_unlimited
  FROM threshold_approval_levels tal
  WHERE tal.threshold_id = p_threshold_id
    AND tal.approval_level = p_user_approval_level;

  -- If no entry found, user cannot approve
  IF v_user_max_value IS NULL AND v_is_unlimited IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Unlimited approval
  IF v_is_unlimited = TRUE THEN
    RETURN TRUE;
  END IF;

  -- Check if value is within user's limit
  RETURN p_value <= v_user_max_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN override_thresholds.category_id IS
'Category-specific threshold. NULL means applies to all categories.';

COMMENT ON COLUMN override_thresholds.valid_from IS
'Start date for time-limited rules (e.g., sale events). NULL means no start restriction.';

COMMENT ON COLUMN override_thresholds.valid_to IS
'End date for time-limited rules. NULL means no end restriction.';

COMMENT ON TABLE threshold_approval_levels IS
'Defines approval limits for each level per threshold. Enables tiered approval where shift_lead can approve small discounts, manager can approve medium, admin unlimited.';

COMMENT ON FUNCTION get_required_approval_level IS
'Returns the minimum approval level required to approve a given value for a threshold.';

COMMENT ON FUNCTION can_user_approve_override IS
'Checks if a user with given approval level can approve a specific value for a threshold.';

-- ============================================================================
-- 10. CREATE AUDIT LOG TABLE FOR ADMIN CHANGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_rule_audit_log (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES override_thresholds(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- create, update, delete, bulk_update, duplicate
  changes JSONB NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_approval_rule_audit_log_rule
ON approval_rule_audit_log(rule_id);

CREATE INDEX IF NOT EXISTS idx_approval_rule_audit_log_admin
ON approval_rule_audit_log(admin_id);

CREATE INDEX IF NOT EXISTS idx_approval_rule_audit_log_created
ON approval_rule_audit_log(created_at DESC);

COMMENT ON TABLE approval_rule_audit_log IS
'Audit log for all changes to approval rules. Tracks who made changes, when, and what was changed.';

COMMIT;
