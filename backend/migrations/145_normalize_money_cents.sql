-- ============================================================================
-- Migration 145: Add *_cents INTEGER columns alongside existing DECIMAL columns
-- Enables dual-write period: new code writes both, reads prefer _cents
-- Follow-up migration will drop old DECIMAL columns after validation
-- ============================================================================

-- ── transactions ────────────────────────────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hst_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gst_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pst_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS balance_due_cents INTEGER;

-- Backfill from existing DECIMAL columns
UPDATE transactions SET
  subtotal_cents       = ROUND(COALESCE(subtotal, 0) * 100)::INTEGER,
  discount_amount_cents = ROUND(COALESCE(discount_amount, 0) * 100)::INTEGER,
  hst_amount_cents     = ROUND(COALESCE(hst_amount, 0) * 100)::INTEGER,
  gst_amount_cents     = ROUND(COALESCE(gst_amount, 0) * 100)::INTEGER,
  pst_amount_cents     = ROUND(COALESCE(pst_amount, 0) * 100)::INTEGER,
  total_amount_cents   = ROUND(COALESCE(total_amount, 0) * 100)::INTEGER,
  deposit_amount_cents = CASE WHEN deposit_amount IS NOT NULL THEN ROUND(deposit_amount * 100)::INTEGER END,
  balance_due_cents    = CASE WHEN balance_due IS NOT NULL THEN ROUND(balance_due * 100)::INTEGER END
WHERE subtotal_cents IS NULL;

-- ── transaction_items ───────────────────────────────────────────────────
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS unit_price_cents INTEGER;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS tax_amount_cents INTEGER;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS line_total_cents INTEGER;

UPDATE transaction_items SET
  unit_price_cents      = ROUND(COALESCE(unit_price, 0) * 100)::INTEGER,
  unit_cost_cents       = CASE WHEN unit_cost IS NOT NULL THEN ROUND(unit_cost * 100)::INTEGER END,
  discount_amount_cents = ROUND(COALESCE(discount_amount, 0) * 100)::INTEGER,
  tax_amount_cents      = ROUND(COALESCE(tax_amount, 0) * 100)::INTEGER,
  line_total_cents      = ROUND(COALESCE(line_total, 0) * 100)::INTEGER
WHERE unit_price_cents IS NULL;

-- ── payments ────────────────────────────────────────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_cents INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_tendered_cents INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS change_given_cents INTEGER;

UPDATE payments SET
  amount_cents        = ROUND(COALESCE(amount, 0) * 100)::INTEGER,
  cash_tendered_cents = CASE WHEN cash_tendered IS NOT NULL THEN ROUND(cash_tendered * 100)::INTEGER END,
  change_given_cents  = CASE WHEN change_given IS NOT NULL THEN ROUND(change_given * 100)::INTEGER END
WHERE amount_cents IS NULL;

-- ── register_shifts ─────────────────────────────────────────────────────
ALTER TABLE register_shifts ADD COLUMN IF NOT EXISTS opening_cash_cents INTEGER;
ALTER TABLE register_shifts ADD COLUMN IF NOT EXISTS closing_cash_cents INTEGER;
ALTER TABLE register_shifts ADD COLUMN IF NOT EXISTS expected_cash_cents INTEGER;
ALTER TABLE register_shifts ADD COLUMN IF NOT EXISTS cash_variance_cents INTEGER;

UPDATE register_shifts SET
  opening_cash_cents  = ROUND(COALESCE(opening_cash, 0) * 100)::INTEGER,
  closing_cash_cents  = CASE WHEN closing_cash IS NOT NULL THEN ROUND(closing_cash * 100)::INTEGER END,
  expected_cash_cents = CASE WHEN expected_cash IS NOT NULL THEN ROUND(expected_cash * 100)::INTEGER END,
  cash_variance_cents = CASE WHEN cash_variance IS NOT NULL THEN ROUND(cash_variance * 100)::INTEGER END
WHERE opening_cash_cents IS NULL;
