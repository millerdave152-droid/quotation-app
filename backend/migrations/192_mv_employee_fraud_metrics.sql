-- Migration 160: Materialized view for employee fraud behavioral analysis
-- Rolling 30-day metrics per employee with peer-comparison z-scores.
-- Minimum 20 transactions threshold to avoid false positives on low activity.
-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires a UNIQUE INDEX.

-- Drop the old 90-day materialized view from migration 098 (if exists)
DROP MATERIALIZED VIEW IF EXISTS employee_fraud_metrics;

-- Create the new 30-day rolling metrics materialized view (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_employee_fraud_metrics'
  ) THEN
    EXECUTE $mv$
CREATE MATERIALIZED VIEW mv_employee_fraud_metrics AS
WITH employee_txns AS (
  SELECT
    t.user_id,
    COUNT(*)                                              AS total_transactions,
    COALESCE(SUM(t.total_amount), 0)                      AS total_sales_amount,
    COALESCE(AVG(t.total_amount), 0)                      AS avg_transaction_amount,
    -- Void metrics
    COUNT(*) FILTER (WHERE t.status = 'voided')           AS void_count,
    -- Discount metrics
    COUNT(*) FILTER (WHERE t.discount_amount > 0)         AS discount_count,
    COALESCE(AVG(
      CASE WHEN t.discount_amount > 0 AND t.total_amount > 0
        THEN (t.discount_amount / t.total_amount * 100)
      END
    ), 0)                                                 AS avg_discount_percent,
    COALESCE(MAX(
      CASE WHEN t.discount_amount > 0 AND t.total_amount > 0
        THEN (t.discount_amount / t.total_amount * 100)
      END
    ), 0)                                                 AS max_discount_percent
  FROM transactions t
  WHERE t.created_at >= NOW() - INTERVAL '30 days'
    AND t.user_id IS NOT NULL
  GROUP BY t.user_id
  HAVING COUNT(*) >= 20
),
employee_refunds AS (
  SELECT
    pr.processed_by                          AS user_id,
    COUNT(*)                                 AS refund_count,
    COALESCE(SUM(pr.total_refund_amount), 0) AS refund_total
  FROM pos_returns pr
  WHERE pr.created_at >= NOW() - INTERVAL '30 days'
    AND pr.processed_by IS NOT NULL
  GROUP BY pr.processed_by
),
employee_audit AS (
  SELECT
    al.user_id,
    COUNT(*) FILTER (
      WHERE al.action ILIKE '%manual_entry%'
         OR al.action ILIKE '%keyed%'
         OR al.action ILIKE '%manual%entry%'
    ) AS manual_entry_count,
    COUNT(*) FILTER (
      WHERE al.action ILIKE '%no_sale%'
         OR al.action ILIKE '%drawer_open%'
         OR al.action ILIKE '%no sale%'
    ) AS no_sale_drawer_opens,
    COUNT(*) FILTER (
      WHERE al.action ILIKE '%price_override%'
         OR al.action ILIKE '%price override%'
    ) AS price_override_count
  FROM audit_log al
  WHERE al.created_at >= NOW() - INTERVAL '30 days'
    AND al.user_id IS NOT NULL
  GROUP BY al.user_id
),
base_metrics AS (
  SELECT
    et.user_id,
    et.total_transactions,
    et.total_sales_amount,
    et.avg_transaction_amount,
    et.void_count,
    CASE WHEN et.total_transactions > 0
      THEN et.void_count::DECIMAL / et.total_transactions
      ELSE 0
    END                                         AS void_rate,
    COALESCE(er.refund_count, 0)                AS refund_count,
    CASE WHEN et.total_transactions > 0
      THEN COALESCE(er.refund_count, 0)::DECIMAL / et.total_transactions
      ELSE 0
    END                                         AS refund_rate,
    COALESCE(er.refund_total, 0)                AS refund_total,
    et.discount_count,
    CASE WHEN et.total_transactions > 0
      THEN et.discount_count::DECIMAL / et.total_transactions
      ELSE 0
    END                                         AS discount_rate,
    et.avg_discount_percent,
    et.max_discount_percent,
    COALESCE(ea.manual_entry_count, 0)          AS manual_entry_count,
    COALESCE(ea.no_sale_drawer_opens, 0)        AS no_sale_drawer_opens,
    COALESCE(ea.price_override_count, 0)        AS price_override_count
  FROM employee_txns et
  LEFT JOIN employee_refunds er ON er.user_id = et.user_id
  LEFT JOIN employee_audit ea   ON ea.user_id = et.user_id
)
SELECT
  bm.*,
  -- Z-scores: compare each employee's rate against ALL peers (AVG + STDDEV)
  CASE WHEN STDDEV_POP(bm.void_rate) OVER () > 0
    THEN ROUND(((bm.void_rate - AVG(bm.void_rate) OVER ()) / STDDEV_POP(bm.void_rate) OVER ())::NUMERIC, 3)
    ELSE 0
  END AS void_rate_zscore,
  CASE WHEN STDDEV_POP(bm.refund_rate) OVER () > 0
    THEN ROUND(((bm.refund_rate - AVG(bm.refund_rate) OVER ()) / STDDEV_POP(bm.refund_rate) OVER ())::NUMERIC, 3)
    ELSE 0
  END AS refund_rate_zscore,
  CASE WHEN STDDEV_POP(bm.discount_rate) OVER () > 0
    THEN ROUND(((bm.discount_rate - AVG(bm.discount_rate) OVER ()) / STDDEV_POP(bm.discount_rate) OVER ())::NUMERIC, 3)
    ELSE 0
  END AS discount_rate_zscore,
  -- Peer averages for comparison display
  ROUND(AVG(bm.void_rate) OVER ()::NUMERIC, 4)     AS peer_avg_void_rate,
  ROUND(AVG(bm.refund_rate) OVER ()::NUMERIC, 4)    AS peer_avg_refund_rate,
  ROUND(AVG(bm.discount_rate) OVER ()::NUMERIC, 4)  AS peer_avg_discount_rate,
  NOW() AS computed_at
FROM base_metrics bm
    $mv$;
  END IF;
END $$;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_emf_user_id ON mv_employee_fraud_metrics (user_id);
CREATE INDEX IF NOT EXISTS idx_mv_emf_void_zscore ON mv_employee_fraud_metrics (void_rate_zscore);
CREATE INDEX IF NOT EXISTS idx_mv_emf_refund_zscore ON mv_employee_fraud_metrics (refund_rate_zscore);
CREATE INDEX IF NOT EXISTS idx_mv_emf_discount_zscore ON mv_employee_fraud_metrics (discount_rate_zscore);
