-- Layaway management tables
-- Creates layaways, layaway_items, layaway_payments

CREATE TABLE IF NOT EXISTS layaways (
  id SERIAL PRIMARY KEY,
  layaway_number VARCHAR(30) UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  location_id INTEGER REFERENCES locations(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, completed, cancelled, defaulted
  total_amount INTEGER NOT NULL DEFAULT 0,        -- cents
  deposit_amount INTEGER NOT NULL DEFAULT 0,      -- cents
  balance_due INTEGER NOT NULL DEFAULT 0,         -- cents
  term_weeks INTEGER NOT NULL DEFAULT 12,
  minimum_payment INTEGER NOT NULL DEFAULT 0,     -- cents
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  completed_date DATE,
  cancellation_fee_percent NUMERIC(5,2) DEFAULT 10,
  restocking_fee INTEGER DEFAULT 0,               -- cents
  refund_amount INTEGER DEFAULT 0,                -- cents
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS layaway_items (
  id SERIAL PRIMARY KEY,
  layaway_id INTEGER NOT NULL REFERENCES layaways(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(255),
  sku VARCHAR(100),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,   -- cents
  line_total INTEGER NOT NULL DEFAULT 0,   -- cents
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS layaway_payments (
  id SERIAL PRIMARY KEY,
  layaway_id INTEGER NOT NULL REFERENCES layaways(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,       -- cents
  payment_method VARCHAR(50),
  reference_number VARCHAR(100),
  received_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_layaways_customer ON layaways(customer_id);
CREATE INDEX IF NOT EXISTS idx_layaways_status ON layaways(status);
CREATE INDEX IF NOT EXISTS idx_layaway_items_layaway ON layaway_items(layaway_id);
CREATE INDEX IF NOT EXISTS idx_layaway_payments_layaway ON layaway_payments(layaway_id);
