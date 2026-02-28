-- ============================================================================
-- Migration 156: Amendment Audit Views, Tiered Permissions & CM Number Function
-- ============================================================================
-- Creates:
--   1. amendment_permissions table (tiered role-based dollar limits)
--   2. v_amendment_audit_report view (comprehensive audit join)
--   3. v_year_end_tax_summary view (monthly aggregated tax reporting)
--   4. generate_credit_memo_number() function (CM-YYYY-00001 format)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. AMENDMENT PERMISSIONS TABLE (tiered role-based dollar limits)
-- ============================================================================

CREATE TABLE IF NOT EXISTS amendment_permissions (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  can_edit_pre_invoice BOOLEAN NOT NULL DEFAULT true,
  can_edit_post_invoice BOOLEAN NOT NULL DEFAULT false,
  max_adjustment_cents INTEGER,  -- NULL = unlimited
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  can_create_credit_memos BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default permissions
INSERT INTO amendment_permissions (role_name, can_edit_pre_invoice, can_edit_post_invoice, max_adjustment_cents, requires_approval, can_approve, can_create_credit_memos, notes) VALUES
  ('cashier',      true,  false, NULL,    true,  false, false, 'Can flag issues for managers'),
  ('sales',        true,  false, 50000,   true,  false, false, 'Direct edit on drafts/quotes up to $500'),
  ('senior_sales', true,  false, 50000,   true,  false, false, 'Direct edit on drafts/quotes up to $500'),
  ('manager',      true,  true,  500000,  false, true,  true,  'Can approve staff requests, edit up to $5,000'),
  ('admin',        true,  true,  NULL,    false, true,  true,  'Full access, no approval needed'),
  ('master',       true,  true,  NULL,    false, true,  true,  'System-level, for Dave')
ON CONFLICT (role_name) DO NOTHING;

-- ============================================================================
-- 1b. ORDER AMENDMENT ITEMS TABLE (if not yet created by migration 008)
-- ============================================================================
-- Stores line-item details for each amendment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_amendment_items (
  id SERIAL PRIMARY KEY,
  amendment_id INTEGER NOT NULL REFERENCES order_amendments(id) ON DELETE CASCADE,

  -- Item reference
  order_item_id INTEGER REFERENCES order_items(id),
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100),

  -- Change details
  change_type VARCHAR(20) NOT NULL,  -- 'add', 'remove', 'modify'

  -- Quantities
  previous_quantity INTEGER DEFAULT 0,
  new_quantity INTEGER DEFAULT 0,
  quantity_change INTEGER NOT NULL DEFAULT 0,

  -- Prices (all in cents)
  quote_price_cents INTEGER,
  current_price_cents INTEGER,
  applied_price_cents INTEGER NOT NULL,

  -- Impact
  line_difference_cents INTEGER NOT NULL DEFAULT 0,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amendment_items_amendment ON order_amendment_items(amendment_id);
CREATE INDEX IF NOT EXISTS idx_amendment_items_product ON order_amendment_items(product_id);

-- ============================================================================
-- 2. v_amendment_audit_report VIEW
-- ============================================================================
-- Comprehensive audit view joining amendments with orders, customers, users,
-- credit memos, and amendment line items (aggregated as JSONB).
-- NOTE: customers.name is a single column (not first_name/last_name).
--       users has first_name + last_name.
--       orders PK is id. customers PK is id. users PK is id.
-- ============================================================================

CREATE OR REPLACE VIEW v_amendment_audit_report AS
SELECT
  a.id                                          AS amendment_id,
  a.amendment_number,
  a.created_at                                  AS amendment_date,
  a.amendment_type,
  a.status                                      AS amendment_status,
  o.id                                          AS order_id,
  o.order_number,
  c.name                                        AS customer_name,
  cu.first_name || ' ' || cu.last_name          AS requested_by,
  au.first_name || ' ' || au.last_name          AS approved_by,
  a.previous_total_cents / 100.0                AS previous_total,
  a.new_total_cents / 100.0                     AS new_total,
  a.difference_cents / 100.0                    AS difference,
  a.rejection_reason,
  cm.credit_memo_number,
  cm.total_cents / 100.0                        AS credit_memo_total,
  cm.status                                     AS credit_memo_status,
  (
    SELECT json_agg(json_build_object(
      'change_type',        ai.change_type,
      'product_name',       ai.product_name,
      'previous_quantity',  ai.previous_quantity,
      'new_quantity',       ai.new_quantity,
      'price_cents',        ai.applied_price_cents
    ))
    FROM order_amendment_items ai
    WHERE ai.amendment_id = a.id
  )                                             AS items_changed
FROM order_amendments a
JOIN orders o            ON a.order_id    = o.id
LEFT JOIN customers c    ON o.customer_id = c.id
LEFT JOIN users cu       ON a.created_by  = cu.id
LEFT JOIN users au       ON a.approved_by = au.id
LEFT JOIN credit_memos cm ON cm.amendment_id = a.id;

-- ============================================================================
-- 3. v_year_end_tax_summary VIEW
-- ============================================================================
-- Monthly aggregated summary for year-end tax reporting.
-- Shows amendment counts, net adjustments, and credit memo totals.
-- ============================================================================

CREATE OR REPLACE VIEW v_year_end_tax_summary AS
SELECT
  date_trunc('month', a.created_at)                                                       AS month,
  COUNT(*)                                                                                AS total_amendments,
  COUNT(*) FILTER (WHERE a.status = 'applied')                                            AS applied_amendments,
  COUNT(*) FILTER (WHERE a.status = 'rejected')                                           AS rejected_amendments,
  COALESCE(SUM(a.difference_cents) FILTER (WHERE a.status = 'applied'), 0) / 100.0       AS net_adjustment_total,
  COALESCE(SUM(CASE WHEN a.difference_cents > 0 THEN a.difference_cents ELSE 0 END)
    FILTER (WHERE a.status = 'applied'), 0) / 100.0                                       AS total_increases,
  COALESCE(SUM(CASE WHEN a.difference_cents < 0 THEN ABS(a.difference_cents) ELSE 0 END)
    FILTER (WHERE a.status = 'applied'), 0) / 100.0                                       AS total_decreases,
  COUNT(DISTINCT cm.id)                                                                   AS credit_memos_issued,
  COALESCE(SUM(cm.total_cents) FILTER (WHERE cm.status IN ('issued', 'applied')), 0) / 100.0 AS credit_memo_total
FROM order_amendments a
LEFT JOIN credit_memos cm ON cm.amendment_id = a.id
GROUP BY date_trunc('month', a.created_at)
ORDER BY month;

-- ============================================================================
-- 4. generate_credit_memo_number() FUNCTION
-- ============================================================================
-- Generates year-prefixed credit memo numbers: CM-2026-00001
-- Uses the existing credit_memo_number_seq sequence (created in migration 155).
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_credit_memo_number() RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  current_year TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::TEXT;
  next_num := nextval('credit_memo_number_seq');
  RETURN 'CM-' || current_year || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- NOTE: Update CreditMemoService.js to call:
--   SELECT generate_credit_memo_number() AS credit_memo_number
-- instead of manual string formatting.

COMMIT;
