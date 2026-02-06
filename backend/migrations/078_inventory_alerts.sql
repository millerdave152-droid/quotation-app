-- ============================================================================
-- Migration 078: Inventory Alert Rules & Alerts
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_alert_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,

  rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN (
    'low_stock', 'out_of_stock', 'overstock', 'stuck_inventory'
  )),

  applies_to VARCHAR(20) DEFAULT 'all' CHECK (applies_to IN ('all', 'category', 'brand', 'location')),
  category_id INTEGER,
  brand_id INTEGER,
  location_id INTEGER REFERENCES locations(id),

  threshold_quantity INTEGER,
  threshold_days INTEGER,
  threshold_value INTEGER,

  notify_emails TEXT[],
  notify_slack_channel VARCHAR(100),

  is_active BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMP,

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_alerts (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES inventory_alert_rules(id),
  product_id INTEGER REFERENCES products(id) NOT NULL,
  location_id INTEGER REFERENCES locations(id),

  alert_type VARCHAR(30) NOT NULL,
  current_quantity INTEGER,
  threshold_quantity INTEGER,

  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),

  acknowledged_by INTEGER REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  resolved_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_status ON inventory_alerts(status);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product ON inventory_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_type ON inventory_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_location ON inventory_alerts(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alert_rules_active ON inventory_alert_rules(is_active) WHERE is_active = TRUE;
