-- TeleTime POS - Customer Signature System
-- Migration: 029_customer_signatures.sql
-- Description: Schema for capturing and storing customer signatures
-- Use Cases: Delivery confirmation, high-value purchases, trade-in acceptance, financing agreements

-- ============================================================================
-- 1. SIGNATURES TABLE - Core signature storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS signatures (
  id SERIAL PRIMARY KEY,

  -- Reference to order/transaction (nullable for flexibility)
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  transaction_id INTEGER REFERENCES transactions(transaction_id) ON DELETE SET NULL,

  -- Signature type determines the use case
  signature_type VARCHAR(30) NOT NULL CHECK (
    signature_type IN ('delivery', 'purchase', 'trade_in', 'financing', 'refund', 'other')
  ),

  -- Related entity references (depends on signature_type)
  trade_in_assessment_id INTEGER REFERENCES trade_in_assessments(id) ON DELETE SET NULL,
  financing_application_id INTEGER REFERENCES financing_applications(id) ON DELETE SET NULL,

  -- Signature data
  -- NOTE: For cloud storage migration, change signature_data to signature_url VARCHAR(500)
  -- and store the base64 data in S3/GCS bucket instead
  signature_data TEXT NOT NULL, -- Base64 encoded SVG or PNG
  signature_format VARCHAR(10) DEFAULT 'svg' CHECK (signature_format IN ('svg', 'png', 'jpeg')),

  -- Signer information
  signer_name VARCHAR(255) NOT NULL, -- Printed/typed name
  signer_email VARCHAR(255), -- Optional email for verification
  signer_phone VARCHAR(50), -- Optional phone for verification

  -- Legal/terms acknowledgment
  terms_version VARCHAR(50), -- Version of terms accepted (e.g., "v2024.1")
  terms_accepted BOOLEAN DEFAULT TRUE,
  legal_text TEXT, -- Snapshot of legal text shown at signing time

  -- Capture metadata
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  captured_by INTEGER NOT NULL REFERENCES users(id),

  -- Audit trail
  ip_address INET,
  device_info JSONB, -- User agent, device type, screen size, etc.
  geolocation JSONB, -- Optional: lat/lng if captured

  -- Status and verification
  status VARCHAR(20) DEFAULT 'valid' CHECK (status IN ('valid', 'voided', 'superseded')),
  voided_at TIMESTAMP WITH TIME ZONE,
  voided_by INTEGER REFERENCES users(id),
  voided_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE signatures IS 'Customer signatures for various acknowledgments and confirmations';
COMMENT ON COLUMN signatures.signature_data IS 'Base64 encoded signature image. NOTE: For scale, migrate to cloud storage URL';
COMMENT ON COLUMN signatures.signature_type IS 'Type: delivery (confirmation), purchase (high-value), trade_in (acceptance), financing (agreement)';
COMMENT ON COLUMN signatures.signer_name IS 'Printed/typed name of the signer for verification';
COMMENT ON COLUMN signatures.terms_version IS 'Version identifier of the terms/agreement signed';
COMMENT ON COLUMN signatures.legal_text IS 'Snapshot of exact legal text shown to customer at time of signing';
COMMENT ON COLUMN signatures.device_info IS 'JSON with user agent, device type, touch/mouse, screen dimensions';

-- ============================================================================
-- 2. SIGNATURE REQUIREMENTS TABLE - When to require signatures
-- ============================================================================

CREATE TABLE IF NOT EXISTS signature_requirements (
  id SERIAL PRIMARY KEY,

  -- Requirement type
  requirement_type VARCHAR(30) NOT NULL CHECK (
    requirement_type IN (
      'delivery',         -- All deliveries require signature
      'value_threshold',  -- Orders above a certain value
      'category',         -- Specific product categories
      'trade_in',         -- All trade-ins
      'financing',        -- All financing agreements
      'refund',           -- All refunds above threshold
      'custom'            -- Custom rules
    )
  ),

  -- Condition parameters (depends on requirement_type)
  threshold_value DECIMAL(10, 2), -- For value-based requirements
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE, -- For category-based
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, -- For specific products

  -- Signature configuration
  signature_type VARCHAR(30) NOT NULL, -- Which signature_type to capture

  -- Display settings
  title VARCHAR(255) NOT NULL, -- Title shown to customer (e.g., "Delivery Confirmation")
  description TEXT, -- Instructions shown to customer
  legal_text TEXT, -- Legal terms to display and capture
  terms_version VARCHAR(50), -- Version of terms

  -- Behavior
  is_required BOOLEAN DEFAULT TRUE, -- Can customer skip?
  allow_typed_name BOOLEAN DEFAULT TRUE, -- Allow typed name instead of drawn signature
  require_printed_name BOOLEAN DEFAULT TRUE, -- Require printed name alongside signature

  -- Priority for overlapping rules
  priority INTEGER DEFAULT 100, -- Higher = checked first

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id)
);

COMMENT ON TABLE signature_requirements IS 'Configuration for when to require customer signatures';
COMMENT ON COLUMN signature_requirements.requirement_type IS 'Type of trigger: value_threshold, category, delivery, trade_in, financing';
COMMENT ON COLUMN signature_requirements.threshold_value IS 'For value_threshold type: minimum order value to trigger';
COMMENT ON COLUMN signature_requirements.priority IS 'Higher priority rules are evaluated first; first match wins';

-- ============================================================================
-- 3. SIGNATURE TEMPLATES TABLE - Reusable legal text templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS signature_templates (
  id SERIAL PRIMARY KEY,

  -- Template identification
  template_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'DELIVERY_V1', 'FINANCING_TERMS'
  template_name VARCHAR(255) NOT NULL,

  -- Content
  signature_type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  legal_text TEXT NOT NULL,
  terms_version VARCHAR(50) NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE, -- Default template for this signature_type

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

COMMENT ON TABLE signature_templates IS 'Reusable templates for signature legal text and terms';

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- Signatures lookups
CREATE INDEX IF NOT EXISTS idx_signatures_order_id ON signatures(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signatures_transaction_id ON signatures(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signatures_type ON signatures(signature_type);
CREATE INDEX IF NOT EXISTS idx_signatures_captured_at ON signatures(captured_at);
CREATE INDEX IF NOT EXISTS idx_signatures_signer_name ON signatures(signer_name);
CREATE INDEX IF NOT EXISTS idx_signatures_status ON signatures(status);
CREATE INDEX IF NOT EXISTS idx_signatures_trade_in ON signatures(trade_in_assessment_id) WHERE trade_in_assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signatures_financing ON signatures(financing_application_id) WHERE financing_application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signatures_captured_by ON signatures(captured_by);

-- Signature requirements lookups
CREATE INDEX IF NOT EXISTS idx_sig_req_type ON signature_requirements(requirement_type);
CREATE INDEX IF NOT EXISTS idx_sig_req_active ON signature_requirements(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sig_req_category ON signature_requirements(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sig_req_priority ON signature_requirements(priority DESC);

-- ============================================================================
-- 5. TRIGGERS - Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_signature_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_signatures_timestamp ON signatures;
CREATE TRIGGER trigger_update_signatures_timestamp
  BEFORE UPDATE ON signatures
  FOR EACH ROW
  EXECUTE FUNCTION update_signature_timestamp();

DROP TRIGGER IF EXISTS trigger_update_signature_requirements_timestamp ON signature_requirements;
CREATE TRIGGER trigger_update_signature_requirements_timestamp
  BEFORE UPDATE ON signature_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_signature_timestamp();

DROP TRIGGER IF EXISTS trigger_update_signature_templates_timestamp ON signature_templates;
CREATE TRIGGER trigger_update_signature_templates_timestamp
  BEFORE UPDATE ON signature_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_signature_timestamp();

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

/**
 * Check if an order requires a signature based on configured requirements
 * @param p_order_id - The order to check
 * @returns TABLE with required signature types and their configurations
 */
CREATE OR REPLACE FUNCTION get_required_signatures(p_order_id INTEGER)
RETURNS TABLE (
  requirement_id INTEGER,
  signature_type VARCHAR(30),
  title VARCHAR(255),
  description TEXT,
  legal_text TEXT,
  terms_version VARCHAR(50),
  is_required BOOLEAN,
  allow_typed_name BOOLEAN,
  require_printed_name BOOLEAN,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH order_info AS (
    SELECT
      o.id,
      o.total_amount,
      o.fulfillment_type,
      ARRAY_AGG(DISTINCT oi.category_id) as category_ids
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.id = p_order_id
    GROUP BY o.id
  )
  SELECT DISTINCT ON (sr.signature_type)
    sr.id as requirement_id,
    sr.signature_type,
    sr.title,
    sr.description,
    sr.legal_text,
    sr.terms_version,
    sr.is_required,
    sr.allow_typed_name,
    sr.require_printed_name,
    CASE
      WHEN sr.requirement_type = 'delivery' THEN 'Delivery requires signature'
      WHEN sr.requirement_type = 'value_threshold' THEN 'Order value exceeds $' || sr.threshold_value::TEXT
      WHEN sr.requirement_type = 'category' THEN 'Product category requires signature'
      ELSE sr.requirement_type
    END as reason
  FROM signature_requirements sr
  CROSS JOIN order_info oi
  WHERE sr.is_active = TRUE
    AND (
      -- Delivery requirement
      (sr.requirement_type = 'delivery' AND oi.fulfillment_type IN ('local_delivery', 'shipping'))
      -- Value threshold requirement
      OR (sr.requirement_type = 'value_threshold' AND oi.total_amount >= sr.threshold_value)
      -- Category requirement
      OR (sr.requirement_type = 'category' AND sr.category_id = ANY(oi.category_ids))
    )
  ORDER BY sr.signature_type, sr.priority DESC;
END;
$$ LANGUAGE plpgsql;

/**
 * Check if a signature has already been captured for an order/type
 */
CREATE OR REPLACE FUNCTION has_valid_signature(
  p_order_id INTEGER,
  p_signature_type VARCHAR(30)
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM signatures
    WHERE order_id = p_order_id
      AND signature_type = p_signature_type
      AND status = 'valid'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. DEFAULT SIGNATURE REQUIREMENTS
-- ============================================================================

-- Delivery confirmation (all deliveries)
INSERT INTO signature_requirements (
  requirement_type,
  signature_type,
  title,
  description,
  legal_text,
  terms_version,
  is_required,
  priority
) VALUES (
  'delivery',
  'delivery',
  'Delivery Confirmation',
  'Please sign to confirm you have received your order in good condition.',
  'I acknowledge receipt of the above items in satisfactory condition. I understand that by signing, I am confirming the delivery and accepting responsibility for the merchandise.',
  'v2024.1',
  TRUE,
  100
) ON CONFLICT DO NOTHING;

-- High-value purchase ($500+)
INSERT INTO signature_requirements (
  requirement_type,
  threshold_value,
  signature_type,
  title,
  description,
  legal_text,
  terms_version,
  is_required,
  priority
) VALUES (
  'value_threshold',
  500.00,
  'purchase',
  'Purchase Acknowledgment',
  'For purchases over $500, we require your signature to confirm the transaction.',
  'I acknowledge this purchase and confirm that I have reviewed the items, pricing, and return policy. I understand the total amount will be charged to my selected payment method.',
  'v2024.1',
  TRUE,
  90
) ON CONFLICT DO NOTHING;

-- Trade-in acceptance
INSERT INTO signature_requirements (
  requirement_type,
  signature_type,
  title,
  description,
  legal_text,
  terms_version,
  is_required,
  priority
) VALUES (
  'trade_in',
  'trade_in',
  'Trade-In Agreement',
  'Please sign to confirm acceptance of the trade-in value and transfer of ownership.',
  'I certify that I am the legal owner of the traded-in device(s) and have the authority to transfer ownership. I acknowledge the assessed trade-in value and agree to transfer all rights to the device. I confirm the device is not stolen, under lease, or subject to any outstanding financial obligations.',
  'v2024.1',
  TRUE,
  100
) ON CONFLICT DO NOTHING;

-- Financing agreement
INSERT INTO signature_requirements (
  requirement_type,
  signature_type,
  title,
  description,
  legal_text,
  terms_version,
  is_required,
  priority
) VALUES (
  'financing',
  'financing',
  'Financing Agreement',
  'Please sign to accept the financing terms and conditions.',
  'I have read and agree to the financing terms presented, including the payment schedule, interest rate (if applicable), and conditions for early payoff. I authorize the periodic charges as described and understand that failure to make payments may result in collection action.',
  'v2024.1',
  TRUE,
  100
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. DEFAULT SIGNATURE TEMPLATES
-- ============================================================================

INSERT INTO signature_templates (template_code, template_name, signature_type, title, description, legal_text, terms_version, is_default)
VALUES
  (
    'DELIVERY_STANDARD',
    'Standard Delivery Confirmation',
    'delivery',
    'Delivery Confirmation',
    'Please sign below to confirm receipt of your order.',
    'I acknowledge receipt of the above items in satisfactory condition. I understand that by signing, I am confirming the delivery and accepting responsibility for the merchandise. If any items are damaged or missing, I will report this within 24 hours.',
    'v2024.1',
    TRUE
  ),
  (
    'PURCHASE_HIGH_VALUE',
    'High-Value Purchase Acknowledgment',
    'purchase',
    'Purchase Acknowledgment',
    'For your protection, we require acknowledgment of purchases over $500.',
    'I acknowledge this purchase and confirm that I have reviewed the items, pricing, and return policy. I understand the total amount shown will be charged to my selected payment method. I have been informed of the warranty terms and return policy for these items.',
    'v2024.1',
    TRUE
  ),
  (
    'TRADE_IN_STANDARD',
    'Standard Trade-In Agreement',
    'trade_in',
    'Trade-In Ownership Transfer',
    'By signing, you confirm ownership and agree to transfer the device.',
    E'TRADE-IN AGREEMENT\n\nI, the undersigned, hereby certify that:\n1. I am the legal owner of the device(s) being traded in\n2. The device(s) are not stolen, lost, or subject to any claims\n3. The device(s) are not under lease or financing agreement\n4. I have removed all personal data and accounts from the device\n5. I accept the assessed trade-in value as final\n\nI hereby transfer all ownership rights to the receiving party.',
    'v2024.1',
    TRUE
  ),
  (
    'FINANCING_AGREEMENT',
    'Standard Financing Agreement',
    'financing',
    'Financing Terms Acceptance',
    'Please review and sign to accept the financing terms.',
    E'FINANCING AGREEMENT\n\nI acknowledge and agree to the following:\n1. The total financed amount and payment schedule as presented\n2. The applicable interest rate and any fees\n3. The terms for early payoff without penalty\n4. My responsibility to make timely payments\n5. The consequences of missed or late payments\n\nI authorize the scheduled payments from my selected payment method.',
    'v2024.1',
    TRUE
  ),
  (
    'REFUND_ACKNOWLEDGMENT',
    'Refund Acknowledgment',
    'refund',
    'Refund Acknowledgment',
    'Please sign to acknowledge the refund terms.',
    'I acknowledge receipt of the refund as described above. I understand that the refund will be processed to my original payment method and may take 5-10 business days to appear. I confirm that I have returned all applicable items in their original condition.',
    'v2024.1',
    TRUE
  )
ON CONFLICT (template_code) DO NOTHING;

-- ============================================================================
-- 9. VIEW: Signature Audit Log
-- ============================================================================

CREATE OR REPLACE VIEW v_signature_audit AS
SELECT
  s.id,
  s.signature_type,
  s.order_id,
  o.order_number,
  s.transaction_id,
  t.transaction_number,
  s.signer_name,
  s.signer_email,
  s.captured_at,
  u.first_name || ' ' || u.last_name as captured_by_name,
  s.ip_address,
  s.device_info->>'userAgent' as user_agent,
  s.device_info->>'deviceType' as device_type,
  s.terms_version,
  s.status,
  s.voided_at,
  vu.first_name || ' ' || vu.last_name as voided_by_name,
  s.voided_reason
FROM signatures s
LEFT JOIN orders o ON s.order_id = o.id
LEFT JOIN transactions t ON s.transaction_id = t.transaction_id
LEFT JOIN users u ON s.captured_by = u.id
LEFT JOIN users vu ON s.voided_by = vu.id
ORDER BY s.captured_at DESC;

COMMENT ON VIEW v_signature_audit IS 'Audit view of all captured signatures with related order/transaction info';

-- ============================================================================
-- 10. CLOUD STORAGE MIGRATION NOTES
-- ============================================================================

/*
 * CLOUD STORAGE MIGRATION GUIDE
 *
 * When ready to migrate signature storage to cloud (S3/GCS):
 *
 * 1. Add new column:
 *    ALTER TABLE signatures ADD COLUMN signature_url VARCHAR(500);
 *    ALTER TABLE signatures ADD COLUMN storage_provider VARCHAR(20) DEFAULT 'database';
 *
 * 2. Migrate existing signatures:
 *    - Read signature_data from database
 *    - Upload to S3/GCS bucket: signatures/{year}/{month}/{signature_id}.{format}
 *    - Update signature_url with the cloud URL
 *    - Set storage_provider = 's3' or 'gcs'
 *
 * 3. Update application code:
 *    - SignatureService.captureSignature() -> upload to cloud, store URL
 *    - SignatureService.getSignature() -> fetch from cloud if signature_url set
 *
 * 4. After full migration:
 *    - ALTER TABLE signatures DROP COLUMN signature_data;
 *    - Or keep as backup for compliance
 *
 * S3 Bucket Policy Example:
 * {
 *   "Version": "2012-10-17",
 *   "Statement": [{
 *     "Sid": "SignatureReadAccess",
 *     "Effect": "Allow",
 *     "Principal": {"AWS": "arn:aws:iam::ACCOUNT:role/pos-backend"},
 *     "Action": ["s3:GetObject", "s3:PutObject"],
 *     "Resource": "arn:aws:s3:::teletime-signatures/*"
 *   }]
 * }
 */
