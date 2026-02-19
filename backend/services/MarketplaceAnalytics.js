const pool = require('../db');

class MarketplaceAnalytics {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Revenue by channel over time ──────────────────────────────────
  async getRevenueByChannel(days = 30, granularity = 'day') {
    const validGranularities = ['hour', 'day', 'week', 'month'];
    if (!validGranularities.includes(granularity)) {
      throw new Error('granularity must be one of: ' + validGranularities.join(', '));
    }

    const { rows } = await this.pool.query(`
      SELECT
        date_trunc($1, o.order_date) AS date,
        c.channel_code,
        c.channel_name,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS revenue,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS commission,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         - SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0)))::numeric(14,2) AS net_revenue
      FROM marketplace_orders o
      JOIN marketplace_channels c ON c.id = o.channel_id
      JOIN marketplace_order_items oi ON oi.order_id = o.id
      WHERE o.order_date >= NOW() - make_interval(days => $2::int)
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY date_trunc($1, o.order_date), c.channel_code, c.channel_name
      ORDER BY date ASC, revenue DESC
    `, [granularity, days]);

    return rows;
  }

  // ─── Product performance per channel ───────────────────────────────
  async getProductPerformance(channelId = null, days = 30, limit = 50) {
    const params = [days, limit];
    let channelFilter = '';
    if (channelId) {
      channelFilter = 'AND o.channel_id = $3';
      params.push(channelId);
    }

    const { rows } = await this.pool.query(`
      SELECT
        oi.product_id,
        COALESCE(oi.product_sku, p.sku) AS sku,
        COALESCE(oi.product_title, p.name) AS product_name,
        oi.category_label,
        SUM(oi.quantity)::int AS units_sold,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS total_revenue,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         / NULLIF(SUM(oi.quantity), 0))::numeric(14,2) AS avg_price,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS total_commission,
        SUM(COALESCE(p.cost, 0) * oi.quantity)::numeric(14,2) AS total_cogs,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         - SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))
         - SUM(COALESCE(p.cost, 0) * oi.quantity))::numeric(14,2) AS net_profit,
        CASE WHEN SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0)) > 0
          THEN ((SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
                 - SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))
                 - SUM(COALESCE(p.cost, 0) * oi.quantity))
                / SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0)) * 100)::numeric(5,2)
          ELSE 0 END AS profit_margin_pct,
        COALESCE(ret.return_count, 0)::int AS return_count
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS return_count
        FROM marketplace_return_items ri
        JOIN marketplace_returns r ON r.id = ri.return_id
        WHERE ri.order_item_id = oi.id
      ) ret ON true
      WHERE o.order_date >= NOW() - make_interval(days => $1::int)
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        ${channelFilter}
      GROUP BY oi.product_id, COALESCE(oi.product_sku, p.sku),
               COALESCE(oi.product_title, p.name), oi.category_label, ret.return_count
      ORDER BY total_revenue DESC
      LIMIT $2
    `, params);

    return rows;
  }

  // ─── Channel comparison for a single product ──────────────────────
  async getChannelComparison(productId) {
    const { rows } = await this.pool.query(`
      SELECT
        c.channel_code,
        c.channel_name,
        SUM(oi.quantity)::int AS units_sold,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS revenue,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         / NULLIF(SUM(oi.quantity), 0))::numeric(14,2) AS avg_selling_price,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS total_commission,
        AVG(COALESCE(oi.commission_rate, 0))::numeric(5,2) AS avg_commission_rate,
        SUM(COALESCE(p.cost, 0) * oi.quantity)::numeric(14,2) AS total_cogs,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         - SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))
         - SUM(COALESCE(p.cost, 0) * oi.quantity))::numeric(14,2) AS net_profit,
        CASE WHEN SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0)) > 0
          THEN ((SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
                 - SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))
                 - SUM(COALESCE(p.cost, 0) * oi.quantity))
                / SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0)) * 100)::numeric(5,2)
          ELSE 0 END AS margin_pct,
        AVG(EXTRACT(EPOCH FROM (COALESCE(o.shipped_date, o.updated_at) - o.order_date)) / 86400)::numeric(5,1)
          AS avg_days_to_ship,
        MIN(o.order_date) AS first_sale,
        MAX(o.order_date) AS last_sale
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      JOIN marketplace_channels c ON c.id = o.channel_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.product_id = $1
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY c.channel_code, c.channel_name
      ORDER BY revenue DESC
    `, [productId]);

    return rows;
  }

  // ─── Profitability analysis (true P&L) ─────────────────────────────
  async getProfitability(channelId, days = 30) {
    const { rows } = await this.pool.query(`
      WITH order_data AS (
        SELECT
          SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0)) AS gross_revenue,
          SUM(COALESCE(p.cost, 0) * oi.quantity) AS cogs,
          SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0)) AS commission,
          SUM(COALESCE(oi.shipping_amount, 0)) AS shipping_costs,
          COUNT(DISTINCT o.id)::int AS order_count,
          SUM(oi.quantity)::int AS units_sold
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.channel_id = $1
          AND o.order_date >= NOW() - make_interval(days => $2::int)
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      ),
      return_data AS (
        SELECT
          COALESCE(SUM(r.total_refund_cents / 100.0), 0) AS return_costs,
          COUNT(*)::int AS return_count
        FROM marketplace_returns r
        WHERE r.channel_id = $1
          AND r.created_at >= NOW() - make_interval(days => $2::int)
          AND r.status NOT IN ('rejected', 'REJECTED')
      ),
      ehf_data AS (
        SELECT COALESCE(SUM(
          CASE WHEN t.value IS NOT NULL THEN t.value::numeric ELSE 0 END
        ), 0) AS ehf_total
        FROM marketplace_order_items oi
        JOIN marketplace_orders o ON o.id = oi.order_id,
        LATERAL jsonb_array_elements(COALESCE(oi.taxes, '[]'::jsonb)) AS t
        WHERE o.channel_id = $1
          AND o.order_date >= NOW() - make_interval(days => $2::int)
          AND o.order_state NOT IN ('CANCELED', 'REFUSED')
          AND (t->>'code' ILIKE '%ehf%' OR t->>'code' ILIKE '%eco%')
      )
      SELECT
        COALESCE(od.gross_revenue, 0)::numeric(14,2) AS gross_revenue,
        COALESCE(od.cogs, 0)::numeric(14,2) AS cogs,
        COALESCE(od.commission, 0)::numeric(14,2) AS commission,
        COALESCE(od.shipping_costs, 0)::numeric(14,2) AS shipping_costs,
        rd.return_costs::numeric(14,2),
        ehf.ehf_total::numeric(14,2) AS ehf,
        (COALESCE(od.gross_revenue, 0)
         - COALESCE(od.cogs, 0)
         - COALESCE(od.commission, 0)
         - COALESCE(od.shipping_costs, 0)
         - rd.return_costs
         - ehf.ehf_total)::numeric(14,2) AS net_profit,
        CASE WHEN COALESCE(od.gross_revenue, 0) > 0
          THEN ((COALESCE(od.gross_revenue, 0)
                 - COALESCE(od.cogs, 0)
                 - COALESCE(od.commission, 0)
                 - COALESCE(od.shipping_costs, 0)
                 - rd.return_costs
                 - ehf.ehf_total)
                / od.gross_revenue * 100)::numeric(5,2)
          ELSE 0 END AS profit_margin_pct,
        COALESCE(od.order_count, 0) AS order_count,
        COALESCE(od.units_sold, 0) AS units_sold,
        rd.return_count
      FROM order_data od, return_data rd, ehf_data ehf
    `, [channelId, days]);

    return rows[0] || {};
  }

  // ─── Sell-through rate ─────────────────────────────────────────────
  async getSellThroughRate(channelId, days = 30) {
    const { rows } = await this.pool.query(`
      SELECT
        oi.product_id,
        COALESCE(oi.product_sku, p.sku) AS sku,
        COALESCE(oi.product_title, p.name) AS product_name,
        SUM(oi.quantity)::int AS units_sold,
        COALESCE(p.quantity_in_stock, 0)::int AS current_stock,
        CASE WHEN (SUM(oi.quantity) + COALESCE(p.quantity_in_stock, 0)) > 0
          THEN (SUM(oi.quantity)::numeric
                / (SUM(oi.quantity) + COALESCE(p.quantity_in_stock, 0)) * 100)::numeric(5,2)
          ELSE 0 END AS sell_through_pct,
        CASE
          WHEN COALESCE(p.quantity_in_stock, 0) = 0 AND SUM(oi.quantity) > 0 THEN 'stockout'
          WHEN (SUM(oi.quantity)::numeric / NULLIF(SUM(oi.quantity) + COALESCE(p.quantity_in_stock, 0), 0) * 100) >= 80 THEN 'fast_mover'
          WHEN (SUM(oi.quantity)::numeric / NULLIF(SUM(oi.quantity) + COALESCE(p.quantity_in_stock, 0), 0) * 100) >= 40 THEN 'healthy'
          WHEN (SUM(oi.quantity)::numeric / NULLIF(SUM(oi.quantity) + COALESCE(p.quantity_in_stock, 0), 0) * 100) >= 10 THEN 'slow_mover'
          ELSE 'dead_stock'
        END AS velocity_tag,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         / NULLIF(SUM(oi.quantity), 0))::numeric(14,2) AS avg_selling_price,
        (COALESCE(p.quantity_in_stock, 0) * COALESCE(p.cost, 0))::numeric(14,2) AS stock_value_at_cost
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.channel_id = $1
        AND o.order_date >= NOW() - make_interval(days => $2::int)
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY oi.product_id, COALESCE(oi.product_sku, p.sku),
               COALESCE(oi.product_title, p.name),
               p.quantity_in_stock, p.cost
      ORDER BY sell_through_pct DESC
    `, [channelId, days]);

    return rows;
  }

  // ─── KPI summary (executive dashboard) ─────────────────────────────
  async getKPISummary(days = 30) {
    const { rows: overall } = await this.pool.query(`
      SELECT
        COUNT(DISTINCT o.id)::int AS total_orders,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS total_gmv,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         / NULLIF(COUNT(DISTINCT o.id), 0))::numeric(14,2) AS avg_order_value,
        SUM(oi.quantity)::int AS total_units,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS total_commission,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         - SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))
         - SUM(COALESCE(p.cost, 0) * oi.quantity))::numeric(14,2) AS total_net_profit
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.order_date >= NOW() - make_interval(days => $1::int)
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
    `, [days]);

    const { rows: returnStats } = await this.pool.query(`
      SELECT
        COUNT(*)::int AS return_count,
        COALESCE(SUM(total_refund_cents / 100.0), 0)::numeric(14,2) AS total_refund_value
      FROM marketplace_returns
      WHERE created_at >= NOW() - make_interval(days => $1::int)
        AND status NOT IN ('rejected', 'REJECTED')
    `, [days]);

    const { rows: fulfillment } = await this.pool.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (s.shipment_date - o.order_date)) / 3600)::numeric(8,1) AS avg_fulfillment_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (s.shipment_date - o.order_date)) / 3600
        )::numeric(8,1) AS median_fulfillment_hours
      FROM marketplace_shipments s
      JOIN marketplace_orders o ON o.id = s.order_id
      WHERE o.order_date >= NOW() - make_interval(days => $1::int)
        AND s.shipment_date IS NOT NULL
        AND o.order_date IS NOT NULL
    `, [days]);

    const { rows: perChannel } = await this.pool.query(`
      SELECT
        c.id AS channel_id,
        c.channel_code,
        c.channel_name,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS gmv,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         / NULLIF(COUNT(DISTINCT o.id), 0))::numeric(14,2) AS avg_order_value,
        SUM(oi.quantity)::int AS units_sold,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS commission,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         - SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))
         - SUM(COALESCE(p.cost, 0) * oi.quantity))::numeric(14,2) AS net_profit
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      JOIN marketplace_channels c ON c.id = o.channel_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.order_date >= NOW() - make_interval(days => $1::int)
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY c.id, c.channel_code, c.channel_name
      ORDER BY gmv DESC
    `, [days]);

    const kpi = overall[0] || {};
    const ret = returnStats[0] || {};
    const ful = fulfillment[0] || {};

    return {
      period_days: days,
      total_orders: kpi.total_orders || 0,
      total_gmv: kpi.total_gmv || '0.00',
      avg_order_value: kpi.avg_order_value || '0.00',
      total_units: kpi.total_units || 0,
      total_commission: kpi.total_commission || '0.00',
      total_net_profit: kpi.total_net_profit || '0.00',
      return_count: ret.return_count || 0,
      return_rate_pct: kpi.total_orders > 0
        ? ((ret.return_count / kpi.total_orders) * 100).toFixed(2)
        : '0.00',
      total_refund_value: ret.total_refund_value || '0.00',
      avg_fulfillment_hours: ful.avg_fulfillment_hours || null,
      median_fulfillment_hours: ful.median_fulfillment_hours || null,
      channels: perChannel
    };
  }
}

module.exports = new MarketplaceAnalytics(pool);
