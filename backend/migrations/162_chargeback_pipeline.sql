-- Migration 162: Chargeback Pipeline Enhancements
-- Extends chargeback_cases with pipeline statuses, adds status history + comments tables,
-- expands evidence types, and adds tracking columns for lifecycle management.

-- ============================================================================
-- 1) Extend chargeback_cases status CHECK to support full pipeline
-- ============================================================================
ALTER TABLE chargeback_cases DROP CONSTRAINT IF EXISTS chargeback_cases_status_check;
ALTER TABLE chargeback_cases ADD CONSTRAINT chargeback_cases_status_check
  CHECK (status IN (
    'pre_alert',          -- Ethoca/Verifi pre-alert (future)
    'received',           -- New chargeback received
    'under_review',       -- Assigned, being investigated
    'evidence_submitted', -- Response sent to card network
    'won',                -- Dispute won
    'lost',               -- Dispute lost
    'expired',            -- Response deadline passed
    'accepted'            -- Merchant accepted the chargeback
  ));

-- Add pipeline tracking columns
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS previous_status VARCHAR(20);
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS evidence_submitted_at TIMESTAMPTZ;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE chargeback_cases ADD COLUMN IF NOT EXISTS response_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_chargeback_assigned ON chargeback_cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_chargeback_response_deadline ON chargeback_cases(response_deadline);
CREATE INDEX IF NOT EXISTS idx_chargeback_card_brand ON chargeback_cases(card_brand);
CREATE INDEX IF NOT EXISTS idx_chargeback_received_at ON chargeback_cases(received_at);

-- ============================================================================
-- 2) Status History table — tracks every status transition
-- ============================================================================
CREATE TABLE IF NOT EXISTS chargeback_status_history (
  id SERIAL PRIMARY KEY,
  chargeback_id INTEGER NOT NULL REFERENCES chargeback_cases(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cb_status_history_case ON chargeback_status_history(chargeback_id);
CREATE INDEX IF NOT EXISTS idx_cb_status_history_created ON chargeback_status_history(created_at);

-- ============================================================================
-- 3) Comments table — internal discussion thread
-- ============================================================================
CREATE TABLE IF NOT EXISTS chargeback_comments (
  id SERIAL PRIMARY KEY,
  chargeback_id INTEGER NOT NULL REFERENCES chargeback_cases(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cb_comments_case ON chargeback_comments(chargeback_id);

-- ============================================================================
-- 4) Extend evidence types for comprehensive evidence tracking
-- ============================================================================
ALTER TABLE chargeback_evidence DROP CONSTRAINT IF EXISTS chargeback_evidence_evidence_type_check;
ALTER TABLE chargeback_evidence ADD CONSTRAINT chargeback_evidence_evidence_type_check
  CHECK (evidence_type IN (
    'receipt',              -- Transaction receipt
    'signature',            -- Customer signature
    'delivery_proof',       -- Delivery confirmation
    'communication',        -- Customer communication log
    'cctv',                 -- CCTV footage
    'avs_cvv',              -- AVS/CVV verification results
    'authorization',        -- Authorization code / log
    'emv_log',              -- EMV chip transaction log
    'transaction_snapshot', -- Auto-captured transaction data
    'customer_history',     -- Customer purchase/interaction history
    'return_policy',        -- Return policy acknowledgment
    'product_listing',      -- Product listing snapshot
    'other'                 -- Other evidence
  ));

-- Add file metadata columns to evidence
ALTER TABLE chargeback_evidence ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE chargeback_evidence ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE chargeback_evidence ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE chargeback_evidence ADD COLUMN IF NOT EXISTS is_auto_populated BOOLEAN DEFAULT false;
