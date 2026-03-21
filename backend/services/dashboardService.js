'use strict';

/**
 * DashboardService
 *
 * Analytics query layer for the real-time retail dashboard.
 * Reads from materialized view (mv_daily_sales) and regular views
 * (v_brand_margins, v_aging_inventory, v_rep_performance).
 *
 * All money values returned in cents (INTEGER).
 */

const pool = require('../db');

// ── Date range helpers ──────────────────────────────────────────

/**
 * Resolve a named period to { from, to } date strings (YYYY-MM-DD).
 * @param {string} period - today|week|month|quarter|year|custom
 * @param {string} [customFrom] - YYYY-MM-DD (for custom period)
 * @param {string} [customTo]   - YYYY-MM-DD (for custom period)
 * @returns {{ from: string, to: string }}
 */
function formatLocalDate(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function resolveDateRange(period, customFrom, customTo) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const today = formatLocalDate(now);

  switch (period) {
    case 'today':
      return { from: today, to: today };

    case 'week': {
      // Monday of current week
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const mon = new Date(now);
      mon.setDate(now.getDate() - diff);
      return { from: formatLocalDate(mon), to: today };
    }

    case 'month':
      return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today };

    case 'quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: formatLocalDate(qStart), to: today };
    }

    case 'year':
      return { from: `${y}-01-01`, to: today };

    case 'custom':
      return {
        from: customFrom || today,
        to: customTo || today,
      };

    default:
      return { from: today, to: today };
  }
}

/**
 * Shift a date range backwards by its own duration (for trend comparison).
 */
function priorPeriod(from, to) {
  const f = new Date(from);
  const t = new Date(to);
  const duration = t - f; // ms
  const priorTo = new Date(f.getTime() - 1); // day before 'from'
  const priorFrom = new Date(priorTo.getTime() - duration);
  return {
    from: priorFrom.toISOString().slice(0, 10),
    to: priorTo.toISOString().slice(0, 10),
  };
}

// ── Service Methods ─────────────────────────────────────────────

/**
 * Sales summary for a period with trend comparison.
 */
async function getSalesSummary(filters = {}) {
  const { period = 'today', from: customFrom, to: customTo, location, salespersonId } = filters;
  const { from, to } = resolveDateRange(period, customFrom, customTo);
  const prior = priorPeriod(from, to);

  const buildQuery = (dateFrom, dateTo) => {
    const params = [dateFrom, dateTo];
    let where = 'WHERE sale_date BETWEEN $1 AND $2';
    if (location) {
      params.push(location);
      where += ` AND register_location = $${params.length}`;
    }
    if (salespersonId) {
      params.push(parseInt(salespersonId));
      where += ` AND salesperson_id = $${params.length}`;
    }

    return {
      text: `
        SELECT
          COALESCE(SUM(total_revenue_cents), 0)  AS total_revenue,
          COALESCE(SUM(transaction_count), 0)     AS total_transactions,
          COALESCE(AVG(avg_transaction_cents), 0)::int AS avg_transaction,
          COALESCE(SUM(cash_count), 0)            AS cash_count,
          COALESCE(SUM(debit_count), 0)           AS debit_count,
          COALESCE(SUM(credit_count), 0)          AS credit_count,
          COALESCE(SUM(financing_count), 0)       AS financing_count
        FROM mv_daily_sales
        ${where}
      `,
      values: params,
    };
  };

  const [currentResult, priorResult] = await Promise.all([
    pool.query(buildQuery(from, to)),
    pool.query(buildQuery(prior.from, prior.to)),
  ]);

  const current = currentResult.rows[0];
  const priorData = priorResult.rows[0];

  const pct = (cur, prev) => {
    if (!prev || prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 10000) / 100; // 2 decimal
  };

  return {
    current: {
      totalRevenue: parseInt(current.total_revenue),
      totalTransactions: parseInt(current.total_transactions),
      avgTransaction: parseInt(current.avg_transaction),
      paymentMethodBreakdown: {
        cash: parseInt(current.cash_count),
        debit: parseInt(current.debit_count),
        credit: parseInt(current.credit_count),
        financing: parseInt(current.financing_count),
      },
    },
    prior: {
      totalRevenue: parseInt(priorData.total_revenue),
      totalTransactions: parseInt(priorData.total_transactions),
      avgTransaction: parseInt(priorData.avg_transaction),
    },
    trends: {
      revenueChangePct: pct(parseInt(current.total_revenue), parseInt(priorData.total_revenue)),
      transactionChangePct: pct(parseInt(current.total_transactions), parseInt(priorData.total_transactions)),
    },
    period,
    from,
    to,
  };
}

/**
 * Daily sales trend for charting (LineChart data).
 */
async function getDailySalesTrend(filters = {}) {
  const { from, to, location } = filters;
  const params = [from, to];
  let where = 'WHERE sale_date BETWEEN $1 AND $2';
  if (location) {
    params.push(location);
    where += ` AND register_location = $${params.length}`;
  }

  const result = await pool.query({
    text: `
      SELECT
        sale_date,
        SUM(total_revenue_cents)  AS revenue_cents,
        SUM(transaction_count)    AS transactions
      FROM mv_daily_sales
      ${where}
      GROUP BY sale_date
      ORDER BY sale_date ASC
    `,
    values: params,
  });

  return result.rows.map(r => ({
    date: r.sale_date,
    revenue: parseInt(r.revenue_cents),
    transactions: parseInt(r.transactions),
  }));
}

/**
 * Brand (manufacturer) margin analysis.
 */
async function getBrandMargins(filters = {}) {
  const { from, to, location, brandNames } = filters;
  const params = [from, to];
  let where = 'WHERE sale_date BETWEEN $1 AND $2';
  if (location) {
    params.push(location);
    where += ` AND register_location = $${params.length}`;
  }
  if (brandNames && brandNames.length > 0) {
    params.push(brandNames);
    where += ` AND brand_name = ANY($${params.length})`;
  }

  const result = await pool.query({
    text: `
      SELECT
        brand_name,
        SUM(sell_price_cents * quantity)  AS total_revenue_cents,
        SUM(margin_cents * quantity)      AS total_margin_cents,
        SUM(quantity)                     AS units_sold,
        AVG(margin_pct)::numeric(5,2)    AS avg_margin_pct
      FROM v_brand_margins
      ${where}
      GROUP BY brand_name
      ORDER BY SUM(sell_price_cents * quantity) DESC
      LIMIT 20
    `,
    values: params,
  });

  return result.rows.map(r => ({
    brandName: r.brand_name || 'Unknown',
    revenueCents: parseInt(r.total_revenue_cents),
    marginCents: parseInt(r.total_margin_cents),
    unitsSold: parseInt(r.units_sold),
    avgMarginPct: parseFloat(r.avg_margin_pct),
  }));
}

/**
 * Top-selling products.
 */
async function getTopProducts(filters = {}) {
  const { from, to, location, limit = 10 } = filters;
  const params = [from, to, parseInt(limit)];
  let where = 'WHERE sale_date BETWEEN $1 AND $2';
  if (location) {
    params.push(location);
    where += ` AND register_location = $${params.length}`;
  }

  const result = await pool.query({
    text: `
      SELECT
        product_id,
        product_name,
        sku,
        brand_name,
        SUM(sell_price_cents * quantity) AS total_revenue_cents,
        SUM(margin_cents * quantity)     AS total_margin_cents,
        SUM(quantity)                    AS units_sold,
        AVG(margin_pct)::numeric(5,2)   AS avg_margin_pct
      FROM v_brand_margins
      ${where}
      GROUP BY product_id, product_name, sku, brand_name
      ORDER BY SUM(sell_price_cents * quantity) DESC
      LIMIT $3
    `,
    values: params,
  });

  return result.rows.map(r => ({
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    brandName: r.brand_name || 'Unknown',
    revenueCents: parseInt(r.total_revenue_cents),
    marginCents: parseInt(r.total_margin_cents),
    unitsSold: parseInt(r.units_sold),
    avgMarginPct: parseFloat(r.avg_margin_pct),
  }));
}

/**
 * Aging inventory — products sitting without sales.
 */
async function getAgingInventory(filters = {}) {
  const { locationId, agingStatus, categoryId } = filters;
  const params = [];
  const conditions = [];

  if (locationId) {
    params.push(parseInt(locationId));
    conditions.push(`location_id = $${params.length}`);
  }
  if (agingStatus) {
    params.push(agingStatus);
    conditions.push(`aging_status = $${params.length}`);
  }
  if (categoryId) {
    params.push(parseInt(categoryId));
    // Need to subquery since category is denormalized in view
    conditions.push(`category = (SELECT name FROM categories WHERE id = $${params.length})`);
  }

  const where = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  const result = await pool.query({
    text: `
      SELECT *
      FROM v_aging_inventory
      ${where}
      ORDER BY days_since_last_sale DESC NULLS FIRST
      LIMIT 100
    `,
    values: params,
  });

  return result.rows.map(r => ({
    productName: r.product_name,
    sku: r.sku || r.variant_sku,
    brand: r.brand || 'Unknown',
    category: r.category,
    qtyOnHand: parseInt(r.qty_on_hand),
    locationId: r.location_id,
    locationName: r.location_name,
    inventoryValueCents: parseInt(r.inventory_value_cents || 0),
    lastSoldAt: r.last_sold_at,
    daysSinceLastSale: r.days_since_last_sale ? Math.round(parseFloat(r.days_since_last_sale)) : null,
    agingStatus: r.aging_status,
  }));
}

/**
 * Low-stock alerts — items below reorder point.
 */
async function getLowStockAlerts(filters = {}) {
  const { locationId } = filters;
  const params = [];
  let locationWhere = '';
  if (locationId) {
    params.push(parseInt(locationId));
    locationWhere = `AND vi.location_id = $${params.length}`;
  }

  const result = await pool.query({
    text: `
      SELECT
        vi.product_id,
        p.name            AS product_name,
        p.sku,
        p.manufacturer    AS brand,
        vi.qty_on_hand,
        vi.qty_available,
        vi.reorder_point,
        vi.reorder_qty,
        vi.location_id,
        l.name            AS location_name
      FROM variant_inventory vi
      JOIN products p  ON p.id = vi.product_id
      LEFT JOIN locations l ON l.id = vi.location_id
      WHERE vi.qty_available <= vi.reorder_point
        AND vi.reorder_point > 0
        AND p.is_active = true
        ${locationWhere}
      ORDER BY
        (vi.qty_available::float / NULLIF(vi.reorder_point, 0)) ASC
      LIMIT 50
    `,
    values: params,
  });

  return result.rows.map(r => ({
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    brand: r.brand || 'Unknown',
    qtyOnHand: parseInt(r.qty_on_hand),
    qtyAvailable: parseInt(r.qty_available),
    reorderPoint: parseInt(r.reorder_point),
    reorderQty: parseInt(r.reorder_qty),
    locationId: r.location_id,
    locationName: r.location_name,
    stockRatio: r.reorder_point > 0
      ? Math.round((r.qty_available / r.reorder_point) * 100)
      : 0,
  }));
}

/**
 * Rep performance with open quote counts.
 */
async function getRepPerformance(filters = {}) {
  const { from, to, location, repId } = filters;
  const params = [from, to];
  let where = 'WHERE sale_date BETWEEN $1 AND $2';
  if (location) {
    params.push(location);
    where += ` AND register_location = $${params.length}`;
  }
  if (repId) {
    params.push(parseInt(repId));
    where += ` AND rep_id = $${params.length}`;
  }

  const [perfResult, quotesResult] = await Promise.all([
    pool.query({
      text: `
        SELECT
          rep_id,
          rep_name,
          SUM(revenue_cents)          AS revenue_cents,
          SUM(transaction_count)      AS transaction_count,
          AVG(avg_transaction_cents)::int AS avg_transaction_cents
        FROM v_rep_performance
        ${where}
        GROUP BY rep_id, rep_name
        ORDER BY SUM(revenue_cents) DESC
      `,
      values: params,
    }),
    pool.query(`
      SELECT
        salesperson_id,
        COUNT(*) AS open_quotes
      FROM quotations
      WHERE UPPER(status) IN ('DRAFT', 'SENT')
        AND salesperson_id IS NOT NULL
      GROUP BY salesperson_id
    `),
  ]);

  // Build quotes lookup
  const quotesMap = {};
  for (const row of quotesResult.rows) {
    quotesMap[row.salesperson_id] = parseInt(row.open_quotes);
  }

  return perfResult.rows.map(r => ({
    repId: r.rep_id,
    repName: r.rep_name,
    revenueCents: parseInt(r.revenue_cents),
    transactionCount: parseInt(r.transaction_count),
    avgTransactionCents: parseInt(r.avg_transaction_cents),
    openQuotesCount: quotesMap[r.rep_id] || 0,
  }));
}

/**
 * Institutional (B2B) summary.
 */
async function getInstitutionalSummary(filters = {}) {
  const { from, to } = filters;

  const [openQuotes, outstandingAR, revenueSplit] = await Promise.all([
    // Open institutional quotes
    pool.query(`
      SELECT
        COUNT(*)                        AS count,
        COALESCE(SUM(total_cents), 0)   AS total_cents
      FROM quotations
      WHERE institutional_profile_id IS NOT NULL
        AND UPPER(status) NOT IN ('WON', 'LOST', 'EXPIRED', 'CANCELLED', 'CONVERTED')
    `),

    // Outstanding AR
    pool.query(`
      SELECT
        COUNT(*)                                              AS count,
        COALESCE(SUM(total_cents - paid_cents), 0)           AS outstanding_cents
      FROM institutional_invoices
      WHERE status NOT IN ('paid', 'void')
    `),

    // Revenue split (B2B vs B2C from won quotes in period)
    pool.query({
      text: `
        SELECT
          COALESCE(SUM(CASE WHEN institutional_profile_id IS NOT NULL
              THEN total_cents ELSE 0 END), 0)               AS b2b_cents,
          COALESCE(SUM(CASE WHEN institutional_profile_id IS NULL
              THEN total_cents ELSE 0 END), 0)               AS b2c_cents
        FROM quotations
        WHERE UPPER(status) = 'WON'
          AND created_at BETWEEN $1 AND $2
      `,
      values: [from, to],
    }),
  ]);

  return {
    openQuotes: {
      count: parseInt(openQuotes.rows[0].count),
      totalCents: parseInt(openQuotes.rows[0].total_cents),
    },
    outstandingAR: {
      count: parseInt(outstandingAR.rows[0].count),
      outstandingCents: parseInt(outstandingAR.rows[0].outstanding_cents),
    },
    revenueSplit: {
      b2bCents: parseInt(revenueSplit.rows[0].b2b_cents),
      b2cCents: parseInt(revenueSplit.rows[0].b2c_cents),
    },
  };
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  resolveDateRange,
  getSalesSummary,
  getDailySalesTrend,
  getBrandMargins,
  getTopProducts,
  getAgingInventory,
  getLowStockAlerts,
  getRepPerformance,
  getInstitutionalSummary,
};
