/**
 * Product Metrics Service
 * Calculates sales velocity, win rates, and demand classification
 */

class ProductMetricsService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Calculate metrics for a single product
   */
  async calculateMetrics(productId) {
    const client = await this.pool.connect();
    try {
      // Get sales data from order_items (last 30, 90, 365 days)
      const salesQuery = `
        SELECT
          COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '30 days' THEN oi.quantity ELSE 0 END), 0) as qty_sold_30d,
          COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '90 days' THEN oi.quantity ELSE 0 END), 0) as qty_sold_90d,
          COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '365 days' THEN oi.quantity ELSE 0 END), 0) as qty_sold_365d,
          COALESCE(AVG(oi.unit_price_cents), 0) as avg_sell_price_cents
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.product_id = $1
          AND o.status NOT IN ('cancelled')
          AND o.created_at >= NOW() - INTERVAL '365 days'
      `;
      const salesResult = await client.query(salesQuery, [productId]);
      const sales = salesResult.rows[0] || {};

      // Get quote metrics (last 30 days)
      const quoteQuery = `
        SELECT
          COUNT(*) as qty_quoted_30d,
          SUM(CASE WHEN q.status = 'WON' THEN 1 ELSE 0 END) as quotes_won_30d,
          SUM(CASE WHEN q.status = 'LOST' THEN 1 ELSE 0 END) as quotes_lost_30d
        FROM quotation_items qi
        JOIN quotations q ON qi.quotation_id = q.id
        WHERE qi.product_id = $1
          AND q.created_at >= NOW() - INTERVAL '30 days'
      `;
      const quoteResult = await client.query(quoteQuery, [productId]);
      const quotes = quoteResult.rows[0] || {};

      // Calculate win rate
      const totalDecided = (parseInt(quotes.quotes_won_30d) || 0) + (parseInt(quotes.quotes_lost_30d) || 0);
      const winRate = totalDecided > 0
        ? ((parseInt(quotes.quotes_won_30d) || 0) / totalDecided * 100).toFixed(2)
        : null;

      // Classify demand
      const demandTag = this.classifyDemand({
        qtySold30d: parseInt(sales.qty_sold_30d) || 0,
        qtySold90d: parseInt(sales.qty_sold_90d) || 0,
        qtyQuoted30d: parseInt(quotes.qty_quoted_30d) || 0,
        productId
      });

      // Upsert metrics
      const upsertQuery = `
        INSERT INTO product_metrics (
          product_id, qty_sold_30d, qty_sold_90d, qty_sold_365d,
          qty_quoted_30d, quotes_won_30d, quotes_lost_30d,
          win_rate_30d, avg_sell_price_cents, demand_tag, last_calculated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (product_id) DO UPDATE SET
          qty_sold_30d = EXCLUDED.qty_sold_30d,
          qty_sold_90d = EXCLUDED.qty_sold_90d,
          qty_sold_365d = EXCLUDED.qty_sold_365d,
          qty_quoted_30d = EXCLUDED.qty_quoted_30d,
          quotes_won_30d = EXCLUDED.quotes_won_30d,
          quotes_lost_30d = EXCLUDED.quotes_lost_30d,
          win_rate_30d = EXCLUDED.win_rate_30d,
          avg_sell_price_cents = EXCLUDED.avg_sell_price_cents,
          demand_tag = EXCLUDED.demand_tag,
          last_calculated = NOW()
        RETURNING *
      `;

      const result = await client.query(upsertQuery, [
        productId,
        parseInt(sales.qty_sold_30d) || 0,
        parseInt(sales.qty_sold_90d) || 0,
        parseInt(sales.qty_sold_365d) || 0,
        parseInt(quotes.qty_quoted_30d) || 0,
        parseInt(quotes.quotes_won_30d) || 0,
        parseInt(quotes.quotes_lost_30d) || 0,
        winRate,
        parseInt(sales.avg_sell_price_cents) || 0,
        demandTag
      ]);

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Classify demand based on sales velocity
   */
  classifyDemand({ qtySold30d, qtySold90d, qtyQuoted30d, productId }) {
    // Fast mover: high sales velocity
    if (qtySold30d >= 10 || qtySold90d >= 25) {
      return 'fast_mover';
    }

    // High interest but low conversion
    if (qtyQuoted30d >= 5 && qtySold30d < 2) {
      return 'high_interest_low_conversion';
    }

    // Slow mover: low sales over time
    if (qtySold90d <= 2 && qtySold30d === 0) {
      return 'slow_mover';
    }

    // Steady: moderate consistent sales
    if (qtySold30d >= 2 && qtySold30d <= 9) {
      return 'steady';
    }

    return 'normal';
  }

  /**
   * Get product metrics
   */
  async getMetrics(productId) {
    const cacheKey = `product_metrics:${productId}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) return cached;

    const result = await this.pool.query(
      'SELECT * FROM product_metrics WHERE product_id = $1',
      [productId]
    );

    if (result.rows.length === 0) {
      // Calculate if not exists
      return this.calculateMetrics(productId);
    }

    const metrics = result.rows[0];
    this.cache?.set(cacheKey, metrics, 300); // 5 min cache
    return metrics;
  }

  /**
   * Get full product intelligence package
   */
  async getProductIntelligence(productId) {
    const client = await this.pool.connect();
    try {
      // Get product with inventory
      const productQuery = `
        SELECT
          p.id, p.model_number, p.name, p.manufacturer,
          p.msrp_cents, p.cost_cents, p.map_cents, p.lap_cents, p.umrp_cents,
          p.qty_on_hand, p.qty_reserved, p.qty_available, p.qty_on_order,
          p.next_po_date, p.next_po_qty, p.last_stock_sync,
          p.promo_price_cents, p.promo_start_date, p.promo_end_date
        FROM products p
        WHERE p.id = $1
      `;
      const productResult = await client.query(productQuery, [productId]);

      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }

      const product = productResult.rows[0];

      // Get metrics
      const metrics = await this.getMetrics(productId);

      // Get recent quote activity
      const quoteActivityQuery = `
        SELECT
          q.id, q.quote_number, q.status, q.created_at,
          qi.quantity, qi.unit_price_cents,
          c.name as customer_name
        FROM quotation_items qi
        JOIN quotations q ON qi.quotation_id = q.id
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE qi.product_id = $1
        ORDER BY q.created_at DESC
        LIMIT 10
      `;
      const quoteActivity = await client.query(quoteActivityQuery, [productId]);

      // Get price history
      const priceHistoryQuery = `
        SELECT
          price_type, price_cents, effective_date, source
        FROM price_point_history
        WHERE product_id = $1
        ORDER BY effective_date DESC
        LIMIT 20
      `;
      const priceHistory = await client.query(priceHistoryQuery, [productId]);

      // Calculate stock status
      let stockStatus = 'in_stock';
      if (product.qty_available <= 0) {
        stockStatus = product.qty_on_order > 0 ? 'on_order' : 'out_of_stock';
      } else if (product.qty_available <= 3) {
        stockStatus = 'low_stock';
      }

      return {
        product: {
          ...product,
          stockStatus,
          hasPromo: product.promo_price_cents &&
            new Date(product.promo_start_date) <= new Date() &&
            new Date(product.promo_end_date) >= new Date()
        },
        metrics: {
          ...metrics,
          demandBadge: this.getDemandBadge(metrics?.demand_tag)
        },
        recentQuotes: quoteActivity.rows,
        priceHistory: priceHistory.rows,
        inventory: {
          onHand: product.qty_on_hand || 0,
          reserved: product.qty_reserved || 0,
          available: product.qty_available || 0,
          onOrder: product.qty_on_order || 0,
          nextPO: product.next_po_date ? {
            date: product.next_po_date,
            quantity: product.next_po_qty
          } : null,
          lastSync: product.last_stock_sync
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get demand badge display info
   */
  getDemandBadge(demandTag) {
    const badges = {
      fast_mover: { label: 'Fast Mover', color: 'success', icon: 'trending_up' },
      slow_mover: { label: 'Slow Mover', color: 'warning', icon: 'trending_down' },
      steady: { label: 'Steady', color: 'info', icon: 'trending_flat' },
      high_interest_low_conversion: { label: 'High Interest', color: 'secondary', icon: 'visibility' },
      overstocked: { label: 'Overstocked', color: 'error', icon: 'inventory_2' },
      stockout_risk: { label: 'Stockout Risk', color: 'error', icon: 'warning' },
      normal: { label: 'Normal', color: 'default', icon: 'check' }
    };
    return badges[demandTag] || badges.normal;
  }

  /**
   * Refresh metrics for all products
   */
  async refreshAllMetrics(options = {}) {
    const { batchSize = 100, onProgress } = options;
    const client = await this.pool.connect();

    try {
      // Get all product IDs
      const productsResult = await client.query(
        'SELECT id FROM products WHERE is_active = true ORDER BY id'
      );
      const productIds = productsResult.rows.map(r => r.id);

      let processed = 0;
      const total = productIds.length;
      const results = { success: 0, failed: 0, errors: [] };

      // Process in batches
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);

        await Promise.all(batch.map(async (productId) => {
          try {
            await this.calculateMetrics(productId);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push({ productId, error: error.message });
          }
          processed++;
        }));

        if (onProgress) {
          onProgress({ processed, total, percent: Math.round(processed / total * 100) });
        }
      }

      return results;
    } finally {
      client.release();
    }
  }

  /**
   * Get demand classification report
   */
  async getDemandReport(filters = {}) {
    const { demandTag, manufacturer, category, limit = 100 } = filters;

    let query = `
      SELECT
        p.id, p.model_number, p.name, p.manufacturer, p.category,
        p.qty_on_hand, p.qty_available,
        pm.qty_sold_30d, pm.qty_sold_90d, pm.qty_quoted_30d,
        pm.win_rate_30d, pm.demand_tag, pm.last_calculated
      FROM products p
      LEFT JOIN product_metrics pm ON p.id = pm.product_id
      WHERE p.is_active = true
    `;
    const params = [];
    let paramIndex = 1;

    if (demandTag) {
      query += ` AND pm.demand_tag = $${paramIndex++}`;
      params.push(demandTag);
    }

    if (manufacturer) {
      query += ` AND p.manufacturer ILIKE $${paramIndex++}`;
      params.push(`%${manufacturer}%`);
    }

    if (category) {
      query += ` AND p.category ILIKE $${paramIndex++}`;
      params.push(`%${category}%`);
    }

    query += ` ORDER BY pm.qty_sold_30d DESC NULLS LAST LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.pool.query(query, params);

    // Get summary stats
    const summaryQuery = `
      SELECT
        demand_tag,
        COUNT(*) as count
      FROM product_metrics
      GROUP BY demand_tag
    `;
    const summaryResult = await this.pool.query(summaryQuery);

    return {
      products: result.rows,
      summary: summaryResult.rows.reduce((acc, row) => {
        acc[row.demand_tag] = parseInt(row.count);
        return acc;
      }, {})
    };
  }

  /**
   * Check for stockout risk products
   */
  async getStockoutRiskProducts() {
    const query = `
      SELECT
        p.id, p.model_number, p.name, p.manufacturer,
        p.qty_available, p.qty_on_order, p.next_po_date,
        pm.qty_sold_30d,
        CASE
          WHEN pm.qty_sold_30d > 0 THEN
            ROUND(p.qty_available::numeric / (pm.qty_sold_30d::numeric / 30), 1)
          ELSE NULL
        END as days_of_stock
      FROM products p
      LEFT JOIN product_metrics pm ON p.id = pm.product_id
      WHERE p.is_active = true
        AND p.qty_available <= 5
        AND pm.qty_sold_30d > 0
      ORDER BY days_of_stock ASC NULLS LAST
      LIMIT 50
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get top performers
   */
  async getTopPerformers(options = {}) {
    const { period = '30d', limit = 20, metric = 'qty_sold' } = options;

    const periodColumn = metric === 'win_rate' ? 'win_rate_30d' :
      period === '90d' ? 'qty_sold_90d' :
      period === '365d' ? 'qty_sold_365d' : 'qty_sold_30d';

    const query = `
      SELECT
        p.id, p.model_number, p.name, p.manufacturer,
        p.msrp_cents, p.cost_cents,
        pm.qty_sold_30d, pm.qty_sold_90d, pm.qty_sold_365d,
        pm.win_rate_30d, pm.demand_tag
      FROM products p
      JOIN product_metrics pm ON p.id = pm.product_id
      WHERE p.is_active = true
        AND pm.${periodColumn} IS NOT NULL
      ORDER BY pm.${periodColumn} DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }
}

module.exports = ProductMetricsService;
