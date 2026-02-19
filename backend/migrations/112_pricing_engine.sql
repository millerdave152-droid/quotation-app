-- Migration 112: Pricing engine tables
-- PricingEngine uses these to calculate, log, and approve channel-specific prices.

CREATE TABLE IF NOT EXISTS pricing_rules (
  id          SERIAL PRIMARY KEY,
  channel_id  INTEGER REFERENCES marketplace_channels(id),  -- NULL = applies to all channels
  rule_name   VARCHAR(100) NOT NULL,
  rule_type   VARCHAR(30) NOT NULL,          -- MIN_MARGIN, CHANNEL_MARKUP, SCHEDULED, VOLUME, COMPETITIVE
  conditions  JSONB DEFAULT '{}',            -- { "category": "Refrigerators", "brand": "LG", "price_min": 500 }
  formula     JSONB DEFAULT '{}',            -- { "markup_percent": 10, "min_margin_percent": 15, "round_to": 0.99 }
  priority    INTEGER DEFAULT 100,
  active      BOOLEAN DEFAULT true,
  starts_at   TIMESTAMP,
  ends_at     TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_change_log (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER REFERENCES products(id),
  channel_id  INTEGER REFERENCES marketplace_channels(id),
  old_price   DECIMAL(10,2),
  new_price   DECIMAL(10,2),
  rule_id     INTEGER REFERENCES pricing_rules(id),
  reason      VARCHAR(255),
  approved_by INTEGER REFERENCES users(id),
  status      VARCHAR(20) DEFAULT 'APPLIED',    -- PENDING_APPROVAL, APPLIED, REJECTED
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_channel ON pricing_rules(channel_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON pricing_rules(active, priority);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_type ON pricing_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_price_change_log_product ON price_change_log(product_id);
CREATE INDEX IF NOT EXISTS idx_price_change_log_channel ON price_change_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_price_change_log_status ON price_change_log(status);
CREATE INDEX IF NOT EXISTS idx_price_change_log_created ON price_change_log(created_at DESC);
