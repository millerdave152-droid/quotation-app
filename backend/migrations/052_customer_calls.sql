CREATE TABLE IF NOT EXISTS customer_calls (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) NOT NULL,

  call_direction VARCHAR(10) NOT NULL CHECK (call_direction IN ('inbound', 'outbound')),
  phone_number VARCHAR(20),

  call_start TIMESTAMP NOT NULL DEFAULT NOW(),
  call_end TIMESTAMP,
  duration_seconds INTEGER,

  call_type VARCHAR(30) CHECK (call_type IN (
    'sales_inquiry', 'order_status', 'delivery_schedule', 'complaint',
    'return_request', 'product_question', 'payment', 'follow_up', 'other'
  )),

  outcome VARCHAR(30) CHECK (outcome IN (
    'resolved', 'callback_scheduled', 'transferred', 'voicemail',
    'no_answer', 'follow_up_needed'
  )),

  order_id INTEGER REFERENCES orders(id),

  summary TEXT,
  notes TEXT,

  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  follow_up_assigned_to INTEGER REFERENCES users(id),
  follow_up_completed BOOLEAN DEFAULT false,
  follow_up_completed_at TIMESTAMP,

  logged_by INTEGER REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_customer ON customer_calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_date ON customer_calls(call_start);
CREATE INDEX IF NOT EXISTS idx_calls_followup ON customer_calls(follow_up_required, follow_up_completed) WHERE follow_up_required = true AND follow_up_completed = false;
CREATE INDEX IF NOT EXISTS idx_calls_logged_by ON customer_calls(logged_by);
