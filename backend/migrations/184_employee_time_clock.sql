CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  location_id INTEGER REFERENCES locations(id),

  clock_in TIMESTAMP NOT NULL,
  clock_out TIMESTAMP,
  hours_worked DECIMAL(5,2),

  entry_type VARCHAR(20) DEFAULT 'regular' CHECK (entry_type IN (
    'regular', 'overtime', 'holiday', 'sick', 'vacation'
  )),

  break_minutes INTEGER DEFAULT 0,

  is_adjusted BOOLEAN DEFAULT false,
  adjusted_by INTEGER REFERENCES users(id),
  adjustment_reason TEXT,
  original_clock_in TIMESTAMP,
  original_clock_out TIMESTAMP,

  notes TEXT,

  is_approved BOOLEAN DEFAULT false,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_date ON time_entries(clock_in);
CREATE INDEX IF NOT EXISTS idx_time_open ON time_entries(user_id, clock_out) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_approval ON time_entries(is_approved) WHERE is_approved = false;
