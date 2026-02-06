-- ============================================================================
-- Migration 079: Inventory Aging Analysis View
-- ============================================================================

-- Add is_clearance flag if missing
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_clearance BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE VIEW inventory_aging AS
SELECT
  li.product_id,
  li.location_id,
  p.sku,
  p.name,
  p.model,
  p.manufacturer,
  p.category,
  p.cost,
  p.price,
  li.quantity_on_hand,
  li.quantity_reserved,
  (li.quantity_on_hand - li.quantity_reserved) AS quantity_available,
  (li.quantity_on_hand * p.cost)::numeric(12,2) AS inventory_value_cost,
  (li.quantity_on_hand * p.price)::numeric(12,2) AS inventory_value_retail,

  -- Last received date from adjustments
  COALESCE(
    (SELECT MAX(ia.created_at) FROM inventory_adjustments ia
     WHERE ia.product_id = li.product_id
       AND ia.location_id = li.location_id
       AND ia.adjustment_type = 'receiving'
       AND ia.quantity_change > 0),
    li.created_at
  ) AS last_received_date,

  -- Days since last receipt
  EXTRACT(DAY FROM NOW() - COALESCE(
    (SELECT MAX(ia.created_at) FROM inventory_adjustments ia
     WHERE ia.product_id = li.product_id
       AND ia.location_id = li.location_id
       AND ia.adjustment_type = 'receiving'
       AND ia.quantity_change > 0),
    li.created_at
  ))::int AS days_in_stock,

  -- Last sale date
  (SELECT MAX(o.created_at) FROM order_items oi
   JOIN orders o ON o.id = oi.order_id
   WHERE oi.product_id = li.product_id) AS last_sale_date,

  -- Days since last sale
  EXTRACT(DAY FROM NOW() - (
    SELECT MAX(o.created_at) FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = li.product_id
  ))::int AS days_since_last_sale,

  -- Units sold last 90 days
  COALESCE(
    (SELECT SUM(oi.quantity)::int FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = li.product_id
       AND o.created_at > NOW() - INTERVAL '90 days'),
    0
  ) AS units_sold_90d,

  -- Age bucket
  CASE
    WHEN EXTRACT(DAY FROM NOW() - COALESCE(
           (SELECT MAX(ia.created_at) FROM inventory_adjustments ia
            WHERE ia.product_id = li.product_id AND ia.location_id = li.location_id
              AND ia.adjustment_type = 'receiving' AND ia.quantity_change > 0),
           li.created_at)) <= 30 THEN '0-30'
    WHEN EXTRACT(DAY FROM NOW() - COALESCE(
           (SELECT MAX(ia.created_at) FROM inventory_adjustments ia
            WHERE ia.product_id = li.product_id AND ia.location_id = li.location_id
              AND ia.adjustment_type = 'receiving' AND ia.quantity_change > 0),
           li.created_at)) <= 60 THEN '31-60'
    WHEN EXTRACT(DAY FROM NOW() - COALESCE(
           (SELECT MAX(ia.created_at) FROM inventory_adjustments ia
            WHERE ia.product_id = li.product_id AND ia.location_id = li.location_id
              AND ia.adjustment_type = 'receiving' AND ia.quantity_change > 0),
           li.created_at)) <= 90 THEN '61-90'
    ELSE '90+'
  END AS age_bucket

FROM location_inventory li
JOIN products p ON p.id = li.product_id
WHERE li.quantity_on_hand > 0;
