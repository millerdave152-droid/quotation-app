-- Migration 171: Voice-to-Text Interaction Notes
-- Creates customer_notes table with voice transcription support,
-- AI-structured content, action items, and follow-up tracking.

BEGIN;

-- ============================================================================
-- 1. CREATE customer_notes TABLE
-- ============================================================================
-- The table did not previously exist as a standalone entity.
-- customer_notes was only a TEXT column on unified_orders / order_fulfillment.

CREATE TABLE IF NOT EXISTS customer_notes (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,                       -- Human-readable note / summary
  note_type       VARCHAR(30) DEFAULT 'general',       -- general, phone_call, walk_in, site_visit, email
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Voice / AI extension columns
  structured_content  JSONB,                           -- Full Claude JSON response
  action_items        TEXT[],                           -- Extracted next steps
  follow_up_date      DATE,                            -- Explicit follow-up date if mentioned
  sentiment           VARCHAR(20)                      -- positive | neutral | negative | urgent
                      CHECK (sentiment IN ('positive','neutral','negative','urgent')),
  tags                TEXT[],                           -- Searchable tags array
  transcription_raw   TEXT,                            -- Raw Whisper transcription
  note_source         VARCHAR(20) DEFAULT 'manual'     -- manual | voice | system
                      CHECK (note_source IN ('manual','voice','system')),
  audio_url           TEXT,                            -- S3 URL of original audio (30-day retention)
  processing_status   VARCHAR(20) DEFAULT 'complete'   -- pending | processing | complete | failed
                      CHECK (processing_status IN ('pending','processing','complete','failed')),
  processed_at        TIMESTAMPTZ
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Base lookup
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id
  ON customer_notes(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_notes_created_by
  ON customer_notes(created_by);

CREATE INDEX IF NOT EXISTS idx_customer_notes_created_at
  ON customer_notes(created_at DESC);

-- GIN indexes for array search (Phase 3 AI search)
CREATE INDEX IF NOT EXISTS idx_customer_notes_tags
  ON customer_notes USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_customer_notes_action_items
  ON customer_notes USING GIN(action_items);

-- Follow-up date partial index
CREATE INDEX IF NOT EXISTS idx_customer_notes_follow_up
  ON customer_notes(follow_up_date)
  WHERE follow_up_date IS NOT NULL;

-- Source filter
CREATE INDEX IF NOT EXISTS idx_customer_notes_source
  ON customer_notes(note_source);

-- ============================================================================
-- 3. AUTO-UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_notes_updated_at'
  ) THEN
    CREATE TRIGGER trg_customer_notes_updated_at
      BEFORE UPDATE ON customer_notes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- ============================================================================
-- 4. RBAC PERMISSIONS
-- ============================================================================

INSERT INTO permissions (code, name, description, category) VALUES
  ('customer_notes.view',   'View Customer Notes',   'View interaction notes for customers',   'CRM'),
  ('customer_notes.create', 'Create Customer Notes', 'Create interaction notes for customers', 'CRM'),
  ('customer_notes.edit',   'Edit Customer Notes',   'Edit interaction notes for customers',   'CRM'),
  ('customer_notes.delete', 'Delete Customer Notes', 'Delete interaction notes for customers', 'CRM'),
  ('customer_notes.voice',  'Voice Notes',           'Record and transcribe voice notes',      'CRM')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin and manager roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'manager')
  AND p.code IN (
    'customer_notes.view', 'customer_notes.create',
    'customer_notes.edit', 'customer_notes.delete',
    'customer_notes.voice'
  )
ON CONFLICT DO NOTHING;

-- Grant view + create + voice to sales role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'sales'
  AND p.code IN (
    'customer_notes.view', 'customer_notes.create',
    'customer_notes.voice'
  )
ON CONFLICT DO NOTHING;

COMMIT;
