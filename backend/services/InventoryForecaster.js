const pool = require('../db');

class InventoryForecaster {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Daily sales velocity per product ──────────────────────────────
  async getSalesVelocity(productId, channelId = null, days = 30) {
    const params = [productId, days];
    let channelFilter = '';
    if (channelId) {
      channelFilter = 'AND o.channel_id = $3';
      params.push(channelId);
    }

    // Total units sold in the period
    const { rows: [totals] } = await this.pool.query(`
      SELECT COALESCE(SUM(oi.quantity), 0)::int AS total_units
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE oi.product_id = $1
        AND o.order_date >= NOW() - make_interval(days => $2::int)
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        ${channelFilter}
    `, params);

    // Weekly buckets for trend detection (split period into two halves)
    const halfDays = Math.floor(days / 2);
    const trendParams = [productId, days, halfDays];
    let trendChannelFilter = '';
    if (channelId) {
      trendChannelFilter = 'AND o.channel_id = $4';
      trendParams.push(channelId);
    }

    const { rows: [trend] } = await this.pool.query(`
      SELECT
        COALESCE(SUM(CASE
          WHEN o.order_date >= NOW() - make_interval(days => $3::int) THEN oi.quantity
        END), 0)::int AS recent_half,
        COALESCE(SUM(CASE
          WHEN o.order_date < NOW() - make_interval(days => $3::int) THEN oi.quantity
        END), 0)::int AS earlier_half
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE oi.product_id = $1
        AND o.order_date >= NOW() - make_interval(days => $2::int)
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        ${trendChannelFilter}
    `, trendParams);

    const dailyAvg = days > 0 ? parseFloat((totals.total_units / days).toFixed(3)) : 0;
    const weeklyAvg = parseFloat((dailyAvg * 7).toFixed(2));

    let trendDirection = 'stable';
    if (trend.earlier_half > 0) {
      const changePct = ((trend.recent_half - trend.earlier_half) / trend.earlier_half) * 100;
      if (changePct > 20) trendDirection = 'increasing';
      else if (changePct < -20) trendDirection = 'decreasing';
    } else if (trend.recent_half > 0) {
      trendDirection = 'increasing';
    }

    return {
      productId,
      channelId,
      periodDays: days,
      totalUnits: totals.total_units,
      dailyAvg,
      weeklyAvg,
      trend: trendDirection
    };
  }

  // ─── Stockout projection for a single product ─────────────────────
  async getStockoutProjection(productId, channelId = null) {
    const velocity = await this.getSalesVelocity(productId, channelId);

    const { rows: [product] } = await this.pool.query(
      `SELECT name, sku, COALESCE(quantity_in_stock, 0)::int AS current_stock, cost
       FROM products WHERE id = $1`,
      [productId]
    );

    if (!product) throw new Error('Product not found: ' + productId);

    const currentStock = product.current_stock;
    const daysRemaining = velocity.dailyAvg > 0
      ? parseFloat((currentStock / velocity.dailyAvg).toFixed(1))
      : null;
    const projectedStockoutDate = daysRemaining !== null
      ? new Date(Date.now() + daysRemaining * 86400000).toISOString().slice(0, 10)
      : null;

    return {
      productId,
      name: product.name,
      sku: product.sku,
      currentStock,
      dailyVelocity: velocity.dailyAvg,
      weeklyVelocity: velocity.weeklyAvg,
      trend: velocity.trend,
      daysRemaining,
      projectedStockoutDate,
      stockValue: parseFloat((currentStock * parseFloat(product.cost || 0)).toFixed(2))
    };
  }

  // ─── Stockout alerts: all products at risk ─────────────────────────
  async getStockoutAlerts(daysThreshold = 14) {
    const { rows } = await this.pool.query(`
      WITH sales AS (
        SELECT
          oi.product_id,
          SUM(oi.quantity)::numeric AS total_units,
          COUNT(DISTINCT o.channel_id) AS channel_count,
          array_agg(DISTINCT c.channel_code) AS channels
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        LEFT JOIN marketplace_channels c ON c.id = o.channel_id
        WHERE o.order_date >= NOW() - INTERVAL '30 days'
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      )
      SELECT
        p.id AS product_id,
        p.name,
        p.sku,
        COALESCE(p.quantity_in_stock, 0)::int AS current_stock,
        s.total_units::int AS units_sold_30d,
        (s.total_units / 30.0)::numeric(10,3) AS daily_velocity,
        CASE WHEN s.total_units > 0
          THEN (COALESCE(p.quantity_in_stock, 0) / (s.total_units / 30.0))::numeric(10,1)
          ELSE NULL END AS days_remaining,
        s.channel_count::int,
        s.channels,
        (COALESCE(p.quantity_in_stock, 0) * COALESCE(p.cost, 0))::numeric(14,2) AS stock_value
      FROM sales s
      JOIN products p ON p.id = s.product_id
      WHERE s.total_units > 0
        AND (
          COALESCE(p.quantity_in_stock, 0) = 0
          OR (COALESCE(p.quantity_in_stock, 0) / (s.total_units / 30.0)) <= $1
        )
      ORDER BY
        CASE WHEN COALESCE(p.quantity_in_stock, 0) = 0 THEN 0
             ELSE (COALESCE(p.quantity_in_stock, 0) / (s.total_units / 30.0)) END ASC
    `, [daysThreshold]);

    return rows;
  }

  // ─── Reorder suggestions ───────────────────────────────────────────
  async getReorderSuggestions(leadTimeDays = 7, targetDaysSupply = 30, safetyStockDays = 7) {
    const { rows } = await this.pool.query(`
      WITH sales AS (
        SELECT
          oi.product_id,
          SUM(oi.quantity)::numeric AS total_units
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        WHERE o.order_date >= NOW() - INTERVAL '30 days'
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      )
      SELECT
        p.id AS product_id,
        p.name,
        p.sku,
        COALESCE(p.quantity_in_stock, 0)::int AS current_stock,
        (s.total_units / 30.0)::numeric(10,3) AS daily_velocity,
        -- reorder_point = (daily_velocity * lead_time) + (daily_velocity * safety_days)
        CEIL((s.total_units / 30.0) * ($1::int + $3::int))::int AS reorder_point,
        -- suggested_qty = (target_days * daily_velocity) - current_stock
        GREATEST(
          CEIL((s.total_units / 30.0) * $2::int) - COALESCE(p.quantity_in_stock, 0),
          0
        )::int AS suggested_order_qty,
        -- estimated_cost = suggested_qty * unit_cost
        (GREATEST(
          CEIL((s.total_units / 30.0) * $2::int) - COALESCE(p.quantity_in_stock, 0),
          0
        ) * COALESCE(p.cost, 0))::numeric(14,2) AS estimated_cost,
        COALESCE(p.cost, 0)::numeric(14,2) AS unit_cost,
        CASE WHEN (s.total_units / 30.0) > 0
          THEN (COALESCE(p.quantity_in_stock, 0) / (s.total_units / 30.0))::numeric(10,1)
          ELSE NULL END AS days_of_supply
      FROM sales s
      JOIN products p ON p.id = s.product_id
      WHERE s.total_units > 0
        AND COALESCE(p.quantity_in_stock, 0) <= CEIL((s.total_units / 30.0) * ($1::int + $3::int))
      ORDER BY
        COALESCE(p.quantity_in_stock, 0)::numeric / NULLIF(s.total_units / 30.0, 0) ASC NULLS FIRST
    `, [leadTimeDays, targetDaysSupply, safetyStockDays]);

    return rows;
  }

  // ─── Overstock detection ───────────────────────────────────────────
  async getOverstockAlerts(daysThreshold = 90) {
    const { rows } = await this.pool.query(`
      WITH sales AS (
        SELECT
          oi.product_id,
          SUM(oi.quantity)::numeric AS total_units
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        WHERE o.order_date >= NOW() - INTERVAL '30 days'
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      )
      SELECT
        p.id AS product_id,
        p.name,
        p.sku,
        COALESCE(p.quantity_in_stock, 0)::int AS current_stock,
        (s.total_units / 30.0)::numeric(10,3) AS daily_velocity,
        (COALESCE(p.quantity_in_stock, 0) / NULLIF(s.total_units / 30.0, 0))::numeric(10,1) AS days_of_supply,
        (COALESCE(p.quantity_in_stock, 0) * COALESCE(p.cost, 0))::numeric(14,2) AS inventory_value,
        (COALESCE(p.quantity_in_stock, 0) * COALESCE(p.price, 0))::numeric(14,2) AS inventory_value_retail,
        COALESCE(p.cost, 0)::numeric(14,2) AS unit_cost
      FROM sales s
      JOIN products p ON p.id = s.product_id
      WHERE COALESCE(p.quantity_in_stock, 0) > 0
        AND s.total_units > 0
        AND (COALESCE(p.quantity_in_stock, 0) / (s.total_units / 30.0)) > $1
      ORDER BY days_of_supply DESC
    `, [daysThreshold]);

    return rows;
  }

  // ─── Velocity anomalies (spikes and drops) ─────────────────────────
  async getVelocityAnomalies(changeThresholdPct = 50) {
    const { rows } = await this.pool.query(`
      WITH recent AS (
        SELECT oi.product_id, SUM(oi.quantity)::numeric AS units
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        WHERE o.order_date >= NOW() - INTERVAL '7 days'
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      ),
      previous AS (
        SELECT oi.product_id, SUM(oi.quantity)::numeric AS units
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        WHERE o.order_date >= NOW() - INTERVAL '14 days'
          AND o.order_date < NOW() - INTERVAL '7 days'
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      )
      SELECT
        COALESCE(r.product_id, pr.product_id) AS product_id,
        p.name,
        p.sku,
        COALESCE(pr.units, 0)::int AS previous_7d_units,
        COALESCE(r.units, 0)::int AS recent_7d_units,
        (COALESCE(pr.units, 0) / 7.0)::numeric(10,3) AS previous_daily_velocity,
        (COALESCE(r.units, 0) / 7.0)::numeric(10,3) AS current_daily_velocity,
        CASE WHEN COALESCE(pr.units, 0) > 0
          THEN (((COALESCE(r.units, 0) - pr.units) / pr.units) * 100)::numeric(8,1)
          ELSE NULL END AS change_pct,
        CASE
          WHEN COALESCE(r.units, 0) > COALESCE(pr.units, 0) THEN 'spike'
          WHEN COALESCE(r.units, 0) < COALESCE(pr.units, 0) THEN 'drop'
          ELSE 'stable'
        END AS direction,
        COALESCE(p.quantity_in_stock, 0)::int AS current_stock
      FROM recent r
      FULL OUTER JOIN previous pr ON pr.product_id = r.product_id
      JOIN products p ON p.id = COALESCE(r.product_id, pr.product_id)
      WHERE (
        -- Significant change: > threshold % when both periods have data
        (COALESCE(pr.units, 0) > 0 AND ABS(COALESCE(r.units, 0) - pr.units) / pr.units * 100 > $1)
        -- New demand: nothing before, sales now
        OR (COALESCE(pr.units, 0) = 0 AND COALESCE(r.units, 0) > 0)
        -- Demand dropped to zero
        OR (COALESCE(pr.units, 0) > 0 AND COALESCE(r.units, 0) = 0)
      )
      ORDER BY ABS(COALESCE(r.units, 0) - COALESCE(pr.units, 0)) DESC
    `, [changeThresholdPct]);

    return rows;
  }

  // ─── Full forecast for a single product ────────────────────────────
  async getProductForecast(productId) {
    const [projection, velocity90] = await Promise.all([
      this.getStockoutProjection(productId),
      this.getSalesVelocity(productId, null, 90)
    ]);

    // Reorder calculation for this product
    const leadTimeDays = 7;
    const safetyStockDays = 7;
    const targetDays = 30;
    const reorderPoint = Math.ceil(velocity90.dailyAvg * (leadTimeDays + safetyStockDays));
    const suggestedQty = Math.max(
      Math.ceil(velocity90.dailyAvg * targetDays) - projection.currentStock, 0
    );

    // Per-channel breakdown
    const { rows: channels } = await this.pool.query(`
      SELECT
        c.id AS channel_id,
        c.channel_code,
        SUM(oi.quantity)::int AS units_sold_30d,
        (SUM(oi.quantity)::numeric / 30.0)::numeric(10,3) AS daily_velocity
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      JOIN marketplace_channels c ON c.id = o.channel_id
      WHERE oi.product_id = $1
        AND o.order_date >= NOW() - INTERVAL '30 days'
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY c.id, c.channel_code
      ORDER BY units_sold_30d DESC
    `, [productId]);

    return {
      ...projection,
      velocity_30d: {
        dailyAvg: projection.dailyVelocity,
        weeklyAvg: projection.weeklyVelocity,
        trend: projection.trend
      },
      velocity_90d: {
        dailyAvg: velocity90.dailyAvg,
        weeklyAvg: velocity90.weeklyAvg,
        trend: velocity90.trend
      },
      reorder: {
        reorderPoint,
        needsReorder: projection.currentStock <= reorderPoint,
        suggestedOrderQty: suggestedQty,
        estimatedCost: parseFloat((suggestedQty * (projection.stockValue / Math.max(projection.currentStock, 1))).toFixed(2))
      },
      channels
    };
  }
}

module.exports = new InventoryForecaster(pool);
