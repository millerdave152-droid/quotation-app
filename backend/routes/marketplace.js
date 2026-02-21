const express = require('express');
const router = express.Router();
const pool = require('../db');
const miraklService = require('../services/miraklService');
const { getInstance: getChannelManager } = require('../services/ChannelManager');
const { validateJoi, marketplaceSchemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const marketplaceAnalytics = require('../services/MarketplaceAnalytics');
const inventoryForecaster = require('../services/InventoryForecaster');
const bundleManager = require('../services/BundleManager');
const taxEngine = require('../services/TaxEngine');
const tenantManager = require('../services/TenantManager');
const shippingService = require('../services/ShippingService');
const reportGenerator = require('../services/ReportGenerator');
const marketplaceAI = require('../services/MarketplaceAI');

/**
 * Resolve a channel adapter from the request.
 * Accepts ?channelId=N or ?channel=BESTBUY_CA.
 * Falls back to the first active adapter (Best Buy default).
 * Returns { manager, adapter, channelId }.
 */
async function resolveChannel(req) {
  const manager = await getChannelManager();
  const rawId = req.query.channelId || req.body?.channelId;
  const rawCode = req.query.channel || req.body?.channel;

  if (rawId) {
    const id = parseInt(rawId, 10);
    return { manager, adapter: manager.getAdapter(id), channelId: id };
  }
  if (rawCode) {
    const adapter = manager.getAdapterByCode(rawCode);
    return { manager, adapter, channelId: adapter.channelId };
  }
  // Default: first active adapter (backward compatible)
  const all = manager.getAllAdapters();
  if (all.length === 0) {
    // No adapters loaded — fall back to legacy miraklService path
    return { manager, adapter: null, channelId: null };
  }
  return { manager, adapter: all[0], channelId: all[0].channelId };
}

// Cached column lookup for products table
let productsColumnCache = { columns: null, loadedAt: 0 };
const PRODUCTS_COLUMN_CACHE_MS = 5 * 60 * 1000;

async function getProductsColumns() {
  const now = Date.now();
  if (productsColumnCache.columns && (now - productsColumnCache.loadedAt) < PRODUCTS_COLUMN_CACHE_MS) {
    return productsColumnCache.columns;
  }
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products'`
  );
  const cols = result.rows.map(r => r.column_name);
  productsColumnCache = { columns: cols, loadedAt: now };
  return cols;
}

function pickFirstColumn(columns, candidates) {
  return candidates.find(c => columns.includes(c));
}

// Helper to generate unique return/refund numbers
const generateReturnNumber = () => `RET-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
const generateRefundNumber = () => `REF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

// Guard: check Mirakl API credentials before calling external API
function requireMiraklConfig() {
  if (!process.env.MIRAKL_API_KEY) {
    throw ApiError.badRequest('Mirakl API key not configured. Set MIRAKL_API_KEY in your .env file.');
  }
}

// ============================================
// MARKETPLACE ORDERS
// ============================================

// -- Static routes BEFORE parameterized routes --

// ============================================
// UNIFIED ORDER HUB — cross-channel + POS view
// ============================================

/**
 * GET /orders/unified
 * Single view of ALL orders across marketplace channels AND POS transactions.
 * Query params:
 *   source  - 'all' (default), 'marketplace', 'pos', or specific channel code (e.g. 'bestbuy_mirakl')
 *   state   - order state filter (e.g. 'SHIPPING', 'completed')
 *   dateFrom, dateTo - ISO date range
 *   search  - free-text (customer name, order number)
 *   limit, offset - pagination
 */
router.get('/orders/unified', authenticate, asyncHandler(async (req, res) => {
  const {
    source = 'all',
    state,
    dateFrom,
    dateTo,
    search,
    limit: rawLimit,
    offset: rawOffset
  } = req.query;

  const limit = Math.min(parseInt(rawLimit, 10) || 50, 200);
  const offset = parseInt(rawOffset, 10) || 0;

  const includeMarketplace = source === 'all' || source === 'marketplace' || (source !== 'pos' && source !== 'all' && source !== 'marketplace');
  const includePOS = source === 'all' || source === 'pos';
  const specificChannel = (source !== 'all' && source !== 'marketplace' && source !== 'pos') ? source : null;

  const unionParts = [];
  const countParts = [];
  const allParams = [];
  let paramIdx = 1;

  // --- Marketplace orders ---
  if (includeMarketplace) {
    const mktWhere = [];

    if (specificChannel) {
      mktWhere.push(`mc.channel_code = $${paramIdx}`);
      allParams.push(specificChannel);
      paramIdx++;
    }
    if (state) {
      mktWhere.push(`mo.mirakl_order_state = $${paramIdx}`);
      allParams.push(state);
      paramIdx++;
    }
    if (dateFrom) {
      mktWhere.push(`mo.created_at >= $${paramIdx}::timestamp`);
      allParams.push(dateFrom);
      paramIdx++;
    }
    if (dateTo) {
      mktWhere.push(`mo.created_at <= $${paramIdx}::timestamp + INTERVAL '1 day'`);
      allParams.push(dateTo);
      paramIdx++;
    }
    if (search) {
      mktWhere.push(`(
        mo.customer_name ILIKE $${paramIdx}
        OR mo.mirakl_order_id ILIKE $${paramIdx}
        OR mo.customer_email ILIKE $${paramIdx}
      )`);
      allParams.push(`%${search}%`);
      paramIdx++;
    }

    const mktWhereClause = mktWhere.length > 0 ? 'AND ' + mktWhere.join(' AND ') : '';

    unionParts.push(`
      SELECT
        mo.id,
        mo.mirakl_order_id AS order_number,
        mc.channel_code AS source_code,
        mc.channel_name AS source_name,
        'marketplace' AS source_type,
        mo.customer_name,
        mo.customer_email,
        mo.total_price_cents / 100.0 AS total_price,
        mo.mirakl_order_state AS status,
        mo.created_at,
        mo.shipped_date,
        mo.acceptance_deadline,
        CASE WHEN mo.mirakl_order_state = 'WAITING_ACCEPTANCE'
          THEN EXTRACT(EPOCH FROM (mo.acceptance_deadline - NOW()))
          ELSE NULL END AS seconds_until_deadline,
        mo.commission_amount,
        mo.channel_id
      FROM marketplace_orders mo
      JOIN marketplace_channels mc ON mc.id = mo.channel_id
      WHERE 1=1 ${mktWhereClause}
    `);

    countParts.push(`
      SELECT mc.channel_code AS source_code, COUNT(*) AS cnt
      FROM marketplace_orders mo
      JOIN marketplace_channels mc ON mc.id = mo.channel_id
      WHERE 1=1 ${mktWhereClause}
      GROUP BY mc.channel_code
    `);
  }

  // --- POS transactions ---
  if (includePOS) {
    const posWhere = [];

    if (state) {
      posWhere.push(`t.status = $${paramIdx}`);
      allParams.push(state);
      paramIdx++;
    }
    if (dateFrom) {
      posWhere.push(`t.created_at >= $${paramIdx}::timestamp`);
      allParams.push(dateFrom);
      paramIdx++;
    }
    if (dateTo) {
      posWhere.push(`t.created_at <= $${paramIdx}::timestamp + INTERVAL '1 day'`);
      allParams.push(dateTo);
      paramIdx++;
    }
    if (search) {
      posWhere.push(`(
        c.name ILIKE $${paramIdx}
        OR t.transaction_number ILIKE $${paramIdx}
      )`);
      allParams.push(`%${search}%`);
      paramIdx++;
    }

    const posWhereClause = posWhere.length > 0 ? 'AND ' + posWhere.join(' AND ') : '';

    unionParts.push(`
      SELECT
        t.transaction_id AS id,
        t.transaction_number AS order_number,
        'POS' AS source_code,
        'In-Store' AS source_name,
        'pos' AS source_type,
        c.name AS customer_name,
        c.email AS customer_email,
        t.total_amount AS total_price,
        t.status,
        t.created_at,
        t.completed_at AS shipped_date,
        NULL::timestamp AS acceptance_deadline,
        NULL::double precision AS seconds_until_deadline,
        0::numeric AS commission_amount,
        NULL::integer AS channel_id
      FROM transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE 1=1 ${posWhereClause}
    `);

    countParts.push(`
      SELECT 'POS' AS source_code, COUNT(*) AS cnt
      FROM transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE 1=1 ${posWhereClause}
    `);
  }

  if (unionParts.length === 0) {
    return res.json({ orders: [], total: 0, sources: {} });
  }

  // Build the UNION query with sorting and pagination
  const unionQuery = unionParts.join(' UNION ALL ');

  // We need separate param sets for the data query (with LIMIT/OFFSET) and count query
  const dataParams = [...allParams, limit, offset];
  const dataQuery = `
    SELECT * FROM (${unionQuery}) AS unified
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  // Count query: UNION ALL the count parts
  const countQuery = countParts.join(' UNION ALL ');

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, dataParams),
    pool.query(countQuery, allParams)
  ]);

  // Build source breakdown
  const sources = {};
  let total = 0;
  for (const row of countResult.rows) {
    const code = row.source_code || 'unknown';
    const cnt = parseInt(row.cnt, 10) || 0;
    sources[code] = cnt;
    total += cnt;
  }

  res.json({
    orders: dataResult.rows,
    total,
    limit,
    offset,
    sources
  });
}));

/**
 * GET /orders/unified/stats
 * Revenue comparison across all channels (marketplace + POS) for the last 30 days.
 */
router.get('/orders/unified/stats', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;

  const [mktResult, posResult] = await Promise.all([
    // Marketplace channels — grouped by channel_code
    pool.query(`
      SELECT
        mc.channel_code AS code,
        mc.channel_name AS name,
        COUNT(mo.id) AS orders,
        COALESCE(SUM(mo.total_price_cents / 100.0), 0) AS revenue,
        COALESCE(SUM(mo.commission_amount), 0) AS commission,
        COALESCE(SUM(mo.total_price_cents / 100.0) - SUM(mo.commission_amount), 0) AS net_revenue,
        CASE WHEN COUNT(mo.id) > 0
          THEN ROUND(SUM(mo.total_price_cents / 100.0) / COUNT(mo.id), 2)
          ELSE 0 END AS avg_order_value
      FROM marketplace_channels mc
      LEFT JOIN marketplace_orders mo
        ON mo.channel_id = mc.id
        AND mo.created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY mc.channel_code, mc.channel_name
      ORDER BY revenue DESC
    `, [days]),

    // POS transactions
    pool.query(`
      SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(total_amount), 0) AS revenue,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(SUM(total_amount) / COUNT(*), 2)
          ELSE 0 END AS avg_order_value
      FROM transactions
      WHERE status NOT IN ('voided', 'void')
        AND created_at >= NOW() - ($1 || ' days')::interval
    `, [days])
  ]);

  const channels = [];

  // Add marketplace channels
  for (const row of mktResult.rows) {
    channels.push({
      code: row.code,
      name: row.name,
      sourceType: 'marketplace',
      orders: parseInt(row.orders, 10) || 0,
      revenue: parseFloat(row.revenue) || 0,
      commission: parseFloat(row.commission) || 0,
      netRevenue: parseFloat(row.net_revenue) || 0,
      avgOrderValue: parseFloat(row.avg_order_value) || 0
    });
  }

  // Add POS
  const pos = posResult.rows[0];
  channels.push({
    code: 'POS',
    name: 'In-Store',
    sourceType: 'pos',
    orders: parseInt(pos.orders, 10) || 0,
    revenue: parseFloat(pos.revenue) || 0,
    commission: 0,
    netRevenue: parseFloat(pos.revenue) || 0,
    avgOrderValue: parseFloat(pos.avg_order_value) || 0
  });

  // Totals
  const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
  const totalOrders = channels.reduce((s, c) => s + c.orders, 0);
  const totalCommission = channels.reduce((s, c) => s + c.commission, 0);

  res.json({
    days,
    channels,
    totals: {
      orders: totalOrders,
      revenue: Math.round(totalRevenue * 100) / 100,
      commission: Math.round(totalCommission * 100) / 100,
      netRevenue: Math.round((totalRevenue - totalCommission) * 100) / 100,
      avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0
    }
  });
}));

/**
 * GET /orders/unified/:orderId
 * Get any order by ID — tries marketplace_orders first, then transactions.
 * Accepts numeric IDs or order number strings.
 */
router.get('/orders/unified/:orderId', authenticate, asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const isNumeric = /^\d+$/.test(orderId);

  // 1. Try marketplace_orders
  const mktQuery = isNumeric
    ? `SELECT mo.*, mc.channel_code, mc.channel_name,
         CASE WHEN mo.mirakl_order_state = 'WAITING_ACCEPTANCE'
           THEN EXTRACT(EPOCH FROM (mo.acceptance_deadline - NOW()))
           ELSE NULL END AS seconds_until_deadline
       FROM marketplace_orders mo
       LEFT JOIN marketplace_channels mc ON mc.id = mo.channel_id
       WHERE mo.id = $1`
    : `SELECT mo.*, mc.channel_code, mc.channel_name,
         CASE WHEN mo.mirakl_order_state = 'WAITING_ACCEPTANCE'
           THEN EXTRACT(EPOCH FROM (mo.acceptance_deadline - NOW()))
           ELSE NULL END AS seconds_until_deadline
       FROM marketplace_orders mo
       LEFT JOIN marketplace_channels mc ON mc.id = mo.channel_id
       WHERE mo.mirakl_order_id = $1`;

  const mktResult = await pool.query(mktQuery, [isNumeric ? parseInt(orderId, 10) : orderId]);

  if (mktResult.rows.length > 0) {
    const order = mktResult.rows[0];

    // Fetch line items
    const items = await pool.query(
      'SELECT * FROM marketplace_order_items WHERE order_id = $1 ORDER BY id',
      [order.id]
    );

    return res.json({
      source: 'marketplace',
      channelCode: order.channel_code,
      channelName: order.channel_name,
      order: {
        ...order,
        totalPrice: order.total_price_cents ? order.total_price_cents / 100 : null,
        items: items.rows
      }
    });
  }

  // 2. Try transactions (POS)
  const posQuery = isNumeric
    ? `SELECT t.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
       FROM transactions t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.transaction_id = $1`
    : `SELECT t.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
       FROM transactions t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.transaction_number = $1`;

  const posResult = await pool.query(posQuery, [isNumeric ? parseInt(orderId, 10) : orderId]);

  if (posResult.rows.length > 0) {
    const tx = posResult.rows[0];

    // Fetch line items from transaction_items
    const items = await pool.query(
      `SELECT ti.*, p.name AS product_name, p.sku
       FROM transaction_items ti
       LEFT JOIN products p ON p.id = ti.product_id
       WHERE ti.transaction_id = $1
       ORDER BY ti.id`,
      [tx.transaction_id]
    );

    return res.json({
      source: 'pos',
      channelCode: 'POS',
      channelName: 'In-Store',
      order: {
        ...tx,
        items: items.rows
      }
    });
  }

  throw ApiError.notFound(`Order ${orderId} not found in any channel`);
}));

// ============================================
// MARKETPLACE ORDERS (channel-specific)
// ============================================

// Dashboard stats for orders — supports ?channelId filter or cross-channel
router.get('/orders/dashboard-stats', authenticate, asyncHandler(async (req, res) => {
  const channelFilter = req.query.channelId ? parseInt(req.query.channelId, 10) : null;
  const channelWhere = channelFilter ? ` AND channel_id = ${channelFilter}` : '';

  const [pending, urgent, shipping, shippedToday, revenue, byState] = await Promise.all([
    pool.query(`SELECT COUNT(*) as cnt FROM marketplace_orders WHERE mirakl_order_state = 'WAITING_ACCEPTANCE'${channelWhere}`),
    pool.query(`SELECT COUNT(*) as cnt FROM marketplace_orders WHERE mirakl_order_state = 'WAITING_ACCEPTANCE' AND acceptance_deadline < NOW() + INTERVAL '4 hours'${channelWhere}`),
    pool.query(`SELECT COUNT(*) as cnt FROM marketplace_orders WHERE mirakl_order_state = 'SHIPPING'${channelWhere}`),
    pool.query(`SELECT COUNT(*) as cnt FROM marketplace_orders WHERE mirakl_order_state = 'SHIPPED' AND shipped_date >= CURRENT_DATE${channelWhere}`),
    pool.query(`
      SELECT
        COALESCE(SUM(total_price_cents / 100.0), 0) as total_revenue,
        COALESCE(SUM(commission_amount), 0) as total_commission
      FROM marketplace_orders
      WHERE created_at >= NOW() - INTERVAL '30 days'${channelWhere}
    `),
    pool.query(`
      SELECT mirakl_order_state as state, COUNT(*) as cnt
      FROM marketplace_orders
      WHERE mirakl_order_state IS NOT NULL${channelWhere}
      GROUP BY mirakl_order_state
    `),
  ]);

  const ordersByState = {};
  byState.rows.forEach(r => { ordersByState[r.state] = parseInt(r.cnt); });

  // If cross-channel requested, include per-channel breakdown
  let channelBreakdown = undefined;
  if (req.query.crossChannel === 'true' && !channelFilter) {
    try {
      const manager = await getChannelManager();
      channelBreakdown = await manager.getDashboardStats();
    } catch (e) { console.error('Channel breakdown fetch error:', e.message); }
  }

  res.json({
    pendingAcceptance: parseInt(pending.rows[0].cnt),
    urgentAcceptance: parseInt(urgent.rows[0].cnt),
    awaitingShipment: parseInt(shipping.rows[0].cnt),
    shippedToday: parseInt(shippedToday.rows[0].cnt),
    totalRevenue30Days: parseFloat(revenue.rows[0].total_revenue) || 0,
    totalCommission30Days: parseFloat(revenue.rows[0].total_commission) || 0,
    ordersByState,
    ...(channelBreakdown && { channelBreakdown })
  });
}));

// Poll orders from Mirakl (trigger immediate sync) — supports ?channelId or polls all
router.get('/orders/poll', authenticate, asyncHandler(async (req, res) => {
  const { adapter } = await resolveChannel(req);
  const options = {
    states: req.query.states || undefined,
    since: req.query.since || undefined
  };

  // If a specific adapter resolved, poll that channel
  if (adapter) {
    const result = await adapter.pollOrders(options);
    return res.json({
      success: true,
      newOrders: result.newOrders,
      updatedOrders: result.updatedOrders,
      totalPolled: result.totalPolled,
      errors: result.errors,
      lastPollTime: new Date()
    });
  }

  // Fallback: legacy miraklService (no channels configured)
  requireMiraklConfig();
  const result = await miraklService.pollOrders(options);
  res.json({
    success: true,
    newOrders: result.newOrders,
    updatedOrders: result.updatedOrders,
    totalPolled: result.totalPolled,
    errors: result.errors,
    lastPollTime: new Date()
  });
}));

// Legacy pull-orders endpoint — redirects to pollOrders
router.get('/pull-orders', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const result = await miraklService.pollOrders();
  res.json({
    success: true,
    imported: result.newOrders,
    updated: result.updatedOrders,
    failed: result.errors.length,
    total: result.totalPolled
  });
}));

// Sync orders (POST variant with body params)
router.post('/orders/sync', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const { start_date, order_state_codes } = req.body || {};
  const result = await miraklService.pollOrders({
    states: order_state_codes || undefined,
    since: start_date || undefined
  });

  res.json({
    success: true,
    total: result.totalPolled,
    succeeded: result.newOrders + result.updatedOrders,
    failed: result.errors.length,
    errors: result.errors
  });
}));

// -- Parameterized order routes --

// List marketplace orders with filters — supports ?channelId filter
router.get('/orders', authenticate, asyncHandler(async (req, res) => {
  const {
    state, status, dateFrom, dateTo, search, channelId: rawChannelId,
    limit: rawLimit = 50, offset: rawOffset = 0
  } = req.query;
  const limit = Math.min(parseInt(rawLimit) || 50, 200);
  const offset = parseInt(rawOffset) || 0;
  const filterState = state || status; // support both param names
  const filterChannelId = rawChannelId ? parseInt(rawChannelId, 10) : null;

  const conditions = [];
  const params = [];
  let pi = 1;

  if (filterChannelId) {
    conditions.push(`mo.channel_id = $${pi++}`);
    params.push(filterChannelId);
  }
  if (filterState) {
    conditions.push(`mo.mirakl_order_state = $${pi++}`);
    params.push(filterState);
  }
  if (dateFrom) {
    conditions.push(`mo.order_date >= $${pi++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`mo.order_date <= $${pi++}::date + INTERVAL '1 day'`);
    params.push(dateTo);
  }
  if (search) {
    conditions.push(`(mo.customer_name ILIKE $${pi} OR mo.customer_email ILIKE $${pi} OR mo.mirakl_order_id ILIKE $${pi})`);
    params.push(`%${search}%`);
    pi++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const [ordersResult, countResult] = await Promise.all([
    pool.query(`
      SELECT
        mo.id, mo.mirakl_order_id, mo.order_state, mo.mirakl_order_state,
        mo.order_date, mo.total_price_cents, mo.total_price_cents / 100.0 as total_price,
        mo.shipping_price_cents / 100.0 as shipping_price,
        mo.commission_amount, mo.taxes_total,
        mo.customer_name, mo.customer_email, mo.customer_phone,
        mo.shipping_address, mo.acceptance_deadline, mo.shipped_date,
        mo.customer_id, mo.customer_match_type,
        mo.created_at, mo.updated_at, mo.last_polled_at,
        CASE WHEN mo.mirakl_order_state = 'WAITING_ACCEPTANCE' AND mo.acceptance_deadline IS NOT NULL
          THEN EXTRACT(EPOCH FROM (mo.acceptance_deadline - NOW())) / 3600.0
          ELSE NULL
        END as hours_until_deadline,
        (SELECT COUNT(*) FROM marketplace_order_items oi WHERE oi.order_id = mo.id) as item_count
      FROM marketplace_orders mo
      ${where}
      ORDER BY mo.order_date DESC
      LIMIT $${pi} OFFSET $${pi + 1}
    `, [...params, limit, offset]),
    pool.query(`SELECT COUNT(*) as total FROM marketplace_orders mo ${where}`, params)
  ]);

  res.json({
    orders: ordersResult.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset
  });
}));

// Get single order with full details
router.get('/orders/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const orderResult = await pool.query(`
    SELECT
      mo.*,
      mo.total_price_cents / 100.0 as total_price,
      mo.shipping_price_cents / 100.0 as shipping_price_dollars,
      mo.tax_cents / 100.0 as tax_dollars,
      mo.commission_fee_cents / 100.0 as commission_fee_dollars,
      CASE WHEN mo.mirakl_order_state = 'WAITING_ACCEPTANCE' AND mo.acceptance_deadline IS NOT NULL
        THEN EXTRACT(EPOCH FROM (mo.acceptance_deadline - NOW())) / 3600.0
        ELSE NULL
      END as hours_until_deadline
    FROM marketplace_orders mo
    WHERE mo.id = $1
  `, [id]);

  if (orderResult.rows.length === 0) {
    throw ApiError.notFound('Order');
  }

  const order = orderResult.rows[0];

  // Items with product details
  const itemsResult = await pool.query(`
    SELECT
      oi.*,
      oi.unit_price_cents / 100.0 as unit_price_dollars,
      oi.total_price_cents / 100.0 as total_price_dollars,
      p.name as product_name, p.sku as internal_sku,
      p.model, p.manufacturer,
      p.stock_quantity, p.bestbuy_category_code
    FROM marketplace_order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = $1
    ORDER BY oi.id
  `, [id]);

  // Shipments
  const shipmentsResult = await pool.query(
    'SELECT * FROM marketplace_shipments WHERE order_id = $1 ORDER BY shipment_date DESC',
    [id]
  );

  // Computed counts
  const items = itemsResult.rows;
  order.items = items;
  order.shipments = shipmentsResult.rows;
  order.items_accepted = items.filter(i => i.status === 'ACCEPTED').length;
  order.items_refused = items.filter(i => i.status === 'REFUSED').length;
  order.items_shipped = items.filter(i => i.status === 'SHIPPED').length;
  order.items_pending = items.filter(i => i.status === 'PENDING').length;
  order.items_refunded = items.filter(i => i.status === 'REFUNDED').length;

  res.json(order);
}));

// Accept or refuse order lines
router.post('/orders/:id/accept', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const { id } = req.params;
  const { lines } = req.body;

  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    throw ApiError.badRequest('lines array is required');
  }

  // Get order
  const orderResult = await pool.query(
    'SELECT * FROM marketplace_orders WHERE id = $1',
    [id]
  );
  if (orderResult.rows.length === 0) throw ApiError.notFound('Order');
  const order = orderResult.rows[0];

  const currentState = (order.mirakl_order_state || order.order_state || '').toUpperCase();
  if (currentState !== 'WAITING_ACCEPTANCE') {
    throw ApiError.badRequest(`Order is in state ${currentState}, expected WAITING_ACCEPTANCE`);
  }

  // Validate all lineIds exist for this order
  const orderItems = await pool.query(
    'SELECT mirakl_order_line_id FROM marketplace_order_items WHERE order_id = $1',
    [id]
  );
  const validLineIds = new Set(orderItems.rows.map(r => r.mirakl_order_line_id));
  for (const line of lines) {
    if (!validLineIds.has(line.lineId)) {
      throw ApiError.badRequest(`Line ID ${line.lineId} not found on this order`);
    }
  }

  // Call Mirakl API
  const miraklLines = lines.map(l => ({
    id: l.lineId,
    accepted: l.accepted,
    reason_code: l.reason || undefined
  }));

  let data;
  try {
    data = await miraklService.acceptOrderLines(order.mirakl_order_id, miraklLines);
  } catch (miraklErr) {
    const miraklData = miraklErr.response?.data;
    const miraklMsg = (typeof miraklData?.message === 'string' ? miraklData.message : null)
      || (typeof miraklData?.error === 'string' ? miraklData.error : null)
      || miraklErr.message;
    // If Mirakl says it's not in WAITING_ACCEPTANCE, re-poll to sync local state
    if (miraklMsg.includes('not in state WAITING_ACCEPTANCE') || miraklErr.response?.status === 400) {
      try {
        await miraklService.pollOrders({ states: 'WAITING_ACCEPTANCE,WAITING_DEBIT,WAITING_DEBIT_PAYMENT,SHIPPING,SHIPPED,RECEIVED' });
      } catch (e) { console.error('Order re-poll error:', e.message); }
    }
    throw ApiError.badRequest('Mirakl rejected the request: ' + miraklMsg);
  }

  // For accepted lines on marketplace_enabled products, decrement inventory
  const acceptedLineIds = lines.filter(l => l.accepted).map(l => l.lineId);
  if (acceptedLineIds.length > 0) {
    const acceptedItems = await pool.query(
      `SELECT oi.product_id, oi.quantity
       FROM marketplace_order_items oi
       WHERE oi.order_id = $1 AND oi.mirakl_order_line_id = ANY($2) AND oi.product_id IS NOT NULL`,
      [id, acceptedLineIds]
    );
    for (const item of acceptedItems.rows) {
      const _stockRes = await pool.query(
        `UPDATE products SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - $1)
         WHERE id = $2 AND marketplace_enabled = true RETURNING stock_quantity, sku`,
        [item.quantity, item.product_id]
      );
      // Queue marketplace inventory sync (non-blocking)
      try {
        if (_stockRes.rows.length > 0) {
          const _newQty = _stockRes.rows[0].stock_quantity ?? 0;
          await miraklService.queueInventoryChange(item.product_id, _stockRes.rows[0].sku, _newQty + item.quantity, _newQty, 'ORDER_ACCEPT');
        }
      } catch (queueErr) {
        console.error('[MarketplaceQueue] ORDER_ACCEPT queue error:', queueErr.message);
      }
    }
  }

  // Fetch updated order
  const updated = await pool.query('SELECT * FROM marketplace_orders WHERE id = $1', [id]);
  res.json({ success: true, order: updated.rows[0], miraklResponse: data });
}));

// Refuse an order (all lines)
router.post('/orders/:id/refuse', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const orderResult = await pool.query('SELECT * FROM marketplace_orders WHERE id = $1', [id]);
  if (orderResult.rows.length === 0) throw ApiError.notFound('Order');
  const order = orderResult.rows[0];

  // Build refuse lines for all items
  const items = await pool.query(
    'SELECT mirakl_order_line_id FROM marketplace_order_items WHERE order_id = $1',
    [id]
  );
  const miraklLines = items.rows.map(i => ({
    id: i.mirakl_order_line_id,
    accepted: false,
    reason_code: reason || 'OUT_OF_STOCK'
  }));

  await miraklService.acceptOrderLines(order.mirakl_order_id, miraklLines);

  await pool.query(
    `UPDATE marketplace_orders
     SET order_state = 'REFUSED', mirakl_order_state = 'REFUSED',
         canceled_date = NOW(), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id]
  );

  res.json({ success: true, message: 'Order refused successfully' });
}));

// ============================================
// SHIPMENTS
// ============================================

// Ship an order — add tracking + confirm shipment
router.post('/orders/:id/ship', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const { id } = req.params;
  const { trackingNumber, carrierCode, carrierName, carrierUrl } = req.body;

  if (!trackingNumber) {
    throw ApiError.badRequest('trackingNumber is required');
  }

  const orderResult = await pool.query('SELECT * FROM marketplace_orders WHERE id = $1', [id]);
  if (orderResult.rows.length === 0) throw ApiError.notFound('Order');
  const order = orderResult.rows[0];

  const currentState = (order.mirakl_order_state || order.order_state || '').toUpperCase();
  if (currentState !== 'SHIPPING') {
    throw ApiError.badRequest(`Order is in state ${currentState}, expected SHIPPING`);
  }

  let miraklError = null;

  // 1. Update tracking on Mirakl
  try {
    await miraklService.updateTracking(order.mirakl_order_id, trackingNumber, carrierCode, carrierName, carrierUrl);
  } catch (err) {
    console.error(`[Ship] Mirakl updateTracking failed for order ${id}:`, err.response?.data || err.message);
    miraklError = err.response?.data?.message || err.message;
  }

  // 2. Confirm shipment on Mirakl
  try {
    await miraklService.confirmShipment(order.mirakl_order_id);
  } catch (err) {
    console.error(`[Ship] Mirakl confirmShipment failed for order ${id}:`, err.response?.data || err.message);
    if (!miraklError) miraklError = err.response?.data?.message || err.message;
  }

  // 3. Save shipment record locally (always persist locally even if Mirakl fails)
  const shipment = await pool.query(
    `INSERT INTO marketplace_shipments
     (order_id, tracking_number, carrier_code, carrier_name, shipment_date, shipment_status)
     VALUES ($1, $2, $3, $4, NOW(), 'SHIPPED')
     RETURNING *`,
    [id, trackingNumber, carrierCode || null, carrierName || carrierCode || 'Other']
  );

  // 4. Update local order state
  await pool.query(
    `UPDATE marketplace_orders
     SET mirakl_order_state = 'SHIPPED', order_state = 'SHIPPED',
         shipped_date = NOW(), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id]
  );
  await pool.query(
    `UPDATE marketplace_order_items
     SET status = 'SHIPPED', order_line_state = 'SHIPPED',
         shipping_tracking = $1, shipping_carrier = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE order_id = $3 AND order_line_state IN ('SHIPPING', 'ACCEPTED')`,
    [trackingNumber, carrierCode || carrierName || 'Other', id]
  );

  res.status(201).json({
    success: true,
    shipment: shipment.rows[0],
    miraklWarning: miraklError ? `Mirakl sync issue: ${miraklError}` : undefined
  });
}));

// Legacy shipments endpoint — kept for backward compatibility
router.post('/orders/:id/shipments', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const { id } = req.params;
  const { tracking_number, carrier_code, carrier_name } = req.body;

  const orderResult = await pool.query('SELECT * FROM marketplace_orders WHERE id = $1', [id]);
  if (orderResult.rows.length === 0) throw ApiError.notFound('Order');
  const order = orderResult.rows[0];

  await miraklService.updateTracking(order.mirakl_order_id, tracking_number, carrier_code, carrier_name);
  await miraklService.confirmShipment(order.mirakl_order_id);

  const shipment = await pool.query(
    `INSERT INTO marketplace_shipments
     (order_id, tracking_number, carrier_code, carrier_name, shipment_date, shipment_status)
     VALUES ($1, $2, $3, $4, NOW(), 'SHIPPED')
     RETURNING *`,
    [id, tracking_number, carrier_code || null, carrier_name || carrier_code || 'Other']
  );

  res.status(201).json(shipment.rows[0]);
}));

// Process refund on order lines
router.post('/orders/:id/refund', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const { id } = req.params;
  const { lines } = req.body;

  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    throw ApiError.badRequest('lines array is required');
  }

  const orderResult = await pool.query('SELECT * FROM marketplace_orders WHERE id = $1', [id]);
  if (orderResult.rows.length === 0) throw ApiError.notFound('Order');
  const order = orderResult.rows[0];

  // Validate refund amounts don't exceed original line amounts
  const orderItems = await pool.query(
    'SELECT mirakl_order_line_id, line_total, unit_price, quantity FROM marketplace_order_items WHERE order_id = $1',
    [id]
  );
  const itemMap = new Map(orderItems.rows.map(r => [r.mirakl_order_line_id, r]));

  for (const line of lines) {
    const item = itemMap.get(line.lineId);
    if (!item) {
      throw ApiError.badRequest(`Line ID ${line.lineId} not found on this order`);
    }
    const maxAmount = parseFloat(item.line_total || item.unit_price * item.quantity || 0);
    if (line.amount > maxAmount) {
      throw ApiError.badRequest(`Refund amount ${line.amount} exceeds line total ${maxAmount} for line ${line.lineId}`);
    }
  }

  const refunds = lines.map(l => ({
    order_line_id: l.lineId,
    amount: l.amount,
    reason_code: l.reason || 'PRODUCT_RETURNED',
    shipping_amount: l.shippingAmount || 0
  }));

  const data = await miraklService.processRefund(order.mirakl_order_id, refunds);

  const updated = await pool.query('SELECT * FROM marketplace_orders WHERE id = $1', [id]);
  res.json({ success: true, order: updated.rows[0], miraklResponse: data });
}));

// ============================================
// PRODUCT SYNC
// ============================================

// Bulk push marketplace-enabled offers to Mirakl (OF01) — supports ?channelId
router.post('/offers/bulk-push', authenticate, asyncHandler(async (req, res) => {
  const { manager, adapter, channelId } = await resolveChannel(req);

  // If adapter available and channel has product_channel_listings, use ChannelManager path
  if (adapter && channelId) {
    try {
      const result = await manager.pushOffers(channelId, req.body.productIds || null);
      return res.json({
        success: true,
        importId: result.importId || null,
        productsSubmitted: result.submitted || 0,
        channelId
      });
    } catch (err) {
      // If product_channel_listings has no rows, fall through to legacy path
      if (!err.message.includes('No adapter')) throw err;
    }
  }

  // Legacy path: direct miraklService (backward compatible)
  requireMiraklConfig();
  const columns = await getProductsColumns();
  const upcCol = pickFirstColumn(columns, ['upc', 'barcode', 'ean', 'gtin']);
  if (!upcCol) {
    throw ApiError.badRequest('No UPC/barcode column found on products table');
  }
  const stockCol = pickFirstColumn(columns, ['stock_quantity', 'qty_on_hand', 'quantity_in_stock', 'stock', 'quantity', 'qty_available']);

  const selectCols = [
    'id',
    'name',
    'description',
    'sku',
    'price',
    'msrp_cents',
    'marketplace_enabled',
    'bestbuy_category_id',
    'bestbuy_logistic_class',
    'bestbuy_min_quantity_alert',
    'bestbuy_leadtime_to_ship',
    'bestbuy_product_tax_code',
    'marketplace_discount_price',
    'marketplace_discount_start',
    'marketplace_discount_end',
    stockCol ? `${stockCol} AS stock_quantity` : '0::integer AS stock_quantity',
    `${upcCol} AS upc`
  ];

  const productsQuery = await pool.query(
    `SELECT ${selectCols.join(', ')}
     FROM products
     WHERE marketplace_enabled = true
       AND bestbuy_category_id IS NOT NULL
       AND ${upcCol} IS NOT NULL`
  );

  const products = productsQuery.rows;
  if (products.length === 0) {
    return res.json({ success: true, importId: null, productsSubmitted: 0 });
  }

  const csvString = miraklService.generateOfferCSV(products);
  const uploadResult = await miraklService.uploadOfferCSV(csvString);
  const importId = uploadResult?.import_id || uploadResult?.import?.import_id || null;

  await pool.query(
    `UPDATE products
     SET mirakl_last_offer_sync = NOW()
     WHERE id = ANY($1)`,
    [products.map(p => p.id)]
  );

  res.json({
    success: true,
    importId,
    productsSubmitted: products.length
  });
}));

// Push or update a single offer (OF24) — supports ?channelId
router.post('/offers/push-single/:productId', authenticate, asyncHandler(async (req, res) => {
  const { adapter } = await resolveChannel(req);
  const { productId } = req.params;
  const columns = await getProductsColumns();
  const upcCol = pickFirstColumn(columns, ['upc', 'barcode', 'ean', 'gtin']);
  if (!upcCol) {
    throw ApiError.badRequest('No UPC/barcode column found on products table');
  }
  const stockCol = pickFirstColumn(columns, ['stock_quantity', 'qty_on_hand', 'quantity_in_stock', 'stock', 'quantity', 'qty_available']);

  const selectCols = [
    'id',
    'name',
    'description',
    'sku',
    'price',
    'msrp_cents',
    'marketplace_enabled',
    'bestbuy_category_id',
    'bestbuy_logistic_class',
    'bestbuy_min_quantity_alert',
    'bestbuy_leadtime_to_ship',
    'bestbuy_product_tax_code',
    'marketplace_discount_price',
    'marketplace_discount_start',
    'marketplace_discount_end',
    stockCol ? `${stockCol} AS stock_quantity` : '0::integer AS stock_quantity',
    `${upcCol} AS upc`
  ];

  const productQuery = await pool.query(
    `SELECT ${selectCols.join(', ')} FROM products WHERE id = $1`,
    [productId]
  );

  if (productQuery.rows.length === 0) {
    throw ApiError.notFound('Product');
  }

  const product = productQuery.rows[0];
  if (!product.marketplace_enabled) {
    throw ApiError.badRequest('Product is not marketplace-enabled');
  }
  if (!product.bestbuy_category_id) {
    throw ApiError.badRequest('Product is missing bestbuy_category_id');
  }
  if (!product.upc) {
    throw ApiError.badRequest('Product is missing UPC/barcode');
  }

  // Use adapter if available, otherwise legacy
  if (adapter) {
    await adapter.pushSingleOffer(product);
  } else {
    requireMiraklConfig();
    await miraklService.updateSingleOffer(product);
  }

  res.json({
    success: true,
    productName: product.name,
    sku: product.sku
  });
}));

// Check status of an offer import — uses adapter if channel_id on import record
router.get('/offers/import-status/:importId', authenticate, asyncHandler(async (req, res) => {
  const { importId } = req.params;
  const importQuery = await pool.query(
    'SELECT * FROM marketplace_offer_imports WHERE import_id = $1',
    [importId]
  );

  if (importQuery.rows.length === 0) {
    throw ApiError.notFound('Import');
  }

  const record = importQuery.rows[0];
  if (!['COMPLETE', 'COMPLETED', 'FAILED'].includes((record.status || '').toUpperCase())) {
    // Use adapter if import has a channel_id, otherwise legacy
    if (record.channel_id) {
      try {
        const manager = await getChannelManager();
        const adapter = manager.getAdapter(record.channel_id);
        await adapter.checkImportStatus(record.mirakl_import_id);
      } catch (_) {
        // Adapter not available — fall through to legacy
        requireMiraklConfig();
        await miraklService.checkImportStatus(record.mirakl_import_id);
      }
    } else {
      requireMiraklConfig();
      await miraklService.checkImportStatus(record.mirakl_import_id);
    }
  }

  const refreshed = await pool.query(
    'SELECT * FROM marketplace_offer_imports WHERE import_id = $1',
    [importId]
  );

  res.json({
    success: true,
    import: refreshed.rows[0]
  });
}));

// Reconcile our offers against Mirakl — supports ?channelId
router.get('/offers/reconcile', authenticate, asyncHandler(async (req, res) => {
  const { adapter } = await resolveChannel(req);
  const columns = await getProductsColumns();
  const stockCol = pickFirstColumn(columns, ['stock_quantity', 'qty_on_hand', 'quantity_in_stock', 'stock', 'quantity', 'qty_available']);

  const productsQuery = await pool.query(
    `SELECT id, sku, price, msrp_cents, bestbuy_logistic_class, bestbuy_leadtime_to_ship,
            ${stockCol ? `${stockCol} AS stock_quantity` : '0::integer AS stock_quantity'}
     FROM products
     WHERE marketplace_enabled = true AND sku IS NOT NULL`
  );
  const products = productsQuery.rows;

  const offerOptions = {
    offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
    max: req.query.max ? parseInt(req.query.max, 10) : 100
  };

  let offers;
  if (adapter) {
    offers = await adapter.getRemoteOffers(offerOptions);
  } else {
    requireMiraklConfig();
    offers = await miraklService.getOfferList(offerOptions);
  }

  const offerBySku = new Map();
  for (const offer of offers) {
    const sku = offer.shop_sku || offer.sku || offer.offer_sku;
    if (sku) offerBySku.set(String(sku), offer);
  }

  const matched = [];
  const mismatched = [];
  const missing = [];

  for (const product of products) {
    const sku = String(product.sku);
    const offer = offerBySku.get(sku);
    if (!offer) {
      missing.push(sku);
      continue;
    }

    matched.push(sku);

    const ourPrice = parseFloat(product.price || (product.msrp_cents ? product.msrp_cents / 100 : 0)) || 0;
    const ourQty = parseInt(product.stock_quantity || 0, 10);
    const ourLogistic = product.bestbuy_logistic_class || 'L';
    const ourLeadtime = product.bestbuy_leadtime_to_ship != null ? product.bestbuy_leadtime_to_ship : 2;

    if (offer.price != null && parseFloat(offer.price) !== ourPrice) {
      mismatched.push({ sku, field: 'price', ours: ourPrice, theirs: offer.price });
    }
    if (offer.quantity != null && parseInt(offer.quantity, 10) !== ourQty) {
      mismatched.push({ sku, field: 'quantity', ours: ourQty, theirs: offer.quantity });
    }
    if (offer.logistic_class && offer.logistic_class !== ourLogistic) {
      mismatched.push({ sku, field: 'logistic_class', ours: ourLogistic, theirs: offer.logistic_class });
    }
    if (offer.leadtime_to_ship != null && parseInt(offer.leadtime_to_ship, 10) !== ourLeadtime) {
      mismatched.push({ sku, field: 'leadtime_to_ship', ours: ourLeadtime, theirs: offer.leadtime_to_ship });
    }
  }

  const missingSet = new Set(missing);
  const orphaned = [];
  for (const sku of offerBySku.keys()) {
    if (!missingSet.has(sku) && !matched.includes(sku)) {
      orphaned.push(sku);
    }
  }

  res.json({
    matched,
    mismatched,
    orphaned,
    missing
  });
}));

// Bulk enable/disable marketplace
router.post('/offers/enable', authenticate, asyncHandler(async (req, res) => {
  const { productIds, enabled } = req.body;
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw ApiError.badRequest('productIds array is required');
  }
  if (enabled === undefined) {
    throw ApiError.badRequest('enabled is required');
  }

  const result = await pool.query(
    `UPDATE products SET marketplace_enabled = $2 WHERE id = ANY($1)`,
    [productIds, enabled]
  );

  res.json({ updated: result.rowCount });
}));

// Sync all active products to Mirakl (inventory sync)
router.post('/sync-offers', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  // Get all active products that need syncing
  // INCREASED LIMIT: Process up to 500 products, prioritizing unsynced ones
  const productsQuery = await pool.query(`
    SELECT id, model, name, msrp_cents, active, mirakl_sku
    FROM products
    WHERE active = true
    ORDER BY
      CASE WHEN last_synced_at IS NULL THEN 0 ELSE 1 END,
      last_synced_at ASC NULLS FIRST
    LIMIT 500
  `);

  const products = productsQuery.rows;

  if (products.length === 0) {
    return res.json({ success: true, synced: 0, message: 'No products to sync' });
  }

  let succeeded = 0;
  let failed = 0;
  const errors = [];

  for (const product of products) {
    try {
      await miraklService.syncProductToMirakl(product.id);
      succeeded++;
    } catch (error) {
      failed++;
      errors.push({
        product_id: product.id,
        model: product.model,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    synced: succeeded,
    failed: failed,
    total: products.length,
    errors: errors.length > 0 ? errors : undefined
  });
}));

// Sync single product to Mirakl
router.post('/products/:id/sync', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const { id } = req.params;

  const result = await miraklService.syncProductToMirakl(id);

  res.json({
    message: 'Product synced successfully',
    offer_id: result.offer_id
  });
}));

// Bulk sync products to Mirakl
router.post('/products/sync-bulk', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const { product_ids } = req.body;

  if (!product_ids || !Array.isArray(product_ids)) {
    throw ApiError.badRequest('product_ids array is required');
  }

  const results = {
    total: product_ids.length,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  for (const productId of product_ids) {
    try {
      await miraklService.syncProductToMirakl(productId);
      results.succeeded++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        product_id: productId,
        error: error.message
      });
    }
  }

  res.json(results);
}));

// Batch sync products using bulk API (more efficient, avoids rate limits)
router.post('/products/batch-sync', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const batchSize = req.body.batch_size || 100; // Mirakl supports up to 100 offers per request
  const delayBetweenBatches = req.body.delay_ms || 5000; // 5 second delay between batches

  // Get all unsynced products
  const productsQuery = await pool.query(`
    SELECT id, model, name, msrp_cents, stock_quantity, active, mirakl_sku
    FROM products
    WHERE active = true
    AND last_synced_at IS NULL
    ORDER BY id
  `);

  const products = productsQuery.rows;

  if (products.length === 0) {
    return res.json({
      success: true,
      synced: 0,
      message: 'All products are already synced'
    });
  }

  let totalSucceeded = 0;
  let totalFailed = 0;
  const errors = [];
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Process in batches
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(products.length / batchSize);

    const result = await miraklService.batchImportOffers(batch);

    if (result.success) {
      // Update last_synced_at for all products in batch
      const productIds = batch.map(p => p.id);
      await pool.query(
        `UPDATE products SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ANY($1)`,
        [productIds]
      );
      totalSucceeded += batch.length;
    } else {
      totalFailed += batch.length;
      errors.push({
        batch: batchNum,
        error: result.error,
        details: result.details
      });
    }

    // Delay between batches
    if (i + batchSize < products.length) {
      await delay(delayBetweenBatches);
    }
  }

  res.json({
    success: true,
    total: products.length,
    synced: totalSucceeded,
    failed: totalFailed,
    batches_processed: Math.ceil(products.length / batchSize),
    errors: errors.length > 5 ? errors.slice(0, 5) : errors,
    totalErrors: errors.length
  });
}));

// Set default stock quantity for products with zero stock
router.post('/products/set-default-stock', authenticate, asyncHandler(async (req, res) => {
  const { default_stock = 10, manufacturer } = req.body;

  let query = `
    UPDATE products
    SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP
    WHERE active = true
    AND (stock_quantity IS NULL OR stock_quantity = 0)
  `;
  const params = [default_stock];

  if (manufacturer) {
    query += ` AND LOWER(manufacturer) = LOWER($2)`;
    params.push(manufacturer);
  }

  query += ' RETURNING id, sku';

  const result = await pool.query(query, params);

  // Queue marketplace inventory changes for all updated products (non-blocking)
  for (const row of result.rows) {
    try {
      await miraklService.queueInventoryChange(row.id, row.sku, 0, default_stock, 'MANUAL_ADJUST');
    } catch (queueErr) {
      console.error('[MarketplaceQueue] MANUAL_ADJUST (set-default-stock) queue error:', queueErr.message);
    }
  }

  res.json({
    success: true,
    updated_count: result.rowCount,
    default_stock: default_stock,
    message: `Set stock to ${default_stock} for ${result.rowCount} products`
  });
}));

// Sync ALL unsynced products to Mirakl (no limit - for catch-up)
router.post('/products/sync-all-unsynced', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  // Rate limiting settings - Mirakl typically allows ~60-120 requests/minute
  const requestDelayMs = req.body.delay_ms || 500; // 500ms = 120 requests/min
  const retryDelayMs = 5000; // Wait 5 seconds on rate limit before retry
  const maxRetries = 3;

  // Get ALL active products that have never been synced
  const productsQuery = await pool.query(`
    SELECT id, model, name, msrp_cents, stock_quantity
    FROM products
    WHERE active = true
    AND last_synced_at IS NULL
    ORDER BY id
  `);

  const products = productsQuery.rows;

  if (products.length === 0) {
    return res.json({
      success: true,
      synced: 0,
      message: 'All products are already synced'
    });
  }

  let succeeded = 0;
  let failed = 0;
  let rateLimited = 0;
  const errors = [];
  const batchSize = 50;
  let processed = 0;

  // Helper to delay
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper to sync with retry on rate limit
  const syncWithRetry = async (productId, retries = 0) => {
    try {
      await miraklService.syncProductToMirakl(productId);
      return { success: true };
    } catch (error) {
      const isRateLimited = error.message?.includes('Too Many Requests') ||
                           error.details?.status === 429;

      if (isRateLimited && retries < maxRetries) {
        rateLimited++;
        const waitTime = retryDelayMs * (retries + 1); // Exponential backoff
        await delay(waitTime);
        return syncWithRetry(productId, retries + 1);
      }
      return { success: false, error: error.message };
    }
  };

  // Process in batches with rate limiting
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);

    for (const product of batch) {
      const result = await syncWithRetry(product.id);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
        errors.push({
          product_id: product.id,
          model: product.model,
          error: result.error
        });
      }

      // Delay between requests to respect rate limits
      await delay(requestDelayMs);
    }

    processed += batch.length;

    // Extra delay between batches
    if (i + batchSize < products.length) {
      await delay(2000);
    }
  }

  res.json({
    success: true,
    total: products.length,
    synced: succeeded,
    failed: failed,
    rate_limit_retries: rateLimited,
    errors: errors.length > 10 ? errors.slice(0, 10) : errors,
    totalErrors: errors.length
  });
}));

// ============================================
// SYNC LOGS
// ============================================

// Get sync logs
router.get('/sync-logs', authenticate, asyncHandler(async (req, res) => {
  const { sync_type, status, limit = 50, offset = 0 } = req.query;

  let query = 'SELECT * FROM marketplace_sync_log WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (sync_type) {
    query += ` AND sync_type = $${paramIndex}`;
    params.push(sync_type);
    paramIndex++;
  }

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  res.json(result.rows);
}));

// Get sync stats
router.get('/sync-stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await pool.query(`
    SELECT
      sync_type,
      COUNT(*) as total_syncs,
      COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful_syncs,
      COUNT(*) FILTER (WHERE status = 'FAILED') as failed_syncs,
      SUM(records_processed) as total_records,
      AVG(duration_ms) as avg_duration_ms
    FROM marketplace_sync_log
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY sync_type
  `);

  res.json(stats.rows);
}));

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

// Webhook receiver for Mirakl events
router.post('/webhooks/mirakl', authenticate, async (req, res) => {
  try {
    const webhookData = req.body;

    // Save webhook event to database
    await pool.query(
      `INSERT INTO marketplace_webhook_events
       (event_type, event_id, marketplace_name, order_id, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        webhookData.event_type,
        webhookData.event_id,
        'BestBuy',
        webhookData.order_id || null,
        JSON.stringify(webhookData)
      ]
    );

    // Process webhook based on event type
    switch (webhookData.event_type) {
      case 'ORDER_CREATED':
      case 'ORDER_UPDATED':
        // Could trigger background job here
        break;

      case 'ORDER_CANCELLED':
        break;

      default:
        break;
    }

    // Always respond with 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    // Still return 200 to prevent retries
    res.json({ received: true, error: error.message });
  }
});

// ============================================
// MARKETPLACE CREDENTIALS
// ============================================

// Get marketplace credentials (masked)
router.get('/credentials', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, marketplace_name, environment, shop_id, is_active, last_validated_at, created_at
     FROM marketplace_credentials
     ORDER BY marketplace_name, environment`
  );

  res.json(result.rows);
}));

// Update marketplace credentials
router.put('/credentials/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { api_key, api_secret, shop_id, is_active } = req.body;

  const result = await pool.query(
    `UPDATE marketplace_credentials
     SET api_key = COALESCE($1, api_key),
         api_secret = COALESCE($2, api_secret),
         shop_id = COALESCE($3, shop_id),
         is_active = COALESCE($4, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING id, marketplace_name, environment, shop_id, is_active`,
    [api_key, api_secret, shop_id, is_active, id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Credentials');
  }

  res.json(result.rows[0]);
}));

// ============================================
// SYNC STATUS
// ============================================

// Get sync scheduler status
router.get('/sync-status', authenticate, asyncHandler(async (req, res) => {
  // Get recent sync activity
  const recentSyncs = await pool.query(`
    SELECT
      sync_type,
      status,
      created_at,
      duration_ms,
      records_processed,
      records_succeeded,
      records_failed
    FROM marketplace_sync_log
    ORDER BY created_at DESC
    LIMIT 10
  `);

  // Get overall stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_syncs,
      COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful_syncs,
      COUNT(*) FILTER (WHERE status = 'FAILED') as failed_syncs,
      MAX(created_at) as last_sync_time
    FROM marketplace_sync_log
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);

  // Get order counts
  const orderCounts = await pool.query(`
    SELECT
      COUNT(*) as total_orders,
      COUNT(*) FILTER (WHERE order_state = 'WAITING_ACCEPTANCE') as pending_orders,
      COUNT(*) FILTER (WHERE order_state = 'SHIPPING') as shipping_orders,
      COUNT(*) FILTER (WHERE order_state = 'SHIPPED') as shipped_orders
    FROM marketplace_orders
  `);

  // Get product sync info
  const productSync = await pool.query(`
    SELECT
      COUNT(*) as total_products,
      COUNT(*) FILTER (WHERE mirakl_offer_id IS NOT NULL) as synced_products,
      COUNT(*) FILTER (WHERE last_synced_at IS NULL) as never_synced,
      COUNT(*) FILTER (WHERE active = true AND last_synced_at < NOW() - INTERVAL '24 hours') as needs_sync
    FROM products
  `);

  res.json({
    status: 'operational',
    auto_sync_enabled: process.env.MARKETPLACE_AUTO_SYNC === 'true',
    recent_syncs: recentSyncs.rows,
    sync_stats: stats.rows[0],
    orders: orderCounts.rows[0],
    products: productSync.rows[0],
    config: {
      order_sync_interval: process.env.MARKETPLACE_ORDER_SYNC_INTERVAL || 15,
      product_sync_interval: process.env.MARKETPLACE_PRODUCT_SYNC_INTERVAL || 60,
      inventory_sync_interval: process.env.MARKETPLACE_INVENTORY_SYNC_INTERVAL || 30
    }
  });
}));

// Detailed sync diagnostics - helps debug why products aren't syncing
router.get('/sync-diagnostics', authenticate, asyncHandler(async (req, res) => {
  // Get breakdown of product sync status
  const productBreakdown = await pool.query(`
    SELECT
      COUNT(*) as total_active_products,
      COUNT(*) FILTER (WHERE last_synced_at IS NULL) as never_synced,
      COUNT(*) FILTER (WHERE last_synced_at IS NOT NULL) as synced_at_least_once,
      COUNT(*) FILTER (WHERE mirakl_offer_id IS NOT NULL) as has_mirakl_offer,
      COUNT(*) FILTER (WHERE COALESCE(stock_quantity, 0) = 0) as zero_stock,
      COUNT(*) FILTER (WHERE COALESCE(stock_quantity, 0) > 0) as has_stock,
      COUNT(*) FILTER (WHERE last_synced_at IS NULL AND COALESCE(stock_quantity, 0) = 0) as unsynced_no_stock,
      COUNT(*) FILTER (WHERE last_synced_at IS NULL AND COALESCE(stock_quantity, 0) > 0) as unsynced_with_stock
    FROM products
    WHERE active = true
  `);

  // Get sample of unsynced products
  const unsyncedSample = await pool.query(`
    SELECT id, model, name, manufacturer, stock_quantity, msrp_cents, created_at
    FROM products
    WHERE active = true AND last_synced_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  `);

  // Get recent sync errors from log
  const recentErrors = await pool.query(`
    SELECT entity_id, error_message, created_at
    FROM marketplace_sync_log
    WHERE status = 'FAILED' AND sync_type = 'product_sync'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  // Check environment configuration
  const envConfig = {
    mirakl_api_url_set: !!process.env.MIRAKL_API_URL,
    mirakl_api_key_set: !!process.env.MIRAKL_API_KEY,
    mirakl_shop_id_set: !!process.env.MIRAKL_SHOP_ID,
    auto_sync_enabled: process.env.MARKETPLACE_AUTO_SYNC === 'true',
    product_sync_interval_minutes: parseInt(process.env.MARKETPLACE_PRODUCT_SYNC_INTERVAL) || 60
  };

  res.json({
    summary: productBreakdown.rows[0],
    sample_unsynced_products: unsyncedSample.rows,
    recent_sync_errors: recentErrors.rows,
    environment: envConfig,
    recommendations: generateSyncRecommendations(productBreakdown.rows[0], envConfig)
  });
}));

// Helper function to generate sync recommendations
function generateSyncRecommendations(stats, env) {
  const recommendations = [];

  if (!env.auto_sync_enabled) {
    recommendations.push({
      priority: 'high',
      issue: 'Auto-sync is disabled',
      action: 'Set MARKETPLACE_AUTO_SYNC=true in .env file'
    });
  }

  if (!env.mirakl_api_key_set || !env.mirakl_shop_id_set) {
    recommendations.push({
      priority: 'critical',
      issue: 'Mirakl API credentials not configured',
      action: 'Set MIRAKL_API_KEY and MIRAKL_SHOP_ID in .env file'
    });
  }

  const neverSynced = parseInt(stats.never_synced) || 0;
  if (neverSynced > 100) {
    recommendations.push({
      priority: 'high',
      issue: `${neverSynced} products have never been synced`,
      action: 'Call POST /api/marketplace/products/sync-all-unsynced to sync all unsynced products'
    });
  }

  const zeroStock = parseInt(stats.zero_stock) || 0;
  const total = parseInt(stats.total_active_products) || 0;
  if (zeroStock > total * 0.5) {
    recommendations.push({
      priority: 'medium',
      issue: `${zeroStock} of ${total} products have zero stock`,
      action: 'Update stock quantities via POST /api/marketplace/bulk/stock-update or import from inventory file'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      issue: 'No critical issues detected',
      action: 'Sync is operating normally'
    });
  }

  return recommendations;
}

// ============================================
// BEST BUY CATEGORIES & PRODUCT MAPPING
// ============================================

// Get all Best Buy categories (alias for /categories for frontend compatibility)
router.get('/categories', authenticate, asyncHandler(async (req, res) => {
  const { group } = req.query;

  let query = `
    SELECT id, code, name, description, category_group, is_active
    FROM bestbuy_categories
    WHERE is_active = true
  `;
  const params = [];

  if (group) {
    query += ' AND category_group = $1';
    params.push(group);
  }

  query += ' ORDER BY category_group, name';

  const result = await pool.query(query, params);

  // Group categories by category_group for easier frontend use
  const grouped = {};
  result.rows.forEach(cat => {
    if (!grouped[cat.category_group]) {
      grouped[cat.category_group] = [];
    }
    grouped[cat.category_group].push(cat);
  });

  res.json({
    categories: result.rows,
    grouped: grouped,
    total: result.rows.length
  });
}));

// Get all Best Buy categories (legacy endpoint)
router.get('/bestbuy-categories', authenticate, asyncHandler(async (req, res) => {
  const { group } = req.query;

  let query = `
    SELECT id, code, name, description, category_group, is_active
    FROM bestbuy_categories
    WHERE is_active = true
  `;
  const params = [];

  if (group) {
    query += ' AND category_group = $1';
    params.push(group);
  }

  query += ' ORDER BY category_group, name';

  const result = await pool.query(query, params);

  // Group categories by category_group for easier frontend use
  const grouped = {};
  result.rows.forEach(cat => {
    if (!grouped[cat.category_group]) {
      grouped[cat.category_group] = [];
    }
    grouped[cat.category_group].push(cat);
  });

  res.json({
    categories: result.rows,
    grouped: grouped,
    total: result.rows.length
  });
}));

// Get unmapped products (products without bestbuy_category_code)
router.get('/products/unmapped', authenticate, asyncHandler(async (req, res) => {
  const { search, manufacturer, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT id, model, name, manufacturer, msrp_cents, active, bestbuy_category_code
    FROM products
    WHERE (bestbuy_category_code IS NULL OR bestbuy_category_code = '')
  `;
  const params = [];
  let paramIndex = 1;

  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR model ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (manufacturer) {
    query += ` AND manufacturer = $${paramIndex}`;
    params.push(manufacturer);
    paramIndex++;
  }

  // Get count first
  const countQuery = query.replace('SELECT id, model, name, manufacturer, msrp_cents, active, bestbuy_category_code', 'SELECT COUNT(*)');
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);

  // Add ordering and pagination
  query += ` ORDER BY manufacturer, name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  res.json({
    products: result.rows,
    total: total,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

// Get mapped products (products with bestbuy_category_code)
router.get('/products/mapped', authenticate, asyncHandler(async (req, res) => {
  const { category_code, search, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT p.id, p.model, p.name, p.manufacturer, p.msrp_cents, p.active,
           p.bestbuy_category_code, bc.name as category_name, bc.category_group
    FROM products p
    LEFT JOIN bestbuy_categories bc ON p.bestbuy_category_code = bc.code
    WHERE p.bestbuy_category_code IS NOT NULL AND p.bestbuy_category_code != ''
  `;
  const params = [];
  let paramIndex = 1;

  if (category_code) {
    query += ` AND p.bestbuy_category_code = $${paramIndex}`;
    params.push(category_code);
    paramIndex++;
  }

  if (search) {
    query += ` AND (p.name ILIKE $${paramIndex} OR p.model ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Get count
  const countQuery = query.replace(
    'SELECT p.id, p.model, p.name, p.manufacturer, p.msrp_cents, p.active, p.bestbuy_category_code, bc.name as category_name, bc.category_group',
    'SELECT COUNT(*)'
  );
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);

  query += ` ORDER BY bc.category_group, bc.name, p.name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  res.json({
    products: result.rows,
    total: total,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

// Map a single product to a Best Buy category
router.post('/products/:id/map-category', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { category_code } = req.body;

  if (!category_code) {
    throw ApiError.badRequest('category_code is required');
  }

  // Verify category exists
  const categoryCheck = await pool.query(
    'SELECT code, name FROM bestbuy_categories WHERE code = $1',
    [category_code]
  );

  if (categoryCheck.rows.length === 0) {
    throw ApiError.badRequest('Invalid category code');
  }

  // Update product
  const result = await pool.query(
    `UPDATE products
     SET bestbuy_category_code = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, model, name, bestbuy_category_code`,
    [category_code, id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Product');
  }

  res.json({
    success: true,
    product: result.rows[0],
    category: categoryCheck.rows[0]
  });
}));

// Bulk map products to a category
router.post('/products/bulk-map', authenticate, asyncHandler(async (req, res) => {
  const { product_ids, category_code } = req.body;

  if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
    throw ApiError.badRequest('product_ids array is required');
  }

  if (!category_code) {
    throw ApiError.badRequest('category_code is required');
  }

  // Verify category exists
  const categoryCheck = await pool.query(
    'SELECT code, name FROM bestbuy_categories WHERE code = $1',
    [category_code]
  );

  if (categoryCheck.rows.length === 0) {
    throw ApiError.badRequest('Invalid category code');
  }

  // Bulk update products
  const result = await pool.query(
    `UPDATE products
     SET bestbuy_category_code = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($2::int[])
     RETURNING id, model, name`,
    [category_code, product_ids]
  );

  res.json({
    success: true,
    mapped_count: result.rows.length,
    category: categoryCheck.rows[0],
    products: result.rows
  });
}));

// Get mapping statistics
router.get('/mapping-stats', authenticate, asyncHandler(async (req, res) => {
  // Total products
  const totalProducts = await pool.query('SELECT COUNT(*) FROM products');

  // Mapped products count
  const mappedProducts = await pool.query(
    `SELECT COUNT(*) FROM products
     WHERE bestbuy_category_code IS NOT NULL AND bestbuy_category_code != ''`
  );

  // Unmapped products count
  const unmappedProducts = await pool.query(
    `SELECT COUNT(*) FROM products
     WHERE bestbuy_category_code IS NULL OR bestbuy_category_code = ''`
  );

  // Active products needing mapping
  const activeUnmapped = await pool.query(
    `SELECT COUNT(*) FROM products
     WHERE active = true AND (bestbuy_category_code IS NULL OR bestbuy_category_code = '')`
  );

  // Products by category
  const byCategory = await pool.query(`
    SELECT bc.code, bc.name, bc.category_group, COUNT(p.id) as product_count
    FROM bestbuy_categories bc
    LEFT JOIN products p ON bc.code = p.bestbuy_category_code
    GROUP BY bc.code, bc.name, bc.category_group
    HAVING COUNT(p.id) > 0
    ORDER BY COUNT(p.id) DESC
  `);

  // Products by manufacturer that need mapping
  const byManufacturer = await pool.query(`
    SELECT manufacturer, COUNT(*) as unmapped_count
    FROM products
    WHERE bestbuy_category_code IS NULL OR bestbuy_category_code = ''
    GROUP BY manufacturer
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);

  res.json({
    total_products: parseInt(totalProducts.rows[0].count),
    mapped_products: parseInt(mappedProducts.rows[0].count),
    unmapped_products: parseInt(unmappedProducts.rows[0].count),
    active_unmapped: parseInt(activeUnmapped.rows[0].count),
    mapping_percentage: totalProducts.rows[0].count > 0
      ? Math.round((mappedProducts.rows[0].count / totalProducts.rows[0].count) * 100)
      : 0,
    by_category: byCategory.rows,
    by_manufacturer: byManufacturer.rows
  });
}));

// Remove category mapping from a product
router.delete('/products/:id/map-category', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE products
     SET bestbuy_category_code = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, model, name`,
    [id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Product');
  }

  res.json({
    success: true,
    product: result.rows[0]
  });
}));

// ============================================
// DASHBOARD ANALYTICS
// ============================================

// Get comprehensive dashboard analytics
router.get('/dashboard-analytics', authenticate, asyncHandler(async (req, res) => {
  // Revenue and order metrics
  const revenueStats = await pool.query(`
    SELECT
      COALESCE(SUM(total_price_cents), 0) / 100.0 as total_revenue,
      COUNT(*) as total_orders,
      COUNT(*) FILTER (WHERE DATE(order_date) = CURRENT_DATE) as orders_today,
      COUNT(*) FILTER (WHERE order_date >= DATE_TRUNC('week', CURRENT_DATE)) as orders_this_week,
      COUNT(*) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)) as orders_this_month,
      COALESCE(SUM(total_price_cents) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) / 100.0 as revenue_this_month,
      COALESCE(SUM(total_price_cents) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                                        AND order_date < DATE_TRUNC('month', CURRENT_DATE)), 0) / 100.0 as revenue_last_month
    FROM marketplace_orders
  `);

  // Products listed count
  const productsListed = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE bestbuy_category_code IS NOT NULL) as mapped_count,
      COUNT(*) as total_count
    FROM products
    WHERE active = true
  `);

  // Get sync status indicator
  const lastSync = await pool.query(`
    SELECT status, created_at
    FROM marketplace_sync_log
    ORDER BY created_at DESC
    LIMIT 1
  `);

  let syncIndicator = 'green';
  if (lastSync.rows.length > 0) {
    const lastSyncStatus = lastSync.rows[0].status;
    const lastSyncTime = new Date(lastSync.rows[0].created_at);
    const hoursSinceSync = (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60);

    if (lastSyncStatus === 'FAILED') {
      // Only show red if the failure is recent (< 24h); old failures shouldn't alarm
      syncIndicator = hoursSinceSync < 24 ? 'red' : 'yellow';
    } else if (hoursSinceSync > 24) {
      syncIndicator = 'yellow';
    }
  }
  // No sync log rows = fresh system, nothing has failed → green

  res.json({
    revenue: {
      total: parseFloat(revenueStats.rows[0].total_revenue) || 0,
      this_month: parseFloat(revenueStats.rows[0].revenue_this_month) || 0,
      last_month: parseFloat(revenueStats.rows[0].revenue_last_month) || 0
    },
    orders: {
      total: parseInt(revenueStats.rows[0].total_orders) || 0,
      today: parseInt(revenueStats.rows[0].orders_today) || 0,
      this_week: parseInt(revenueStats.rows[0].orders_this_week) || 0,
      this_month: parseInt(revenueStats.rows[0].orders_this_month) || 0
    },
    products: {
      listed: parseInt(productsListed.rows[0].mapped_count) || 0,
      total: parseInt(productsListed.rows[0].total_count) || 0
    },
    sync_status: syncIndicator,
    last_sync: lastSync.rows[0]?.created_at || null
  });
}));

// Get sales chart data (last 30 days)
router.get('/sales-chart', authenticate, asyncHandler(async (req, res) => {
  const salesData = await pool.query(`
    SELECT
      DATE(order_date) as date,
      COUNT(*) as order_count,
      COALESCE(SUM(total_price_cents), 0) / 100.0 as revenue
    FROM marketplace_orders
    WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY DATE(order_date)
    ORDER BY DATE(order_date)
  `);

  // Fill in missing dates with zeros
  const result = [];
  const dataMap = new Map(salesData.rows.map(r => [r.date.toISOString().split('T')[0], r]));

  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    if (dataMap.has(dateStr)) {
      result.push({
        date: dateStr,
        order_count: parseInt(dataMap.get(dateStr).order_count),
        revenue: parseFloat(dataMap.get(dateStr).revenue)
      });
    } else {
      result.push({
        date: dateStr,
        order_count: 0,
        revenue: 0
      });
    }
  }

  res.json(result);
}));

// Get top selling products
router.get('/top-products', authenticate, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const topProducts = await pool.query(`
    SELECT
      p.id,
      p.model,
      p.name,
      p.manufacturer,
      COUNT(oi.id) as units_sold,
      COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0) / 100.0 as total_revenue
    FROM products p
    INNER JOIN marketplace_order_items oi ON p.id = oi.product_id
    INNER JOIN marketplace_orders mo ON oi.order_id = mo.id
    GROUP BY p.id, p.model, p.name, p.manufacturer
    ORDER BY units_sold DESC
    LIMIT $1
  `, [limit]);

  res.json(topProducts.rows);
}));

// Get sales by category
router.get('/sales-by-category', authenticate, asyncHandler(async (req, res) => {
  const salesByCategory = await pool.query(`
    SELECT
      bc.code,
      bc.name as category_name,
      COUNT(DISTINCT mo.id) as order_count,
      COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0) / 100.0 as revenue
    FROM bestbuy_categories bc
    INNER JOIN products p ON bc.code = p.bestbuy_category_code
    INNER JOIN marketplace_order_items oi ON p.id = oi.product_id
    INNER JOIN marketplace_orders mo ON oi.order_id = mo.id
    GROUP BY bc.code, bc.name
    ORDER BY revenue DESC
    LIMIT 10
  `);

  res.json(salesByCategory.rows);
}));

// Get inventory health metrics
router.get('/inventory-health', authenticate, asyncHandler(async (req, res) => {
  // Low stock, out of stock, overstocked counts
  // Note: Using a placeholder for quantity since the schema may vary
  const inventoryHealth = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE active = true AND bestbuy_category_code IS NOT NULL) as listed_products,
      COUNT(*) FILTER (WHERE active = false) as inactive_products,
      COUNT(*) FILTER (WHERE bestbuy_category_code IS NULL) as unmapped_products,
      COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days' AND bestbuy_category_code IS NOT NULL) as needs_sync
    FROM products
  `);

  // Products changed since last sync
  const changedProducts = await pool.query(`
    SELECT COUNT(*) as count
    FROM products p
    WHERE p.bestbuy_category_code IS NOT NULL
      AND p.updated_at > COALESCE(p.last_synced_at, '1970-01-01')
  `);

  res.json({
    listed_products: parseInt(inventoryHealth.rows[0].listed_products) || 0,
    inactive_products: parseInt(inventoryHealth.rows[0].inactive_products) || 0,
    unmapped_products: parseInt(inventoryHealth.rows[0].unmapped_products) || 0,
    needs_sync: parseInt(changedProducts.rows[0].count) || 0,
    low_stock: 0,  // Placeholder - implement when inventory tracking is added
    out_of_stock: 0,
    overstocked: 0
  });
}));

// Get recent activity feed
router.get('/activity-feed', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  // Combine multiple sources into activity feed
  const activities = [];

  // Recent orders
  const recentOrders = await pool.query(`
    SELECT
      'order' as event_type,
      id,
      mirakl_order_id as reference,
      order_state as status,
      total_price_cents / 100.0 as amount,
      created_at as timestamp,
      'New order received' as description
    FROM marketplace_orders
    ORDER BY created_at DESC
    LIMIT 10
  `);
  activities.push(...recentOrders.rows.map(o => ({
    type: 'order',
    icon: '📦',
    title: `Order #${o.reference?.substring(0, 8) || o.id}`,
    description: `${o.status} - $${parseFloat(o.amount || 0).toFixed(2)}`,
    timestamp: o.timestamp,
    status: o.status
  })));

  // Recent syncs
  const recentSyncs = await pool.query(`
    SELECT
      'sync' as event_type,
      id,
      sync_type,
      status,
      records_processed,
      records_succeeded,
      records_failed,
      created_at as timestamp
    FROM marketplace_sync_log
    ORDER BY created_at DESC
    LIMIT 10
  `);
  activities.push(...recentSyncs.rows.map(s => ({
    type: 'sync',
    icon: s.status === 'SUCCESS' ? '✅' : '❌',
    title: `${s.sync_type} Sync`,
    description: `${s.records_succeeded || 0} succeeded, ${s.records_failed || 0} failed`,
    timestamp: s.timestamp,
    status: s.status
  })));

  // Recent shipments
  const recentShipments = await pool.query(`
    SELECT
      'shipment' as event_type,
      s.id,
      s.tracking_number,
      s.carrier_name,
      s.shipment_status,
      s.created_at as timestamp,
      mo.mirakl_order_id
    FROM marketplace_shipments s
    LEFT JOIN marketplace_orders mo ON s.order_id = mo.id
    ORDER BY s.created_at DESC
    LIMIT 5
  `);
  activities.push(...recentShipments.rows.map(sh => ({
    type: 'shipment',
    icon: '🚚',
    title: `Shipment Created`,
    description: `${sh.carrier_name || 'Carrier'} - ${sh.tracking_number || 'No tracking'}`,
    timestamp: sh.timestamp,
    status: sh.shipment_status
  })));

  // Recent webhook events
  const recentWebhooks = await pool.query(`
    SELECT
      'webhook' as event_type,
      id,
      event_type as webhook_type,
      processed_at,
      created_at as timestamp
    FROM marketplace_webhook_events
    ORDER BY created_at DESC
    LIMIT 5
  `);
  activities.push(...recentWebhooks.rows.map(w => ({
    type: 'webhook',
    icon: '📨',
    title: `Webhook: ${w.webhook_type}`,
    description: w.processed_at ? 'Processed' : 'Pending',
    timestamp: w.timestamp,
    status: w.processed_at ? 'processed' : 'pending'
  })));

  // Sort by timestamp and limit
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json(activities.slice(0, parseInt(limit)));
}));

// Get orders by state for dashboard
router.get('/orders-by-state', authenticate, asyncHandler(async (req, res) => {
  const ordersByState = await pool.query(`
    SELECT
      order_state,
      COUNT(*) as count
    FROM marketplace_orders
    GROUP BY order_state
    ORDER BY count DESC
  `);

  res.json(ordersByState.rows);
}));

// ============================================
// NOTIFICATION SYSTEM
// ============================================

// Get all notifications with pagination
router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unread_only = false } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT n.*, mo.customer_name, mo.order_state
    FROM marketplace_notifications n
    LEFT JOIN marketplace_orders mo ON n.order_id = mo.id
    WHERE n.dismissed = false
  `;

  if (unread_only === 'true') {
    query += ` AND n.read = false`;
  }

  query += ` ORDER BY n.created_at DESC LIMIT $1 OFFSET $2`;

  const notifications = await pool.query(query, [limit, offset]);

  // Get total count
  let countQuery = `SELECT COUNT(*) FROM marketplace_notifications WHERE dismissed = false`;
  if (unread_only === 'true') {
    countQuery += ` AND read = false`;
  }
  const totalCount = await pool.query(countQuery);

  // Get unread count
  const unreadCount = await pool.query(`
    SELECT COUNT(*) FROM marketplace_notifications WHERE read = false AND dismissed = false
  `);

  res.json({
    notifications: notifications.rows,
    total: parseInt(totalCount.rows[0].count),
    unread_count: parseInt(unreadCount.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

// Get unread notification count
router.get('/notifications/unread-count', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT COUNT(*) as count FROM marketplace_notifications WHERE read = false AND dismissed = false
  `);
  res.json({ count: parseInt(result.rows[0].count) });
}));

// Mark notification as read
router.put('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(`
    UPDATE marketplace_notifications
    SET read = true, read_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Notification');
  }

  res.json({ success: true, notification: result.rows[0] });
}));

// Mark all notifications as read
router.put('/notifications/mark-all-read', authenticate, asyncHandler(async (req, res) => {
  await pool.query(`
    UPDATE marketplace_notifications
    SET read = true, read_at = CURRENT_TIMESTAMP
    WHERE read = false
  `);
  res.json({ success: true });
}));

// Dismiss notification
router.put('/notifications/:id/dismiss', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query(`
    UPDATE marketplace_notifications
    SET dismissed = true, dismissed_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [id]);
  res.json({ success: true });
}));

// Create notification (internal use)
async function createNotification(type, title, message, orderId = null, miraklOrderId = null, priority = 'normal', metadata = {}) {
  try {
    const result = await pool.query(`
      INSERT INTO marketplace_notifications (type, title, message, order_id, mirakl_order_id, priority, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [type, title, message, orderId, miraklOrderId, priority, JSON.stringify(metadata)]);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    return null;
  }
}

// ============================================
// ORDER SETTINGS
// ============================================

// Get all settings
router.get('/order-settings', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM marketplace_order_settings ORDER BY setting_key`);

  // Convert to key-value object
  const settings = {};
  result.rows.forEach(row => {
    settings[row.setting_key] = row.setting_value;
  });

  res.json(settings);
}));

// Update a setting
router.put('/order-settings/:key', authenticate, asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  const result = await pool.query(`
    UPDATE marketplace_order_settings
    SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
    WHERE setting_key = $2
    RETURNING *
  `, [JSON.stringify(value), key]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Setting');
  }

  res.json({ success: true, setting: result.rows[0] });
}));

// Get all settings (general-purpose)
router.get('/settings', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM marketplace_order_settings ORDER BY setting_key`);
  const settings = {};
  result.rows.forEach(row => {
    settings[row.setting_key] = row.setting_value;
  });
  res.json(settings);
}));

// Update a setting (general-purpose — upserts into marketplace_order_settings)
router.put('/settings/:key', authenticate, asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  const result = await pool.query(`
    INSERT INTO marketplace_order_settings (setting_key, setting_value, description, created_at, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [key, JSON.stringify(value), `Setting: ${key}`]);

  res.json({ success: true, setting: result.rows[0] });
}));

// ============================================
// BATCH ORDER PROCESSING
// ============================================

// Batch accept orders
router.post('/orders/batch-accept', authenticate, asyncHandler(async (req, res) => {
  const { order_ids } = req.body;

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    throw ApiError.badRequest('order_ids array is required');
  }

  const results = {
    success: [],
    failed: []
  };

  // OPTIMIZED: Batch fetch all orders at once instead of N+1 pattern
  const ordersResult = await pool.query(
    `SELECT * FROM marketplace_orders WHERE id = ANY($1)`,
    [order_ids]
  );
  const ordersMap = new Map(ordersResult.rows.map(o => [o.id, o]));

  // Track successful order IDs for batch update
  const successfulOrderIds = [];
  const successfulOrders = [];

  for (const orderId of order_ids) {
    try {
      const order = ordersMap.get(orderId);

      if (!order) {
        results.failed.push({ id: orderId, error: 'Order not found' });
        continue;
      }

      // Check if order can be accepted
      if (order.order_state !== 'WAITING_ACCEPTANCE') {
        results.failed.push({ id: orderId, error: `Order state is ${order.order_state}, cannot accept` });
        continue;
      }

      // Call Mirakl API to accept
      try {
        await miraklService.acceptOrder(order.mirakl_order_id);
        successfulOrderIds.push(orderId);
        successfulOrders.push(order);
        results.success.push({ id: orderId, mirakl_order_id: order.mirakl_order_id });
      } catch (apiError) {
        results.failed.push({ id: orderId, error: apiError.message || 'Mirakl API error' });
      }
    } catch (err) {
      results.failed.push({ id: orderId, error: err.message });
    }
  }

  // OPTIMIZED: Batch update all successful orders at once
  if (successfulOrderIds.length > 0) {
    await pool.query(`
      UPDATE marketplace_orders
      SET order_state = 'SHIPPING',
          acceptance_decision_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1)
    `, [successfulOrderIds]);

    // Create notifications for all successful orders
    for (const order of successfulOrders) {
      await createNotification(
        'order_accepted',
        'Order Accepted',
        `Order #${order.mirakl_order_id.substring(0, 8)} has been accepted`,
        order.id,
        order.mirakl_order_id,
        'normal'
      );
    }
  }

  res.json({
    success: true,
    accepted: results.success.length,
    failed: results.failed.length,
    results
  });
}));

// Batch reject orders
router.post('/orders/batch-reject', authenticate, asyncHandler(async (req, res) => {
  const { order_ids, reason } = req.body;

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    throw ApiError.badRequest('order_ids array is required');
  }

  const rejectReason = reason || 'Out of stock';
  const results = {
    success: [],
    failed: []
  };

  // OPTIMIZED: Batch fetch all orders at once instead of N+1 pattern
  const ordersResult = await pool.query(
    `SELECT * FROM marketplace_orders WHERE id = ANY($1)`,
    [order_ids]
  );
  const ordersMap = new Map(ordersResult.rows.map(o => [o.id, o]));

  // Track successful order IDs for batch update
  const successfulOrderIds = [];
  const successfulOrders = [];

  for (const orderId of order_ids) {
    try {
      const order = ordersMap.get(orderId);

      if (!order) {
        results.failed.push({ id: orderId, error: 'Order not found' });
        continue;
      }

      // Check if order can be rejected
      if (order.order_state !== 'WAITING_ACCEPTANCE') {
        results.failed.push({ id: orderId, error: `Order state is ${order.order_state}, cannot reject` });
        continue;
      }

      // Call Mirakl API to reject
      try {
        await miraklService.rejectOrder(order.mirakl_order_id, rejectReason);
        successfulOrderIds.push(orderId);
        successfulOrders.push(order);
        results.success.push({ id: orderId, mirakl_order_id: order.mirakl_order_id });
      } catch (apiError) {
        results.failed.push({ id: orderId, error: apiError.message || 'Mirakl API error' });
      }
    } catch (err) {
      results.failed.push({ id: orderId, error: err.message });
    }
  }

  // OPTIMIZED: Batch update all rejected orders at once
  if (successfulOrderIds.length > 0) {
    await pool.query(`
      UPDATE marketplace_orders
      SET order_state = 'REFUSED',
          canceled_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1)
    `, [successfulOrderIds]);

    // Create notifications for all rejected orders
    for (const order of successfulOrders) {
      await createNotification(
        'order_rejected',
        'Order Rejected',
        `Order #${order.mirakl_order_id.substring(0, 8)} has been rejected: ${rejectReason}`,
        order.id,
        order.mirakl_order_id,
        'normal'
      );
    }
  }

  res.json({
    success: true,
    rejected: results.success.length,
    failed: results.failed.length,
    results
  });
}));

// Export orders as CSV
router.post('/orders/export', authenticate, asyncHandler(async (req, res) => {
  const { order_ids, format = 'csv' } = req.body;

  let query = `
    SELECT
      mo.id,
      mo.mirakl_order_id,
      mo.order_state,
      mo.customer_name,
      mo.customer_email,
      mo.total_price_cents / 100.0 as total_price,
      mo.currency,
      mo.shipping_price_cents / 100.0 as shipping_price,
      mo.tax_cents / 100.0 as tax,
      mo.order_date,
      mo.created_at
    FROM marketplace_orders mo
  `;

  let params = [];
  if (order_ids && Array.isArray(order_ids) && order_ids.length > 0) {
    query += ` WHERE mo.id = ANY($1)`;
    params = [order_ids];
  }

  query += ` ORDER BY mo.order_date DESC`;

  const result = await pool.query(query, params);

  if (format === 'csv') {
    // Generate CSV
    const headers = ['Order ID', 'Mirakl Order ID', 'Status', 'Customer', 'Email', 'Total', 'Currency', 'Shipping', 'Tax', 'Order Date', 'Created'];
    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      csvRows.push([
        row.id,
        row.mirakl_order_id,
        row.order_state,
        `"${(row.customer_name || '').replace(/"/g, '""')}"`,
        row.customer_email,
        row.total_price,
        row.currency,
        row.shipping_price,
        row.tax,
        row.order_date ? new Date(row.order_date).toISOString() : '',
        row.created_at ? new Date(row.created_at).toISOString() : ''
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=orders_export_${Date.now()}.csv`);
    res.send(csvRows.join('\n'));
  } else {
    // Return JSON
    res.json(result.rows);
  }
}));

// Generate packing slip data for orders
router.post('/orders/packing-slips', authenticate, asyncHandler(async (req, res) => {
  const { order_ids } = req.body;

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    throw ApiError.badRequest('order_ids array is required');
  }

  const orders = await pool.query(`
    SELECT
      mo.*,
      mo.total_price_cents / 100.0 as total_price,
      mo.shipping_price_cents / 100.0 as shipping_price,
      mo.tax_cents / 100.0 as tax
    FROM marketplace_orders mo
    WHERE mo.id = ANY($1)
    ORDER BY mo.order_date DESC
  `, [order_ids]);

  // OPTIMIZED: Batch fetch all order items at once instead of N+1 pattern
  const allItems = await pool.query(`
    SELECT
      oi.*,
      oi.unit_price_cents / 100.0 as unit_price,
      oi.total_price_cents / 100.0 as total_price,
      p.name as product_name,
      p.manufacturer
    FROM marketplace_order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ANY($1)
    ORDER BY oi.order_id
  `, [order_ids]);

  // Group items by order_id
  const itemsByOrder = new Map();
  for (const item of allItems.rows) {
    if (!itemsByOrder.has(item.order_id)) {
      itemsByOrder.set(item.order_id, []);
    }
    itemsByOrder.get(item.order_id).push(item);
  }

  // Build packing slips
  const packingSlips = orders.rows.map(order => {
    const items = itemsByOrder.get(order.id) || [];
    return {
      order_id: order.id,
      mirakl_order_id: order.mirakl_order_id,
      order_date: order.order_date,
      customer: {
        name: order.customer_name,
        email: order.customer_email
      },
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      items: items,
      totals: {
        subtotal: items.reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0),
        shipping: parseFloat(order.shipping_price || 0),
        tax: parseFloat(order.tax || 0),
        total: parseFloat(order.total_price || 0)
      }
    };
  });

  res.json(packingSlips);
}));

// ============================================
// AUTO-ACCEPT RULES
// ============================================

// Get all auto-rules
router.get('/auto-rules', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT * FROM marketplace_auto_rules
    ORDER BY priority ASC, created_at DESC
  `);
  res.json(result.rows);
}));

// Get single auto-rule
router.get('/auto-rules/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(`SELECT * FROM marketplace_auto_rules WHERE id = $1`, [id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Rule');
  }

  res.json(result.rows[0]);
}));

// Create auto-rule
router.post('/auto-rules', authenticate, asyncHandler(async (req, res) => {
  const { name, description, rule_type, conditions, action, action_params, priority, enabled } = req.body;

  if (!name || !rule_type || !action) {
    throw ApiError.badRequest('name, rule_type, and action are required');
  }

  const result = await pool.query(`
    INSERT INTO marketplace_auto_rules (name, description, rule_type, conditions, action, action_params, priority, enabled)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    name,
    description || null,
    rule_type,
    JSON.stringify(conditions || []),
    action,
    JSON.stringify(action_params || {}),
    priority || 100,
    enabled !== false
  ]);

  res.json({ success: true, rule: result.rows[0] });
}));

// Update auto-rule
router.put('/auto-rules/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, rule_type, conditions, action, action_params, priority, enabled } = req.body;

  const result = await pool.query(`
    UPDATE marketplace_auto_rules
    SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      rule_type = COALESCE($3, rule_type),
      conditions = COALESCE($4, conditions),
      action = COALESCE($5, action),
      action_params = COALESCE($6, action_params),
      priority = COALESCE($7, priority),
      enabled = COALESCE($8, enabled),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $9
    RETURNING *
  `, [
    name,
    description,
    rule_type,
    conditions ? JSON.stringify(conditions) : null,
    action,
    action_params ? JSON.stringify(action_params) : null,
    priority,
    enabled,
    id
  ]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Rule');
  }

  res.json({ success: true, rule: result.rows[0] });
}));

// Toggle auto-rule enabled status
router.put('/auto-rules/:id/toggle', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    UPDATE marketplace_auto_rules
    SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Rule');
  }

  res.json({ success: true, rule: result.rows[0] });
}));

// Delete auto-rule
router.delete('/auto-rules/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`DELETE FROM marketplace_auto_rules WHERE id = $1 RETURNING id`, [id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Rule');
  }

  res.json({ success: true });
}));

// Get rule logs
router.get('/auto-rules/:id/logs', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  const result = await pool.query(`
    SELECT rl.*, mo.customer_name, mo.order_state
    FROM marketplace_rule_logs rl
    LEFT JOIN marketplace_orders mo ON rl.order_id = mo.id
    WHERE rl.rule_id = $1
    ORDER BY rl.created_at DESC
    LIMIT $2
  `, [id, limit]);

  res.json(result.rows);
}));

// Evaluate rules for an order (internal function)
async function evaluateRulesForOrder(order, orderItems) {
  try {
    // Get all enabled rules sorted by priority
    const rulesResult = await pool.query(`
      SELECT * FROM marketplace_auto_rules
      WHERE enabled = true
      ORDER BY priority ASC
    `);

    const rules = rulesResult.rows;
    const results = [];

    for (const rule of rules) {
      const conditions = rule.conditions || [];
      let allConditionsMet = true;

      // Evaluate each condition
      for (const condition of conditions) {
        const met = evaluateCondition(condition, order, orderItems);
        if (!met) {
          allConditionsMet = false;
          break;
        }
      }

      if (allConditionsMet) {
        // Log the rule trigger
        await pool.query(`
          INSERT INTO marketplace_rule_logs (rule_id, order_id, mirakl_order_id, action_taken, conditions_matched, result)
          VALUES ($1, $2, $3, $4, $5, 'triggered')
        `, [rule.id, order.id, order.mirakl_order_id, rule.action, JSON.stringify(conditions)]);

        // Update rule trigger count
        await pool.query(`
          UPDATE marketplace_auto_rules
          SET trigger_count = trigger_count + 1, last_triggered_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [rule.id]);

        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          action: rule.action,
          action_params: rule.action_params
        });

        // If this is an auto_accept or auto_reject rule, stop evaluating further rules
        if (rule.rule_type === 'auto_accept' || rule.rule_type === 'auto_reject') {
          break;
        }
      }
    }

    return results;
  } catch (error) {
    console.error('❌ Error evaluating rules:', error);
    return [];
  }
}

// Evaluate a single condition
function evaluateCondition(condition, order, orderItems) {
  const { field, operator, value } = condition;

  let fieldValue;

  // Get field value based on field name
  switch (field) {
    case 'order_total':
      fieldValue = order.total_price_cents / 100;
      break;
    case 'max_quantity':
      fieldValue = orderItems.reduce((max, item) => Math.max(max, item.quantity), 0);
      break;
    case 'total_quantity':
      fieldValue = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      break;
    case 'all_items_in_stock':
      // Check if all items have sufficient stock
      fieldValue = orderItems.every(item => {
        const qtyOnHand = item.qty_on_hand ?? item.stock ?? item.inventory ?? null;
        if (qtyOnHand === null) return true; // Default to true if inventory data unavailable
        return qtyOnHand >= (item.quantity || 1);
      });
      break;
    case 'any_item_out_of_stock':
      // Check if any item is out of stock
      fieldValue = orderItems.some(item => {
        const qtyOnHand = item.qty_on_hand ?? item.stock ?? item.inventory ?? null;
        if (qtyOnHand === null) return false; // Default to false if inventory data unavailable
        return qtyOnHand < (item.quantity || 1);
      });
      break;
    case 'category_is':
      fieldValue = orderItems.some(item => item.bestbuy_category_code === value);
      return fieldValue;
    case 'customer_location':
      fieldValue = order.shipping_address?.country || order.shipping_address?.state;
      break;
    default:
      return false;
  }

  // Evaluate operator
  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'not_equals':
      return fieldValue !== value;
    case 'greater_than':
      return fieldValue > value;
    case 'less_than':
      return fieldValue < value;
    case 'greater_than_or_equal':
      return fieldValue >= value;
    case 'less_than_or_equal':
      return fieldValue <= value;
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    default:
      return false;
  }
}

// Check for new orders and create notifications (called by scheduler)
async function checkForNewOrders() {
  try {
    // Get orders from last check
    const settingResult = await pool.query(`
      SELECT setting_value FROM marketplace_order_settings WHERE setting_key = 'last_order_check'
    `);

    let lastCheck = new Date(Date.now() - 5 * 60 * 1000); // Default to 5 minutes ago
    if (settingResult.rows.length > 0) {
      lastCheck = new Date(settingResult.rows[0].setting_value.timestamp);
    }

    // Get new orders since last check
    const newOrders = await pool.query(`
      SELECT * FROM marketplace_orders
      WHERE created_at > $1 AND order_state = 'WAITING_ACCEPTANCE'
      ORDER BY created_at ASC
    `, [lastCheck]);

    // Create notifications for new orders
    for (const order of newOrders.rows) {
      await createNotification(
        'new_order',
        'New Order Received',
        `Order #${order.mirakl_order_id.substring(0, 8)} - $${(order.total_price_cents / 100).toFixed(2)} from ${order.customer_name || 'Customer'}`,
        order.id,
        order.mirakl_order_id,
        'high',
        { total: order.total_price_cents / 100 }
      );

      // Get order items and evaluate rules
      const itemsResult = await pool.query(`
        SELECT oi.*, p.bestbuy_category_code
        FROM marketplace_order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [order.id]);

      const triggeredRules = await evaluateRulesForOrder(order, itemsResult.rows);

      // Execute rule actions
      for (const triggered of triggeredRules) {
        if (triggered.action === 'accept') {
          // Auto-accept the order
          try {
            await miraklService.acceptOrder(order.mirakl_order_id);
            await pool.query(`
              UPDATE marketplace_orders
              SET order_state = 'SHIPPING', acceptance_decision_date = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [order.id]);

            await createNotification(
              'auto_accepted',
              'Order Auto-Accepted',
              `Order #${order.mirakl_order_id.substring(0, 8)} was automatically accepted by rule: ${triggered.rule_name}`,
              order.id,
              order.mirakl_order_id,
              'normal'
            );
          } catch (err) {
            console.error('❌ Auto-accept failed:', err);
          }
        } else if (triggered.action === 'reject') {
          // Auto-reject the order
          const reason = triggered.action_params?.reason || 'Automatically rejected';
          try {
            await miraklService.rejectOrder(order.mirakl_order_id, reason);
            await pool.query(`
              UPDATE marketplace_orders
              SET order_state = 'REFUSED', canceled_date = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [order.id]);

            await createNotification(
              'auto_rejected',
              'Order Auto-Rejected',
              `Order #${order.mirakl_order_id.substring(0, 8)} was automatically rejected by rule: ${triggered.rule_name}`,
              order.id,
              order.mirakl_order_id,
              'normal'
            );
          } catch (err) {
            console.error('❌ Auto-reject failed:', err);
          }
        } else if (triggered.action === 'notify') {
          // Create alert notification
          await createNotification(
            'rule_alert',
            triggered.action_params?.title || 'Order Alert',
            triggered.action_params?.message || `Order #${order.mirakl_order_id.substring(0, 8)} triggered alert rule: ${triggered.rule_name}`,
            order.id,
            order.mirakl_order_id,
            triggered.action_params?.priority || 'high'
          );
        }
      }
    }

    // Update last check timestamp
    await pool.query(`
      INSERT INTO marketplace_order_settings (setting_key, setting_value)
      VALUES ('last_order_check', $1)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1
    `, [JSON.stringify({ timestamp: new Date().toISOString() })]);

    return { checked: newOrders.rows.length };
  } catch (error) {
    console.error('❌ Error checking for new orders:', error);
    return { error: error.message };
  }
}

// Manual trigger to check for new orders
router.post('/check-new-orders', authenticate, asyncHandler(async (req, res) => {
  const result = await checkForNewOrders();
  res.json({ success: true, ...result });
}));

// Get order detail with items
router.get('/orders/:id/detail', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const orderResult = await pool.query(`
    SELECT
      mo.*,
      mo.total_price_cents / 100.0 as total_price,
      mo.shipping_price_cents / 100.0 as shipping_price,
      mo.tax_cents / 100.0 as tax,
      mo.commission_fee_cents / 100.0 as commission_fee
    FROM marketplace_orders mo
    WHERE mo.id = $1
  `, [id]);

  if (orderResult.rows.length === 0) {
    throw ApiError.notFound('Order');
  }

  const order = orderResult.rows[0];

  // Get order items with expected commission rate lookup
  const itemsResult = await pool.query(`
    SELECT
      oi.*,
      oi.unit_price_cents / 100.0 as unit_price,
      oi.total_price_cents / 100.0 as total_price,
      oi.commission_fee_cents / 100.0 as commission_fee,
      oi.tax_cents / 100.0 as tax,
      p.name as product_name,
      p.model,
      p.manufacturer,
      p.bestbuy_category_code,
      p.image_url as internal_image_url,
      COALESCE(oi.expected_commission_rate, cr.commission_pct) as expected_commission_rate
    FROM marketplace_order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN marketplace_commission_rates cr
      ON LOWER(oi.category_label) = LOWER(cr.category_leaf)
    WHERE oi.order_id = $1
  `, [id]);

  // Get shipments
  const shipmentsResult = await pool.query(`
    SELECT * FROM marketplace_shipments WHERE order_id = $1
  `, [id]);

  // Get related notifications
  const notificationsResult = await pool.query(`
    SELECT * FROM marketplace_notifications
    WHERE order_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [id]);

  res.json({
    order,
    items: itemsResult.rows,
    shipments: shipmentsResult.rows,
    notifications: notificationsResult.rows
  });
}));

// ============================================
// INVENTORY SYNC & PRICING ENDPOINTS
// ============================================

const inventorySyncScheduler = require('../services/inventorySyncScheduler');

// Get sync settings
router.get('/sync-settings', authenticate, asyncHandler(async (req, res) => {
  const settings = await inventorySyncScheduler.getSyncSettings();
  res.json(settings);
}));

// Update sync setting
router.put('/sync-settings/:key', authenticate, asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  await inventorySyncScheduler.updateSetting(key, value);

  // Restart scheduler if auto-sync or frequency changed
  if (key === 'auto_sync_enabled' || key === 'sync_frequency_hours') {
    await inventorySyncScheduler.restart();
  }

  res.json({ success: true, key, value });
}));

// Manual trigger inventory sync (OUTBOUND - push to Best Buy)
router.post('/run-inventory-sync', authenticate, asyncHandler(async (req, res) => {
  const forceFullSync = req.body?.forceFullSync || false;
  const result = await inventorySyncScheduler.runSync({ forceFullSync });
  res.json(result);
}));

// Pull offers FROM Best Buy INTO local system (INBOUND)
router.post('/pull-offers-from-bestbuy', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  // Fetch all offers from Best Buy
  const offers = await miraklService.getOffers({ max: 1000 });

  let imported = 0;
  let updated = 0;
  let failed = 0;
  const errors = [];

  for (const offer of offers) {
    try {
      // Check if product already exists by shop_sku or product_sku
      const existingProduct = await pool.query(
        `SELECT id FROM products WHERE mirakl_sku = $1 OR model = $2`,
        [offer.shop_sku, offer.shop_sku]
      );

      // Extract UPC from product_references
      let upc = null;
      if (offer.product_references && offer.product_references.length > 0) {
        const upcRef = offer.product_references.find(r => r.reference_type === 'UPC-A' || r.reference_type === 'EAN');
        if (upcRef) upc = upcRef.reference;
      }

      // Convert price to cents
      const priceCents = Math.round((offer.price || 0) * 100);
      const msrpCents = offer.msrp ? Math.round(offer.msrp * 100) : priceCents;

      // Check if category code exists in bestbuy_categories, set to null if not
      let validCategoryCode = null;
      if (offer.category_code) {
        const categoryCheck = await pool.query(
          `SELECT code FROM bestbuy_categories WHERE code = $1`,
          [offer.category_code]
        );
        if (categoryCheck.rows.length > 0) {
          validCategoryCode = offer.category_code;
        }
      }

      if (existingProduct.rows.length > 0) {
        // Update existing product
        await pool.query(`
          UPDATE products SET
            mirakl_sku = $1,
            mirakl_offer_id = $2,
            marketplace_price = $3,
            stock_quantity = $4,
            bestbuy_category_code = $5,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $6
        `, [
          offer.shop_sku,
          offer.offer_id,
          offer.price,
          offer.quantity || 0,
          validCategoryCode,
          existingProduct.rows[0].id
        ]);
        updated++;
      } else {
        // Insert new product
        await pool.query(`
          INSERT INTO products (
            model, name, manufacturer, mirakl_sku, mirakl_offer_id,
            price, msrp_cents, marketplace_price, stock_quantity,
            bestbuy_category_code, category, active, last_synced_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          offer.shop_sku,
          offer.product_title || offer.shop_sku,
          offer.product_brand || 'Unknown',
          offer.shop_sku,
          offer.offer_id,
          offer.price,
          msrpCents,
          offer.price,
          offer.quantity || 0,
          validCategoryCode,
          offer.category_label || 'Marketplace Import',
          offer.active !== false
        ]);
        imported++;
      }
    } catch (err) {
      console.error(`❌ Failed to import offer ${offer.shop_sku}:`, err.message);
      failed++;
      errors.push({ sku: offer.shop_sku, error: err.message });
    }
  }

  // Log the sync
  await miraklService.logSync('offer_import', 'product', failed > 0 ? 'PARTIAL' : 'SUCCESS', {
    direction: 'inbound',
    recordsProcessed: offers.length,
    recordsSucceeded: imported + updated,
    recordsFailed: failed,
    startTime: new Date(),
    endTime: new Date()
  });

  res.json({
    success: true,
    total_offers: offers.length,
    imported,
    updated,
    failed,
    errors: errors.slice(0, 10) // Return first 10 errors
  });
}));

// Get sync history
router.get('/sync-history', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;
  const history = await inventorySyncScheduler.getSyncHistory(parseInt(limit));
  res.json(history);
}));

// Preview prices before applying
router.get('/preview-prices', authenticate, asyncHandler(async (req, res) => {
  const { product_ids, limit = 50 } = req.query;
  const productIds = product_ids ? product_ids.split(',').map(id => parseInt(id)) : null;
  const previews = await inventorySyncScheduler.previewPrices(productIds, parseInt(limit));
  res.json({ previews, count: previews.length });
}));

// ============================================
// PRICE RULES ENDPOINTS
// ============================================

// Get all price rules
router.get('/price-rules', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT pr.*,
      (SELECT COUNT(*) FROM products WHERE marketplace_price_rule_id = pr.id) as products_count
    FROM marketplace_price_rules pr
    ORDER BY pr.priority DESC, pr.created_at DESC
  `);
  res.json(result.rows);
}));

// Get single price rule
router.get('/price-rules/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM marketplace_price_rules WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Price rule');
  }

  res.json(result.rows[0]);
}));

// Create price rule
router.post('/price-rules', authenticate, asyncHandler(async (req, res) => {
  const {
    name,
    description,
    rule_type,
    value,
    category_code,
    manufacturer,
    min_price,
    max_price,
    priority = 100,
    enabled = true,
    apply_globally = false
  } = req.body;

  const result = await pool.query(`
    INSERT INTO marketplace_price_rules
      (name, description, rule_type, value, category_code, manufacturer, min_price, max_price, priority, enabled, apply_globally)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `, [name, description, rule_type, value, category_code, manufacturer, min_price, max_price, priority, enabled, apply_globally]);

  res.status(201).json(result.rows[0]);
}));

// Update price rule
router.put('/price-rules/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    rule_type,
    value,
    category_code,
    manufacturer,
    min_price,
    max_price,
    priority,
    enabled,
    apply_globally
  } = req.body;

  const result = await pool.query(`
    UPDATE marketplace_price_rules
    SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      rule_type = COALESCE($3, rule_type),
      value = COALESCE($4, value),
      category_code = $5,
      manufacturer = $6,
      min_price = $7,
      max_price = $8,
      priority = COALESCE($9, priority),
      enabled = COALESCE($10, enabled),
      apply_globally = COALESCE($11, apply_globally),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    RETURNING *
  `, [name, description, rule_type, value, category_code, manufacturer, min_price, max_price, priority, enabled, apply_globally, id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Price rule');
  }

  res.json(result.rows[0]);
}));

// Toggle price rule enabled/disabled
router.put('/price-rules/:id/toggle', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    UPDATE marketplace_price_rules
    SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Price rule');
  }

  res.json({ success: true, rule: result.rows[0] });
}));

// Delete price rule
router.delete('/price-rules/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // First remove any product references
  await pool.query('UPDATE products SET marketplace_price_rule_id = NULL WHERE marketplace_price_rule_id = $1', [id]);

  const result = await pool.query('DELETE FROM marketplace_price_rules WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Price rule');
  }

  res.json({ success: true, deleted_id: id });
}));

// ============================================
// STOCK BUFFER ENDPOINTS
// ============================================

// Get global stock buffer
router.get('/stock-buffer', authenticate, asyncHandler(async (req, res) => {
  const buffer = await inventorySyncScheduler.getGlobalStockBuffer();
  res.json({ global_buffer: buffer });
}));

// Update global stock buffer
router.put('/stock-buffer', authenticate, asyncHandler(async (req, res) => {
  const { value } = req.body;

  if (value < 0) {
    throw ApiError.badRequest('Stock buffer cannot be negative');
  }

  await inventorySyncScheduler.updateSetting('global_stock_buffer', { value: parseInt(value) });
  res.json({ success: true, global_buffer: parseInt(value) });
}));

// Update product-specific stock buffer
router.put('/products/:id/stock-buffer', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { buffer } = req.body;

  // null means use global buffer
  const bufferValue = buffer === null || buffer === '' ? null : parseInt(buffer);

  if (bufferValue !== null && bufferValue < 0) {
    throw ApiError.badRequest('Stock buffer cannot be negative');
  }

  const result = await pool.query(`
    UPDATE products
    SET marketplace_stock_buffer = $1
    WHERE id = $2
    RETURNING id, model, marketplace_stock_buffer
  `, [bufferValue, id]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Product');
  }

  res.json({ success: true, product: result.rows[0] });
}));

// Bulk update stock buffers
router.put('/products/bulk-stock-buffer', authenticate, asyncHandler(async (req, res) => {
  const { product_ids, buffer } = req.body;

  if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
    throw ApiError.badRequest('Product IDs required');
  }

  const bufferValue = buffer === null || buffer === '' ? null : parseInt(buffer);

  if (bufferValue !== null && bufferValue < 0) {
    throw ApiError.badRequest('Stock buffer cannot be negative');
  }

  const result = await pool.query(`
    UPDATE products
    SET marketplace_stock_buffer = $1
    WHERE id = ANY($2)
    RETURNING id
  `, [bufferValue, product_ids]);

  res.json({ success: true, updated_count: result.rowCount });
}));

// Get products with marketplace info for inventory management
router.get('/inventory-products', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search = '', category = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT
      p.id,
      p.model,
      p.name,
      p.manufacturer,
      p.mirakl_sku as sku,
      p.price,
      p.cost,
      COALESCE(p.stock_quantity, 0) as stock_quantity,
      p.marketplace_stock_buffer,
      p.marketplace_price,
      p.marketplace_last_synced,
      p.bestbuy_category_code,
      p.active,
      c.name as category_name
    FROM products p
    LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
    WHERE p.bestbuy_category_code IS NOT NULL
  `;

  const params = [];
  let paramIndex = 1;

  if (search) {
    query += ` AND (p.name ILIKE $${paramIndex} OR p.manufacturer ILIKE $${paramIndex} OR p.mirakl_sku ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (category) {
    query += ` AND p.bestbuy_category_code = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  // Count query
  const countQuery = query.replace('SELECT\n        p.id,', 'SELECT COUNT(*) as total FROM (SELECT p.id,') + ') sub';

  query += ` ORDER BY p.updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(parseInt(limit), offset);

  const [dataResult, countResult] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, params.slice(0, -2))
  ]);

  const globalBuffer = await inventorySyncScheduler.getGlobalStockBuffer();

  // Add effective stock to each product
  const products = dataResult.rows.map(p => ({
    ...p,
    effective_stock: inventorySyncScheduler.calculateEffectiveStock(
      p.stock_quantity,
      p.marketplace_stock_buffer,
      globalBuffer
    ),
    uses_global_buffer: p.marketplace_stock_buffer === null
  }));

  res.json({
    products,
    total: parseInt(countResult.rows[0]?.total || 0),
    page: parseInt(page),
    limit: parseInt(limit),
    global_buffer: globalBuffer
  });
}));

// ============================================
// INVENTORY SYNC MANAGEMENT
// ============================================

// Trigger immediate batch inventory sync — supports ?channelId
router.post('/inventory/sync-now', authenticate, asyncHandler(async (req, res) => {
  const { manager, adapter, channelId } = await resolveChannel(req);

  if (adapter && channelId) {
    const result = await adapter.processInventoryBatch();
    return res.json({
      success: true,
      processed: result.submitted || result.processed || 0,
      importId: result.importId || null,
      channelId,
      syncTime: new Date()
    });
  }

  // Legacy fallback
  requireMiraklConfig();
  const result = await miraklService.processInventoryBatch();
  res.json({
    success: true,
    processed: result.processed,
    importId: result.importId || null,
    syncTime: new Date()
  });
}));

// Show pending inventory changes waiting to sync
router.get('/inventory/queue-status', authenticate, asyncHandler(async (req, res) => {
  const [pendingResult, lastSyncResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) as pending_changes,
        MIN(queued_at) as oldest_pending
      FROM marketplace_inventory_queue
      WHERE synced_at IS NULL
    `),
    pool.query(`
      SELECT submitted_at as last_sync
      FROM marketplace_offer_imports
      WHERE import_type = 'STOCK'
      ORDER BY submitted_at DESC
      LIMIT 1
    `)
  ]);

  res.json({
    pendingChanges: parseInt(pendingResult.rows[0].pending_changes) || 0,
    oldestPending: pendingResult.rows[0].oldest_pending || null,
    lastSync: lastSyncResult.rows[0]?.last_sync || null
  });
}));

// Compare our stock vs channel's stock levels — supports ?channelId
router.get('/inventory/drift-check', authenticate, asyncHandler(async (req, res) => {
  const { adapter } = await resolveChannel(req);

  if (adapter) {
    const drift = await adapter.getInventoryDrift();
    return res.json(drift);
  }

  requireMiraklConfig();
  const drift = await miraklService.getInventoryDrift();
  res.json(drift);
}));

// Push ALL inventory to channel (emergency/initial sync) — supports ?channelId
router.post('/inventory/force-full-sync', authenticate, asyncHandler(async (req, res) => {
  if (!req.body.confirm) {
    throw ApiError.badRequest('Must include { confirm: true } to force a full inventory sync');
  }

  const { adapter } = await resolveChannel(req);

  if (adapter) {
    const result = await adapter.forceFullInventorySync();
    return res.json({ success: true, ...result });
  }

  requireMiraklConfig();
  const result = await miraklService.forceFullInventorySync();
  res.json({
    success: true,
    ...result
  });
}));

// Get polling job status
router.get('/polling-status', authenticate, asyncHandler(async (req, res) => {
  try {
    const marketplaceJobs = require('../jobs/marketplaceJobs');
    res.json(marketplaceJobs.getPollingStatus());
  } catch (err) {
    res.json({ enabled: false, jobs: [], error: 'Polling module not available' });
  }
}));

// Manually trigger a polling job
router.post('/polling/run/:jobName', authenticate, asyncHandler(async (req, res) => {
  requireMiraklConfig();
  const marketplaceJobs = require('../jobs/marketplaceJobs');
  const result = await marketplaceJobs.runJobNow(req.params.jobName);
  res.json({ success: true, result });
}));

// Get offers/products for Offers tab (includes marketplace_enabled, mirakl state, UPC)
router.get('/offers/products', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search = '', enabled_only } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let paramIndex = 1;
  let where = 'WHERE p.bestbuy_category_id IS NOT NULL OR p.marketplace_enabled = true';

  if (search) {
    where += ` AND (p.name ILIKE $${paramIndex} OR p.model ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex} OR p.upc ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (enabled_only === 'true') {
    where += ' AND p.marketplace_enabled = true';
  }

  const dataQuery = `
    SELECT p.id, p.name, p.model, p.sku, p.upc, p.price, p.cost,
      COALESCE(p.stock_quantity, 0) as stock_quantity,
      p.bestbuy_category_id, p.marketplace_enabled,
      p.mirakl_offer_state, p.mirakl_last_offer_sync,
      p.manufacturer, p.category
    FROM products p
    ${where}
    ORDER BY p.marketplace_enabled DESC NULLS LAST, p.name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(parseInt(limit), offset);

  const countQuery = `SELECT COUNT(*) as total FROM products p ${where}`;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, params),
    pool.query(countQuery, params.slice(0, -2))
  ]);

  res.json({
    products: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || 0),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

// Get recent offer imports for Offers tab
router.get('/offers/recent-imports', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT import_id as id, mirakl_import_id, import_type, status, records_processed,
      records_with_errors, submitted_at, completed_at
    FROM marketplace_offer_imports
    ORDER BY submitted_at DESC
    LIMIT 10
  `);
  res.json(result.rows);
}));

// ============================================
// CUSTOMER INTEGRATION
// ============================================

// Match order to customer
router.post('/orders/:id/match-customer', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { customer_id, create_new } = req.body;

  // Get the order
  const orderResult = await pool.query(
    'SELECT * FROM marketplace_orders WHERE id = $1',
    [id]
  );

  if (orderResult.rows.length === 0) {
    throw ApiError.notFound('Order');
  }

  const order = orderResult.rows[0];

  if (customer_id) {
    // Link to existing customer
    await pool.query(`
      UPDATE marketplace_orders
      SET customer_id = $1, customer_match_type = 'manual', customer_matched_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [customer_id, id]);

    // Update customer stats
    await updateCustomerMarketplaceStats(customer_id);

    res.json({ success: true, customer_id, match_type: 'manual' });
  } else if (create_new) {
    // Create new customer from order
    const shippingAddr = order.shipping_address || {};

    const newCustomer = await pool.query(`
      INSERT INTO customers (name, email, phone, address, city, province, postal_code, customer_type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'marketplace', CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      order.customer_name,
      order.customer_email,
      shippingAddr.phone || null,
      [shippingAddr.street_1, shippingAddr.street_2].filter(Boolean).join(', ') || null,
      shippingAddr.city || null,
      shippingAddr.state || null,
      shippingAddr.zip_code || null
    ]);

    const newCustomerId = newCustomer.rows[0].id;

    // Link order to new customer
    await pool.query(`
      UPDATE marketplace_orders
      SET customer_id = $1, customer_match_type = 'new_created', customer_matched_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newCustomerId, id]);

    // Update stats
    await updateCustomerMarketplaceStats(newCustomerId);

    res.json({ success: true, customer_id: newCustomerId, match_type: 'new_created' });
  } else {
    throw ApiError.badRequest('Must provide customer_id or set create_new=true');
  }
}));

// Auto-match order to customer by email
router.post('/orders/:id/auto-match', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get the order
  const orderResult = await pool.query(
    'SELECT * FROM marketplace_orders WHERE id = $1',
    [id]
  );

  if (orderResult.rows.length === 0) {
    throw ApiError.notFound('Order');
  }

  const order = orderResult.rows[0];

  if (!order.customer_email) {
    return res.json({ success: false, message: 'No email on order' });
  }

  // Try to find matching customer
  const customerResult = await pool.query(
    'SELECT id, name, email FROM customers WHERE LOWER(email) = LOWER($1)',
    [order.customer_email]
  );

  if (customerResult.rows.length > 0) {
    const customer = customerResult.rows[0];

    await pool.query(`
      UPDATE marketplace_orders
      SET customer_id = $1, customer_match_type = 'email_match', customer_matched_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [customer.id, id]);

    await updateCustomerMarketplaceStats(customer.id);

    res.json({
      success: true,
      matched: true,
      customer_id: customer.id,
      customer_name: customer.name,
      match_type: 'email_match'
    });
  } else {
    res.json({ success: true, matched: false, message: 'No matching customer found' });
  }
}));

// Find potential customer matches for an order
router.get('/orders/:id/customer-matches', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const orderResult = await pool.query(
    'SELECT customer_name, customer_email FROM marketplace_orders WHERE id = $1',
    [id]
  );

  if (orderResult.rows.length === 0) {
    throw ApiError.notFound('Order');
  }

  const order = orderResult.rows[0];
  const matches = [];

  // Exact email match
  if (order.customer_email) {
    const emailMatch = await pool.query(
      'SELECT id, name, email, phone, company FROM customers WHERE LOWER(email) = LOWER($1)',
      [order.customer_email]
    );
    emailMatch.rows.forEach(c => matches.push({ ...c, match_type: 'exact_email', confidence: 100 }));
  }

  // Name similarity match (if no exact email match)
  if (matches.length === 0 && order.customer_name) {
    const nameMatch = await pool.query(`
      SELECT id, name, email, phone, company
      FROM customers
      WHERE LOWER(name) ILIKE $1
      LIMIT 5
    `, [`%${order.customer_name.split(' ')[0]}%`]);
    nameMatch.rows.forEach(c => matches.push({ ...c, match_type: 'name_partial', confidence: 50 }));
  }

  res.json({ matches });
}));

// Create quote from marketplace order
router.post('/orders/:id/create-quote', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Get the order with customer info
    const orderResult = await client.query(`
      SELECT mo.*, c.id as linked_customer_id, c.name as linked_customer_name
      FROM marketplace_orders mo
      LEFT JOIN customers c ON mo.customer_id = c.id
      WHERE mo.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Order');
    }

    const order = orderResult.rows[0];

    // If no linked customer, create one first
    let customerId = order.linked_customer_id;
    if (!customerId) {
      const shippingAddr = order.shipping_address || {};
      const newCustomer = await client.query(`
        INSERT INTO customers (name, email, phone, address, city, province, postal_code, customer_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'marketplace', CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        order.customer_name,
        order.customer_email,
        shippingAddr.phone || null,
        [shippingAddr.street_1, shippingAddr.street_2].filter(Boolean).join(', ') || null,
        shippingAddr.city || null,
        shippingAddr.state || null,
        shippingAddr.zip_code || null
      ]);
      customerId = newCustomer.rows[0].id;

      // Link order to customer
      await client.query(`
        UPDATE marketplace_orders
        SET customer_id = $1, customer_match_type = 'new_created', customer_matched_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [customerId, id]);
    }

    // Generate quote number
    const quoteNumResult = await client.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'Q([0-9]+)') AS INTEGER)), 0) + 1 as next_num
      FROM quotations
    `);
    const nextNum = quoteNumResult.rows[0].next_num;
    const quotationNumber = 'Q' + String(nextNum).padStart(5, '0');

    // Get shipping address for quote
    const shippingAddr = order.shipping_address || {};
    const customerAddress = [
      shippingAddr.street_1,
      shippingAddr.street_2,
      shippingAddr.city,
      shippingAddr.state,
      shippingAddr.zip_code
    ].filter(Boolean).join(', ');

    // Calculate totals
    const subtotalCents = order.total_price_cents - (order.tax_cents || 0) - (order.shipping_price_cents || 0);

    // Create the quotation
    const quoteResult = await client.query(`
      INSERT INTO quotations (
        quotation_number,
        customer_id,
        customer_name,
        customer_email,
        customer_address,
        status,
        subtotal_cents,
        tax_cents,
        total_cents,
        source,
        marketplace_order_id,
        notes,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      quotationNumber,
      customerId,
      order.customer_name,
      order.customer_email,
      customerAddress,
      'won', // Marketplace orders are already completed
      subtotalCents,
      order.tax_cents || 0,
      order.total_price_cents,
      'marketplace',
      id,
      `Created from Best Buy Marketplace Order ${order.mirakl_order_id}`
    ]);

    const quotationId = quoteResult.rows[0].id;

    // Add order items to quotation
    const orderLines = order.order_lines || [];
    for (const line of orderLines) {
      // Try to find matching product
      const productResult = await client.query(
        'SELECT id, cost FROM products WHERE LOWER(name) = LOWER($1) OR mirakl_sku = $2 LIMIT 1',
        [line.product_title || line.offer_sku, line.offer_sku]
      );

      const productId = productResult.rows[0]?.id || null;
      const costCents = productResult.rows[0]?.cost ? Math.round(parseFloat(productResult.rows[0].cost) * 100) : 0;
      const sellCents = line.price_cents || Math.round((line.price || 0) * 100);

      await client.query(`
        INSERT INTO quotation_items (
          quotation_id,
          product_id,
          quantity,
          manufacturer,
          model,
          description,
          cost_cents,
          sell_cents,
          line_total_cents,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      `, [
        quotationId,
        productId,
        line.quantity || 1,
        line.manufacturer || 'Unknown',
        line.offer_sku || line.product_sku,
        line.product_title || line.offer_sku,
        costCents,
        sellCents,
        sellCents * (line.quantity || 1)
      ]);
    }

    // Link quote back to order
    await client.query(`
      UPDATE marketplace_orders
      SET created_quote_id = $1, quote_created_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [quotationId, id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      quotation_id: quotationId,
      quotation_number: quotationNumber,
      customer_id: customerId
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Get customer's marketplace orders
router.get('/customers/:customerId/orders', authenticate, asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const result = await pool.query(`
    SELECT
      mo.*,
      q.quotation_number as linked_quote_number
    FROM marketplace_orders mo
    LEFT JOIN quotations q ON mo.created_quote_id = q.id
    WHERE mo.customer_id = $1
    ORDER BY mo.order_date DESC
  `, [customerId]);

  res.json({ orders: result.rows });
}));

// Get customer's unified order history (quotes + marketplace orders)
router.get('/customers/:customerId/unified-history', authenticate, asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  // Get quotes
  const quotes = await pool.query(`
    SELECT
      'quote' as type,
      id,
      quotation_number as reference,
      status,
      total_cents as amount_cents,
      source,
      created_at as date,
      NULL as mirakl_order_id
    FROM quotations
    WHERE customer_id = $1
    ORDER BY created_at DESC
  `, [customerId]);

  // Get marketplace orders
  const orders = await pool.query(`
    SELECT
      'marketplace_order' as type,
      id,
      mirakl_order_id as reference,
      order_state as status,
      total_price_cents as amount_cents,
      'bestbuy' as source,
      order_date as date,
      mirakl_order_id
    FROM marketplace_orders
    WHERE customer_id = $1
    ORDER BY order_date DESC
  `, [customerId]);

  // Combine and sort by date
  const combined = [...quotes.rows, ...orders.rows]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Get customer summary
  const summary = await pool.query(`
    SELECT
      c.*,
      (SELECT COUNT(*) FROM quotations WHERE customer_id = c.id) as quotes_count,
      (SELECT COALESCE(SUM(total_cents), 0) FROM quotations WHERE customer_id = c.id AND status = 'won') as quotes_revenue_cents
    FROM customers c
    WHERE c.id = $1
  `, [customerId]);

  res.json({
    customer: summary.rows[0],
    history: combined,
    totals: {
      quotes_count: parseInt(summary.rows[0]?.quotes_count || 0),
      quotes_revenue_cents: parseInt(summary.rows[0]?.quotes_revenue_cents || 0),
      marketplace_orders_count: parseInt(summary.rows[0]?.marketplace_orders_count || 0),
      marketplace_revenue_cents: parseInt(summary.rows[0]?.marketplace_revenue_cents || 0),
      total_revenue_cents: parseInt(summary.rows[0]?.quotes_revenue_cents || 0) + parseInt(summary.rows[0]?.marketplace_revenue_cents || 0)
    }
  });
}));

// Helper function to update customer marketplace stats
async function updateCustomerMarketplaceStats(customerId) {
  await pool.query(`
    UPDATE customers c
    SET
      marketplace_orders_count = COALESCE(stats.order_count, 0),
      marketplace_revenue_cents = COALESCE(stats.total_revenue, 0),
      first_marketplace_order_at = stats.first_order,
      last_marketplace_order_at = stats.last_order,
      updated_at = CURRENT_TIMESTAMP
    FROM (
      SELECT
        customer_id,
        COUNT(*) as order_count,
        SUM(total_price_cents) as total_revenue,
        MIN(order_date) as first_order,
        MAX(order_date) as last_order
      FROM marketplace_orders
      WHERE customer_id = $1
      GROUP BY customer_id
    ) stats
    WHERE c.id = $1 AND c.id = stats.customer_id
  `, [customerId]);
}

// Update order list to include customer match info
router.get('/orders-with-customers', authenticate, asyncHandler(async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT
      mo.*,
      c.id as linked_customer_id,
      c.name as linked_customer_name,
      c.email as linked_customer_email,
      q.quotation_number as linked_quote_number
    FROM marketplace_orders mo
    LEFT JOIN customers c ON mo.customer_id = c.id
    LEFT JOIN quotations q ON mo.created_quote_id = q.id
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND mo.order_state = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY mo.order_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  res.json({ orders: result.rows });
}));

// ============================================
// MARKETPLACE REPORTS API
// ============================================

// Sales Report - Summary and Daily Breakdown
router.get('/reports/sales', authenticate, asyncHandler(async (req, res) => {
  const { start_date, end_date, category, product_id } = req.query;

  // Default to last 30 days
  const endDate = end_date || new Date().toISOString().split('T')[0];
  const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Build filters
  let filters = `mo.order_date >= $1 AND mo.order_date <= $2`;
  const params = [startDate, endDate + ' 23:59:59'];
  let paramIndex = 3;

  if (category) {
    filters += ` AND p.bestbuy_category_code = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  if (product_id) {
    filters += ` AND oi.product_id = $${paramIndex}`;
    params.push(product_id);
    paramIndex++;
  }

  // Summary stats
  const summaryQuery = await pool.query(`
    SELECT
      COUNT(DISTINCT mo.id) as total_orders,
      COALESCE(SUM(mo.total_price_cents), 0) as total_revenue_cents,
      COALESCE(SUM(oi.quantity), 0) as total_units_sold,
      COALESCE(AVG(mo.total_price_cents), 0) as avg_order_value_cents,
      COUNT(DISTINCT mo.customer_email) as unique_customers
    FROM marketplace_orders mo
    LEFT JOIN marketplace_order_items oi ON mo.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE ${filters}
  `, params);

  // Daily breakdown
  const dailyQuery = await pool.query(`
    SELECT
      DATE(mo.order_date) as date,
      COUNT(DISTINCT mo.id) as orders,
      COALESCE(SUM(mo.total_price_cents), 0) as revenue_cents,
      COALESCE(SUM(oi.quantity), 0) as units_sold
    FROM marketplace_orders mo
    LEFT JOIN marketplace_order_items oi ON mo.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE ${filters}
    GROUP BY DATE(mo.order_date)
    ORDER BY date ASC
  `, params);

  // Top products by revenue
  const topProductsQuery = await pool.query(`
    SELECT
      oi.product_id,
      p.name as product_name,
      p.manufacturer,
      COUNT(DISTINCT mo.id) as order_count,
      SUM(oi.quantity) as units_sold,
      SUM(oi.total_price_cents) as revenue_cents
    FROM marketplace_order_items oi
    JOIN marketplace_orders mo ON oi.order_id = mo.id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE ${filters}
    GROUP BY oi.product_id, p.name, p.manufacturer
    ORDER BY revenue_cents DESC
    LIMIT 10
  `, params);

  // Sales by category
  const categoryQuery = await pool.query(`
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      p.bestbuy_category_code as category_code,
      COUNT(DISTINCT mo.id) as order_count,
      SUM(oi.quantity) as units_sold,
      SUM(oi.total_price_cents) as revenue_cents
    FROM marketplace_order_items oi
    JOIN marketplace_orders mo ON oi.order_id = mo.id
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
    WHERE ${filters}
    GROUP BY c.name, p.bestbuy_category_code
    ORDER BY revenue_cents DESC
  `, params);

  res.json({
    summary: summaryQuery.rows[0],
    daily: dailyQuery.rows,
    top_products: topProductsQuery.rows,
    by_category: categoryQuery.rows,
    date_range: { start: startDate, end: endDate }
  });
}));

// Inventory Report - Current Stock and Sync History
router.get('/reports/inventory', authenticate, asyncHandler(async (req, res) => {
  // Current inventory by category
  const inventoryByCategoryQuery = await pool.query(`
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      p.bestbuy_category_code as category_code,
      COUNT(*) as product_count,
      SUM(COALESCE(p.stock_quantity, 0)) as total_stock,
      SUM(CASE WHEN COALESCE(p.stock_quantity, 0) = 0 THEN 1 ELSE 0 END) as out_of_stock_count,
      SUM(CASE WHEN COALESCE(p.stock_quantity, 0) > 0 AND COALESCE(p.stock_quantity, 0) <= 5 THEN 1 ELSE 0 END) as low_stock_count
    FROM products p
    LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
    WHERE p.bestbuy_category_code IS NOT NULL AND p.active = true
    GROUP BY c.name, p.bestbuy_category_code
    ORDER BY total_stock DESC
  `);

  // Overall inventory stats
  const overallStatsQuery = await pool.query(`
    SELECT
      COUNT(*) as total_products,
      SUM(COALESCE(stock_quantity, 0)) as total_stock,
      SUM(CASE WHEN COALESCE(stock_quantity, 0) = 0 THEN 1 ELSE 0 END) as out_of_stock,
      SUM(CASE WHEN COALESCE(stock_quantity, 0) > 0 AND COALESCE(stock_quantity, 0) <= 5 THEN 1 ELSE 0 END) as low_stock,
      SUM(CASE WHEN marketplace_last_synced IS NULL THEN 1 ELSE 0 END) as never_synced,
      SUM(CASE WHEN marketplace_last_synced IS NOT NULL THEN 1 ELSE 0 END) as synced
    FROM products
    WHERE bestbuy_category_code IS NOT NULL AND active = true
  `);

  // Sync history (last 30 syncs)
  const syncHistoryQuery = await pool.query(`
    SELECT
      id,
      job_type,
      status,
      started_at,
      completed_at,
      products_checked,
      products_synced,
      products_failed,
      EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds,
      details
    FROM marketplace_sync_jobs
    ORDER BY started_at DESC
    LIMIT 30
  `);

  // Products never synced
  const neverSyncedQuery = await pool.query(`
    SELECT
      id, name, manufacturer, bestbuy_category_code,
      COALESCE(stock_quantity, 0) as stock_quantity,
      price
    FROM products
    WHERE bestbuy_category_code IS NOT NULL
      AND active = true
      AND marketplace_last_synced IS NULL
    ORDER BY name
    LIMIT 50
  `);

  // Products with recent sync (to show sync coverage)
  const recentlySyncedQuery = await pool.query(`
    SELECT
      COUNT(*) as count,
      MAX(marketplace_last_synced) as last_sync
    FROM products
    WHERE marketplace_last_synced > NOW() - INTERVAL '24 hours'
  `);

  res.json({
    overall: overallStatsQuery.rows[0],
    by_category: inventoryByCategoryQuery.rows,
    sync_history: syncHistoryQuery.rows,
    never_synced: neverSyncedQuery.rows,
    recent_sync: recentlySyncedQuery.rows[0]
  });
}));

// Order Report - All Orders with Filters
router.get('/reports/orders', authenticate, asyncHandler(async (req, res) => {
  const {
    start_date, end_date, status,
    customer_matched, limit = 100, offset = 0
  } = req.query;

  const endDate = end_date || new Date().toISOString().split('T')[0];
  const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let filters = `mo.order_date >= $1 AND mo.order_date <= $2`;
  const params = [startDate, endDate + ' 23:59:59'];
  let paramIndex = 3;

  if (status) {
    filters += ` AND mo.order_state = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (customer_matched === 'true') {
    filters += ` AND mo.customer_id IS NOT NULL`;
  } else if (customer_matched === 'false') {
    filters += ` AND mo.customer_id IS NULL`;
  }

  // Summary by status
  const statusSummaryQuery = await pool.query(`
    SELECT
      order_state,
      COUNT(*) as count,
      SUM(total_price_cents) as total_revenue_cents
    FROM marketplace_orders mo
    WHERE ${filters}
    GROUP BY order_state
    ORDER BY count DESC
  `, params);

  // Orders list
  const ordersQuery = await pool.query(`
    SELECT
      mo.*,
      c.name as customer_name,
      c.email as linked_customer_email,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = mo.id) as item_count
    FROM marketplace_orders mo
    LEFT JOIN customers c ON mo.customer_id = c.id
    WHERE ${filters}
    ORDER BY mo.order_date DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, limit, offset]);

  // Total count
  const countQuery = await pool.query(`
    SELECT COUNT(*) as total FROM marketplace_orders mo WHERE ${filters}
  `, params);

  res.json({
    orders: ordersQuery.rows,
    by_status: statusSummaryQuery.rows,
    total: parseInt(countQuery.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
    date_range: { start: startDate, end: endDate }
  });
}));

// Customer Report - Top Customers and New vs Returning
router.get('/reports/customers', authenticate, asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const endDate = end_date || new Date().toISOString().split('T')[0];
  const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Top customers by marketplace revenue
  const topCustomersQuery = await pool.query(`
    SELECT
      COALESCE(c.name, mo.customer_name) as customer_name,
      COALESCE(c.email, mo.customer_email) as customer_email,
      c.id as customer_id,
      COUNT(DISTINCT mo.id) as order_count,
      SUM(mo.total_price_cents) as total_revenue_cents,
      AVG(mo.total_price_cents) as avg_order_value_cents,
      MIN(mo.order_date) as first_order,
      MAX(mo.order_date) as last_order
    FROM marketplace_orders mo
    LEFT JOIN customers c ON mo.customer_id = c.id
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
    GROUP BY c.name, mo.customer_name, c.email, mo.customer_email, c.id
    ORDER BY total_revenue_cents DESC
    LIMIT 20
  `, [startDate, endDate + ' 23:59:59']);

  // New vs Returning customers (in date range)
  const customerTypeQuery = await pool.query(`
    WITH first_orders AS (
      SELECT
        COALESCE(customer_id::text, customer_email) as customer_key,
        MIN(order_date) as first_order_date
      FROM marketplace_orders
      GROUP BY COALESCE(customer_id::text, customer_email)
    )
    SELECT
      CASE
        WHEN fo.first_order_date >= $1 THEN 'new'
        ELSE 'returning'
      END as customer_type,
      COUNT(DISTINCT COALESCE(mo.customer_id::text, mo.customer_email)) as customer_count,
      COUNT(DISTINCT mo.id) as order_count,
      SUM(mo.total_price_cents) as revenue_cents
    FROM marketplace_orders mo
    JOIN first_orders fo ON COALESCE(mo.customer_id::text, mo.customer_email) = fo.customer_key
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
    GROUP BY CASE WHEN fo.first_order_date >= $1 THEN 'new' ELSE 'returning' END
  `, [startDate, endDate + ' 23:59:59']);

  // Customer match stats
  const matchStatsQuery = await pool.query(`
    SELECT
      customer_match_type,
      COUNT(*) as count
    FROM marketplace_orders
    WHERE order_date >= $1 AND order_date <= $2
    GROUP BY customer_match_type
  `, [startDate, endDate + ' 23:59:59']);

  // Geographic distribution (by shipping province/state)
  const geoQuery = await pool.query(`
    SELECT
      COALESCE(shipping_address->>'state', shipping_address->>'province', 'Unknown') as region,
      COUNT(DISTINCT id) as order_count,
      SUM(total_price_cents) as revenue_cents
    FROM marketplace_orders
    WHERE order_date >= $1 AND order_date <= $2
    GROUP BY COALESCE(shipping_address->>'state', shipping_address->>'province', 'Unknown')
    ORDER BY order_count DESC
    LIMIT 15
  `, [startDate, endDate + ' 23:59:59']);

  res.json({
    top_customers: topCustomersQuery.rows,
    customer_types: customerTypeQuery.rows,
    match_stats: matchStatsQuery.rows,
    geographic: geoQuery.rows,
    date_range: { start: startDate, end: endDate }
  });
}));

// Profit & Margin Report
router.get('/reports/profit', authenticate, asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const endDate = end_date || new Date().toISOString().split('T')[0];
  const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Overall profit metrics
  const overallQuery = await pool.query(`
    SELECT
      COUNT(DISTINCT mo.id) as total_orders,
      SUM(oi.total_price_cents) as total_revenue_cents,
      SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as total_cost_cents,
      SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as total_profit_cents,
      CASE
        WHEN SUM(oi.total_price_cents) > 0
        THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
              SUM(oi.total_price_cents) * 100)
        ELSE 0
      END as overall_margin_percent
    FROM marketplace_orders mo
    JOIN marketplace_order_items oi ON mo.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
  `, [startDate, endDate + ' 23:59:59']);

  // Margin by category
  const marginByCategoryQuery = await pool.query(`
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      p.bestbuy_category_code as category_code,
      COUNT(DISTINCT mo.id) as order_count,
      SUM(oi.quantity) as units_sold,
      SUM(oi.total_price_cents) as revenue_cents,
      SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
      SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
      CASE
        WHEN SUM(oi.total_price_cents) > 0
        THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
              SUM(oi.total_price_cents) * 100)
        ELSE 0
      END as margin_percent
    FROM marketplace_order_items oi
    JOIN marketplace_orders mo ON oi.order_id = mo.id
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
    GROUP BY c.name, p.bestbuy_category_code
    ORDER BY profit_cents DESC
  `, [startDate, endDate + ' 23:59:59']);

  // Margin by product (top 20 by profit, bottom 10 by margin)
  const marginByProductQuery = await pool.query(`
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.manufacturer,
      SUM(oi.quantity) as units_sold,
      SUM(oi.total_price_cents) as revenue_cents,
      SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
      SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
      CASE
        WHEN SUM(oi.total_price_cents) > 0
        THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
              SUM(oi.total_price_cents) * 100)
        ELSE 0
      END as margin_percent
    FROM marketplace_order_items oi
    JOIN marketplace_orders mo ON oi.order_id = mo.id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
    GROUP BY p.id, p.name, p.manufacturer
    ORDER BY profit_cents DESC
    LIMIT 20
  `, [startDate, endDate + ' 23:59:59']);

  // Low margin products (sold items with margin < 15%)
  const lowMarginQuery = await pool.query(`
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.manufacturer,
      SUM(oi.quantity) as units_sold,
      SUM(oi.total_price_cents) as revenue_cents,
      SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
      SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
      CASE
        WHEN SUM(oi.total_price_cents) > 0
        THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
              SUM(oi.total_price_cents) * 100)
        ELSE 0
      END as margin_percent
    FROM marketplace_order_items oi
    JOIN marketplace_orders mo ON oi.order_id = mo.id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
    GROUP BY p.id, p.name, p.manufacturer
    HAVING SUM(oi.total_price_cents) > 0
      AND (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
           SUM(oi.total_price_cents) * 100) < 15
    ORDER BY margin_percent ASC
    LIMIT 20
  `, [startDate, endDate + ' 23:59:59']);

  // Unprofitable products (negative margin)
  const unprofitableQuery = await pool.query(`
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.manufacturer,
      SUM(oi.quantity) as units_sold,
      SUM(oi.total_price_cents) as revenue_cents,
      SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
      SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
      CASE
        WHEN SUM(oi.total_price_cents) > 0
        THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
              SUM(oi.total_price_cents) * 100)
        ELSE 0
      END as margin_percent
    FROM marketplace_order_items oi
    JOIN marketplace_orders mo ON oi.order_id = mo.id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
    GROUP BY p.id, p.name, p.manufacturer
    HAVING SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) < 0
    ORDER BY profit_cents ASC
  `, [startDate, endDate + ' 23:59:59']);

  // Daily profit trend
  const dailyProfitQuery = await pool.query(`
    SELECT
      DATE(mo.order_date) as date,
      SUM(oi.total_price_cents) as revenue_cents,
      SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
      SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents
    FROM marketplace_orders mo
    JOIN marketplace_order_items oi ON mo.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE mo.order_date >= $1 AND mo.order_date <= $2
    GROUP BY DATE(mo.order_date)
    ORDER BY date ASC
  `, [startDate, endDate + ' 23:59:59']);

  res.json({
    overall: overallQuery.rows[0],
    by_category: marginByCategoryQuery.rows,
    top_products: marginByProductQuery.rows,
    low_margin_alerts: lowMarginQuery.rows,
    unprofitable: unprofitableQuery.rows,
    daily_trend: dailyProfitQuery.rows,
    date_range: { start: startDate, end: endDate }
  });
}));

// Reports Dashboard Summary - Quick overview of all reports
router.get('/reports/dashboard', authenticate, asyncHandler(async (req, res) => {
  // Today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayStats = await pool.query(`
    SELECT
      COUNT(*) as orders_today,
      COALESCE(SUM(total_price_cents), 0) as revenue_today_cents
    FROM marketplace_orders
    WHERE DATE(order_date) = $1
  `, [today]);

  // This week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const thisWeekStats = await pool.query(`
    SELECT
      COUNT(*) as orders_week,
      COALESCE(SUM(total_price_cents), 0) as revenue_week_cents
    FROM marketplace_orders
    WHERE order_date >= $1
  `, [weekStart.toISOString().split('T')[0]]);

  // This month
  const monthStart = new Date();
  monthStart.setDate(1);
  const thisMonthStats = await pool.query(`
    SELECT
      COUNT(*) as orders_month,
      COALESCE(SUM(total_price_cents), 0) as revenue_month_cents
    FROM marketplace_orders
    WHERE order_date >= $1
  `, [monthStart.toISOString().split('T')[0]]);

  // Pending orders
  const pendingStats = await pool.query(`
    SELECT
      COUNT(*) as pending_orders,
      COUNT(CASE WHEN order_state = 'WAITING_ACCEPTANCE' THEN 1 END) as waiting_acceptance,
      COUNT(CASE WHEN order_state = 'SHIPPING' THEN 1 END) as needs_shipping
    FROM marketplace_orders
    WHERE order_state IN ('WAITING_ACCEPTANCE', 'SHIPPING')
  `);

  // Inventory alerts
  const inventoryAlerts = await pool.query(`
    SELECT
      SUM(CASE WHEN COALESCE(stock_quantity, 0) = 0 THEN 1 ELSE 0 END) as out_of_stock,
      SUM(CASE WHEN COALESCE(stock_quantity, 0) > 0 AND COALESCE(stock_quantity, 0) <= 5 THEN 1 ELSE 0 END) as low_stock,
      SUM(CASE WHEN marketplace_last_synced IS NULL THEN 1 ELSE 0 END) as never_synced
    FROM products
    WHERE bestbuy_category_code IS NOT NULL AND active = true
  `);

  // Last sync info
  const lastSync = await pool.query(`
    SELECT
      started_at,
      status,
      products_synced,
      products_failed
    FROM marketplace_sync_jobs
    ORDER BY started_at DESC
    LIMIT 1
  `);

  res.json({
    today: todayStats.rows[0],
    this_week: thisWeekStats.rows[0],
    this_month: thisMonthStats.rows[0],
    pending: pendingStats.rows[0],
    inventory_alerts: inventoryAlerts.rows[0],
    last_sync: lastSync.rows[0] || null
  });
}));

// Export Report Data (CSV format)
router.get('/reports/export/:type', authenticate, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { start_date, end_date } = req.query;

  const endDate = end_date || new Date().toISOString().split('T')[0];
  const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let data = [];
  let filename = '';

  switch (type) {
    case 'sales':
      const salesResult = await pool.query(`
        SELECT
          DATE(mo.order_date) as date,
          mo.mirakl_order_id as order_id,
          mo.customer_name,
          mo.customer_email,
          mo.total_price_cents / 100.0 as total_amount,
          mo.order_state as status
        FROM marketplace_orders mo
        WHERE mo.order_date >= $1 AND mo.order_date <= $2
        ORDER BY mo.order_date DESC
      `, [startDate, endDate + ' 23:59:59']);
      data = salesResult.rows;
      filename = `sales_report_${startDate}_to_${endDate}.csv`;
      break;

    case 'inventory':
      const inventoryResult = await pool.query(`
        SELECT
          p.id,
          p.name,
          p.manufacturer,
          p.mirakl_sku as sku,
          c.name as category,
          COALESCE(p.stock_quantity, 0) as stock,
          p.price,
          p.cost,
          p.marketplace_price,
          p.marketplace_last_synced as last_synced
        FROM products p
        LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
        WHERE p.bestbuy_category_code IS NOT NULL AND p.active = true
        ORDER BY p.name
      `);
      data = inventoryResult.rows;
      filename = `inventory_report_${new Date().toISOString().split('T')[0]}.csv`;
      break;

    case 'profit':
      const profitResult = await pool.query(`
        SELECT
          DATE(mo.order_date) as date,
          mo.mirakl_order_id as order_id,
          p.name as product_name,
          oi.quantity,
          oi.unit_price_cents / 100.0 as sale_price,
          COALESCE(p.cost, 0) as unit_cost,
          (oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) / 100.0 as profit,
          CASE
            WHEN oi.unit_price_cents > 0
            THEN ((oi.unit_price_cents - COALESCE(p.cost, 0) * 100)::float / oi.unit_price_cents * 100)
            ELSE 0
          END as margin_percent
        FROM marketplace_order_items oi
        JOIN marketplace_orders mo ON oi.order_id = mo.id
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE mo.order_date >= $1 AND mo.order_date <= $2
        ORDER BY mo.order_date DESC
      `, [startDate, endDate + ' 23:59:59']);
      data = profitResult.rows;
      filename = `profit_report_${startDate}_to_${endDate}.csv`;
      break;

    default:
      throw ApiError.badRequest('Invalid report type');
  }

  // Convert to CSV
  if (data.length === 0) {
    throw ApiError.notFound('Data');
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','))
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvRows.join('\n'));
}));

// ============================================
// ADVANCED FEATURES - BULK OPERATIONS
// ============================================

// Get products for bulk operations (with pagination and filters)
router.get('/bulk/products', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, category, enabled, search } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE p.bestbuy_category_code IS NOT NULL';
  const params = [];
  let paramCount = 0;

  if (category) {
    paramCount++;
    whereClause += ` AND p.bestbuy_category_code = $${paramCount}`;
    params.push(category);
  }

  if (enabled !== undefined) {
    paramCount++;
    whereClause += ` AND COALESCE(p.marketplace_enabled, true) = $${paramCount}`;
    params.push(enabled === 'true');
  }

  if (search) {
    paramCount++;
    whereClause += ` AND (p.name ILIKE $${paramCount} OR p.model ILIKE $${paramCount} OR p.manufacturer ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  const countResult = await pool.query(`
    SELECT COUNT(*) as total FROM products p ${whereClause}
  `, params);

  params.push(limit, offset);
  const productsResult = await pool.query(`
    SELECT
      p.id,
      p.model as sku,
      p.name,
      p.manufacturer,
      COALESCE(p.msrp_cents, 0) / 100.0 as price,
      COALESCE(p.cost_cents, 0) / 100.0 as cost,
      p.stock_quantity,
      p.bestbuy_category_code,
      COALESCE(c.name, 'Unknown') as category_name,
      COALESCE(p.marketplace_enabled, true) as marketplace_enabled,
      p.marketplace_last_synced
    FROM products p
    LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
    ${whereClause}
    ORDER BY p.name
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `, params);

  res.json({
    products: productsResult.rows,
    total: parseInt(countResult.rows[0].total),
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(countResult.rows[0].total / limit)
  });
}));

// Bulk enable/disable products on marketplace
router.post('/bulk/toggle-enabled', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_ids, enabled, user_name = 'System' } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      throw ApiError.badRequest('product_ids array is required');
    }

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ($1, $2, 'in_progress', $3, $4)
      RETURNING id
    `, ['toggle_enabled', product_ids.length, user_name, { enabled, product_ids }]);

    const opId = opLog.rows[0].id;
    let successCount = 0;
    let failCount = 0;

    // Update products
    const result = await client.query(`
      UPDATE products
      SET marketplace_enabled = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2::int[])
      RETURNING id
    `, [enabled, product_ids]);

    successCount = result.rowCount;
    failCount = product_ids.length - successCount;

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    // Add audit log entries
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, entity_id, user_name, new_values, description)
      SELECT 'bulk_toggle_enabled', 'product', id, $1, $2, $3
      FROM unnest($4::int[]) as id
    `, [user_name, JSON.stringify({ enabled }), `Bulk ${enabled ? 'enabled' : 'disabled'} on marketplace`, product_ids]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `${successCount} products ${enabled ? 'enabled' : 'disabled'} successfully`,
      successful: successCount,
      failed: failCount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Bulk category assignment
router.post('/bulk/assign-category', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_ids, category_code, user_name = 'System' } = req.body;

    if (!product_ids || !category_code) {
      throw ApiError.badRequest('product_ids and category_code are required');
    }

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ($1, $2, 'in_progress', $3, $4)
      RETURNING id
    `, ['assign_category', product_ids.length, user_name, { category_code, product_ids }]);

    const opId = opLog.rows[0].id;

    // Update products
    const result = await client.query(`
      UPDATE products
      SET bestbuy_category_code = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2::int[])
      RETURNING id
    `, [category_code, product_ids]);

    const successCount = result.rowCount;
    const failCount = product_ids.length - successCount;

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    // Add audit log entry
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, user_name, new_values, description)
      VALUES ($1, $2, $3, $4, $5)
    `, ['bulk_assign_category', 'product', user_name, JSON.stringify({ category_code, product_count: successCount }), `Assigned category ${category_code} to ${successCount} products`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Category assigned to ${successCount} products`,
      successful: successCount,
      failed: failCount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Bulk price adjustment
router.post('/bulk/adjust-prices', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_ids, adjustment_type, adjustment_value, user_name = 'System' } = req.body;

    if (!product_ids || !adjustment_type || adjustment_value === undefined) {
      throw ApiError.badRequest('product_ids, adjustment_type, and adjustment_value are required');
    }

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ($1, $2, 'in_progress', $3, $4)
      RETURNING id
    `, ['adjust_prices', product_ids.length, user_name, { adjustment_type, adjustment_value }]);

    const opId = opLog.rows[0].id;

    let updateQuery;
    if (adjustment_type === 'percentage') {
      updateQuery = `
        UPDATE products
        SET price = ROUND(price * (1 + $1 / 100), 2), updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
        RETURNING id
      `;
    } else if (adjustment_type === 'fixed') {
      updateQuery = `
        UPDATE products
        SET price = price + $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[]) AND price + $1 >= 0
        RETURNING id
      `;
    } else if (adjustment_type === 'set') {
      updateQuery = `
        UPDATE products
        SET price = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
        RETURNING id
      `;
    } else {
      throw new Error('Invalid adjustment_type');
    }

    const result = await client.query(updateQuery, [adjustment_value, product_ids]);

    const successCount = result.rowCount;
    const failCount = product_ids.length - successCount;

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    // Add audit log entry
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, user_name, new_values, description)
      VALUES ($1, $2, $3, $4, $5)
    `, ['bulk_price_adjustment', 'product', user_name, JSON.stringify({ adjustment_type, adjustment_value }), `Adjusted prices for ${successCount} products (${adjustment_type}: ${adjustment_value})`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Prices adjusted for ${successCount} products`,
      successful: successCount,
      failed: failCount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Export product mappings to CSV
router.get('/bulk/export-mappings', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      p.id,
      p.model,
      p.name,
      p.manufacturer,
      p.msrp_cents,
      p.bestbuy_category_code,
      c.name as category_name,
      COALESCE(p.marketplace_enabled, true) as marketplace_enabled
    FROM products p
    LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
    WHERE p.bestbuy_category_code IS NOT NULL
    ORDER BY p.name
  `);

  const headers = ['id', 'model', 'name', 'manufacturer', 'msrp_cents', 'bestbuy_category_code', 'category_name', 'marketplace_enabled'];
  const csvRows = [
    headers.join(','),
    ...result.rows.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','))
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="product_mappings_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csvRows.join('\n'));
}));

// Import product mappings from CSV
router.post('/bulk/import-mappings', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { mappings, user_name = 'System' } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      throw ApiError.badRequest('mappings array is required');
    }

    await client.query('BEGIN');

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const mapping of mappings) {
      try {
        await client.query(`
          UPDATE products
          SET bestbuy_category_code = $1,
              marketplace_enabled = COALESCE($2, true),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3 OR model = $4
        `, [mapping.bestbuy_category_code, mapping.marketplace_enabled, mapping.id, mapping.model || mapping.sku]);
        successCount++;
      } catch (err) {
        failCount++;
        errors.push({ mapping, error: err.message });
      }
    }

    // Log the operation
    await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, successful_items, failed_items, status, user_name, details)
      VALUES ($1, $2, $3, $4, 'completed', $5, $6)
    `, ['import_mappings', mappings.length, successCount, failCount, user_name, JSON.stringify({ errors })]);

    // Add audit log entry
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, user_name, description)
      VALUES ($1, $2, $3, $4)
    `, ['bulk_import_mappings', 'product', user_name, `Imported ${successCount} mappings, ${failCount} failed`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Imported ${successCount} mappings, ${failCount} failed`,
      successful: successCount,
      failed: failCount,
      errors: errors.slice(0, 10)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Get bulk operations history
router.get('/bulk/history', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  const result = await pool.query(`
    SELECT * FROM bulk_operations_log
    ORDER BY started_at DESC
    LIMIT $1
  `, [limit]);

  res.json(result.rows);
}));

// ============================================
// SYNC ERROR MANAGEMENT
// ============================================

// Get sync errors (with filters)
router.get('/errors', authenticate, asyncHandler(async (req, res) => {
  const { status = 'all', error_type, product_id, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (status !== 'all') {
    paramCount++;
    whereClause += ` AND e.status = $${paramCount}`;
    params.push(status);
  }

  if (error_type) {
    paramCount++;
    whereClause += ` AND e.error_type = $${paramCount}`;
    params.push(error_type);
  }

  if (product_id) {
    paramCount++;
    whereClause += ` AND e.product_id = $${paramCount}`;
    params.push(product_id);
  }

  const countResult = await pool.query(`
    SELECT COUNT(*) as total FROM marketplace_sync_errors e ${whereClause}
  `, params);

  params.push(limit, offset);
  const errorsResult = await pool.query(`
    SELECT
      e.*,
      p.description as product_name,
      p.name as product_sku_ref
    FROM marketplace_sync_errors e
    LEFT JOIN products p ON e.product_id = p.id
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `, params);

  // Get error type summary
  const typeSummary = await pool.query(`
    SELECT error_type, COUNT(*) as count
    FROM marketplace_sync_errors
    WHERE ignored = false
    GROUP BY error_type
    ORDER BY count DESC
  `);

  res.json({
    errors: errorsResult.rows,
    total: parseInt(countResult.rows[0].total),
    page: parseInt(page),
    limit: parseInt(limit),
    by_type: typeSummary.rows
  });
}));

// Retry failed sync
router.post('/errors/:id/retry', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Get the error details
    const errorResult = await client.query(`
      SELECT * FROM marketplace_sync_errors WHERE id = $1
    `, [id]);

    if (errorResult.rows.length === 0) {
      throw ApiError.notFound('Error');
    }

    const syncError = errorResult.rows[0];

    if (syncError.retry_count >= syncError.max_retries) {
      throw ApiError.badRequest('Maximum retries exceeded');
    }

    // Update retry count
    await client.query(`
      UPDATE marketplace_sync_errors
      SET retry_count = retry_count + 1, status = 'retrying'
      WHERE id = $1
    `, [id]);

    // Here you would trigger the actual sync retry
    // For now, we'll simulate success after a delay
    // In production, this would call the actual sync service

    // Mark as resolved (in production, this would be done by the sync service)
    await client.query(`
      UPDATE marketplace_sync_errors
      SET status = 'pending', resolved_at = NULL
      WHERE id = $1
    `, [id]);

    res.json({ success: true, message: 'Retry initiated' });
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}));

// Ignore/dismiss error
router.post('/errors/:id/ignore', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_name = 'System' } = req.body;

  await pool.query(`
    UPDATE marketplace_sync_errors
    SET ignored = true, ignored_at = CURRENT_TIMESTAMP, ignored_by = $1, status = 'ignored'
    WHERE id = $2
  `, [user_name, id]);

  res.json({ success: true, message: 'Error ignored' });
}));

// Bulk ignore errors
router.post('/errors/bulk-ignore', authenticate, asyncHandler(async (req, res) => {
  const { error_ids, user_name = 'System' } = req.body;

  const result = await pool.query(`
    UPDATE marketplace_sync_errors
    SET ignored = true, ignored_at = CURRENT_TIMESTAMP, ignored_by = $1, status = 'ignored'
    WHERE id = ANY($2::int[])
  `, [user_name, error_ids]);

  res.json({ success: true, message: `${result.rowCount} errors ignored` });
}));

// ============================================
// COMPETITOR PRICE TRACKING
// ============================================

// Get competitor prices for a product
router.get('/competitors/:productId', authenticate, asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const result = await pool.query(`
    SELECT cp.*, p.name as product_name, p.price as our_price
    FROM competitor_prices cp
    JOIN products p ON cp.product_id = p.id
    WHERE cp.product_id = $1
    ORDER BY cp.last_checked DESC
  `, [productId]);

  res.json(result.rows);
}));

// Add/Update competitor price
router.post('/competitors', authenticate, asyncHandler(async (req, res) => {
  const { product_id, competitor_name, competitor_price, competitor_url, notes } = req.body;

  // Get our price for comparison
  const productResult = await pool.query(`SELECT price FROM products WHERE id = $1`, [product_id]);
  if (productResult.rows.length === 0) {
    throw ApiError.notFound('Product');
  }

  const ourPrice = parseFloat(productResult.rows[0].price);
  const theirPrice = parseFloat(competitor_price);
  const priceDifference = ourPrice - theirPrice;
  const isLower = theirPrice < ourPrice;

  const result = await pool.query(`
    INSERT INTO competitor_prices (product_id, competitor_name, competitor_price, competitor_url, notes, price_difference, is_lower)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      competitor_price = EXCLUDED.competitor_price,
      competitor_url = EXCLUDED.competitor_url,
      notes = EXCLUDED.notes,
      price_difference = EXCLUDED.price_difference,
      is_lower = EXCLUDED.is_lower,
      last_checked = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [product_id, competitor_name, theirPrice, competitor_url, notes, priceDifference, isLower]);

  res.json(result.rows[0]);
}));

// Get all products with lower competitor prices
router.get('/competitors/alerts/lower-prices', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      cp.*,
      p.description as product_name,
      p.name as product_sku,
      p.price as our_price
    FROM competitor_prices cp
    JOIN products p ON cp.product_id = p.id
    WHERE cp.is_lower = true
    ORDER BY cp.price_difference ASC
  `);

  res.json(result.rows);
}));

// ============================================
// MARKETPLACE HEALTH SCORE
// ============================================

// Calculate and get current health score
router.get('/health-score', authenticate, asyncHandler(async (req, res) => {
  // Calculate metrics
  const syncStats = await pool.query(`
    SELECT
      COUNT(*) as total_syncs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_syncs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_syncs
    FROM marketplace_sync_jobs
    WHERE started_at >= NOW() - INTERVAL '7 days'
  `);

  const orderStats = await pool.query(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN order_state IN ('SHIPPED', 'DELIVERED') THEN 1 ELSE 0 END) as fulfilled_orders,
      SUM(CASE WHEN order_state IN ('CANCELLED', 'REFUNDED') THEN 1 ELSE 0 END) as cancelled_orders
    FROM marketplace_orders
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `);

  const inventoryStats = await pool.query(`
    SELECT
      COUNT(*) as total_products,
      SUM(CASE WHEN marketplace_last_synced IS NOT NULL AND marketplace_last_synced >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as in_sync,
      SUM(CASE WHEN marketplace_last_synced IS NULL OR marketplace_last_synced < NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as out_of_sync
    FROM products
    WHERE bestbuy_category_code IS NOT NULL AND COALESCE(marketplace_enabled, true) = true
  `);

  const sync = syncStats.rows[0];
  const orders = orderStats.rows[0];
  const inventory = inventoryStats.rows[0];

  // Calculate individual scores (0-100) with proper NaN handling
  const totalSyncs = parseInt(sync.total_syncs) || 0;
  const successfulSyncs = parseInt(sync.successful_syncs) || 0;
  const failedSyncs = parseInt(sync.failed_syncs) || 0;
  const syncSuccessRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 100;

  const totalOrders = parseInt(orders.total_orders) || 0;
  const fulfilledOrders = parseInt(orders.fulfilled_orders) || 0;
  const cancelledOrders = parseInt(orders.cancelled_orders) || 0;
  const fulfillmentRate = totalOrders > 0 ? (fulfilledOrders / totalOrders) * 100 : 100;

  const totalProducts = parseInt(inventory.total_products) || 0;
  const inSync = parseInt(inventory.in_sync) || 0;
  const outOfSync = parseInt(inventory.out_of_sync) || 0;
  const inventoryAccuracy = totalProducts > 0 ? (inSync / totalProducts) * 100 : 100;

  // Calculate overall health score (weighted average) - ensure it's a valid number
  const overallScore = Math.round(
    (syncSuccessRate * 0.3) +
    (fulfillmentRate * 0.4) +
    (inventoryAccuracy * 0.3)
  ) || 100;

  // Generate recommendations
  const recommendations = [];
  if (syncSuccessRate < 90) {
    recommendations.push({ type: 'sync', message: 'Sync success rate is below 90%. Check sync error logs for recurring issues.', priority: 'high' });
  }
  if (fulfillmentRate < 95) {
    recommendations.push({ type: 'orders', message: 'Order fulfillment rate is below 95%. Review cancelled orders for patterns.', priority: 'medium' });
  }
  if (inventoryAccuracy < 80) {
    recommendations.push({ type: 'inventory', message: 'Over 20% of products are out of sync. Consider running a full inventory sync.', priority: 'high' });
  }
  if (outOfSync > 100) {
    recommendations.push({ type: 'inventory', message: `${outOfSync} products haven't synced in 24 hours.`, priority: 'medium' });
  }

  // Store the metrics
  await pool.query(`
    INSERT INTO marketplace_health_metrics (
      metric_date, sync_success_rate, order_fulfillment_rate, inventory_accuracy,
      total_sync_attempts, successful_syncs, failed_syncs,
      total_orders, fulfilled_orders, cancelled_orders,
      products_in_sync, products_out_of_sync, overall_health_score, recommendations
    ) VALUES (
      CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    ON CONFLICT (metric_date) DO UPDATE SET
      sync_success_rate = EXCLUDED.sync_success_rate,
      order_fulfillment_rate = EXCLUDED.order_fulfillment_rate,
      inventory_accuracy = EXCLUDED.inventory_accuracy,
      total_sync_attempts = EXCLUDED.total_sync_attempts,
      successful_syncs = EXCLUDED.successful_syncs,
      failed_syncs = EXCLUDED.failed_syncs,
      total_orders = EXCLUDED.total_orders,
      fulfilled_orders = EXCLUDED.fulfilled_orders,
      cancelled_orders = EXCLUDED.cancelled_orders,
      products_in_sync = EXCLUDED.products_in_sync,
      products_out_of_sync = EXCLUDED.products_out_of_sync,
      overall_health_score = EXCLUDED.overall_health_score,
      recommendations = EXCLUDED.recommendations,
      updated_at = CURRENT_TIMESTAMP
  `, [
    syncSuccessRate, fulfillmentRate, inventoryAccuracy,
    totalSyncs, successfulSyncs, failedSyncs,
    totalOrders, fulfilledOrders, cancelledOrders,
    inSync, outOfSync, overallScore, JSON.stringify(recommendations)
  ]);

  res.json({
    overall_score: overallScore,
    status: overallScore >= 80 ? 'healthy' : overallScore >= 60 ? 'warning' : 'critical',
    metrics: {
      sync_success_rate: Math.round(syncSuccessRate),
      order_fulfillment_rate: Math.round(fulfillmentRate),
      inventory_accuracy: Math.round(inventoryAccuracy)
    },
    details: {
      sync: {
        total: totalSyncs,
        successful: successfulSyncs,
        failed: failedSyncs
      },
      orders: {
        total: totalOrders,
        fulfilled: fulfilledOrders,
        cancelled: cancelledOrders
      },
      inventory: {
        total: totalProducts,
        in_sync: inSync,
        out_of_sync: outOfSync
      }
    },
    recommendations,
    calculated_at: new Date().toISOString()
  });
}));

// Get health score history
router.get('/health-score/history', authenticate, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  const result = await pool.query(`
    SELECT * FROM marketplace_health_metrics
    WHERE metric_date >= CURRENT_DATE - $1::int
    ORDER BY metric_date DESC
  `, [days]);

  res.json(result.rows);
}));

// ============================================
// AUDIT LOG
// ============================================

// Get audit log entries
router.get('/audit-log', authenticate, asyncHandler(async (req, res) => {
  const { action_type, entity_type, user_name, page = 1, limit = 50, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (action_type) {
    paramCount++;
    whereClause += ` AND action_type = $${paramCount}`;
    params.push(action_type);
  }

  if (entity_type) {
    paramCount++;
    whereClause += ` AND entity_type = $${paramCount}`;
    params.push(entity_type);
  }

  if (user_name) {
    paramCount++;
    whereClause += ` AND user_name ILIKE $${paramCount}`;
    params.push(`%${user_name}%`);
  }

  if (start_date) {
    paramCount++;
    whereClause += ` AND created_at >= $${paramCount}`;
    params.push(start_date);
  }

  if (end_date) {
    paramCount++;
    whereClause += ` AND created_at <= $${paramCount}`;
    params.push(end_date + ' 23:59:59');
  }

  const countResult = await pool.query(`
    SELECT COUNT(*) as total FROM marketplace_audit_log ${whereClause}
  `, params);

  params.push(limit, offset);
  const logsResult = await pool.query(`
    SELECT * FROM marketplace_audit_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `, params);

  // Get action type summary
  const actionSummary = await pool.query(`
    SELECT action_type, COUNT(*) as count
    FROM marketplace_audit_log
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY action_type
    ORDER BY count DESC
  `);

  res.json({
    entries: logsResult.rows,
    total: parseInt(countResult.rows[0].total),
    page: parseInt(page),
    limit: parseInt(limit),
    action_types: actionSummary.rows
  });
}));

// Add audit log entry (utility endpoint)
router.post('/audit-log', authenticate, asyncHandler(async (req, res) => {
  const { action_type, entity_type, entity_id, entity_name, user_name, old_values, new_values, description } = req.body;

  const result = await pool.query(`
    INSERT INTO marketplace_audit_log
    (action_type, entity_type, entity_id, entity_name, user_name, old_values, new_values, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [action_type, entity_type, entity_id, entity_name, user_name || 'System', old_values, new_values, description]);

  res.json(result.rows[0]);
}));

// ============================================
// RETURNS MANAGEMENT
// ============================================

// Get all returns with filtering and pagination
router.get('/returns', authenticate, asyncHandler(async (req, res) => {
  const { status, return_type, start_date, end_date, customer_email, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT r.*, mo.mirakl_order_id as order_mirakl_id, mo.customer_name, mo.total_price_cents as order_total
    FROM marketplace_returns r
    LEFT JOIN marketplace_orders mo ON r.order_id = mo.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND r.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (return_type) {
    query += ` AND r.return_type = $${paramIndex}`;
    params.push(return_type);
    paramIndex++;
  }

  if (start_date) {
    query += ` AND r.created_at >= $${paramIndex}`;
    params.push(start_date);
    paramIndex++;
  }

  if (end_date) {
    query += ` AND r.created_at <= $${paramIndex}`;
    params.push(end_date);
    paramIndex++;
  }

  if (customer_email) {
    query += ` AND r.customer_email ILIKE $${paramIndex}`;
    params.push(`%${customer_email}%`);
    paramIndex++;
  }

  // Get count before pagination — build count query from same WHERE conditions
  let countQuery = `SELECT COUNT(*) as total FROM marketplace_returns r LEFT JOIN marketplace_orders mo ON r.order_id = mo.id WHERE 1=1`;
  if (status) countQuery += ` AND r.status = $${params.indexOf(status) + 1}`;
  if (return_type) countQuery += ` AND r.return_type = $${params.indexOf(return_type) + 1}`;
  if (start_date) countQuery += ` AND r.created_at >= $${params.indexOf(start_date) + 1}`;
  if (end_date) countQuery += ` AND r.created_at <= $${params.indexOf(end_date) + 1}`;
  if (customer_email) countQuery += ` AND r.customer_email ILIKE $${params.indexOf(`%${customer_email}%`) + 1}`;
  const countResult = await pool.query(countQuery, params);

  query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Get status summary
  const statusSummary = await pool.query(`
    SELECT status, COUNT(*) as count
    FROM marketplace_returns
    GROUP BY status
  `);

  res.json({
    returns: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset),
    status_summary: statusSummary.rows
  });
}));

// Get single return with items (numeric IDs only — let /returns/stats, /returns/analytics, /returns/rules pass through)
router.get('/returns/:id', authenticate, (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next('route');
  next();
}, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const returnQuery = await pool.query(`
    SELECT r.*, mo.mirakl_order_id, mo.customer_name, mo.order_lines, mo.total_price_cents as order_total
    FROM marketplace_returns r
    LEFT JOIN marketplace_orders mo ON r.order_id = mo.id
    WHERE r.id = $1
  `, [id]);

  if (returnQuery.rows.length === 0) {
    throw ApiError.notFound('Return');
  }

  // Get return items
  const itemsQuery = await pool.query(`
    SELECT ri.*, p.name as product_name, p.model as product_model
    FROM marketplace_return_items ri
    LEFT JOIN products p ON ri.product_id = p.id
    WHERE ri.return_id = $1
  `, [id]);

  // Get return history
  const historyQuery = await pool.query(`
    SELECT * FROM marketplace_return_history
    WHERE return_id = $1
    ORDER BY created_at DESC
  `, [id]);

  // Get associated refunds
  const refundsQuery = await pool.query(`
    SELECT * FROM marketplace_refunds
    WHERE return_id = $1
    ORDER BY created_at DESC
  `, [id]);

  const returnData = returnQuery.rows[0];
  returnData.items = itemsQuery.rows;
  returnData.history = historyQuery.rows;
  returnData.refunds = refundsQuery.rows;

  res.json(returnData);
}));

// Create a new return request
router.post('/returns', authenticate, validateJoi(marketplaceSchemas.createReturn), asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { order_id, return_type, return_reason, return_reason_detail, items, notes } = req.body;

    await client.query('BEGIN');

    // Get order details
    const orderQuery = await client.query(
      'SELECT * FROM marketplace_orders WHERE id = $1',
      [order_id]
    );

    if (orderQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Order');
    }

    const order = orderQuery.rows[0];

    // Generate return number
    const returnNumber = generateReturnNumber();

    // Calculate total refund
    let totalRefundCents = 0;
    for (const item of items) {
      totalRefundCents += item.quantity_returned * (item.unit_price_cents || 0);
    }

    // Create return record
    const returnResult = await client.query(`
      INSERT INTO marketplace_returns
      (return_number, order_id, mirakl_order_id, customer_name, customer_email,
       return_type, return_reason, return_reason_detail, status, total_refund_cents, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
      RETURNING *
    `, [
      returnNumber,
      order_id,
      order.mirakl_order_id,
      order.customer_name,
      order.customer_email,
      return_type,
      return_reason,
      return_reason_detail,
      totalRefundCents,
      notes
    ]);

    const returnRecord = returnResult.rows[0];

    // Create return items
    for (const item of items) {
      await client.query(`
        INSERT INTO marketplace_return_items
        (return_id, order_item_id, product_id, product_sku, quantity_ordered, quantity_returned,
         unit_price_cents, refund_amount_cents, condition, reason, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        returnRecord.id,
        item.order_item_id,
        item.product_id,
        item.product_sku,
        item.quantity_ordered || item.quantity_returned,
        item.quantity_returned,
        item.unit_price_cents || 0,
        item.quantity_returned * (item.unit_price_cents || 0),
        item.condition || 'unknown',
        item.reason,
        item.notes
      ]);
    }

    // Add to return history
    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'System', 'Return request created')
    `, [returnRecord.id]);

    // Create notification
    await client.query(`
      INSERT INTO marketplace_notifications
      (type, title, message, order_id, mirakl_order_id, priority)
      VALUES ('return_request', 'New Return Request', $1, $2, $3, 'high')
    `, [
      `Return request ${returnNumber} created for order ${order.mirakl_order_id}`,
      order_id,
      order.mirakl_order_id
    ]);

    // Add audit log
    await client.query(`
      INSERT INTO marketplace_audit_log
      (action_type, entity_type, entity_id, entity_name, user_name, new_values, description)
      VALUES ('create', 'return', $1, $2, 'System', $3, $4)
    `, [
      returnRecord.id,
      returnNumber,
      JSON.stringify({ return_type, return_reason, items_count: items.length }),
      `Created return request for order ${order.mirakl_order_id}`
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      return: returnRecord,
      message: `Return request ${returnNumber} created successfully`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Update return status
router.put('/returns/:id', authenticate, validateJoi(marketplaceSchemas.updateReturn), asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, received_date, tracking_number, carrier_code, notes, internal_notes, restocking_fee_cents } = req.body;

    await client.query('BEGIN');

    // Get current return
    const currentReturn = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (currentReturn.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Return');
    }

    const oldReturn = currentReturn.rows[0];

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (received_date !== undefined) {
      updates.push(`received_date = $${paramIndex}`);
      params.push(received_date);
      paramIndex++;
    }
    if (tracking_number !== undefined) {
      updates.push(`tracking_number = $${paramIndex}`);
      params.push(tracking_number);
      paramIndex++;
    }
    if (carrier_code !== undefined) {
      updates.push(`carrier_code = $${paramIndex}`);
      params.push(carrier_code);
      paramIndex++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }
    if (internal_notes !== undefined) {
      updates.push(`internal_notes = $${paramIndex}`);
      params.push(internal_notes);
      paramIndex++;
    }
    if (restocking_fee_cents !== undefined) {
      updates.push(`restocking_fee_cents = $${paramIndex}`);
      params.push(restocking_fee_cents);
      paramIndex++;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (status === 'processed') {
      updates.push('processed_date = CURRENT_TIMESTAMP');
    }

    params.push(id);

    const result = await client.query(`
      UPDATE marketplace_returns
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

    // Log status change in history
    if (status && status !== oldReturn.status) {
      await client.query(`
        INSERT INTO marketplace_return_history
        (return_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, $2, $3, 'System', $4)
      `, [id, oldReturn.status, status, `Status changed from ${oldReturn.status} to ${status}`]);
    }

    // Add audit log
    await client.query(`
      INSERT INTO marketplace_audit_log
      (action_type, entity_type, entity_id, entity_name, user_name, old_values, new_values, description)
      VALUES ('update', 'return', $1, $2, 'System', $3, $4, $5)
    `, [
      id,
      oldReturn.return_number,
      JSON.stringify({ status: oldReturn.status }),
      JSON.stringify({ status }),
      `Updated return ${oldReturn.return_number}`
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      return: result.rows[0],
      message: 'Return updated successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Approve a return
router.post('/returns/:id/approve', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { notes } = req.body;

    await client.query('BEGIN');

    const returnQuery = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (returnQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Return');
    }

    const returnRecord = returnQuery.rows[0];

    if (returnRecord.status !== 'pending') {
      await client.query('ROLLBACK');
      throw ApiError.badRequest(`Cannot approve return in ${returnRecord.status} status`);
    }

    await client.query(`
      UPDATE marketplace_returns
      SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'approved', 'System', $2)
    `, [id, notes || 'Return approved']);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Return approved successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Reject a return
router.post('/returns/:id/reject', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    await client.query('BEGIN');

    const returnQuery = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (returnQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Return');
    }

    const returnRecord = returnQuery.rows[0];

    if (returnRecord.status !== 'pending') {
      await client.query('ROLLBACK');
      throw ApiError.badRequest(`Cannot reject return in ${returnRecord.status} status`);
    }

    await client.query(`
      UPDATE marketplace_returns
      SET status = 'rejected', internal_notes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id, reason || notes]);

    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'rejected', 'System', $2)
    `, [id, reason || 'Return rejected']);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Return rejected'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Mark return as received
router.post('/returns/:id/receive', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { condition_notes, items_condition } = req.body;

    await client.query('BEGIN');

    const returnQuery = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (returnQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Return');
    }

    const returnRecord = returnQuery.rows[0];

    if (!['approved', 'pending'].includes(returnRecord.status)) {
      await client.query('ROLLBACK');
      throw ApiError.badRequest(`Cannot receive return in ${returnRecord.status} status`);
    }

    await client.query(`
      UPDATE marketplace_returns
      SET status = 'received', received_date = CURRENT_TIMESTAMP,
          internal_notes = COALESCE(internal_notes, '') || $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id, condition_notes ? `\nReceived: ${condition_notes}` : '']);

    // Update item conditions if provided
    if (items_condition && Array.isArray(items_condition)) {
      for (const item of items_condition) {
        await client.query(`
          UPDATE marketplace_return_items
          SET condition = $2, notes = COALESCE(notes, '') || $3, restockable = $4
          WHERE id = $1
        `, [item.id, item.condition, item.notes || '', item.restockable !== false]);
      }
    }

    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, $2, 'received', 'System', 'Return items received')
    `, [id, returnRecord.status]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Return marked as received'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================
// REFUNDS MANAGEMENT
// ============================================

// Get all refunds
router.get('/refunds', authenticate, asyncHandler(async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT rf.*, r.return_number, mo.mirakl_order_id, mo.customer_name
    FROM marketplace_refunds rf
    LEFT JOIN marketplace_returns r ON rf.return_id = r.id
    LEFT JOIN marketplace_orders mo ON rf.order_id = mo.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND rf.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY rf.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Get count
  const countQuery = 'SELECT COUNT(*) as total FROM marketplace_refunds' +
    (status ? ' WHERE status = $1' : '');
  const countParams = status ? [status] : [];
  const countResult = await pool.query(countQuery, countParams);

  res.json({
    refunds: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

// Process a refund
router.post('/refunds', authenticate, validateJoi(marketplaceSchemas.processRefund), asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { return_id, order_id, refund_type, amount_cents, reason, notes } = req.body;

    await client.query('BEGIN');

    // Generate refund number
    const refundNumber = generateRefundNumber();

    // Create refund record
    const result = await client.query(`
      INSERT INTO marketplace_refunds
      (refund_number, return_id, order_id, refund_type, status, amount_cents, reason, notes)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
      RETURNING *
    `, [refundNumber, return_id, order_id, refund_type, amount_cents, reason, notes]);

    const refund = result.rows[0];

    // If linked to a return, update return status
    if (return_id) {
      await client.query(`
        UPDATE marketplace_returns
        SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [return_id]);

      await client.query(`
        INSERT INTO marketplace_return_history
        (return_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, 'processed', 'refunded', 'System', $2)
      `, [return_id, `Refund ${refundNumber} created for $${(amount_cents / 100).toFixed(2)}`]);
    }

    // Create notification
    await client.query(`
      INSERT INTO marketplace_notifications
      (type, title, message, order_id, priority)
      VALUES ('refund_created', 'Refund Processed', $1, $2, 'normal')
    `, [
      `Refund ${refundNumber} for $${(amount_cents / 100).toFixed(2)} created`,
      order_id
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      refund,
      message: `Refund ${refundNumber} created successfully`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Update refund status (mark as processed)
router.put('/refunds/:id/process', authenticate, asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { transaction_id, processed_by } = req.body;

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE marketplace_refunds
      SET status = 'processed',
          transaction_id = $2,
          processed_by = $3,
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, transaction_id, processed_by || 'System']);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Refund');
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      refund: result.rows[0],
      message: 'Refund marked as processed'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Get return settings
router.get('/return-settings', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT setting_key, setting_value, description
    FROM marketplace_order_settings
    WHERE setting_key LIKE 'return%' OR setting_key LIKE 'refund%' OR setting_key LIKE 'restocking%'
  `);

  // Convert to object for easier access
  const settings = {};
  result.rows.forEach(row => {
    settings[row.setting_key] = {
      ...row.setting_value,
      description: row.description
    };
  });

  res.json(settings);
}));

// Update return settings
router.put('/return-settings/:key', authenticate, asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  const result = await pool.query(`
    UPDATE marketplace_order_settings
    SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
    WHERE setting_key = $1
    RETURNING *
  `, [key, JSON.stringify(value)]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Setting');
  }

  res.json({
    success: true,
    setting: result.rows[0]
  });
}));

// Returns analytics/dashboard
router.get('/returns/analytics', authenticate, asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  let dateFilter = '';
  const params = [];

  if (start_date) {
    params.push(start_date);
    dateFilter += ` AND created_at >= $${params.length}`;
  }
  if (end_date) {
    params.push(end_date);
    dateFilter += ` AND created_at <= $${params.length}`;
  }

  // Total returns by status
  const statusBreakdown = await pool.query(`
    SELECT status, COUNT(*) as count, SUM(total_refund_cents) as total_value
    FROM marketplace_returns
    WHERE 1=1 ${dateFilter}
    GROUP BY status
  `, params);

  // Returns by reason
  const reasonBreakdown = await pool.query(`
    SELECT return_reason, COUNT(*) as count
    FROM marketplace_returns
    WHERE 1=1 ${dateFilter}
    GROUP BY return_reason
    ORDER BY count DESC
    LIMIT 10
  `, params);

  // Total refunds processed
  const refundStats = await pool.query(`
    SELECT
      COUNT(*) as total_refunds,
      SUM(CASE WHEN status = 'processed' THEN amount_cents ELSE 0 END) as processed_amount,
      SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) as pending_amount
    FROM marketplace_refunds
    WHERE 1=1 ${dateFilter.replace(/created_at/g, 'created_at')}
  `, params);

  // Average processing time
  const processingTime = await pool.query(`
    SELECT AVG(EXTRACT(EPOCH FROM (processed_date - created_at)) / 86400) as avg_days
    FROM marketplace_returns
    WHERE processed_date IS NOT NULL ${dateFilter}
  `, params);

  res.json({
    status_breakdown: statusBreakdown.rows,
    reason_breakdown: reasonBreakdown.rows,
    refund_stats: refundStats.rows[0],
    avg_processing_days: processingTime.rows[0]?.avg_days || 0
  });
}));

// ============================================
// ADDITIONAL BULK OPERATIONS
// ============================================

// Bulk create shipments
router.post('/bulk/shipments', authenticate, validateJoi(marketplaceSchemas.bulkShipment), asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { shipments } = req.body;

    await client.query('BEGIN');

    const results = {
      total: shipments.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const shipment of shipments) {
      try {
        // Get order
        const orderQuery = await client.query(
          'SELECT * FROM marketplace_orders WHERE id = $1',
          [shipment.order_id]
        );

        if (orderQuery.rows.length === 0) {
          results.failed++;
          results.errors.push({ order_id: shipment.order_id, error: 'Order not found' });
          continue;
        }

        const order = orderQuery.rows[0];

        // Create shipment on Mirakl (if service is available)
        try {
          await miraklService.createShipment({
            order_id: order.mirakl_order_id,
            tracking_number: shipment.tracking_number,
            carrier_code: shipment.carrier_code,
            carrier_name: shipment.carrier_name
          });
        } catch (miraklError) {
          console.warn(`⚠️ Mirakl shipment sync failed for order ${shipment.order_id}:`, miraklError.message);
        }

        // Save shipment to database
        await client.query(`
          INSERT INTO marketplace_shipments
          (order_id, tracking_number, carrier_code, carrier_name, shipment_date, shipment_status)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'SHIPPED')
        `, [shipment.order_id, shipment.tracking_number, shipment.carrier_code, shipment.carrier_name]);

        // Update order status
        await client.query(`
          UPDATE marketplace_orders
          SET order_state = 'SHIPPED', shipped_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [shipment.order_id]);

        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({ order_id: shipment.order_id, error: error.message });
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      ...results
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Bulk stock update
router.post('/bulk/stock-update', authenticate, validateJoi(marketplaceSchemas.bulkStockUpdate), asyncHandler(async (req, res) => {
  const client = await pool.connect();

  try {
    const { updates, user_name = 'System' } = req.body;

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ('stock_update', $1, 'in_progress', $2, $3)
      RETURNING id
    `, [updates.length, user_name, JSON.stringify({ updates_count: updates.length })]);

    const opId = opLog.rows[0].id;
    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
      try {
        await client.query(`
          UPDATE products
          SET stock = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [update.quantity, update.product_id]);
        successCount++;
      } catch {
        failCount++;
      }
    }

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Stock updated for ${successCount} products`,
      successful: successCount,
      failed: failCount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================
// COMMISSION RATES
// ============================================

// List all commission rates
router.get('/commission-rates', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT id, category_path, category_leaf, commission_pct, item_condition, created_at
    FROM marketplace_commission_rates
    ORDER BY category_path
  `);
  res.json({ rates: result.rows, total: result.rows.length });
}));

// Apply expected commission rates to all existing order items
router.post('/commission-rates/apply-to-orders', authenticate, asyncHandler(async (req, res) => {
  // Update items that have a category_label matching a commission rate leaf
  const exactResult = await pool.query(`
    UPDATE marketplace_order_items oi
    SET expected_commission_rate = cr.commission_pct,
        updated_at = CURRENT_TIMESTAMP
    FROM marketplace_commission_rates cr
    WHERE LOWER(oi.category_label) = LOWER(cr.category_leaf)
      AND oi.category_label IS NOT NULL
  `);

  // For items without an exact leaf match, try partial path match
  const partialResult = await pool.query(`
    UPDATE marketplace_order_items oi
    SET expected_commission_rate = sub.commission_pct,
        updated_at = CURRENT_TIMESTAMP
    FROM (
      SELECT DISTINCT ON (oi2.id) oi2.id, cr2.commission_pct
      FROM marketplace_order_items oi2
      JOIN marketplace_commission_rates cr2
        ON LOWER(cr2.category_path) LIKE '%' || LOWER(oi2.category_label) || '%'
      WHERE oi2.category_label IS NOT NULL
        AND oi2.expected_commission_rate IS NULL
      ORDER BY oi2.id, LENGTH(cr2.category_path) DESC
    ) sub
    WHERE oi.id = sub.id
  `);

  const totalUpdated = (exactResult.rowCount || 0) + (partialResult.rowCount || 0);

  // Get summary of what was matched vs unmatched
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_items,
      COUNT(expected_commission_rate) as matched,
      COUNT(*) - COUNT(expected_commission_rate) as unmatched
    FROM marketplace_order_items
    WHERE category_label IS NOT NULL
  `);

  res.json({
    success: true,
    updated: totalUpdated,
    exactMatches: exactResult.rowCount || 0,
    partialMatches: partialResult.rowCount || 0,
    stats: stats.rows[0]
  });
}));

// ============================================
// CHANNEL MANAGEMENT
// ============================================

// List all channels (active and inactive)
router.get('/channels', authenticate, asyncHandler(async (req, res) => {
  const manager = await getChannelManager();
  const channels = await manager.listChannels();

  // Augment each channel with adapter status
  const result = channels.map(ch => ({
    ...ch,
    adapterLoaded: manager.hasAdapter(ch.id),
    features: manager.hasAdapter(ch.id) ? manager.getAdapter(ch.id).getFeatures() : null
  }));

  res.json({ channels: result, total: result.length });
}));

// Cross-channel dashboard stats (BEFORE :channelId param route)
router.get('/channels/dashboard', authenticate, asyncHandler(async (req, res) => {
  const manager = await getChannelManager();
  const stats = await manager.getDashboardStats();
  const recentSyncs = await manager.getRecentSyncActivity(10);

  res.json({ channels: stats, recentSyncs });
}));

// Get single channel details
router.get('/channels/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const channelResult = await pool.query('SELECT * FROM marketplace_channels WHERE id = $1', [channelId]);

  if (channelResult.rows.length === 0) {
    throw ApiError.notFound('Channel');
  }

  const channel = channelResult.rows[0];
  const manager = await getChannelManager();
  const adapterLoaded = manager.hasAdapter(channelId);

  // Get recent sync stats for this channel
  const syncStats = await pool.query(`
    SELECT sync_type, status, COUNT(*) as cnt,
           MAX(sync_end_time) as last_run
    FROM marketplace_sync_log
    WHERE channel_id = $1 AND sync_start_time >= NOW() - INTERVAL '7 days'
    GROUP BY sync_type, status
    ORDER BY last_run DESC
  `, [channelId]);

  // Get order counts
  const orderCounts = await pool.query(`
    SELECT mirakl_order_state as state, COUNT(*) as cnt
    FROM marketplace_orders
    WHERE channel_id = $1
    GROUP BY mirakl_order_state
  `, [channelId]);

  const ordersByState = {};
  orderCounts.rows.forEach(r => { ordersByState[r.state] = parseInt(r.cnt); });

  // Mask credentials for security
  const safeChannel = { ...channel };
  if (safeChannel.credentials) {
    const creds = typeof safeChannel.credentials === 'string' ? JSON.parse(safeChannel.credentials) : safeChannel.credentials;
    safeChannel.credentials = {
      api_key: creds.api_key ? `${creds.api_key.slice(0, 8)}...` : null,
      shop_id: creds.shop_id || null
    };
  }

  res.json({
    channel: safeChannel,
    adapterLoaded,
    features: adapterLoaded ? manager.getAdapter(channelId).getFeatures() : null,
    recentSyncs: syncStats.rows,
    ordersByState
  });
}));

// Add a new channel
router.post('/channels', authenticate, asyncHandler(async (req, res) => {
  const { code, name, type, apiUrl, credentials, config } = req.body;

  if (!code || !name || !type) {
    throw ApiError.badRequest('code, name, and type are required');
  }

  const manager = await getChannelManager();
  const channel = await manager.addChannel({ code, name, type, apiUrl, credentials, config });

  res.status(201).json({ success: true, channel });
}));

// ============================================
// CHANNEL ONBOARDING
// ============================================

/**
 * POST /channels/onboard
 * Step-by-step channel onboarding with connection test.
 */
router.post('/channels/onboard', authenticate, asyncHandler(async (req, res) => {
  const { channelType, channelCode, channelName, apiUrl, credentials, config } = req.body;

  if (!channelType || !channelCode || !channelName) {
    throw ApiError.badRequest('channelType, channelCode, and channelName are required');
  }
  if (!apiUrl) {
    throw ApiError.badRequest('apiUrl is required');
  }
  if (!credentials || !credentials.api_key) {
    throw ApiError.badRequest('credentials.api_key is required');
  }

  // 1. Insert into marketplace_channels with status = 'PENDING'
  const insertResult = await pool.query(
    `INSERT INTO marketplace_channels
       (channel_code, channel_name, channel_type, api_url, credentials, config, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
     RETURNING *`,
    [
      channelCode,
      channelName,
      channelType.toUpperCase(),
      apiUrl,
      JSON.stringify(credentials),
      JSON.stringify(config || {})
    ]
  );
  const channel = insertResult.rows[0];

  // 2. Attempt testConnection via a temporary adapter
  let connectionTest = { connected: false, message: 'No adapter for this channel type' };
  try {
    const manager = await getChannelManager();
    const adapter = manager._createAdapter(channel);
    connectionTest = await adapter.testConnection();
  } catch (err) {
    connectionTest = { connected: false, message: err.message };
  }

  // 3. If connection succeeds, update status to 'INACTIVE' (ready to activate)
  if (connectionTest.connected) {
    await pool.query(
      "UPDATE marketplace_channels SET status = 'INACTIVE', updated_at = NOW() WHERE id = $1",
      [channel.id]
    );
    channel.status = 'INACTIVE';
  }

  // Mask credentials in response
  const safeChannel = { ...channel };
  if (safeChannel.credentials) {
    const creds = typeof safeChannel.credentials === 'string'
      ? JSON.parse(safeChannel.credentials)
      : safeChannel.credentials;
    safeChannel.credentials = {
      api_key: creds.api_key ? `${creds.api_key.slice(0, 8)}...` : null,
      shop_id: creds.shop_id || null
    };
  }

  res.status(201).json({
    success: true,
    channel: safeChannel,
    connectionTest
  });
}));

/**
 * POST /channels/:channelId/map-categories
 * Import category tree from a Mirakl marketplace via H11 API.
 */
router.post('/channels/:channelId/map-categories', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);

  // 1. Get channel from DB
  const chResult = await pool.query('SELECT * FROM marketplace_channels WHERE id = $1', [channelId]);
  if (chResult.rows.length === 0) throw ApiError.notFound('Channel');

  const channel = chResult.rows[0];

  if (channel.channel_type !== 'MIRAKL') {
    throw ApiError.badRequest(`Category import not yet supported for channel type: ${channel.channel_type}`);
  }

  // 2. Create a temporary adapter and call Mirakl H11
  const manager = await getChannelManager();
  let adapter;
  try {
    adapter = manager.hasAdapter(channelId)
      ? manager.getAdapter(channelId)
      : manager._createAdapter(channel);
  } catch (err) {
    throw ApiError.badRequest(`Cannot create adapter: ${err.message}`);
  }

  // H11 endpoint: GET /api/hierarchies
  const data = await adapter._retryableRequest(
    () => adapter.client.get('/hierarchies'),
    'mapCategories(H11)'
  );

  const hierarchies = data?.hierarchies || data || [];

  // 3. Flatten the category tree and store in channel_categories
  // Clear existing categories for this channel first
  await pool.query('DELETE FROM channel_categories WHERE channel_id = $1', [channelId]);

  const categories = [];
  function flattenCategories(items, parentCode, level, pathParts) {
    for (const item of items) {
      const code = item.code || item.hierarchy_code || '';
      const label = item.label || item.hierarchy_label || '';
      const currentPath = [...pathParts, label];
      const children = item.children_hierarchies || item.children || [];

      categories.push({
        code,
        label,
        parentCode: parentCode || null,
        level,
        fullPath: currentPath.join(' > '),
        isLeaf: children.length === 0,
        rawData: item
      });

      if (children.length > 0) {
        flattenCategories(children, code, level + 1, currentPath);
      }
    }
  }
  flattenCategories(Array.isArray(hierarchies) ? hierarchies : [hierarchies], null, 0, []);

  // Batch insert
  if (categories.length > 0) {
    const values = [];
    const params = [];
    let idx = 1;
    for (const cat of categories) {
      values.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7})`);
      params.push(channelId, cat.code, cat.label, cat.parentCode, cat.level, cat.fullPath, cat.isLeaf, JSON.stringify(cat.rawData));
      idx += 8;
    }

    await pool.query(
      `INSERT INTO channel_categories
         (channel_id, category_code, category_label, parent_code, level, full_path, is_leaf, raw_data)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  // 4. Return category tree for the UI
  const storedCategories = await pool.query(
    `SELECT id, category_code, category_label, parent_code, level, full_path, is_leaf
     FROM channel_categories
     WHERE channel_id = $1
     ORDER BY full_path`,
    [channelId]
  );

  res.json({
    success: true,
    channelId,
    categoriesImported: categories.length,
    categories: storedCategories.rows
  });
}));

/**
 * POST /channels/:channelId/map-products
 * Create product_channel_listings for products on this channel.
 * Body: { productIds: [1,2,3], categoryId: 'CAT_XXX', categoryName: 'Refrigerators' }
 */
router.post('/channels/:channelId/map-products', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const { productIds, categoryId, categoryName } = req.body;

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    throw ApiError.badRequest('productIds array is required');
  }

  // Verify channel exists
  const chResult = await pool.query('SELECT id FROM marketplace_channels WHERE id = $1', [channelId]);
  if (chResult.rows.length === 0) throw ApiError.notFound('Channel');

  // Get product details (sku, price)
  const products = await pool.query(
    'SELECT id, sku, price FROM products WHERE id = ANY($1)',
    [productIds]
  );

  if (products.rows.length === 0) {
    throw ApiError.badRequest('No valid products found for the given IDs');
  }

  let mapped = 0;
  let skipped = 0;
  const errors = [];

  for (const product of products.rows) {
    try {
      await pool.query(
        `INSERT INTO product_channel_listings
           (product_id, channel_id, channel_sku, channel_category_id, channel_category_name,
            channel_price, listing_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
         ON CONFLICT (product_id, channel_id) DO UPDATE
         SET channel_category_id = EXCLUDED.channel_category_id,
             channel_category_name = EXCLUDED.channel_category_name,
             updated_at = NOW()`,
        [
          product.id,
          channelId,
          product.sku,
          categoryId || null,
          categoryName || null,
          product.price
        ]
      );
      mapped++;
    } catch (err) {
      skipped++;
      errors.push({ productId: product.id, error: err.message });
    }
  }

  res.json({
    success: true,
    mapped,
    skipped,
    errors: errors.length > 0 ? errors : undefined
  });
}));

/**
 * POST /channels/:channelId/auto-map
 * Auto-map products based on existing Best Buy category mappings.
 * Matches products with bestbuy_category_id to this channel's categories by name similarity.
 */
router.post('/channels/:channelId/auto-map', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);

  // Verify channel exists
  const chResult = await pool.query('SELECT * FROM marketplace_channels WHERE id = $1', [channelId]);
  if (chResult.rows.length === 0) throw ApiError.notFound('Channel');

  // 1. Get this channel's leaf categories
  const channelCats = await pool.query(
    `SELECT category_code, category_label, full_path
     FROM channel_categories
     WHERE channel_id = $1 AND is_leaf = true
     ORDER BY category_label`,
    [channelId]
  );

  if (channelCats.rows.length === 0) {
    throw ApiError.badRequest(
      'No categories imported for this channel. Run POST /channels/:channelId/map-categories first.'
    );
  }

  // Build a lookup: normalised label -> category
  const catMap = new Map();
  for (const cat of channelCats.rows) {
    const normalised = cat.category_label.trim().toLowerCase();
    catMap.set(normalised, cat);
    // Also index each segment of the full_path for partial matching
    if (cat.full_path) {
      const segments = cat.full_path.split(' > ');
      for (const seg of segments) {
        const normSeg = seg.trim().toLowerCase();
        if (!catMap.has(normSeg)) catMap.set(normSeg, cat);
      }
    }
  }

  // 2. Get products that have bestbuy_category_id set but NOT yet listed on this channel
  const products = await pool.query(`
    SELECT p.id, p.sku, p.price, p.bestbuy_category_id, p.bestbuy_category_code, p.category
    FROM products p
    WHERE p.marketplace_enabled = true
      AND p.sku IS NOT NULL
      AND p.bestbuy_category_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM product_channel_listings pcl
        WHERE pcl.product_id = p.id AND pcl.channel_id = $1
      )
  `, [channelId]);

  // 3. Try to match by category name similarity
  // First, build a map of bestbuy category labels from marketplace_commission_rates
  const commRates = await pool.query(
    `SELECT DISTINCT category_label FROM marketplace_commission_rates WHERE category_label IS NOT NULL`
  );
  const bbCatLabels = new Map();
  for (const row of commRates.rows) {
    bbCatLabels.set(row.category_label.trim().toLowerCase(), row.category_label);
  }

  let autoMapped = 0;
  let unmapped = 0;
  const mappings = [];

  for (const product of products.rows) {
    // Try matching using product.category, bestbuy_category_code, or commission rate labels
    const candidates = [
      product.category,
      product.bestbuy_category_code
    ].filter(Boolean);

    let matchedCat = null;

    // Direct name match
    for (const candidate of candidates) {
      const normalised = candidate.trim().toLowerCase();
      if (catMap.has(normalised)) {
        matchedCat = catMap.get(normalised);
        break;
      }
    }

    // Partial match: check if any channel category label contains our category or vice versa
    if (!matchedCat) {
      for (const candidate of candidates) {
        const normCandidate = candidate.trim().toLowerCase();
        for (const [normLabel, cat] of catMap) {
          if (normLabel.includes(normCandidate) || normCandidate.includes(normLabel)) {
            matchedCat = cat;
            break;
          }
        }
        if (matchedCat) break;
      }
    }

    if (matchedCat) {
      try {
        await pool.query(
          `INSERT INTO product_channel_listings
             (product_id, channel_id, channel_sku, channel_category_id, channel_category_name,
              channel_price, listing_status)
           VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
           ON CONFLICT (product_id, channel_id) DO NOTHING`,
          [
            product.id,
            channelId,
            product.sku,
            matchedCat.category_code,
            matchedCat.category_label,
            product.price
          ]
        );
        autoMapped++;
        mappings.push({
          productId: product.id,
          sku: product.sku,
          sourceCategory: product.category || product.bestbuy_category_code,
          mappedTo: matchedCat.category_label,
          mappedCode: matchedCat.category_code
        });
      } catch (err) {
        unmapped++;
      }
    } else {
      unmapped++;
    }
  }

  res.json({
    success: true,
    autoMapped,
    unmapped,
    totalCandidates: products.rows.length,
    channelCategories: channelCats.rows.length,
    mappings: mappings.slice(0, 50) // first 50 for preview
  });
}));

/**
 * POST /channels/:channelId/go-live
 * Activate channel: validate, push offers + inventory, set ACTIVE.
 */
router.post('/channels/:channelId/go-live', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);

  // 1. Load channel
  const chResult = await pool.query('SELECT * FROM marketplace_channels WHERE id = $1', [channelId]);
  if (chResult.rows.length === 0) throw ApiError.notFound('Channel');
  const channel = chResult.rows[0];

  // Validate: must have credentials
  const creds = typeof channel.credentials === 'string'
    ? JSON.parse(channel.credentials)
    : (channel.credentials || {});
  if (!creds.api_key) {
    throw ApiError.badRequest('Channel has no API key configured. Update credentials first.');
  }

  // 2. Check mapped products
  const listingCount = await pool.query(
    `SELECT COUNT(*) as cnt FROM product_channel_listings WHERE channel_id = $1`,
    [channelId]
  );
  const totalListings = parseInt(listingCount.rows[0].cnt, 10);
  if (totalListings === 0) {
    throw ApiError.badRequest('No products mapped to this channel. Map products before going live.');
  }

  // 3. Get or create adapter
  const manager = await getChannelManager();
  let adapter;
  try {
    adapter = manager.hasAdapter(channelId)
      ? manager.getAdapter(channelId)
      : manager._createAdapter(channel);
  } catch (err) {
    throw ApiError.badRequest(`Cannot create adapter: ${err.message}`);
  }

  // 4. Set all DRAFT listings to PENDING
  const draftUpdate = await pool.query(
    `UPDATE product_channel_listings
     SET listing_status = 'PENDING', updated_at = NOW()
     WHERE channel_id = $1 AND listing_status = 'DRAFT'
     RETURNING id`,
    [channelId]
  );
  const pendingCount = draftUpdate.rowCount;

  // 5. Push offers
  let offerResult = { submitted: 0 };
  try {
    offerResult = await manager.pushOffers(channelId);
  } catch (err) {
    console.error(`[go-live] pushOffers error for channel ${channelId}:`, err.message);
    offerResult = { submitted: 0, error: err.message };
  }

  // 6. Push inventory with allocation
  let inventoryResult = { submitted: 0 };
  try {
    inventoryResult = await manager.pushInventory(channelId);
  } catch (err) {
    console.error(`[go-live] pushInventory error for channel ${channelId}:`, err.message);
    inventoryResult = { submitted: 0, error: err.message };
  }

  // 7. Activate channel
  await manager.activateChannel(channelId);

  // Update listings that were PENDING to ACTIVE (optimistic)
  await pool.query(
    `UPDATE product_channel_listings
     SET listing_status = 'ACTIVE', updated_at = NOW()
     WHERE channel_id = $1 AND listing_status = 'PENDING'`,
    [channelId]
  );

  res.json({
    success: true,
    activated: true,
    channelId,
    channelCode: channel.channel_code,
    channelName: channel.channel_name,
    listingsActivated: pendingCount,
    totalListings,
    offersPushed: offerResult.submitted || offerResult.processed || 0,
    inventoryPushed: inventoryResult.submitted || inventoryResult.processed || 0,
    offersError: offerResult.error || undefined,
    inventoryError: inventoryResult.error || undefined
  });
}));

// ============================================
// CHANNEL ACTIVATION / MANAGEMENT
// ============================================

// Activate a channel
router.put('/channels/:channelId/activate', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const manager = await getChannelManager();
  const channel = await manager.activateChannel(channelId);

  if (!channel) {
    throw ApiError.notFound('Channel');
  }

  res.json({ success: true, channel, adapterLoaded: manager.hasAdapter(channelId) });
}));

// Deactivate a channel
router.put('/channels/:channelId/deactivate', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const manager = await getChannelManager();
  await manager.deactivateChannel(channelId);

  res.json({ success: true, message: `Channel ${channelId} deactivated` });
}));

// Test channel connection
router.post('/channels/:channelId/test', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const manager = await getChannelManager();
  const result = await manager.testConnection(channelId);

  res.json({ success: true, ...result });
}));

// Update channel settings
router.put('/channels/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const { apiUrl, credentials, config, name } = req.body;
  const manager = await getChannelManager();
  const channel = await manager.updateChannel(channelId, { apiUrl, credentials, config, name });

  if (!channel) {
    throw ApiError.notFound('Channel');
  }

  res.json({ success: true, channel });
}));

// Poll orders across all channels
router.post('/channels/poll-all-orders', authenticate, asyncHandler(async (req, res) => {
  const manager = await getChannelManager();
  const results = await manager.pollAllOrders();

  res.json({
    success: true,
    results,
    pollTime: new Date()
  });
}));

// ============================================
// PRICING ENGINE
// ============================================

const pricingEngine = require('../services/PricingEngine');

// List pricing rules (optionally filtered by channel)
router.get('/pricing/rules', authenticate, asyncHandler(async (req, res) => {
  const channelId = req.query.channelId ? parseInt(req.query.channelId, 10) : null;
  const rules = await pricingEngine.getRules(channelId);
  res.json({ rules, total: rules.length });
}));

// Create a pricing rule
router.post('/pricing/rules', authenticate, asyncHandler(async (req, res) => {
  const { channelId, ruleName, ruleType, conditions, formula, priority, active, startsAt, endsAt } = req.body;

  if (!ruleName || !ruleType) {
    throw ApiError.badRequest('ruleName and ruleType are required');
  }

  const validTypes = ['MIN_MARGIN', 'CHANNEL_MARKUP', 'SCHEDULED', 'VOLUME', 'COMPETITIVE'];
  if (!validTypes.includes(ruleType)) {
    throw ApiError.badRequest(`ruleType must be one of: ${validTypes.join(', ')}`);
  }

  const rule = await pricingEngine.createRule({
    channelId, ruleName, ruleType, conditions, formula, priority, active, startsAt, endsAt
  });

  res.status(201).json({ success: true, rule });
}));

// Update a pricing rule
router.put('/pricing/rules/:id', authenticate, asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id, 10);
  const rule = await pricingEngine.updateRule(ruleId, req.body);

  if (!rule) {
    throw ApiError.notFound('Pricing rule');
  }

  res.json({ success: true, rule });
}));

// Delete a pricing rule
router.delete('/pricing/rules/:id', authenticate, asyncHandler(async (req, res) => {
  const ruleId = parseInt(req.params.id, 10);
  const deleted = await pricingEngine.deleteRule(ruleId);

  if (!deleted) {
    throw ApiError.notFound('Pricing rule');
  }

  res.json({ success: true, message: `Rule ${ruleId} deleted` });
}));

// Calculate price for a single product on a channel
router.get('/pricing/calculate/:productId', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const channelId = parseInt(req.query.channelId, 10);

  if (!channelId) {
    throw ApiError.badRequest('channelId query parameter is required');
  }

  const result = await pricingEngine.calculatePrice(productId, channelId);
  res.json({ success: true, ...result });
}));

// Trigger recalculation for all products on a channel
router.post('/pricing/recalculate/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const dryRun = req.body.dryRun === true || req.query.dryRun === 'true';
  const approvalThreshold = req.body.approvalThreshold
    ? parseFloat(req.body.approvalThreshold)
    : undefined;

  const result = await pricingEngine.recalculateChannel(channelId, { dryRun, approvalThreshold });
  res.json({ success: true, ...result });
}));

// Push price changes to channel
router.post('/pricing/push/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const result = await pricingEngine.pushPriceChanges(channelId);
  res.json({ success: true, ...result });
}));

// List pending price change approvals
router.get('/pricing/pending', authenticate, asyncHandler(async (req, res) => {
  const channelId = req.query.channelId ? parseInt(req.query.channelId, 10) : null;
  const pending = await pricingEngine.getPendingApprovals(channelId);
  res.json({ pending, total: pending.length });
}));

// Approve or reject a price change
router.post('/pricing/approve/:changeId', authenticate, asyncHandler(async (req, res) => {
  const changeId = parseInt(req.params.changeId, 10);
  const approved = req.body.approved !== false; // default to approve

  const change = await pricingEngine.approveChange(changeId, req.user.id, approved);
  res.json({
    success: true,
    status: approved ? 'approved' : 'rejected',
    change
  });
}));

// Bulk approve all pending changes for a channel
router.post('/pricing/bulk-approve/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const result = await pricingEngine.bulkApprove(channelId, req.user.id);
  res.json({ success: true, ...result });
}));

// Get price change history
router.get('/pricing/log', authenticate, asyncHandler(async (req, res) => {
  const filters = {
    productId: req.query.productId ? parseInt(req.query.productId, 10) : undefined,
    channelId: req.query.channelId ? parseInt(req.query.channelId, 10) : undefined,
    status: req.query.status,
    limit: req.query.limit,
    offset: req.query.offset
  };
  const log = await pricingEngine.getChangeLog(filters);
  res.json({ log, total: log.length });
}));

// =============================================
// LISTING HEALTH MONITOR ROUTES
// =============================================

const listingHealthMonitor = require('../services/ListingHealthMonitor');

// Get listing health score + issue summary for a channel
router.get('/listings/health/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const [score, summary] = await Promise.all([
    listingHealthMonitor.getHealthScore(channelId),
    listingHealthMonitor.getIssueSummary(channelId)
  ]);
  res.json({ channelId, score, summary });
}));

// Trigger a manual listing health scan for a channel
router.post('/listings/health/:channelId/scan', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const result = await listingHealthMonitor.scanChannel(channelId);
  res.json({ success: true, channelId, ...result });
}));

// Trigger auto-fix for a channel's listing issues
router.post('/listings/health/:channelId/auto-fix', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const result = await listingHealthMonitor.autoFix(channelId);
  res.json({ success: true, channelId, ...result });
}));

// List all open listing issues (filterable)
router.get('/listings/issues', authenticate, asyncHandler(async (req, res) => {
  const filters = {
    channelId: req.query.channelId ? parseInt(req.query.channelId, 10) : undefined,
    severity: req.query.severity,
    issueType: req.query.type,
    autoFixable: req.query.autoFixable === 'true' ? true : req.query.autoFixable === 'false' ? false : undefined,
    limit: parseInt(req.query.limit) || 100,
    offset: parseInt(req.query.offset) || 0
  };
  const issues = await listingHealthMonitor.getIssues(filters);
  res.json({ issues, total: issues.length, ...filters });
}));

// =============================================
// RETURNS AUTOMATION ROUTES (ReturnsManager)
// =============================================

const returnsManager = require('../services/ReturnsManager');

// Return analytics / stats (channel-aware, by period)
router.get('/returns/stats', authenticate, asyncHandler(async (req, res) => {
  const channelId = req.query.channelId ? parseInt(req.query.channelId, 10) : null;
  const days = parseInt(req.query.days) || 30;
  const stats = await returnsManager.getReturnStats(channelId, days);
  res.json(stats);
}));

// List return automation rules
router.get('/returns/rules', authenticate, asyncHandler(async (req, res) => {
  const rules = await returnsManager.getRules();
  res.json({ rules, total: rules.length });
}));

// Create return automation rule
router.post('/returns/rules', authenticate, asyncHandler(async (req, res) => {
  const rule = await returnsManager.createRule(req.body);
  res.status(201).json({ success: true, rule });
}));

// Accept a return (via ReturnsManager auto-decision engine)
router.post('/returns/:id/accept', authenticate, asyncHandler(async (req, res) => {
  const returnId = parseInt(req.params.id, 10);
  const result = await returnsManager.acceptReturn(returnId);
  res.json({ success: true, return: result });
}));

// =============================================
// MESSAGING HUB ROUTES
// =============================================

const messagingHub = require('../services/MessagingHub');

// Get inbox (unread messages across channels)
router.get('/messages/inbox', authenticate, asyncHandler(async (req, res) => {
  const channelId = req.query.channelId ? parseInt(req.query.channelId, 10) : null;
  const options = {
    unreadOnly: req.query.unreadOnly === 'true',
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0
  };
  const result = await messagingHub.getInbox(channelId, options);
  res.json(result);
}));

// Response time analytics
router.get('/messages/stats', authenticate, asyncHandler(async (req, res) => {
  const channelId = req.query.channelId ? parseInt(req.query.channelId, 10) : null;
  const days = parseInt(req.query.days) || 30;
  const stats = await messagingHub.getResponseStats(channelId, days);
  res.json(stats);
}));

// List message templates
router.get('/messages/templates', authenticate, asyncHandler(async (req, res) => {
  const templates = await messagingHub.getTemplates();
  res.json({ templates, total: templates.length });
}));

// Create message template
router.post('/messages/templates', authenticate, asyncHandler(async (req, res) => {
  const template = await messagingHub.createTemplate(req.body);
  res.status(201).json({ success: true, template });
}));

// Update message template
router.put('/messages/templates/:id', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const template = await messagingHub.updateTemplate(id, req.body);
  res.json({ success: true, template });
}));

// Get full conversation thread
router.get('/messages/thread/:threadId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.query.channelId, 10);
  if (!channelId) return res.status(400).json({ error: 'channelId query parameter required' });
  const thread = await messagingHub.getThread(channelId, req.params.threadId);
  res.json(thread);
}));

// Send reply to a message
router.post('/messages/reply/:messageId', authenticate, asyncHandler(async (req, res) => {
  const messageId = parseInt(req.params.messageId, 10);
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'body is required' });
  const result = await messagingHub.sendReply(messageId, body);
  res.json({ success: true, ...result });
}));

// Mark message as read
router.post('/messages/:messageId/read', authenticate, asyncHandler(async (req, res) => {
  const messageId = parseInt(req.params.messageId, 10);
  const result = await messagingHub.markRead(messageId);
  res.json({ success: true, ...result });
}));

// ═══════════════════════════════════════════════════════════════════
// ONBOARDING WIZARD  (4 routes)
// ═══════════════════════════════════════════════════════════════════

const WIZARD_STEPS = [
  { step: 1, name: 'Channel Setup', description: 'Choose channel type and name' },
  { step: 2, name: 'API Credentials', description: 'Enter API credentials and test connection' },
  { step: 3, name: 'Category Import', description: 'Fetch and review marketplace categories' },
  { step: 4, name: 'Category Mapping', description: 'Map your product categories to marketplace categories' },
  { step: 5, name: 'Product Selection', description: 'Choose which products to list' },
  { step: 6, name: 'Pricing & Inventory', description: 'Set pricing rules and inventory allocation' },
  { step: 7, name: 'Review & Activate', description: 'Confirm and push listings live' }
];

// POST /onboarding/start — begin the wizard
router.post('/onboarding/start', authenticate, asyncHandler(async (req, res) => {
  const { channelType, channelName } = req.body;
  if (!channelType || !channelName) {
    return res.status(400).json({ error: 'channelType and channelName are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create channel record (INACTIVE, placeholder code)
    const channelCode = channelName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 30) + '_' + Date.now().toString(36).toUpperCase();
    const { rows: [channel] } = await client.query(`
      INSERT INTO marketplace_channels (channel_code, channel_name, channel_type, status)
      VALUES ($1, $2, $3, 'INACTIVE')
      RETURNING id, channel_code, channel_name, channel_type, status
    `, [channelCode, channelName, channelType.toUpperCase()]);

    // Create onboarding record
    const { rows: [onboarding] } = await client.query(`
      INSERT INTO channel_onboarding (channel_id, current_step, step_data)
      VALUES ($1, 1, $2)
      RETURNING *
    `, [channel.id, JSON.stringify({ step1: { channelType: channelType.toUpperCase(), channelName } })]);

    await client.query('COMMIT');

    res.status(201).json({
      onboardingId: onboarding.id,
      channelId: channel.id,
      currentStep: 1,
      totalSteps: 7,
      status: 'IN_PROGRESS',
      channel,
      steps: WIZARD_STEPS
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// GET /onboarding/:id — current wizard state
router.get('/onboarding/:id', authenticate, asyncHandler(async (req, res) => {
  const onboardingId = parseInt(req.params.id, 10);

  const { rows: [ob] } = await pool.query(
    'SELECT * FROM channel_onboarding WHERE id = $1', [onboardingId]
  );
  if (!ob) return res.status(404).json({ error: 'Onboarding session not found' });

  const { rows: [channel] } = await pool.query(`
    SELECT id, channel_code, channel_name, channel_type, api_url, status, config,
           commission_rates, features, onboarded_at
    FROM marketplace_channels WHERE id = $1
  `, [ob.channel_id]);

  // Count mapped products
  const { rows: [listingStats] } = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE listing_status = 'ACTIVE')::int AS active
    FROM product_channel_listings WHERE channel_id = $1
  `, [ob.channel_id]);

  // Count imported categories
  const { rows: [catStats] } = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_leaf = true)::int AS leaf_count
    FROM channel_categories WHERE channel_id = $1
  `, [ob.channel_id]);

  res.json({
    onboardingId: ob.id,
    channelId: ob.channel_id,
    currentStep: ob.current_step,
    totalSteps: ob.total_steps,
    status: ob.status,
    stepData: typeof ob.step_data === 'string' ? JSON.parse(ob.step_data) : ob.step_data,
    startedAt: ob.started_at,
    completedAt: ob.completed_at,
    channel,
    listings: listingStats,
    categories: catStats,
    steps: WIZARD_STEPS.map(function(s) {
      return { ...s, completed: s.step < ob.current_step, current: s.step === ob.current_step };
    })
  });
}));

// PUT /onboarding/:id/step/:stepNumber — submit a step
router.put('/onboarding/:id/step/:stepNumber', authenticate, asyncHandler(async (req, res) => {
  const onboardingId = parseInt(req.params.id, 10);
  const stepNumber = parseInt(req.params.stepNumber, 10);

  // Load onboarding
  const { rows: [ob] } = await pool.query(
    'SELECT * FROM channel_onboarding WHERE id = $1', [onboardingId]
  );
  if (!ob) return res.status(404).json({ error: 'Onboarding session not found' });
  if (ob.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Onboarding is ' + ob.status });
  if (stepNumber < 1 || stepNumber > 7) return res.status(400).json({ error: 'Step must be 1-7' });

  const channelId = ob.channel_id;
  const stepData = typeof ob.step_data === 'string' ? JSON.parse(ob.step_data) : (ob.step_data || {});
  var result = {};

  // ─── STEP 1: Channel Setup ─────────────────────────────────────
  if (stepNumber === 1) {
    const { channelType, channelCode, channelName } = req.body;
    if (!channelName) return res.status(400).json({ error: 'channelName is required' });

    const sets = ['channel_name = $1', 'updated_at = NOW()'];
    const params = [channelName];
    if (channelType) { sets.push('channel_type = $' + (params.length + 1)); params.push(channelType.toUpperCase()); }
    if (channelCode) { sets.push('channel_code = $' + (params.length + 1)); params.push(channelCode.toUpperCase()); }
    params.push(channelId);

    await pool.query(
      'UPDATE marketplace_channels SET ' + sets.join(', ') + ' WHERE id = $' + params.length,
      params
    );
    stepData.step1 = { channelType, channelCode, channelName };
    result = { saved: true };
  }

  // ─── STEP 2: API Credentials + Test Connection ─────────────────
  else if (stepNumber === 2) {
    const { apiUrl, apiKey, shopId } = req.body;
    if (!apiUrl || !apiKey) return res.status(400).json({ error: 'apiUrl and apiKey are required' });

    const credentials = { api_key: apiKey };
    if (shopId) credentials.shop_id = shopId;

    await pool.query(
      `UPDATE marketplace_channels SET api_url = $1, credentials = $2, updated_at = NOW() WHERE id = $3`,
      [apiUrl, JSON.stringify(credentials), channelId]
    );

    // Test connection
    var connectionTest = { connected: false, message: 'Connection test not available' };
    try {
      const manager = await getChannelManager();
      const chRow = (await pool.query('SELECT * FROM marketplace_channels WHERE id = $1', [channelId])).rows[0];
      const adapter = manager.hasAdapter && manager.hasAdapter(channelId)
        ? manager.getAdapter(channelId)
        : manager._createAdapter(chRow);
      connectionTest = await adapter.testConnection();
    } catch (err) {
      connectionTest = { connected: false, message: err.message };
    }

    if (connectionTest.connected) {
      await pool.query("UPDATE marketplace_channels SET status = 'PENDING', updated_at = NOW() WHERE id = $1", [channelId]);
    }

    stepData.step2 = { apiUrl, shopId: shopId || null, connectionTest };
    result = { connectionTest };
  }

  // ─── STEP 3: Fetch Categories ──────────────────────────────────
  else if (stepNumber === 3) {
    var categories = [];
    try {
      const manager = await getChannelManager();
      const chRow = (await pool.query('SELECT * FROM marketplace_channels WHERE id = $1', [channelId])).rows[0];
      const adapter = manager.hasAdapter && manager.hasAdapter(channelId)
        ? manager.getAdapter(channelId)
        : manager._createAdapter(chRow);

      const data = await adapter._retryableRequest(
        () => adapter.client.get('/hierarchies'),
        'onboardingFetchCategories'
      );
      const hierarchies = data?.hierarchies || data || [];

      // Flatten and store
      await pool.query('DELETE FROM channel_categories WHERE channel_id = $1', [channelId]);
      function flattenCats(items, parentCode, level, pathParts) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var code = item.code || item.hierarchy_code || '';
          var label = item.label || item.hierarchy_label || '';
          var currentPath = pathParts.concat([label]);
          var children = item.children_hierarchies || item.children || [];
          categories.push({ code, label, parentCode: parentCode || null, level, fullPath: currentPath.join(' > '), isLeaf: children.length === 0 });
          if (children.length > 0) flattenCats(children, code, level + 1, currentPath);
        }
      }
      flattenCats(Array.isArray(hierarchies) ? hierarchies : [hierarchies], null, 0, []);

      if (categories.length > 0) {
        var values = [], params = [], idx = 1;
        for (var ci = 0; ci < categories.length; ci++) {
          var cat = categories[ci];
          values.push('($' + idx + ', $' + (idx+1) + ', $' + (idx+2) + ', $' + (idx+3) + ', $' + (idx+4) + ', $' + (idx+5) + ', $' + (idx+6) + ')');
          params.push(channelId, cat.code, cat.label, cat.parentCode, cat.level, cat.fullPath, cat.isLeaf);
          idx += 7;
        }
        await pool.query(
          'INSERT INTO channel_categories (channel_id, category_code, category_label, parent_code, level, full_path, is_leaf) VALUES ' + values.join(', '),
          params
        );
      }
    } catch (err) {
      stepData.step3 = { error: err.message, categoriesImported: 0 };
      result = { error: 'Failed to fetch categories: ' + err.message, categoriesImported: 0 };
      // Still advance — user can retry
    }

    if (!result.error) {
      stepData.step3 = { categoriesImported: categories.length };
      result = { categoriesImported: categories.length };
    }
  }

  // ─── STEP 4: Category Mappings ─────────────────────────────────
  else if (stepNumber === 4) {
    const { categoryMappings } = req.body;
    if (!categoryMappings || !Array.isArray(categoryMappings)) {
      return res.status(400).json({ error: 'categoryMappings array is required' });
    }

    // Store mappings in step_data and also use them to update listings
    var mapped = 0;
    for (var mi = 0; mi < categoryMappings.length; mi++) {
      var m = categoryMappings[mi];
      if (m.productCategory && m.channelCategory) {
        // Update all product_channel_listings with this product category
        var upd = await pool.query(`
          UPDATE product_channel_listings pcl
          SET channel_category_id = $1, channel_category_name = $2, updated_at = NOW()
          FROM products p
          WHERE pcl.product_id = p.id AND pcl.channel_id = $3 AND p.category = $4
        `, [m.channelCategory, m.channelCategoryName || m.channelCategory, channelId, m.productCategory]);
        mapped += upd.rowCount;
      }
    }

    stepData.step4 = { categoryMappings, productsMapped: mapped };
    result = { mappingsApplied: categoryMappings.length, productsMapped: mapped };
  }

  // ─── STEP 5: Product Selection ─────────────────────────────────
  else if (stepNumber === 5) {
    const { productIds } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds array is required' });
    }

    // Get products
    const { rows: products } = await pool.query(
      'SELECT id, sku, price FROM products WHERE id = ANY($1)', [productIds]
    );

    var listed = 0, skipped = 0;
    for (var pi = 0; pi < products.length; pi++) {
      var p = products[pi];
      try {
        await pool.query(`
          INSERT INTO product_channel_listings (product_id, channel_id, channel_sku, channel_price, listing_status)
          VALUES ($1, $2, $3, $4, 'DRAFT')
          ON CONFLICT (product_id, channel_id) DO UPDATE SET updated_at = NOW()
        `, [p.id, channelId, p.sku, p.price]);
        listed++;
      } catch (e) { console.error('Product listing error:', e.message); skipped++; }
    }

    stepData.step5 = { productCount: listed };
    result = { productsListed: listed, skipped };
  }

  // ─── STEP 6: Pricing & Inventory Rules ─────────────────────────
  else if (stepNumber === 6) {
    const { pricingRuleId, inventoryAllocation, stockBuffer } = req.body;

    // Apply pricing rule to channel listings
    if (pricingRuleId) {
      const { rows: [rule] } = await pool.query(
        'SELECT * FROM marketplace_price_rules WHERE id = $1 AND enabled = true', [pricingRuleId]
      );
      if (rule) {
        var priceUpdate;
        if (rule.rule_type === 'MARKUP_PERCENT') {
          priceUpdate = await pool.query(`
            UPDATE product_channel_listings SET channel_price = (
              SELECT p.price * (1 + $1::numeric / 100) FROM products p WHERE p.id = product_id
            ), updated_at = NOW() WHERE channel_id = $2
          `, [parseFloat(rule.value), channelId]);
        } else if (rule.rule_type === 'FIXED_MARKUP') {
          priceUpdate = await pool.query(`
            UPDATE product_channel_listings SET channel_price = (
              SELECT p.price + $1::numeric FROM products p WHERE p.id = product_id
            ), updated_at = NOW() WHERE channel_id = $2
          `, [parseFloat(rule.value), channelId]);
        }
        stepData.step6 = stepData.step6 || {};
        stepData.step6.pricingRuleId = pricingRuleId;
        stepData.step6.pricingRuleName = rule.name;
        stepData.step6.listingsUpdated = priceUpdate ? priceUpdate.rowCount : 0;
      }
    }

    // Apply inventory allocation
    if (inventoryAllocation !== undefined) {
      var allocPct = Math.min(100, Math.max(0, parseFloat(inventoryAllocation)));
      await pool.query(
        'UPDATE product_channel_listings SET allocation_percent = $1, updated_at = NOW() WHERE channel_id = $2',
        [allocPct, channelId]
      );
      stepData.step6 = stepData.step6 || {};
      stepData.step6.inventoryAllocation = allocPct;
    }

    // Apply stock buffer
    if (stockBuffer !== undefined) {
      var buffer = Math.max(0, parseInt(stockBuffer, 10));
      await pool.query(
        'UPDATE product_channel_listings SET safety_buffer = $1, updated_at = NOW() WHERE channel_id = $2',
        [buffer, channelId]
      );
      stepData.step6 = stepData.step6 || {};
      stepData.step6.stockBuffer = buffer;
    }

    result = { applied: stepData.step6 || {} };
  }

  // ─── STEP 7: Review & Activate ─────────────────────────────────
  else if (stepNumber === 7) {
    const { confirm } = req.body;
    if (!confirm) return res.status(400).json({ error: 'Set confirm: true to activate' });

    // Activate channel
    await pool.query(
      "UPDATE marketplace_channels SET status = 'ACTIVE', onboarded_at = NOW(), updated_at = NOW() WHERE id = $1",
      [channelId]
    );

    // Push initial offers + inventory via ChannelManager
    var pushResult = { offers: null, inventory: null };
    try {
      const manager = await getChannelManager();
      await manager.initialize();
      if (manager.hasAdapter && manager.hasAdapter(channelId)) {
        pushResult.offers = await manager.pushOffers(channelId);
        pushResult.inventory = await manager.pushInventory(channelId);
      } else {
        pushResult.note = 'Adapter not loaded — push offers manually after restart';
      }
    } catch (err) {
      pushResult.error = err.message;
    }

    // Mark onboarding complete
    await pool.query(`
      UPDATE channel_onboarding SET status = 'COMPLETED', completed_at = NOW(), current_step = 7, updated_at = NOW()
      WHERE id = $1
    `, [onboardingId]);

    stepData.step7 = { activatedAt: new Date().toISOString(), pushResult };
    result = { activated: true, pushResult };
  }

  // Save step progress
  var nextStep = Math.min(stepNumber + 1, 7);
  if (stepNumber < 7) {
    await pool.query(`
      UPDATE channel_onboarding SET current_step = $1, step_data = $2, updated_at = NOW()
      WHERE id = $3
    `, [nextStep, JSON.stringify(stepData), onboardingId]);
  } else {
    await pool.query(
      'UPDATE channel_onboarding SET step_data = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(stepData), onboardingId]
    );
  }

  res.json({
    onboardingId,
    stepCompleted: stepNumber,
    nextStep: stepNumber < 7 ? nextStep : null,
    status: stepNumber === 7 ? 'COMPLETED' : 'IN_PROGRESS',
    ...result
  });
}));

// DELETE /onboarding/:id — abandon onboarding
router.delete('/onboarding/:id', authenticate, asyncHandler(async (req, res) => {
  const onboardingId = parseInt(req.params.id, 10);

  const { rows: [ob] } = await pool.query(
    'SELECT * FROM channel_onboarding WHERE id = $1', [onboardingId]
  );
  if (!ob) return res.status(404).json({ error: 'Onboarding session not found' });

  // Mark abandoned
  await pool.query(
    "UPDATE channel_onboarding SET status = 'ABANDONED', updated_at = NOW() WHERE id = $1",
    [onboardingId]
  );

  // Deactivate channel
  await pool.query(
    "UPDATE marketplace_channels SET status = 'INACTIVE', updated_at = NOW() WHERE id = $1",
    [ob.channel_id]
  );

  res.json({
    success: true,
    onboardingId,
    channelId: ob.channel_id,
    status: 'ABANDONED'
  });
}));

// ═══════════════════════════════════════════════════════════════════
// MARKETPLACE ANALYTICS  (6 routes)
// ═══════════════════════════════════════════════════════════════════

// Revenue by channel over time
router.get('/analytics/revenue', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const granularity = req.query.granularity || 'day';
  const rows = await marketplaceAnalytics.getRevenueByChannel(days, granularity);
  res.json({ period_days: days, granularity, data: rows });
}));

// Product performance
router.get('/analytics/products', authenticate, asyncHandler(async (req, res) => {
  const channelId = req.query.channelId ? parseInt(req.query.channelId, 10) : null;
  const days = parseInt(req.query.days, 10) || 30;
  const limit = parseInt(req.query.limit, 10) || 50;
  const rows = await marketplaceAnalytics.getProductPerformance(channelId, days, limit);
  res.json({ period_days: days, channel_id: channelId, data: rows });
}));

// Cross-channel comparison for a single product
router.get('/analytics/products/:productId/compare', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const rows = await marketplaceAnalytics.getChannelComparison(productId);
  res.json({ product_id: productId, channels: rows });
}));

// Profitability P&L for a channel
router.get('/analytics/profitability/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const days = parseInt(req.query.days, 10) || 30;
  const result = await marketplaceAnalytics.getProfitability(channelId, days);
  res.json({ channel_id: channelId, period_days: days, ...result });
}));

// Sell-through rates for a channel
router.get('/analytics/sell-through/:channelId', authenticate, asyncHandler(async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const days = parseInt(req.query.days, 10) || 30;
  const rows = await marketplaceAnalytics.getSellThroughRate(channelId, days);
  res.json({ channel_id: channelId, period_days: days, data: rows });
}));

// Executive KPI summary (cross-channel)
router.get('/analytics/kpi', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const result = await marketplaceAnalytics.getKPISummary(days);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════
// INVENTORY FORECASTING  (5 routes)
// ═══════════════════════════════════════════════════════════════════

// Products at risk of stockout
router.get('/forecasting/stockout-alerts', authenticate, asyncHandler(async (req, res) => {
  const daysThreshold = parseInt(req.query.daysThreshold, 10) || 14;
  const rows = await inventoryForecaster.getStockoutAlerts(daysThreshold);
  res.json({ days_threshold: daysThreshold, count: rows.length, data: rows });
}));

// Reorder suggestions
router.get('/forecasting/reorder-suggestions', authenticate, asyncHandler(async (req, res) => {
  const leadTime = parseInt(req.query.leadTime, 10) || 7;
  const targetDays = parseInt(req.query.targetDays, 10) || 30;
  const safetyDays = parseInt(req.query.safetyDays, 10) || 7;
  const rows = await inventoryForecaster.getReorderSuggestions(leadTime, targetDays, safetyDays);
  res.json({ lead_time_days: leadTime, target_days_supply: targetDays, safety_stock_days: safetyDays, count: rows.length, data: rows });
}));

// Overstock detection
router.get('/forecasting/overstock', authenticate, asyncHandler(async (req, res) => {
  const daysThreshold = parseInt(req.query.daysThreshold, 10) || 90;
  const rows = await inventoryForecaster.getOverstockAlerts(daysThreshold);
  res.json({ days_threshold: daysThreshold, count: rows.length, data: rows });
}));

// Velocity anomalies
router.get('/forecasting/anomalies', authenticate, asyncHandler(async (req, res) => {
  const threshold = parseInt(req.query.threshold, 10) || 50;
  const rows = await inventoryForecaster.getVelocityAnomalies(threshold);
  res.json({ change_threshold_pct: threshold, count: rows.length, data: rows });
}));

// Full forecast for a single product
router.get('/forecasting/product/:productId', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const result = await inventoryForecaster.getProductForecast(productId);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════
// MARKETPLACE BUNDLES  (5 routes)
// ═══════════════════════════════════════════════════════════════════

// List bundles with components and availability
router.get('/bundles', authenticate, asyncHandler(async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const rows = await bundleManager.getBundles(activeOnly);
  res.json({ count: rows.length, data: rows });
}));

// Sync bundle listings to channels
router.post('/bundles/sync', authenticate, asyncHandler(async (req, res) => {
  const result = await bundleManager.syncBundleListings();
  res.json({ success: true, ...result });
}));

// Create bundle
router.post('/bundles', authenticate, asyncHandler(async (req, res) => {
  const { bundleSku, bundleName, bundleDescription, bundlePrice, components, category, imageUrl } = req.body;
  if (!bundleSku || !bundleName || !bundlePrice || !components || !components.length) {
    return res.status(400).json({ error: 'bundleSku, bundleName, bundlePrice, and components are required' });
  }
  const result = await bundleManager.createBundle({
    bundleSku, bundleName, bundleDescription, bundlePrice, components, category, imageUrl
  });
  res.status(201).json(result);
}));

// Update bundle
router.put('/bundles/:id', authenticate, asyncHandler(async (req, res) => {
  const bundleId = parseInt(req.params.id, 10);
  const result = await bundleManager.updateBundle(bundleId, req.body);
  res.json(result);
}));

// Deactivate bundle (soft delete)
router.delete('/bundles/:id', authenticate, asyncHandler(async (req, res) => {
  const bundleId = parseInt(req.params.id, 10);
  const result = await bundleManager.deleteBundle(bundleId);
  res.json({ success: true, ...result });
}));

// ═══════════════════════════════════════════════════════════════════
// TAX ENGINE  (4 routes)
// ═══════════════════════════════════════════════════════════════════

// Calculate tax for amount + province
router.get('/tax/calculate', authenticate, asyncHandler(async (req, res) => {
  const subtotal = parseFloat(req.query.subtotal);
  const province = (req.query.province || 'ON').toUpperCase();
  if (isNaN(subtotal) || subtotal < 0) return res.status(400).json({ error: 'subtotal query parameter required (positive number)' });
  const result = taxEngine.calculateTax(subtotal, province);
  res.json(result);
}));

// Get EHF for product category + province
router.get('/tax/ehf/:category/:province', authenticate, asyncHandler(async (req, res) => {
  const category = req.params.category;
  const province = req.params.province.toUpperCase();
  const result = taxEngine.getEHF(category, province);
  res.json(result);
}));

// Tax reconciliation report (CRA-ready)
router.get('/tax/reconciliation', authenticate, asyncHandler(async (req, res) => {
  const dateFrom = req.query.dateFrom;
  const dateTo = req.query.dateTo;
  if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom and dateTo query parameters required (YYYY-MM-DD)' });
  const result = await taxEngine.getTaxReconciliation(dateFrom, dateTo);
  res.json(result);
}));

// Commission tax report (ITC for CRA)
router.get('/tax/commission-report', authenticate, asyncHandler(async (req, res) => {
  const dateFrom = req.query.dateFrom;
  const dateTo = req.query.dateTo;
  if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom and dateTo query parameters required (YYYY-MM-DD)' });
  const result = await taxEngine.getCommissionTaxReport(dateFrom, dateTo);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════
// TENANT MANAGEMENT  (6 routes)
// ═══════════════════════════════════════════════════════════════════

// List tenants
router.get('/tenants', authenticate, asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const rows = await tenantManager.getTenants(includeInactive);
  res.json({ count: rows.length, data: rows });
}));

// Resolve current tenant (from middleware) — MUST be before /:id routes
router.get('/tenants/current', authenticate, tenantManager.tenantMiddleware(), asyncHandler(async (req, res) => {
  if (!req.tenantId) return res.status(404).json({ error: 'No tenant resolved' });
  const tenant = await tenantManager.getTenant(req.tenantId);
  res.json(tenant);
}));

// Create tenant
router.post('/tenants', authenticate, asyncHandler(async (req, res) => {
  const { tenantCode, companyName, contactEmail, plan, config } = req.body;
  if (!tenantCode || !companyName) {
    return res.status(400).json({ error: 'tenantCode and companyName are required' });
  }
  const tenant = await tenantManager.createTenant({ tenantCode, companyName, contactEmail, plan, config });
  res.status(201).json(tenant);
}));

// Update tenant
router.put('/tenants/:id', authenticate, asyncHandler(async (req, res) => {
  const tenantId = parseInt(req.params.id, 10);
  const tenant = await tenantManager.updateTenant(tenantId, req.body);
  res.json(tenant);
}));

// Get tenant channels
router.get('/tenants/:id/channels', authenticate, asyncHandler(async (req, res) => {
  const tenantId = parseInt(req.params.id, 10);
  const rows = await tenantManager.getTenantChannels(tenantId);
  res.json({ tenant_id: tenantId, count: rows.length, data: rows });
}));

// Get tenant stats
router.get('/tenants/:id/stats', authenticate, asyncHandler(async (req, res) => {
  const tenantId = parseInt(req.params.id, 10);
  const stats = await tenantManager.getTenantStats(tenantId);
  res.json({ tenant_id: tenantId, ...stats });
}));

// ============================================
// SHIPPING SERVICE
// ============================================

// Get rate quotes for an order or ad-hoc shipment
router.post('/shipping/rates', authenticate, asyncHandler(async (req, res) => {
  const { orderId, weightKg, destinationPostal, destinationProvince, destinationCountry } = req.body;
  const rates = await shippingService.getRates({
    orderId, weightKg, destinationPostal, destinationProvince, destinationCountry,
  });
  res.json(rates);
}));

// Batch generate labels for multiple orders (must come before :orderId)
router.post('/shipping/labels/batch', authenticate, asyncHandler(async (req, res) => {
  const { orderIds, carrierId, serviceCode } = req.body;
  const result = await shippingService.generateBatchLabels({ orderIds, carrierId, serviceCode });
  res.json(result);
}));

// Generate shipping label for a single order
router.post('/shipping/labels/:orderId', authenticate, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const { carrierId, serviceCode, packages, notes } = req.body;
  const label = await shippingService.generateLabel({
    orderId, carrierId, serviceCode, packages, notes,
  });
  res.status(201).json(label);
}));

// Track a shipment by tracking number
router.get('/shipping/track/:trackingNumber', authenticate, asyncHandler(async (req, res) => {
  const tracking = await shippingService.trackShipment(req.params.trackingNumber);
  res.json(tracking);
}));

// Shipping cost/P&L report
router.get('/shipping/cost-report', authenticate, asyncHandler(async (req, res) => {
  const { startDate, endDate, channelId, carrierId, groupBy } = req.query;
  const report = await shippingService.getShippingCostReport({
    startDate, endDate,
    channelId: channelId ? parseInt(channelId, 10) : null,
    carrierId: carrierId ? parseInt(carrierId, 10) : null,
    groupBy,
  });
  res.json(report);
}));

// ============================================
// REPORT GENERATOR
// ============================================

// Daily sales summary
router.get('/reports/daily-summary', authenticate, asyncHandler(async (req, res) => {
  const { date } = req.query; // optional YYYY-MM-DD, defaults to today
  const report = await reportGenerator.generateDailySummary(date || undefined);
  res.json(report);
}));

// Weekly P&L by channel
router.get('/reports/weekly-pnl', authenticate, asyncHandler(async (req, res) => {
  const { weekStartDate } = req.query; // optional YYYY-MM-DD (Monday), defaults to current week
  const report = await reportGenerator.generateWeeklyPnL(weekStartDate || undefined);
  res.json(report);
}));

// Monthly tax reconciliation
router.get('/reports/monthly-tax', authenticate, asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'year and month query parameters are required' });
  }
  const report = await reportGenerator.generateMonthlyTaxReport(year, month);
  res.json(report);
}));

// Export report as CSV or JSON
router.get('/reports/export', authenticate, asyncHandler(async (req, res) => {
  const { reportType, format, date, weekStartDate, year, month } = req.query;
  if (!reportType) {
    return res.status(400).json({ error: 'reportType query parameter is required (DailySummary, WeeklyPnL, MonthlyTaxReport)' });
  }
  const params = { date, weekStartDate, year, month };
  const result = await reportGenerator.exportReport(reportType, params, format || 'csv');

  if ((format || 'csv') === 'csv' && result.content) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.content);
  }

  res.json(result.data || result);
}));

// ============================================
// MARKETPLACE AI
// ============================================

// Generate optimized listing title
router.post('/ai/generate-title/:productId/:channelId', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const channelId = parseInt(req.params.channelId, 10);
  const result = await marketplaceAI.generateTitle(productId, channelId);
  res.json(result);
}));

// Generate optimized listing description
router.post('/ai/generate-description/:productId/:channelId', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const channelId = parseInt(req.params.channelId, 10);
  const result = await marketplaceAI.generateDescription(productId, channelId);
  res.json(result);
}));

// Suggest best category for a product on a channel
router.post('/ai/suggest-category/:productId/:channelId', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const channelId = parseInt(req.params.channelId, 10);
  const result = await marketplaceAI.suggestCategory(productId, channelId);
  res.json(result);
}));

// AI price recommendation
router.post('/ai/suggest-price/:productId/:channelId', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const channelId = parseInt(req.params.channelId, 10);
  const result = await marketplaceAI.suggestPrice(productId, channelId);
  res.json(result);
}));

// Anomaly detection across all listings
router.get('/ai/anomalies', authenticate, asyncHandler(async (req, res) => {
  const result = await marketplaceAI.detectAnomalies();
  res.json(result);
}));

// Natural language marketplace query
router.post('/ai/query', authenticate, asyncHandler(async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'question is required in request body' });
  }
  const result = await marketplaceAI.query(question);
  res.json(result);
}));

module.exports = router;
