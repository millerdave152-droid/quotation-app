-- Migration: 012_drafts_table.sql
-- Description: Create drafts table for quote and POS draft persistence
-- Date: 2026-01-26

-- ============================================================================
-- DRAFTS TABLE
-- Stores draft state for quotes, POS transactions, and orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,

  -- Draft identification
  draft_type VARCHAR(20) NOT NULL CHECK (draft_type IN ('quote', 'pos', 'order')),
  draft_key VARCHAR(100), -- Optional unique key (e.g., device ID + user ID)

  -- Ownership
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  register_id INTEGER REFERENCES registers(register_id) ON DELETE SET NULL,
  device_id VARCHAR(100), -- For device-specific drafts

  -- Related entities (optional)
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  quote_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,

  -- Draft data (JSONB for flexibility)
  data JSONB NOT NULL DEFAULT '{}',

  -- Summary fields for listing (denormalized for performance)
  item_count INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  customer_name VARCHAR(255),
  label VARCHAR(255), -- User-friendly label

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Optional auto-expire

  -- Sync tracking
  sync_version INTEGER DEFAULT 1,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  is_synced BOOLEAN DEFAULT FALSE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_draft_type ON drafts(draft_type);
CREATE INDEX IF NOT EXISTS idx_drafts_draft_key ON drafts(draft_key);
CREATE INDEX IF NOT EXISTS idx_drafts_device_id ON drafts(device_id);
CREATE INDEX IF NOT EXISTS idx_drafts_customer_id ON drafts(customer_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_expires_at ON drafts(expires_at) WHERE expires_at IS NOT NULL;

-- Unique constraint for draft key (one active draft per key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_unique_key
  ON drafts(draft_key)
  WHERE draft_key IS NOT NULL;

-- ============================================================================
-- DRAFT HISTORY TABLE (for audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS draft_history (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER REFERENCES drafts(id) ON DELETE CASCADE,

  -- Change tracking
  action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'updated', 'restored', 'completed', 'deleted', 'expired')),
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- Snapshot of data at this point
  data_snapshot JSONB,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_history_draft_id ON draft_history(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_history_created_at ON draft_history(created_at DESC);

-- ============================================================================
-- OFFLINE SYNC QUEUE TABLE
-- Stores operations to be synced when connection is restored
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_queue (
  id SERIAL PRIMARY KEY,

  -- Operation details
  operation_type VARCHAR(50) NOT NULL, -- 'create_transaction', 'update_draft', etc.
  entity_type VARCHAR(50) NOT NULL, -- 'transaction', 'draft', 'customer', etc.
  entity_id VARCHAR(100), -- Can be temporary ID

  -- Device/user tracking
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_id VARCHAR(100),

  -- Operation data
  payload JSONB NOT NULL,

  -- Processing status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,

  -- Priority (lower = higher priority)
  priority INTEGER DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_id ON sync_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_device_id ON sync_queue(device_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority, created_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update draft updated_at timestamp
CREATE OR REPLACE FUNCTION update_draft_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.sync_version = OLD.sync_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for draft updates
DROP TRIGGER IF EXISTS trigger_update_draft_timestamp ON drafts;
CREATE TRIGGER trigger_update_draft_timestamp
  BEFORE UPDATE ON drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_draft_timestamp();

-- Function to clean expired drafts (to be called by scheduled job)
CREATE OR REPLACE FUNCTION clean_expired_drafts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Archive to history before deleting
  INSERT INTO draft_history (draft_id, action, data_snapshot, notes, created_at)
  SELECT id, 'expired', data, 'Auto-expired by cleanup job', NOW()
  FROM drafts
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  -- Delete expired drafts
  DELETE FROM drafts
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for active drafts with user info
CREATE OR REPLACE VIEW v_active_drafts AS
SELECT
  d.id,
  d.draft_type,
  d.draft_key,
  d.user_id,
  CONCAT(u.first_name, ' ', u.last_name) as username,
  d.register_id,
  r.register_name,
  d.device_id,
  d.customer_id,
  c.name as customer_name_lookup,
  d.quote_id,
  d.item_count,
  d.total_cents,
  d.customer_name,
  d.label,
  d.created_at,
  d.updated_at,
  d.sync_version,
  d.is_synced,
  EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 60 as minutes_since_update
FROM drafts d
LEFT JOIN users u ON d.user_id = u.id
LEFT JOIN registers r ON d.register_id = r.register_id
LEFT JOIN customers c ON d.customer_id = c.id
WHERE d.expires_at IS NULL OR d.expires_at > NOW()
ORDER BY d.updated_at DESC;

-- View for pending sync operations
CREATE OR REPLACE VIEW v_pending_sync AS
SELECT
  sq.*,
  CONCAT(u.first_name, ' ', u.last_name) as username
FROM sync_queue sq
LEFT JOIN users u ON sq.user_id = u.id
WHERE sq.status IN ('pending', 'failed')
  AND sq.retry_count < sq.max_retries
ORDER BY sq.priority, sq.created_at;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE drafts IS 'Stores draft state for quotes, POS transactions, and orders with offline support';
COMMENT ON TABLE draft_history IS 'Audit trail for draft changes';
COMMENT ON TABLE sync_queue IS 'Queue for offline operations to be synced when connection restored';
COMMENT ON COLUMN drafts.draft_key IS 'Unique identifier for draft (e.g., device_id:user_id:type)';
COMMENT ON COLUMN drafts.sync_version IS 'Incremented on each update for conflict detection';
COMMENT ON COLUMN sync_queue.priority IS 'Lower numbers = higher priority (default 10)';
