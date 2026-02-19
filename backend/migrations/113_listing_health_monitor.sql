-- Migration 113: Listing health issues table
-- ListingHealthMonitor scans channel listings and records issues for dashboard/auto-fix.

CREATE TABLE IF NOT EXISTS listing_issues (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER REFERENCES products(id) ON DELETE CASCADE,
  channel_id      INTEGER REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  issue_type      VARCHAR(50) NOT NULL,
  severity        VARCHAR(10) DEFAULT 'WARNING',
  details         JSONB DEFAULT '{}',
  auto_fixable    BOOLEAN DEFAULT false,
  fix_applied     BOOLEAN DEFAULT false,
  fix_applied_at  TIMESTAMP,
  detected_at     TIMESTAMP DEFAULT NOW(),
  resolved_at     TIMESTAMP,
  UNIQUE(product_id, channel_id, issue_type)
);

CREATE INDEX IF NOT EXISTS idx_listing_issues_open ON listing_issues(channel_id, severity) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listing_issues_product ON listing_issues(product_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listing_issues_type ON listing_issues(issue_type) WHERE resolved_at IS NULL;
