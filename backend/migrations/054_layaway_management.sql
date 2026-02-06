CREATE TABLE IF NOT EXISTS layaways (
  id SERIAL PRIMARY KEY,
  layaway_number VARCHAR(50) UNIQUE NOT NULL,

  customer_id INTEGER REFERENCES customers(id) NOT NULL,
  location_id INTEGER REFERENCES locations(id) NOT NULL,

  status VARCHAR(20) DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'cancelled', 'forfeited'
  )),

  total_amount INTEGER NOT NULL,       -- cents
  deposit_amount INTEGER NOT NULL,     -- cents
  balance_due INTEGER NOT NULL,        -- cents

  term_weeks INTEGER DEFAULT 12,
  minimum_payment INTEGER,             -- cents

  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  completed_date DATE,

  cancellation_fee_percent DECIMAL(5,2) DEFAULT 10.0,
  restocking_fee INTEGER,
  refund_amount INTEGER,

  notes TEXT,

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS layaway_items (
  id SERIAL PRIMARY KEY,
  layaway_id INTEGER REFERENCES layaways(id) ON DELETE CASCADE NOT NULL,
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(255),
  sku VARCHAR(100),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,         -- cents
  line_total INTEGER NOT NULL          -- cents
);

CREATE TABLE IF NOT EXISTS layaway_payments (
  id SERIAL PRIMARY KEY,
  layaway_id INTEGER REFERENCES layaways(id) NOT NULL,
  amount INTEGER NOT NULL,             -- cents
  payment_method VARCHAR(30),
  reference_number VARCHAR(100),
  received_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_layaways_customer ON layaways(customer_id);
CREATE INDEX IF NOT EXISTS idx_layaways_status ON layaways(status);
CREATE INDEX IF NOT EXISTS idx_layaways_due ON layaways(due_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_layaway_items_layaway ON layaway_items(layaway_id);
CREATE INDEX IF NOT EXISTS idx_layaway_payments_layaway ON layaway_payments(layaway_id);
