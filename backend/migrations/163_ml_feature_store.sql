-- Migration 163: ML Feature Store — Materialized views for fraud ML features
-- Pre-computes per-card, per-customer, and per-location aggregates
-- Refreshed hourly by cron for real-time feature serving

-- ============================================================================
-- Per-card aggregates (7d / 30d / 90d windows)
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_card_features AS
SELECT
  card_bin || card_last_four AS card_key,
  card_bin,
  card_last_four,
  card_brand,

  -- 7-day window
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS txn_count_7d,
  COALESCE(AVG(amount) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::numeric(12,2) AS avg_amount_7d,
  COALESCE(MAX(amount) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::numeric(12,2) AS max_amount_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND action_taken = 'declined')::int AS decline_count_7d,

  -- 30-day window
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS txn_count_30d,
  COALESCE(AVG(amount) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)::numeric(12,2) AS avg_amount_30d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND action_taken = 'declined')::int AS decline_count_30d,

  -- 90-day window
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::int AS txn_count_90d,
  COALESCE(AVG(amount) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days'), 0)::numeric(12,2) AS avg_amount_90d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days' AND action_taken = 'declined')::int AS decline_count_90d,

  -- Decline rate (90d)
  CASE WHEN COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days') > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days' AND action_taken = 'declined')::numeric /
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::numeric, 4
    )
    ELSE 0
  END AS decline_rate_90d,

  -- Distinct locations used (90d)
  COUNT(DISTINCT location_id) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::int AS distinct_locations_90d,

  MAX(created_at) AS last_seen

FROM fraud_scores
WHERE card_bin IS NOT NULL AND card_last_four IS NOT NULL
GROUP BY card_bin, card_last_four, card_brand;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_card_features_key ON mv_card_features(card_key);

-- ============================================================================
-- Per-customer aggregates
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_features AS
SELECT
  t.customer_id,

  -- Lifetime stats
  COUNT(*)::int AS total_transactions,
  COALESCE(SUM(t.total_amount), 0)::numeric(12,2) AS lifetime_value,
  COALESCE(AVG(t.total_amount), 0)::numeric(12,2) AS avg_order_value,
  MIN(t.created_at) AS first_transaction_date,
  MAX(t.created_at) AS last_transaction_date,
  EXTRACT(DAY FROM NOW() - MIN(t.created_at))::int AS account_age_days,

  -- Return rate
  COUNT(*) FILTER (WHERE t.status = 'refunded')::int AS refund_count,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE t.status = 'refunded')::numeric / COUNT(*)::numeric, 4)
    ELSE 0
  END AS return_rate,

  -- Chargeback count
  COALESCE(cb_agg.chargeback_count, 0)::int AS chargeback_count,

  -- 30-day activity
  COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '30 days')::int AS txn_count_30d,
  COALESCE(SUM(t.total_amount) FILTER (WHERE t.created_at >= NOW() - INTERVAL '30 days'), 0)::numeric(12,2) AS spend_30d,

  -- Void rate
  COUNT(*) FILTER (WHERE t.status = 'voided')::int AS void_count,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE t.status = 'voided')::numeric / COUNT(*)::numeric, 4)
    ELSE 0
  END AS void_rate

FROM transactions t
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS chargeback_count
  FROM chargeback_cases cc
  WHERE cc.customer_id = t.customer_id
) cb_agg ON true
WHERE t.customer_id IS NOT NULL
GROUP BY t.customer_id, cb_agg.chargeback_count;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_customer_features_id ON mv_customer_features(customer_id);

-- ============================================================================
-- Per-location aggregates
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_location_features AS
SELECT
  fs.location_id,

  -- Transaction stats (30d)
  COUNT(*)::int AS txn_count_30d,
  COALESCE(AVG(fs.amount), 0)::numeric(12,2) AS avg_amount_30d,
  COALESCE(STDDEV_POP(fs.amount), 0)::numeric(12,2) AS stddev_amount_30d,

  -- Fraud rate (30d)
  COUNT(*) FILTER (WHERE fs.risk_level IN ('high', 'critical'))::int AS high_risk_count_30d,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE fs.risk_level IN ('high', 'critical'))::numeric / COUNT(*)::numeric, 4
    )
    ELSE 0
  END AS fraud_rate_30d,

  -- Decline rate (30d)
  COUNT(*) FILTER (WHERE fs.action_taken = 'declined')::int AS decline_count_30d,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE fs.action_taken = 'declined')::numeric / COUNT(*)::numeric, 4
    )
    ELSE 0
  END AS decline_rate_30d,

  -- Busiest hours (top 3, stored as array)
  (SELECT ARRAY_AGG(h ORDER BY cnt DESC)
   FROM (
     SELECT EXTRACT(HOUR FROM fs2.created_at)::int AS h, COUNT(*) AS cnt
     FROM fraud_scores fs2
     WHERE fs2.location_id = fs.location_id
       AND fs2.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY h
     ORDER BY cnt DESC
     LIMIT 3
   ) top_hours
  ) AS busiest_hours,

  -- Chargeback count at this location
  (SELECT COUNT(*)::int
   FROM chargeback_cases cc
   JOIN transactions t ON t.transaction_id = cc.transaction_id
   JOIN fraud_scores fs3 ON fs3.transaction_id = t.transaction_id
   WHERE fs3.location_id = fs.location_id
  ) AS chargeback_count

FROM fraud_scores fs
WHERE fs.location_id IS NOT NULL
  AND fs.created_at >= NOW() - INTERVAL '30 days'
GROUP BY fs.location_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_location_features_id ON mv_location_features(location_id);
