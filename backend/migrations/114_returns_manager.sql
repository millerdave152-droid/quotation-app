-- Migration 114: Returns management — add missing columns + return_rules table
-- marketplace_returns already exists; ALTER to add channel_id, items, automation fields.

-- Add missing columns to existing marketplace_returns
ALTER TABLE marketplace_returns ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES marketplace_channels(id);
ALTER TABLE marketplace_returns ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE marketplace_returns ADD COLUMN IF NOT EXISTS restock_eligible BOOLEAN DEFAULT true;
ALTER TABLE marketplace_returns ADD COLUMN IF NOT EXISTS auto_decision VARCHAR(30);
ALTER TABLE marketplace_returns ADD COLUMN IF NOT EXISTS auto_decision_reason TEXT;
ALTER TABLE marketplace_returns ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_marketplace_returns_channel ON marketplace_returns(channel_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_returns_status ON marketplace_returns(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_returns_order ON marketplace_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_returns_mirakl ON marketplace_returns(mirakl_order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_returns_created ON marketplace_returns(created_at DESC);

-- Return rules for automation
CREATE TABLE IF NOT EXISTS return_rules (
  id          SERIAL PRIMARY KEY,
  rule_name   VARCHAR(100) NOT NULL,
  priority    INTEGER DEFAULT 100,
  conditions  JSONB DEFAULT '{}',
  action      JSONB DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_rules_active ON return_rules(active, priority);

-- Default return rules
INSERT INTO return_rules (rule_name, priority, conditions, action) VALUES
('Auto-accept defective within 30 days', 10,
 '{"reason_codes": ["DEFECTIVE", "DAMAGED_IN_TRANSIT"], "days_max": 30}',
 '{"auto_accept": true, "restocking_fee_percent": 0, "restock": false}'),
('Auto-accept wrong item', 20,
 '{"reason_codes": ["WRONG_ITEM"]}',
 '{"auto_accept": true, "restocking_fee_percent": 0, "restock": true}'),
('Changed mind - restocking fee', 50,
 '{"reason_codes": ["CHANGED_MIND", "NO_LONGER_NEEDED"]}',
 '{"auto_accept": true, "restocking_fee_percent": 15, "restock": true}'),
('High value needs review', 5,
 '{"amount_min": 1000}',
 '{"auto_accept": false, "needs_review": true}')
ON CONFLICT DO NOTHING;
