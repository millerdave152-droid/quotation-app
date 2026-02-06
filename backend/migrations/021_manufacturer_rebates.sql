-- Migration: 021_manufacturer_rebates.sql
-- Description: Manufacturer rebate system for instant, mail-in, and online rebates
-- Created: 2026-01-27

-- ============================================================================
-- REBATES TABLE
-- Main rebate definitions from manufacturers
-- ============================================================================

CREATE TABLE IF NOT EXISTS rebates (
  id SERIAL PRIMARY KEY,

  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Rebate type
  rebate_type VARCHAR(20) NOT NULL CHECK (rebate_type IN ('instant', 'mail_in', 'online')),

  -- Amount configuration
  amount DECIMAL(10, 2) NOT NULL,
  amount_type VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (amount_type IN ('fixed', 'percent')),
  max_rebate_amount DECIMAL(10, 2), -- Cap for percent rebates

  -- Manufacturer info
  manufacturer VARCHAR(100) NOT NULL,
  manufacturer_rebate_code VARCHAR(50), -- Manufacturer's internal code

  -- Validity period
  valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMP NOT NULL,

  -- URLs for customer
  terms_url VARCHAR(500), -- Link to rebate terms/conditions
  submission_url VARCHAR(500), -- For mail-in/online: where to submit

  -- Claim requirements
  requires_upc BOOLEAN DEFAULT false, -- Customer needs to mail UPC
  requires_receipt BOOLEAN DEFAULT true, -- Customer needs copy of receipt
  requires_registration BOOLEAN DEFAULT false, -- Product registration required
  claim_deadline_days INTEGER DEFAULT 30, -- Days after purchase to submit claim

  -- Limits
  max_claims_per_customer INTEGER, -- NULL = unlimited
  max_total_claims INTEGER, -- Total redemption limit
  current_claim_count INTEGER DEFAULT 0,

  -- Stacking rules
  stackable_with_promotions BOOLEAN DEFAULT true,
  stackable_with_other_rebates BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),

  -- Indexes for common queries
  CONSTRAINT valid_date_range CHECK (valid_to > valid_from)
);

-- Indexes
CREATE INDEX idx_rebates_manufacturer ON rebates(manufacturer);
CREATE INDEX idx_rebates_type ON rebates(rebate_type);
CREATE INDEX idx_rebates_active ON rebates(is_active) WHERE is_active = true;
CREATE INDEX idx_rebates_validity ON rebates(valid_from, valid_to);
CREATE INDEX idx_rebates_active_validity ON rebates(is_active, valid_from, valid_to)
  WHERE is_active = true;

-- ============================================================================
-- REBATE_PRODUCTS TABLE
-- Links rebates to specific products or categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS rebate_products (
  id SERIAL PRIMARY KEY,
  rebate_id INTEGER NOT NULL REFERENCES rebates(id) ON DELETE CASCADE,

  -- Product targeting (one of these should be set)
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  sku_pattern VARCHAR(50), -- For pattern matching: 'SM-G99%' matches Samsung Galaxy

  -- Quantity requirements
  min_quantity INTEGER DEFAULT 1, -- Buy X, get rebate
  max_quantity INTEGER, -- Maximum units eligible per transaction

  -- Per-product rebate override (optional)
  override_amount DECIMAL(10, 2), -- Override the rebate amount for this product

  created_at TIMESTAMP DEFAULT NOW(),

  -- Ensure at least one targeting method
  CONSTRAINT rebate_product_target CHECK (
    product_id IS NOT NULL OR
    category_id IS NOT NULL OR
    sku_pattern IS NOT NULL
  ),

  -- Prevent duplicates
  CONSTRAINT unique_rebate_product UNIQUE (rebate_id, product_id),
  CONSTRAINT unique_rebate_category UNIQUE (rebate_id, category_id)
);

-- Indexes
CREATE INDEX idx_rebate_products_rebate ON rebate_products(rebate_id);
CREATE INDEX idx_rebate_products_product ON rebate_products(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_rebate_products_category ON rebate_products(category_id) WHERE category_id IS NOT NULL;

-- ============================================================================
-- REBATE_CLAIMS TABLE
-- Tracks customer claims for mail-in and online rebates
-- ============================================================================

CREATE TABLE IF NOT EXISTS rebate_claims (
  id SERIAL PRIMARY KEY,

  -- References
  rebate_id INTEGER NOT NULL REFERENCES rebates(id),
  order_id INTEGER REFERENCES orders(id), -- Can also reference transactions
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  customer_id INTEGER REFERENCES customers(id),

  -- Claim details
  claim_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    claim_status IN ('pending', 'submitted', 'processing', 'approved', 'denied', 'expired', 'paid')
  ),

  -- Amounts
  rebate_amount DECIMAL(10, 2) NOT NULL, -- Actual rebate amount for this claim
  quantity INTEGER DEFAULT 1, -- Number of units claimed

  -- Customer info (for mail-in)
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  mailing_address TEXT,

  -- Submission tracking
  submitted_at TIMESTAMP,
  submission_method VARCHAR(20) CHECK (submission_method IN ('mail', 'online', 'in_store')),

  -- Manufacturer tracking
  claim_reference VARCHAR(100), -- Manufacturer's claim/confirmation number
  tracking_number VARCHAR(100), -- If mailed physically

  -- Processing
  processed_at TIMESTAMP,
  processed_by INTEGER REFERENCES users(id),
  denial_reason TEXT,

  -- Payment (when rebate is sent to customer)
  paid_at TIMESTAMP,
  payment_method VARCHAR(50), -- 'check', 'prepaid_card', 'direct_deposit'
  payment_reference VARCHAR(100),

  -- Document tracking
  receipt_uploaded BOOLEAN DEFAULT false,
  upc_uploaded BOOLEAN DEFAULT false,
  registration_completed BOOLEAN DEFAULT false,

  -- Notes
  customer_notes TEXT,
  internal_notes TEXT,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure either order or transaction reference
  CONSTRAINT claim_order_reference CHECK (
    order_id IS NOT NULL OR transaction_id IS NOT NULL
  )
);

-- Indexes
CREATE INDEX idx_rebate_claims_rebate ON rebate_claims(rebate_id);
CREATE INDEX idx_rebate_claims_order ON rebate_claims(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_rebate_claims_transaction ON rebate_claims(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_rebate_claims_customer ON rebate_claims(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_rebate_claims_status ON rebate_claims(claim_status);
CREATE INDEX idx_rebate_claims_reference ON rebate_claims(claim_reference) WHERE claim_reference IS NOT NULL;
CREATE INDEX idx_rebate_claims_pending ON rebate_claims(claim_status, created_at)
  WHERE claim_status IN ('pending', 'submitted', 'processing');

-- ============================================================================
-- REBATE_CLAIM_DOCUMENTS TABLE
-- Stores uploaded documents for rebate claims
-- ============================================================================

CREATE TABLE IF NOT EXISTS rebate_claim_documents (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES rebate_claims(id) ON DELETE CASCADE,

  document_type VARCHAR(30) NOT NULL CHECK (
    document_type IN ('receipt', 'upc', 'registration', 'proof_of_purchase', 'other')
  ),

  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),

  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_rebate_claim_docs_claim ON rebate_claim_documents(claim_id);

-- ============================================================================
-- ORDER/TRANSACTION REBATE TRACKING
-- Links applied instant rebates to orders/transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS applied_rebates (
  id SERIAL PRIMARY KEY,

  -- Reference (one should be set)
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  transaction_id INTEGER REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  order_item_id INTEGER, -- Specific line item

  -- Rebate info
  rebate_id INTEGER NOT NULL REFERENCES rebates(id),
  product_id INTEGER REFERENCES products(id),

  -- Amounts
  rebate_amount DECIMAL(10, 2) NOT NULL, -- Amount applied
  quantity INTEGER DEFAULT 1,

  -- For non-instant rebates, link to claim
  claim_id INTEGER REFERENCES rebate_claims(id),

  -- Flags
  is_instant BOOLEAN DEFAULT true, -- Was applied at POS

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT applied_rebate_reference CHECK (
    order_id IS NOT NULL OR transaction_id IS NOT NULL
  )
);

CREATE INDEX idx_applied_rebates_order ON applied_rebates(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_applied_rebates_transaction ON applied_rebates(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_applied_rebates_rebate ON applied_rebates(rebate_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a rebate is currently valid
CREATE OR REPLACE FUNCTION is_rebate_valid(rebate_id_param INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  rebate_record RECORD;
BEGIN
  SELECT
    is_active,
    valid_from,
    valid_to,
    max_total_claims,
    current_claim_count
  INTO rebate_record
  FROM rebates
  WHERE id = rebate_id_param;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check active status
  IF NOT rebate_record.is_active THEN
    RETURN false;
  END IF;

  -- Check date validity
  IF NOW() < rebate_record.valid_from OR NOW() > rebate_record.valid_to THEN
    RETURN false;
  END IF;

  -- Check claim limit
  IF rebate_record.max_total_claims IS NOT NULL AND
     rebate_record.current_claim_count >= rebate_record.max_total_claims THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to get rebate amount for a product
CREATE OR REPLACE FUNCTION get_rebate_amount(
  rebate_id_param INTEGER,
  product_id_param INTEGER,
  product_price DECIMAL(10, 2)
)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  rebate_record RECORD;
  product_override DECIMAL(10, 2);
  calculated_amount DECIMAL(10, 2);
BEGIN
  -- Get rebate info
  SELECT amount, amount_type, max_rebate_amount
  INTO rebate_record
  FROM rebates
  WHERE id = rebate_id_param;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Check for product-specific override
  SELECT override_amount INTO product_override
  FROM rebate_products
  WHERE rebate_id = rebate_id_param AND product_id = product_id_param;

  IF product_override IS NOT NULL THEN
    RETURN product_override;
  END IF;

  -- Calculate based on amount type
  IF rebate_record.amount_type = 'fixed' THEN
    calculated_amount := rebate_record.amount;
  ELSE
    -- Percent
    calculated_amount := product_price * (rebate_record.amount / 100);

    -- Apply cap if set
    IF rebate_record.max_rebate_amount IS NOT NULL AND
       calculated_amount > rebate_record.max_rebate_amount THEN
      calculated_amount := rebate_record.max_rebate_amount;
    END IF;
  END IF;

  RETURN calculated_amount;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update claim count
CREATE OR REPLACE FUNCTION update_rebate_claim_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE rebates
    SET current_claim_count = current_claim_count + 1
    WHERE id = NEW.rebate_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE rebates
    SET current_claim_count = GREATEST(0, current_claim_count - 1)
    WHERE id = OLD.rebate_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rebate_claim_count
AFTER INSERT OR DELETE ON rebate_claims
FOR EACH ROW EXECUTE FUNCTION update_rebate_claim_count();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_rebate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rebate_updated_at
BEFORE UPDATE ON rebates
FOR EACH ROW EXECUTE FUNCTION update_rebate_updated_at();

CREATE TRIGGER trigger_rebate_claim_updated_at
BEFORE UPDATE ON rebate_claims
FOR EACH ROW EXECUTE FUNCTION update_rebate_updated_at();

-- ============================================================================
-- VIEW: Active Rebates with Product Info
-- ============================================================================

CREATE OR REPLACE VIEW v_active_rebates AS
SELECT
  r.id,
  r.name,
  r.description,
  r.rebate_type,
  r.amount,
  r.amount_type,
  r.max_rebate_amount,
  r.manufacturer,
  r.valid_from,
  r.valid_to,
  r.terms_url,
  r.submission_url,
  r.claim_deadline_days,
  r.stackable_with_promotions,
  r.stackable_with_other_rebates,
  r.max_claims_per_customer,
  r.max_total_claims,
  r.current_claim_count,
  CASE
    WHEN r.max_total_claims IS NOT NULL
    THEN r.max_total_claims - r.current_claim_count
    ELSE NULL
  END as remaining_claims,
  EXTRACT(DAY FROM r.valid_to - NOW()) as days_remaining,
  COUNT(DISTINCT rp.product_id) as product_count,
  COUNT(DISTINCT rp.category_id) as category_count
FROM rebates r
LEFT JOIN rebate_products rp ON r.id = rp.rebate_id
WHERE r.is_active = true
  AND NOW() BETWEEN r.valid_from AND r.valid_to
  AND (r.max_total_claims IS NULL OR r.current_claim_count < r.max_total_claims)
GROUP BY r.id;

-- ============================================================================
-- VIEW: Rebate Claims Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_rebate_claims_summary AS
SELECT
  r.id as rebate_id,
  r.name as rebate_name,
  r.manufacturer,
  r.rebate_type,
  COUNT(rc.id) as total_claims,
  COUNT(rc.id) FILTER (WHERE rc.claim_status = 'pending') as pending_claims,
  COUNT(rc.id) FILTER (WHERE rc.claim_status = 'submitted') as submitted_claims,
  COUNT(rc.id) FILTER (WHERE rc.claim_status = 'approved') as approved_claims,
  COUNT(rc.id) FILTER (WHERE rc.claim_status = 'denied') as denied_claims,
  COUNT(rc.id) FILTER (WHERE rc.claim_status = 'paid') as paid_claims,
  SUM(rc.rebate_amount) FILTER (WHERE rc.claim_status IN ('approved', 'paid')) as total_approved_amount,
  SUM(rc.rebate_amount) FILTER (WHERE rc.claim_status = 'paid') as total_paid_amount
FROM rebates r
LEFT JOIN rebate_claims rc ON r.id = rc.rebate_id
GROUP BY r.id, r.name, r.manufacturer, r.rebate_type;

-- ============================================================================
-- SAMPLE DATA: Manufacturer Rebates
-- ============================================================================

-- Samsung Holiday Rebate (Instant)
INSERT INTO rebates (
  name, description, rebate_type, amount, amount_type,
  manufacturer, manufacturer_rebate_code,
  valid_from, valid_to,
  terms_url,
  stackable_with_promotions, stackable_with_other_rebates
) VALUES (
  'Samsung Holiday Instant Rebate',
  'Get $100 off instantly on select Samsung Galaxy phones',
  'instant',
  100.00, 'fixed',
  'Samsung', 'SAM-HOL-2026',
  '2026-01-01', '2026-02-28',
  'https://samsung.com/rebates/holiday2026',
  true, false
);

-- Apple Trade-In Rebate (Instant, percent-based)
INSERT INTO rebates (
  name, description, rebate_type, amount, amount_type, max_rebate_amount,
  manufacturer, manufacturer_rebate_code,
  valid_from, valid_to,
  terms_url,
  stackable_with_promotions
) VALUES (
  'Apple Trade-In Bonus',
  '10% extra on top of trade-in value for iPhone purchases',
  'instant',
  10.00, 'percent', 150.00,
  'Apple', 'APL-TRD-Q1',
  '2026-01-15', '2026-03-31',
  'https://apple.com/trade-in',
  true
);

-- Google Pixel Mail-In Rebate
INSERT INTO rebates (
  name, description, rebate_type, amount, amount_type,
  manufacturer, manufacturer_rebate_code,
  valid_from, valid_to,
  terms_url, submission_url,
  requires_upc, requires_receipt, claim_deadline_days,
  max_claims_per_customer
) VALUES (
  'Google Pixel $150 Mail-In Rebate',
  'Mail in your receipt and UPC to receive $150 prepaid Visa card',
  'mail_in',
  150.00, 'fixed',
  'Google', 'GOO-PIX-MIR',
  '2026-01-01', '2026-04-30',
  'https://google.com/pixel/rebate-terms',
  'https://google.com/pixel/submit-rebate',
  true, true, 45,
  2
);

-- OnePlus Online Rebate
INSERT INTO rebates (
  name, description, rebate_type, amount, amount_type,
  manufacturer, manufacturer_rebate_code,
  valid_from, valid_to,
  terms_url, submission_url,
  requires_receipt, requires_registration, claim_deadline_days,
  max_total_claims
) VALUES (
  'OnePlus $75 Online Rebate',
  'Register your OnePlus device online to receive $75 rebate',
  'online',
  75.00, 'fixed',
  'OnePlus', 'OP-REG-75',
  '2026-02-01', '2026-05-31',
  'https://oneplus.com/rebate-terms',
  'https://oneplus.com/register-rebate',
  true, true, 30,
  1000
);

-- Motorola Instant + Mail-In Combo (High value instant)
INSERT INTO rebates (
  name, description, rebate_type, amount, amount_type,
  manufacturer, manufacturer_rebate_code,
  valid_from, valid_to,
  terms_url,
  stackable_with_other_rebates
) VALUES (
  'Motorola Edge Instant Savings',
  'Instant $50 off any Motorola Edge phone',
  'instant',
  50.00, 'fixed',
  'Motorola', 'MOTO-EDGE-50',
  '2026-01-20', '2026-03-20',
  'https://motorola.com/edge-promo',
  true -- Can stack with mail-in
);

-- Motorola additional mail-in (stacks with instant)
INSERT INTO rebates (
  name, description, rebate_type, amount, amount_type,
  manufacturer, manufacturer_rebate_code,
  valid_from, valid_to,
  terms_url, submission_url,
  requires_receipt, claim_deadline_days,
  stackable_with_other_rebates
) VALUES (
  'Motorola Edge Additional Mail-In',
  'Additional $100 mail-in rebate on Motorola Edge phones',
  'mail_in',
  100.00, 'fixed',
  'Motorola', 'MOTO-EDGE-MIR',
  '2026-01-20', '2026-03-20',
  'https://motorola.com/edge-rebate-terms',
  'https://motorola.com/submit-rebate',
  true, 60,
  true -- Stacks with instant
);

-- Link sample rebates to products (assuming some product IDs exist)
-- In real scenario, these would reference actual product IDs

-- Link Samsung rebate to Samsung category (assuming category_id = 1 for phones)
INSERT INTO rebate_products (rebate_id, category_id, min_quantity)
SELECT r.id, 1, 1
FROM rebates r
WHERE r.manufacturer_rebate_code = 'SAM-HOL-2026'
ON CONFLICT DO NOTHING;

-- Link Google rebate with quantity requirement (buy 1 get rebate)
INSERT INTO rebate_products (rebate_id, sku_pattern, min_quantity, max_quantity)
SELECT r.id, 'PIXEL%', 1, 2
FROM rebates r
WHERE r.manufacturer_rebate_code = 'GOO-PIX-MIR'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE rebates IS 'Manufacturer rebate programs (instant, mail-in, online)';
COMMENT ON TABLE rebate_products IS 'Products/categories eligible for each rebate';
COMMENT ON TABLE rebate_claims IS 'Customer claims for mail-in and online rebates';
COMMENT ON TABLE rebate_claim_documents IS 'Uploaded documents for rebate claims (receipts, UPCs)';
COMMENT ON TABLE applied_rebates IS 'Rebates applied to orders/transactions';

COMMENT ON COLUMN rebates.rebate_type IS 'instant=applied at POS, mail_in=customer mails claim, online=customer submits online';
COMMENT ON COLUMN rebates.amount_type IS 'fixed=dollar amount, percent=percentage of price';
COMMENT ON COLUMN rebates.claim_deadline_days IS 'Days after purchase customer has to submit claim';
COMMENT ON COLUMN rebates.stackable_with_promotions IS 'Can this rebate be combined with store promotions';
COMMENT ON COLUMN rebates.stackable_with_other_rebates IS 'Can this rebate be combined with other manufacturer rebates';

COMMENT ON COLUMN rebate_products.sku_pattern IS 'SQL LIKE pattern for matching SKUs (use % for wildcard)';
COMMENT ON COLUMN rebate_products.min_quantity IS 'Minimum quantity to purchase to qualify for rebate';
COMMENT ON COLUMN rebate_products.override_amount IS 'Override rebate amount for this specific product';

COMMENT ON COLUMN rebate_claims.claim_status IS 'pending=not yet submitted, submitted=sent to manufacturer, processing=under review, approved/denied=decision made, paid=rebate sent';

-- ============================================================================
-- REBATE REMINDERS TABLE
-- Tracks reminder emails sent to customers
-- ============================================================================

CREATE TABLE IF NOT EXISTS rebate_reminders (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES rebate_claims(id) ON DELETE CASCADE,

  reminder_type VARCHAR(30) NOT NULL CHECK (
    reminder_type IN ('notice', 'reminder', 'urgent', 'final_warning', 'expired', 'post_purchase')
  ),
  days_before_deadline INTEGER,
  days_since_purchase INTEGER, -- For post-purchase reminders (7, 14, 21 days after)

  sent_to_email VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  email_sent_successfully BOOLEAN DEFAULT false,

  -- Tracking
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rebate_reminders_claim ON rebate_reminders(claim_id);
CREATE INDEX idx_rebate_reminders_sent_at ON rebate_reminders(sent_at);
CREATE INDEX idx_rebate_reminders_type ON rebate_reminders(reminder_type);

COMMENT ON TABLE rebate_reminders IS 'Tracks reminder emails sent to customers about pending rebate claims';
