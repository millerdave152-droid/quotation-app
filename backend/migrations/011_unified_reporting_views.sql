-- ============================================
-- UNIFIED REPORTING VIEWS
-- Combines Quote and POS data for analytics
-- ============================================

-- Drop existing views first (in reverse dependency order)
DROP VIEW IF EXISTS v_category_performance CASCADE;
DROP VIEW IF EXISTS v_monthly_sales_trend CASCADE;
DROP VIEW IF EXISTS v_hourly_sales_pattern CASCADE;
DROP VIEW IF EXISTS v_sales_rep_performance CASCADE;
DROP VIEW IF EXISTS v_customer_purchase_history CASCADE;
DROP VIEW IF EXISTS v_product_performance CASCADE;
DROP VIEW IF EXISTS v_quote_conversion CASCADE;
DROP VIEW IF EXISTS v_daily_sales_summary CASCADE;
DROP VIEW IF EXISTS v_unified_sales CASCADE;

-- ============================================
-- 1. UNIFIED SALES VIEW
-- Combines quotes (converted to orders) and POS transactions
-- ============================================

CREATE OR REPLACE VIEW v_unified_sales AS
-- Quote-based sales (converted quotes)
SELECT
  'quote' as source,
  q.id as source_id,
  q.quotation_number as reference_number,
  q.customer_id,
  c.name as customer_name,
  c.company,
  'account' as customer_type,
  q.created_at as created_date,
  q.accepted_at as completed_date,
  COALESCE(q.subtotal_cents, 0) / 100.0 as subtotal,
  COALESCE(q.discount_cents, 0) / 100.0 as discount_amount,
  COALESCE(q.tax_cents, 0) / 100.0 as tax_amount,
  COALESCE(q.total_cents, 0) / 100.0 as total_amount,
  q.sales_rep_name,
  NULL::integer as register_id,
  NULL::varchar as register_name,
  NULL::integer as shift_id,
  q.status,
  CASE WHEN UPPER(q.status) IN ('ACCEPTED', 'WON', 'APPROVED') THEN true ELSE false END as is_completed
FROM quotations q
LEFT JOIN customers c ON q.customer_id = c.id
WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')

UNION ALL

-- POS transactions
SELECT
  'pos' as source,
  t.transaction_id as source_id,
  t.transaction_number as reference_number,
  t.customer_id,
  c.name as customer_name,
  c.company,
  CASE WHEN t.customer_id IS NULL THEN 'walk-in' ELSE 'account' END as customer_type,
  t.created_at as created_date,
  t.created_at as completed_date,
  COALESCE(t.subtotal, 0) as subtotal,
  COALESCE(t.discount_amount, 0) as discount_amount,
  COALESCE(t.hst_amount, 0) + COALESCE(t.gst_amount, 0) + COALESCE(t.pst_amount, 0) as tax_amount,
  COALESCE(t.total_amount, 0) as total_amount,
  u.first_name || ' ' || u.last_name as sales_rep_name,
  rs.register_id,
  r.register_name,
  t.shift_id,
  t.status,
  CASE WHEN t.status = 'completed' THEN true ELSE false END as is_completed
FROM transactions t
LEFT JOIN customers c ON t.customer_id = c.id
LEFT JOIN users u ON t.user_id = u.id
LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
LEFT JOIN registers r ON rs.register_id = r.register_id
WHERE t.status = 'completed';

-- ============================================
-- 2. DAILY SALES SUMMARY VIEW
-- ============================================

CREATE OR REPLACE VIEW v_daily_sales_summary AS
SELECT
  DATE(completed_date) as sale_date,
  source,
  COUNT(*) as transaction_count,
  SUM(subtotal) as gross_sales,
  SUM(discount_amount) as total_discounts,
  SUM(tax_amount) as total_tax,
  SUM(total_amount) as net_sales,
  AVG(total_amount) as avg_order_value,
  COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL) as unique_customers,
  COUNT(*) FILTER (WHERE customer_type = 'walk-in') as walk_in_count,
  COUNT(*) FILTER (WHERE customer_type = 'account') as account_count
FROM v_unified_sales
WHERE is_completed = true
GROUP BY DATE(completed_date), source;

-- ============================================
-- 3. QUOTE CONVERSION TRACKING VIEW
-- ============================================

CREATE OR REPLACE VIEW v_quote_conversion AS
SELECT
  q.id as quote_id,
  q.quotation_number,
  q.customer_id,
  c.name as customer_name,
  c.company,
  q.created_at as quote_date,
  q.status,
  q.total_cents / 100.0 as quote_value,
  q.sales_rep_name,
  q.accepted_at,
  q.rejected_at,
  q.expired_at,
  CASE
    WHEN UPPER(q.status) IN ('ACCEPTED', 'WON', 'APPROVED', 'CONVERTED') THEN 'converted'
    WHEN UPPER(q.status) IN ('REJECTED', 'LOST') THEN 'lost'
    WHEN UPPER(q.status) = 'EXPIRED' THEN 'expired'
    WHEN UPPER(q.status) IN ('DRAFT', 'SENT') THEN 'pending'
    ELSE q.status
  END as conversion_status,
  CASE
    WHEN q.accepted_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (q.accepted_at - q.created_at)) / 3600
    ELSE NULL
  END as hours_to_conversion,
  CASE
    WHEN q.accepted_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (q.accepted_at - q.created_at)) / 86400
    ELSE NULL
  END as days_to_conversion
FROM quotations q
LEFT JOIN customers c ON q.customer_id = c.id;

-- ============================================
-- 4. UNIFIED PRODUCT PERFORMANCE VIEW
-- ============================================

CREATE OR REPLACE VIEW v_product_performance AS
-- Quote items
SELECT
  'quote' as source,
  qi.product_id,
  p.name as product_name,
  p.model as sku,
  p.manufacturer,
  p.category,
  DATE(q.created_at) as sale_date,
  qi.quantity,
  COALESCE(qi.unit_price, qi.sell_cents / 100.0) as unit_price,
  COALESCE(qi.total_price, qi.line_total_cents / 100.0) as line_total,
  COALESCE(qi.line_profit_cents, 0) / 100.0 as gross_profit,
  q.customer_id,
  c.name as customer_name,
  q.sales_rep_name
FROM quotation_items qi
JOIN quotations q ON qi.quotation_id = q.id
JOIN products p ON qi.product_id = p.id
LEFT JOIN customers c ON q.customer_id = c.id
WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')

UNION ALL

-- POS transaction items
SELECT
  'pos' as source,
  ti.product_id,
  ti.product_name,
  ti.product_sku as sku,
  p.manufacturer,
  p.category,
  DATE(t.created_at) as sale_date,
  ti.quantity,
  ti.unit_price as unit_price,
  ti.line_total,
  (ti.line_total - COALESCE(ti.unit_cost * ti.quantity, 0)) as gross_profit,
  t.customer_id,
  c.name as customer_name,
  u.first_name || ' ' || u.last_name as sales_rep_name
FROM transaction_items ti
JOIN transactions t ON ti.transaction_id = t.transaction_id
LEFT JOIN products p ON ti.product_id = p.id
LEFT JOIN customers c ON t.customer_id = c.id
LEFT JOIN users u ON t.user_id = u.id
WHERE t.status = 'completed';

-- ============================================
-- 5. CUSTOMER PURCHASE HISTORY VIEW
-- ============================================

CREATE OR REPLACE VIEW v_customer_purchase_history AS
SELECT
  c.id as customer_id,
  c.name as customer_name,
  c.company,
  c.email,
  c.phone,
  c.created_at as customer_since,
  -- Quote metrics
  COUNT(DISTINCT q.id) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')) as total_quotes_converted,
  COUNT(DISTINCT q.id) FILTER (WHERE UPPER(q.status) IN ('DRAFT', 'SENT')) as quotes_pending,
  COALESCE(SUM(q.total_cents) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')), 0) / 100.0 as quote_revenue,
  -- POS metrics
  COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'completed') as total_pos_transactions,
  COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as pos_revenue,
  -- Combined metrics
  COUNT(DISTINCT q.id) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')) +
    COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'completed') as total_transactions,
  COALESCE(SUM(q.total_cents) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')), 0) / 100.0 +
    COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as total_revenue,
  -- Activity
  GREATEST(
    MAX(q.created_at) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')),
    MAX(t.created_at) FILTER (WHERE t.status = 'completed')
  ) as last_purchase_date,
  LEAST(
    MIN(q.created_at) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')),
    MIN(t.created_at) FILTER (WHERE t.status = 'completed')
  ) as first_purchase_date
FROM customers c
LEFT JOIN quotations q ON c.id = q.customer_id
LEFT JOIN transactions t ON c.id = t.customer_id
GROUP BY c.id, c.name, c.company, c.email, c.phone, c.created_at;

-- ============================================
-- 6. SALES REP PERFORMANCE VIEW
-- ============================================

CREATE OR REPLACE VIEW v_sales_rep_performance AS
SELECT
  COALESCE(q.sales_rep_name, u.first_name || ' ' || u.last_name) as sales_rep,
  -- Quote performance
  COUNT(DISTINCT q.id) as total_quotes,
  COUNT(DISTINCT q.id) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')) as quotes_converted,
  COUNT(DISTINCT q.id) FILTER (WHERE UPPER(q.status) IN ('REJECTED', 'LOST')) as quotes_lost,
  CASE
    WHEN COUNT(DISTINCT q.id) > 0 THEN
      ROUND(COUNT(DISTINCT q.id) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED'))::numeric /
            COUNT(DISTINCT q.id)::numeric * 100, 2)
    ELSE 0
  END as quote_conversion_rate,
  COALESCE(SUM(q.total_cents) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')), 0) / 100.0 as quote_revenue,
  -- POS performance
  COUNT(DISTINCT t.transaction_id) FILTER (WHERE t.status = 'completed') as pos_transactions,
  COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as pos_revenue,
  -- Combined
  COALESCE(SUM(q.total_cents) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')), 0) / 100.0 +
    COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as total_revenue,
  AVG(q.total_cents / 100.0) FILTER (WHERE UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')) as avg_quote_value,
  AVG(t.total_amount) FILTER (WHERE t.status = 'completed') as avg_pos_value
FROM users u
LEFT JOIN quotations q ON q.sales_rep_name = u.first_name || ' ' || u.last_name
LEFT JOIN transactions t ON t.user_id = u.id
WHERE u.role IN ('admin', 'sales', 'manager')
GROUP BY COALESCE(q.sales_rep_name, u.first_name || ' ' || u.last_name);

-- ============================================
-- 7. HOURLY SALES PATTERN VIEW
-- ============================================

CREATE OR REPLACE VIEW v_hourly_sales_pattern AS
SELECT
  EXTRACT(HOUR FROM completed_date) as hour_of_day,
  EXTRACT(DOW FROM completed_date) as day_of_week,
  source,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_sales,
  AVG(total_amount) as avg_sale
FROM v_unified_sales
WHERE is_completed = true
  AND completed_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY EXTRACT(HOUR FROM completed_date), EXTRACT(DOW FROM completed_date), source;

-- ============================================
-- 8. MONTHLY TREND VIEW
-- ============================================

CREATE OR REPLACE VIEW v_monthly_sales_trend AS
SELECT
  DATE_TRUNC('month', completed_date) as month,
  source,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_sales,
  AVG(total_amount) as avg_order_value,
  COUNT(DISTINCT customer_id) as unique_customers,
  SUM(total_amount) / NULLIF(COUNT(DISTINCT customer_id), 0) as revenue_per_customer
FROM v_unified_sales
WHERE is_completed = true
GROUP BY DATE_TRUNC('month', completed_date), source
ORDER BY month DESC, source;

-- ============================================
-- 9. PRODUCT CATEGORY PERFORMANCE VIEW
-- ============================================

CREATE OR REPLACE VIEW v_category_performance AS
SELECT
  COALESCE(p.category, 'Uncategorized') as category,
  COUNT(DISTINCT qi.quotation_id) + COUNT(DISTINCT ti.transaction_id) as total_orders,
  SUM(COALESCE(qi.quantity, 0)) + SUM(COALESCE(ti.quantity, 0)) as units_sold,
  COALESCE(SUM(COALESCE(qi.total_price, qi.line_total_cents / 100.0)), 0) + COALESCE(SUM(ti.line_total), 0) as total_revenue,
  COUNT(DISTINCT COALESCE(qi.product_id, 0)) as unique_products_sold
FROM products p
LEFT JOIN quotation_items qi ON p.id = qi.product_id
LEFT JOIN quotations q ON qi.quotation_id = q.id AND UPPER(q.status) IN ('ACCEPTED', 'CONVERTED', 'WON', 'APPROVED')
LEFT JOIN transaction_items ti ON p.id = ti.product_id
LEFT JOIN transactions t ON ti.transaction_id = t.transaction_id AND t.status = 'completed'
WHERE qi.id IS NOT NULL OR ti.item_id IS NOT NULL
GROUP BY COALESCE(p.category, 'Uncategorized');

-- ============================================
-- INDEXES FOR REPORTING PERFORMANCE
-- ============================================

-- Indexes on quotations for reporting
CREATE INDEX IF NOT EXISTS idx_quotations_status_created ON quotations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_quotations_accepted_at ON quotations(accepted_at) WHERE accepted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_sales_rep ON quotations(sales_rep_name);

-- Indexes on transactions for reporting
CREATE INDEX IF NOT EXISTS idx_transactions_status_created ON transactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_created ON transactions(customer_id, created_at);

-- Composite indexes for common report queries
CREATE INDEX IF NOT EXISTS idx_quotations_reporting ON quotations(status, created_at, customer_id, total_cents);
CREATE INDEX IF NOT EXISTS idx_transactions_reporting ON transactions(status, created_at, customer_id, total_amount);

-- ============================================
-- VIEW COMMENTS
-- ============================================

COMMENT ON VIEW v_unified_sales IS 'Combined view of quote-based sales and POS transactions';
COMMENT ON VIEW v_daily_sales_summary IS 'Daily aggregated sales by source (quote vs POS)';
COMMENT ON VIEW v_quote_conversion IS 'Quote conversion tracking with time-to-conversion metrics';
COMMENT ON VIEW v_product_performance IS 'Product sales across both quote and POS channels';
COMMENT ON VIEW v_customer_purchase_history IS 'Complete customer purchase history combining quotes and POS';
COMMENT ON VIEW v_sales_rep_performance IS 'Sales representative performance metrics';
COMMENT ON VIEW v_hourly_sales_pattern IS 'Hourly and daily sales patterns for scheduling optimization';
COMMENT ON VIEW v_monthly_sales_trend IS 'Monthly sales trends by source';
COMMENT ON VIEW v_category_performance IS 'Product category performance metrics';
