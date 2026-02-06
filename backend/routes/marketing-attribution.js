/**
 * TeleTime - Marketing Attribution Routes
 * CRUD for marketing sources and attribution reporting.
 */

const express = require('express');
const Joi = require('joi');
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

let pool = null;

const router = express.Router();
router.use(authenticate);

// ============================================================================
// GET /api/marketing-sources — List active marketing sources
// ============================================================================

router.get('/', asyncHandler(async (req, res) => {
  const includeInactive = req.query.all === 'true';

  const result = await pool.query(
    `SELECT id, code, name, label, category, is_active, sort_order, requires_detail
     FROM marketing_sources
     ${includeInactive ? '' : 'WHERE (is_active = true OR active = true)'}
     ORDER BY sort_order, name`
  );

  res.json({
    success: true,
    data: result.rows.map(row => ({
      id: row.id,
      code: row.code || row.label,
      name: row.name || row.label,
      label: row.label,
      category: row.category,
      isActive: row.is_active ?? row.active ?? true,
      sortOrder: row.sort_order,
      requiresDetail: row.requires_detail || false,
    })),
  });
}));

// ============================================================================
// POST /api/marketing-sources — Create a new source (admin)
// ============================================================================

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const schema = Joi.object({
    code: Joi.string().max(50).required(),
    name: Joi.string().max(100).required(),
    category: Joi.string().valid('digital', 'traditional', 'referral', 'direct', 'other').required(),
    sortOrder: Joi.number().integer().default(50),
    requiresDetail: Joi.boolean().default(false),
  });

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const result = await pool.query(
    `INSERT INTO marketing_sources (code, name, label, category, sort_order, is_active, active, requires_detail)
     VALUES ($1, $2, $2, $3, $4, true, true, $5)
     RETURNING *`,
    [value.code, value.name, value.category, value.sortOrder, value.requiresDetail]
  );

  const row = result.rows[0];
  res.status(201).json({
    success: true,
    data: {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      isActive: true,
      sortOrder: row.sort_order,
      requiresDetail: row.requires_detail,
    },
  });
}));

// ============================================================================
// PUT /api/marketing-sources/:id — Update a source (admin)
// ============================================================================

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw ApiError.badRequest('Invalid source ID');

  const schema = Joi.object({
    name: Joi.string().max(100).optional(),
    category: Joi.string().valid('digital', 'traditional', 'referral', 'direct', 'other').optional(),
    sortOrder: Joi.number().integer().optional(),
    requiresDetail: Joi.boolean().optional(),
    isActive: Joi.boolean().optional(),
  }).min(1);

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const sets = [];
  const params = [];
  let idx = 1;

  if (value.name !== undefined) { sets.push(`name = $${idx}, label = $${idx}`); params.push(value.name); idx++; }
  if (value.category !== undefined) { sets.push(`category = $${idx}`); params.push(value.category); idx++; }
  if (value.sortOrder !== undefined) { sets.push(`sort_order = $${idx}`); params.push(value.sortOrder); idx++; }
  if (value.requiresDetail !== undefined) { sets.push(`requires_detail = $${idx}`); params.push(value.requiresDetail); idx++; }
  if (value.isActive !== undefined) { sets.push(`is_active = $${idx}, active = $${idx}`); params.push(value.isActive); idx++; }

  params.push(id);

  const result = await pool.query(
    `UPDATE marketing_sources SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (result.rows.length === 0) throw ApiError.notFound('Marketing source');

  const row = result.rows[0];
  res.json({
    success: true,
    data: {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      requiresDetail: row.requires_detail,
    },
  });
}));

// ============================================================================
// REPORT ROUTER — mounted at /api/reports
// ============================================================================

const reportRouter = express.Router();
reportRouter.use(authenticate);

/**
 * GET /api/reports/marketing-attribution
 * Query: date_from, date_to, group_by (source|category), source (orders|customers|both)
 */
reportRouter.get('/marketing-attribution', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const schema = Joi.object({
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().optional(),
    group_by: Joi.string().valid('source', 'category').default('source'),
    source: Joi.string().valid('orders', 'customers', 'both').default('both'),
  });

  const { error, value } = schema.validate(req.query, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const dateFrom = value.date_from || null;
  const dateTo = value.date_to || null;

  const results = {};

  // Orders attribution
  if (value.source !== 'customers') {
    const groupCol = value.group_by === 'category' ? 'ms.category' : 'ms.name';
    const groupAlias = value.group_by === 'category' ? 'category' : 'source_name';

    let orderQuery = `
      SELECT
        ${groupCol} AS ${groupAlias},
        ms.id AS source_id,
        COUNT(o.id) AS order_count,
        COALESCE(SUM(o.total_cents), 0) AS total_revenue_cents,
        COALESCE(AVG(o.total_cents), 0)::INTEGER AS avg_order_cents
      FROM unified_orders o
      JOIN marketing_sources ms ON o.marketing_source_id = ms.id
      WHERE o.status NOT IN ('void', 'draft')
    `;
    const orderParams = [];
    let paramIdx = 1;

    if (dateFrom) { orderQuery += ` AND o.created_at >= $${paramIdx}`; orderParams.push(dateFrom); paramIdx++; }
    if (dateTo) { orderQuery += ` AND o.created_at <= $${paramIdx}`; orderParams.push(dateTo); paramIdx++; }

    orderQuery += ` GROUP BY ${groupCol}, ms.id ORDER BY total_revenue_cents DESC`;

    const orderResult = await pool.query(orderQuery, orderParams);
    results.orders = orderResult.rows.map(row => ({
      ...(value.group_by === 'category' ? { category: row.category } : { sourceName: row.source_name }),
      sourceId: row.source_id,
      orderCount: parseInt(row.order_count),
      totalRevenueCents: parseInt(row.total_revenue_cents),
      totalRevenue: parseInt(row.total_revenue_cents) / 100,
      avgOrderCents: parseInt(row.avg_order_cents),
      avgOrder: parseInt(row.avg_order_cents) / 100,
    }));
  }

  // Customer acquisition attribution
  if (value.source !== 'orders') {
    const groupCol = value.group_by === 'category' ? 'ms.category' : 'ms.name';
    const groupAlias = value.group_by === 'category' ? 'category' : 'source_name';

    let custQuery = `
      SELECT
        ${groupCol} AS ${groupAlias},
        ms.id AS source_id,
        COUNT(c.id) AS customer_count
      FROM customers c
      JOIN marketing_sources ms ON c.marketing_source_id = ms.id
      WHERE 1=1
    `;
    const custParams = [];
    let paramIdx = 1;

    if (dateFrom) { custQuery += ` AND c.first_contact_date >= $${paramIdx}`; custParams.push(dateFrom); paramIdx++; }
    if (dateTo) { custQuery += ` AND c.first_contact_date <= $${paramIdx}`; custParams.push(dateTo); paramIdx++; }

    custQuery += ` GROUP BY ${groupCol}, ms.id ORDER BY customer_count DESC`;

    const custResult = await pool.query(custQuery, custParams);
    results.customers = custResult.rows.map(row => ({
      ...(value.group_by === 'category' ? { category: row.category } : { sourceName: row.source_name }),
      sourceId: row.source_id,
      customerCount: parseInt(row.customer_count),
    }));
  }

  // Also include orders/customers with no marketing source
  if (value.source !== 'customers') {
    let unattribQuery = `
      SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS revenue
      FROM unified_orders
      WHERE marketing_source_id IS NULL AND status NOT IN ('void', 'draft')
    `;
    const unattribParams = [];
    let idx = 1;
    if (dateFrom) { unattribQuery += ` AND created_at >= $${idx}`; unattribParams.push(dateFrom); idx++; }
    if (dateTo) { unattribQuery += ` AND created_at <= $${idx}`; unattribParams.push(dateTo); idx++; }

    const unattrib = await pool.query(unattribQuery, unattribParams);
    results.unattributedOrders = {
      count: parseInt(unattrib.rows[0].count),
      revenueCents: parseInt(unattrib.rows[0].revenue),
      revenue: parseInt(unattrib.rows[0].revenue) / 100,
    };
  }

  res.json({ success: true, data: results });
}));

// Also add to legacy customers/transactions via text-based marketing_source
// fallback: include text-based attribution from customers table
reportRouter.get('/marketing-attribution/legacy', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const dateFrom = req.query.date_from || null;
  const dateTo = req.query.date_to || null;

  let query = `
    SELECT
      COALESCE(marketing_source, 'Unknown') AS source,
      COUNT(*) AS customer_count
    FROM customers
    WHERE marketing_source IS NOT NULL
  `;
  const params = [];
  let idx = 1;
  if (dateFrom) { query += ` AND created_at >= $${idx}`; params.push(dateFrom); idx++; }
  if (dateTo) { query += ` AND created_at <= $${idx}`; params.push(dateTo); idx++; }
  query += ` GROUP BY marketing_source ORDER BY customer_count DESC`;

  const result = await pool.query(query, params);
  res.json({
    success: true,
    data: result.rows.map(r => ({
      source: r.source,
      customerCount: parseInt(r.customer_count),
    })),
  });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  return { sourcesRouter: router, reportRouter };
};

module.exports = { init };
