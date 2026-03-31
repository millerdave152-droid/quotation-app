-- Migration 217: Data export audit table for PIPEDA compliance
-- Tracks all exports containing PII with anonymization method used.

CREATE TABLE IF NOT EXISTS data_export_audit (
  id SERIAL PRIMARY KEY,
  exported_by INTEGER REFERENCES users(id),
  export_type VARCHAR(100) NOT NULL,
  record_count INTEGER NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contains_pii BOOLEAN NOT NULL DEFAULT false,
  anonymization_method TEXT
);
