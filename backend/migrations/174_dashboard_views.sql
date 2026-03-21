-- ============================================================================
-- Migration 174: Real-Time Retail Dashboard Views
--
-- Creates materialized view mv_daily_sales (refreshed via cron every 15 min)
-- and regular views for brand margins, aging inventory, and rep performance.
--
-- Corrected table/column names:
--   transactions (PK: transaction_id), NOT pos_transactions
--   transaction_items (product_id, quantity, unit_price_cents, unit_cost_cents)
--   payments (payment_method, transaction_id)
--   products.manufacturer (TEXT), NOT brands table
--   registers.location (TEXT) via register_shifts — no FK location_id
--   variant_inventory.product_id, NOT variant_id
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. MATERIALIZED VIEW: mv_daily_sales
--    Aggregates daily sales by salesperson and register location.
--    Refreshed CONCURRENTLY every 15 min via cron job.
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_sales AS
SELECT
  DATE(t.created_at)                                       AS sale_date,
  t.salesperson_id,
  r.location                                               AS register_location,
  COUNT(*)                                                 AS transaction_count,
  SUM(COALESCE(t.total_amount_cents,
      ROUND(t.total_amount * 100)::int))                   AS total_revenue_cents,
  SUM(COALESCE(t.subtotal_cents,
      ROUND(t.subtotal * 100)::int))                       AS total_subtotal_cents,
  AVG(COALESCE(t.total_amount_cents,
      ROUND(t.total_amount * 100)::int))::int              AS avg_transaction_cents,
  -- Payment method breakdown (from payments table)
  COUNT(DISTINCT t.transaction_id)
    FILTER (WHERE p_agg.has_cash)                          AS cash_count,
  COUNT(DISTINCT t.transaction_id)
    FILTER (WHERE p_agg.has_debit)                         AS debit_count,
  COUNT(DISTINCT t.transaction_id)
    FILTER (WHERE p_agg.has_credit)                        AS credit_count,
  COUNT(DISTINCT t.transaction_id)
    FILTER (WHERE p_agg.has_financing)                     AS financing_count
FROM transactions t
LEFT JOIN register_shifts rs ON rs.shift_id = t.shift_id
LEFT JOIN registers r        ON r.register_id = rs.register_id
LEFT JOIN LATERAL (
  SELECT
    BOOL_OR(pm.payment_method = 'cash')      AS has_cash,
    BOOL_OR(pm.payment_method = 'debit')     AS has_debit,
    BOOL_OR(pm.payment_method = 'credit')    AS has_credit,
    BOOL_OR(pm.payment_method = 'gift_card'
         OR pm.payment_method = 'financing') AS has_financing
  FROM payments pm
  WHERE pm.transaction_id = t.transaction_id
) p_agg ON true
WHERE t.status = 'completed'
GROUP BY DATE(t.created_at), t.salesperson_id, r.location;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_sales_pk
  ON mv_daily_sales(sale_date, salesperson_id, register_location);

-- ============================================================================
-- 2. VIEW: v_brand_margins (uses products.manufacturer as "brand")
-- ============================================================================

CREATE OR REPLACE VIEW v_brand_margins AS
SELECT
  p.manufacturer                                           AS brand_name,
  ti.product_id,
  p.name                                                   AS product_name,
  p.sku,
  ti.quantity,
  COALESCE(ti.unit_price_cents,
           ROUND(ti.unit_price * 100)::int)                AS sell_price_cents,
  COALESCE(ti.unit_cost_cents,
           ROUND(COALESCE(ti.unit_cost, 0) * 100)::int)   AS cost_cents,
  COALESCE(ti.unit_price_cents,
           ROUND(ti.unit_price * 100)::int)
    - COALESCE(ti.unit_cost_cents,
               ROUND(COALESCE(ti.unit_cost, 0) * 100)::int)
                                                           AS margin_cents,
  ROUND(
    (COALESCE(ti.unit_price_cents, ROUND(ti.unit_price * 100)::int)
      - COALESCE(ti.unit_cost_cents, ROUND(COALESCE(ti.unit_cost, 0) * 100)::int))::NUMERIC
    / NULLIF(COALESCE(ti.unit_price_cents,
                      ROUND(ti.unit_price * 100)::int), 0) * 100, 2
  )                                                        AS margin_pct,
  DATE(t.created_at)                                       AS sale_date,
  r.location                                               AS register_location,
  t.salesperson_id
FROM transaction_items ti
JOIN transactions t    ON t.transaction_id = ti.transaction_id
JOIN products p        ON p.id = ti.product_id
LEFT JOIN register_shifts rs ON rs.shift_id = t.shift_id
LEFT JOIN registers r        ON r.register_id = rs.register_id
WHERE t.status = 'completed';

-- ============================================================================
-- 3. VIEW: v_aging_inventory
-- ============================================================================

CREATE OR REPLACE VIEW v_aging_inventory AS
SELECT
  p.name                                                   AS product_name,
  p.sku,
  p.variant_sku,
  p.manufacturer                                           AS brand,
  c.name                                                   AS category,
  vi.qty_on_hand,
  vi.location_id,
  l.name                                                   AS location_name,
  COALESCE(p.cost, 0) * 100 * vi.qty_on_hand              AS inventory_value_cents,
  MAX(t.created_at)                                        AS last_sold_at,
  EXTRACT(EPOCH FROM
    (NOW() - MAX(t.created_at))) / 86400                   AS days_since_last_sale,
  CASE
    WHEN MAX(t.created_at) IS NULL
      THEN 'never_sold'
    WHEN MAX(t.created_at) < NOW() - INTERVAL '120 days'
      THEN 'critical'
    WHEN MAX(t.created_at) < NOW() - INTERVAL '90 days'
      THEN 'warning'
    WHEN MAX(t.created_at) < NOW() - INTERVAL '60 days'
      THEN 'watch'
    ELSE 'healthy'
  END                                                      AS aging_status
FROM variant_inventory vi
JOIN products p           ON p.id = vi.product_id
LEFT JOIN categories c    ON c.id = p.category_id
LEFT JOIN locations l     ON l.id = vi.location_id
LEFT JOIN transaction_items ti ON ti.product_id = p.id
LEFT JOIN transactions t
  ON t.transaction_id = ti.transaction_id
  AND t.status = 'completed'
WHERE vi.qty_on_hand > 0
  AND p.is_active = true
GROUP BY p.name, p.sku, p.variant_sku, p.manufacturer, c.name,
         vi.qty_on_hand, vi.location_id, l.name, p.cost;

-- ============================================================================
-- 4. VIEW: v_rep_performance
-- ============================================================================

CREATE OR REPLACE VIEW v_rep_performance AS
SELECT
  u.id                                                     AS rep_id,
  COALESCE(u.first_name || ' ' || u.last_name,
           u.name)                                         AS rep_name,
  DATE(t.created_at)                                       AS sale_date,
  r.location                                               AS register_location,
  COUNT(*)                                                 AS transaction_count,
  SUM(COALESCE(t.total_amount_cents,
      ROUND(t.total_amount * 100)::int))                   AS revenue_cents,
  AVG(COALESCE(t.total_amount_cents,
      ROUND(t.total_amount * 100)::int))::int              AS avg_transaction_cents
FROM transactions t
JOIN users u ON u.id = t.salesperson_id
LEFT JOIN register_shifts rs ON rs.shift_id = t.shift_id
LEFT JOIN registers r        ON r.register_id = rs.register_id
WHERE t.status = 'completed'
  AND t.salesperson_id IS NOT NULL
GROUP BY u.id, u.first_name, u.last_name, u.name,
         DATE(t.created_at), r.location;

COMMIT;
