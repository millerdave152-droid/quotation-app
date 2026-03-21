-- Migration 154: Employee risk profiles for fraud tracking
-- Auto-updated when fraud alerts are created

CREATE TABLE IF NOT EXISTS employee_risk_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  risk_level VARCHAR(20) DEFAULT 'normal',  -- normal, elevated, high, suspended
  total_alerts INTEGER DEFAULT 0,
  total_incidents INTEGER DEFAULT 0,
  last_alert_at TIMESTAMPTZ,
  last_incident_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
