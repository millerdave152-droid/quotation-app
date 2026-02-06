-- Migration 027: Quote Follow-Up Tracking
-- Tracks sales rep follow-ups on expiring quotes

-- ============================================================================
-- QUOTE FOLLOW-UP TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_follow_ups (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES unified_orders(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  contact_method VARCHAR(20) DEFAULT 'phone', -- phone, email, in_person, other
  notes TEXT,
  outcome VARCHAR(50), -- interested, not_interested, callback_requested, no_answer, converted, expired
  callback_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_quote_follow_ups_quote ON quote_follow_ups(quote_id);
CREATE INDEX idx_quote_follow_ups_user ON quote_follow_ups(user_id);
CREATE INDEX idx_quote_follow_ups_created ON quote_follow_ups(created_at DESC);

-- ============================================================================
-- VIEW: Expiring Quotes with Follow-Up Status
-- ============================================================================

CREATE OR REPLACE VIEW v_expiring_quotes AS
SELECT
  uo.id AS quote_id,
  uo.order_number AS quote_number,
  uo.customer_id,
  uo.customer_name,
  uo.customer_phone,
  uo.customer_email,
  uo.total_cents AS total_value_cents,
  uo.total_cents / 100.0 AS total_value,
  uo.quote_expiry_date AS expires_at,
  uo.quote_expiry_date - CURRENT_DATE AS days_until_expiry,
  uo.salesperson_id AS assigned_rep_id,
  u.name AS assigned_rep_name,
  uo.source,
  uo.status,
  uo.created_at,
  -- Item count from order items
  (SELECT COUNT(*) FROM unified_order_items WHERE order_id = uo.id) AS item_count,
  -- Last follow-up info
  lf.last_contacted_at,
  lf.last_contact_outcome,
  lf.follow_up_count,
  -- Customer tier (if exists)
  c.tier AS customer_tier,
  c.lifetime_value_cents AS customer_lifetime_value,
  -- Priority score: lower = higher priority
  -- Factors: days until expiry (most important), value, customer tier
  CASE
    WHEN uo.quote_expiry_date - CURRENT_DATE <= 0 THEN 0
    ELSE uo.quote_expiry_date - CURRENT_DATE
  END
  - (CASE WHEN uo.total_cents > 100000 THEN 3 ELSE 0 END) -- High value quotes get priority
  - (CASE WHEN uo.total_cents > 50000 THEN 2 ELSE 0 END)
  - (CASE
      WHEN c.tier = 'platinum' THEN 3
      WHEN c.tier = 'gold' THEN 2
      WHEN c.tier = 'silver' THEN 1
      ELSE 0
    END) AS priority_score
FROM unified_orders uo
LEFT JOIN users u ON u.id = uo.salesperson_id
LEFT JOIN customers c ON c.id = uo.customer_id
LEFT JOIN LATERAL (
  SELECT
    MAX(created_at) AS last_contacted_at,
    (SELECT outcome FROM quote_follow_ups WHERE quote_id = uo.id ORDER BY created_at DESC LIMIT 1) AS last_contact_outcome,
    COUNT(*) AS follow_up_count
  FROM quote_follow_ups
  WHERE quote_id = uo.id
) lf ON true
WHERE uo.source = 'quote'
  AND uo.status IN ('draft', 'quote_sent', 'quote_viewed')
  AND uo.quote_expiry_date IS NOT NULL
  AND uo.quote_expiry_date >= CURRENT_DATE;

-- ============================================================================
-- FUNCTION: Get Quote Expiry Stats
-- ============================================================================

CREATE OR REPLACE FUNCTION get_quote_expiry_stats(p_sales_rep_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  expiring_today INTEGER,
  expiring_in_3_days INTEGER,
  expiring_in_7_days INTEGER,
  expired_last_7_days INTEGER,
  total_at_risk_cents BIGINT,
  avg_quote_value_cents BIGINT,
  quotes_needing_follow_up INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE quote_expiry_date = CURRENT_DATE)::INTEGER AS expiring_today,
    COUNT(*) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '3 days')::INTEGER AS expiring_in_3_days,
    COUNT(*) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days')::INTEGER AS expiring_in_7_days,
    COUNT(*) FILTER (WHERE quote_expiry_date < CURRENT_DATE AND quote_expiry_date >= CURRENT_DATE - INTERVAL '7 days')::INTEGER AS expired_last_7_days,
    COALESCE(SUM(total_cents) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days'), 0)::BIGINT AS total_at_risk_cents,
    COALESCE(AVG(total_cents) FILTER (WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days'), 0)::BIGINT AS avg_quote_value_cents,
    COUNT(*) FILTER (
      WHERE quote_expiry_date <= CURRENT_DATE + INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM quote_follow_ups qf
          WHERE qf.quote_id = unified_orders.id
            AND qf.created_at > NOW() - INTERVAL '3 days'
        )
    )::INTEGER AS quotes_needing_follow_up
  FROM unified_orders
  WHERE source = 'quote'
    AND status IN ('draft', 'quote_sent', 'quote_viewed')
    AND quote_expiry_date IS NOT NULL
    AND quote_expiry_date >= CURRENT_DATE - INTERVAL '7 days'
    AND (p_sales_rep_id IS NULL OR salesperson_id = p_sales_rep_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE quote_follow_ups IS 'Tracks sales rep follow-up contacts on quotes';
COMMENT ON VIEW v_expiring_quotes IS 'Active quotes approaching expiration with follow-up status';
COMMENT ON FUNCTION get_quote_expiry_stats IS 'Returns aggregate stats on expiring quotes';
