-- Migration 158: Extend velocity_events, bin_cache, and chargeback_cases
-- Phase 3 fraud infrastructure

-- velocity_events: add transaction_id, location_id
ALTER TABLE velocity_events ADD COLUMN IF NOT EXISTS transaction_id BIGINT;
ALTER TABLE velocity_events ADD COLUMN IF NOT EXISTS location_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_velocity_events_type_created ON velocity_events(event_type, created_at);

-- bin_cache: add category, is_commercial, expires_at
ALTER TABLE bin_cache ADD COLUMN IF NOT EXISTS category VARCHAR(30);
ALTER TABLE bin_cache ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN DEFAULT false;
ALTER TABLE bin_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days';

-- chargeback_cases: add missing columns from spec
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS order_id BIGINT;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS moneris_case_id VARCHAR(64);
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS card_brand VARCHAR(20);
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS reason_description TEXT;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'CAD';
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMPTZ;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS evidence_json JSONB DEFAULT '{}';
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS outcome_notes TEXT;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
