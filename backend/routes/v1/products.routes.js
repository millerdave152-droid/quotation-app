/**
 * Product Routes - v1 API
 * Handles product catalog management
 */

const express = require('express');
const router = express.Router();

const {
  asyncHandler,
  ApiError,
  standardStack,
  adminStack,
  managerStack,
  parsePagination,
  validate,
  validateId
} = require('../../shared/middleware');

const { paginationSchema, cents, dollars, id } = require('../../shared/validation/schemas');
const Joi = require('joi');

// Dependencies injected via init()
let db;
let services;

/**
 * Initialize routes with dependencies
 */
const init = (deps) => {
  db = deps.db;
  services = deps.services || {};
  return router;
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createProductSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  model: Joi.string().max(100).required(),
  sku: Joi.string().max(100).optional().allow('', null),
  barcode: Joi.string().max(50).optional().allow('', null),
  description: Joi.string().max(2000).optional().allow('', null),
  categoryId: Joi.number().integer().positive().optional().allow(null),
  brandId: Joi.number().integer().positive().optional().allow(null),
  costCents: cents.optional(),
  cost: dollars.optional(),
  sellCents: cents.optional(),
  sell: dollars.optional(),
  msrpCents: cents.optional(),
  msrp: dollars.optional(),
  minQuantity: Joi.number().integer().min(0).default(0),
  maxQuantity: Joi.number().integer().min(0).optional().allow(null),
  reorderPoint: Joi.number().integer().min(0).default(0),
  taxable: Joi.boolean().default(true),
  trackInventory: Joi.boolean().default(true),
  isActive: Joi.boolean().default(true),
  weight: Joi.number().min(0).optional().allow(null),
  dimensions: Joi.object({
    length: Joi.number().min(0).optional(),
    width: Joi.number().min(0).optional(),
    height: Joi.number().min(0).optional(),
    unit: Joi.string().valid('cm', 'in').default('cm')
  }).optional(),
  imageUrl: Joi.string().uri().max(500).optional().allow('', null),
  notes: Joi.string().max(2000).optional().allow('', null)
}).or('costCents', 'cost').or('sellCents', 'sell');

const updateProductSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  model: Joi.string().max(100).optional(),
  sku: Joi.string().max(100).optional().allow('', null),
  barcode: Joi.string().max(50).optional().allow('', null),
  description: Joi.string().max(2000).optional().allow('', null),
  categoryId: Joi.number().integer().positive().optional().allow(null),
  brandId: Joi.number().integer().positive().optional().allow(null),
  costCents: cents.optional(),
  cost: dollars.optional(),
  sellCents: cents.optional(),
  sell: dollars.optional(),
  msrpCents: cents.optional(),
  msrp: dollars.optional(),
  minQuantity: Joi.number().integer().min(0).optional(),
  maxQuantity: Joi.number().integer().min(0).optional().allow(null),
  reorderPoint: Joi.number().integer().min(0).optional(),
  taxable: Joi.boolean().optional(),
  trackInventory: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
  weight: Joi.number().min(0).optional().allow(null),
  dimensions: Joi.object({
    length: Joi.number().min(0).optional(),
    width: Joi.number().min(0).optional(),
    height: Joi.number().min(0).optional(),
    unit: Joi.string().valid('cm', 'in').default('cm')
  }).optional(),
  imageUrl: Joi.string().uri().max(500).optional().allow('', null),
  notes: Joi.string().max(2000).optional().allow('', null)
});

const productQuerySchema = paginationSchema.keys({
  search: Joi.string().max(100).optional(),
  categoryId: id.optional(),
  brandId: id.optional(),
  isActive: Joi.boolean().optional(),
  inStock: Joi.boolean().optional(),
  lowStock: Joi.boolean().optional(),
  minPrice: dollars.optional(),
  maxPrice: dollars.optional()
});

const inventoryAdjustmentSchema = Joi.object({
  quantity: Joi.number().integer().required(),
  reason: Joi.string().max(255).required(),
  notes: Joi.string().max(500).optional().allow('', null)
});

// ============================================================================
// PRODUCT CRUD
// ============================================================================

/**
 * GET /api/v1/products
 * List products with search and filters
 */
router.get('/',
  ...standardStack,
  parsePagination(50, 500),
  validate(productQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset, sortBy, sortOrder } = req.pagination;
    const { search, categoryId, brandId, isActive, inStock, lowStock, minPrice, maxPrice } = req.query;

    let query = `
      SELECT
        p.id,
        p.name,
        p.model,
        p.sku,
        p.barcode,
        p.description,
        p.category_id,
        cat.name as category_name,
        p.brand_id,
        b.name as brand_name,
        p.cost_cents,
        p.sell_cents,
        p.msrp_cents,
        p.quantity_on_hand,
        p.quantity_reserved,
        p.quantity_available,
        p.min_quantity,
        p.reorder_point,
        p.taxable,
        p.track_inventory,
        p.is_active,
        p.image_url,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.deleted_at IS NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex++} OR p.model ILIKE $${paramIndex++} OR p.sku ILIKE $${paramIndex++} OR p.barcode = $${paramIndex++})`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, search);
    }

    if (categoryId) {
      query += ` AND p.category_id = $${paramIndex++}`;
      params.push(categoryId);
    }

    if (brandId) {
      query += ` AND p.brand_id = $${paramIndex++}`;
      params.push(brandId);
    }

    if (isActive !== undefined) {
      query += ` AND p.is_active = $${paramIndex++}`;
      params.push(isActive);
    }

    if (inStock === true) {
      query += ` AND p.quantity_available > 0`;
    } else if (inStock === false) {
      query += ` AND p.quantity_available <= 0`;
    }

    if (lowStock === true) {
      query += ` AND p.quantity_available <= p.reorder_point AND p.track_inventory = true`;
    }

    if (minPrice !== undefined) {
      query += ` AND p.sell_cents >= $${paramIndex++}`;
      params.push(Math.round(minPrice * 100));
    }

    if (maxPrice !== undefined) {
      query += ` AND p.sell_cents <= $${paramIndex++}`;
      params.push(Math.round(maxPrice * 100));
    }

    // Count query
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Sorting
    const validSortFields = ['name', 'model', 'sell_cents', 'quantity_available', 'created_at'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
    query += ` ORDER BY p.${sortField} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.success(result.rows, {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

/**
 * POST /api/v1/products
 * Create new product
 */
router.post('/',
  ...managerStack,
  validate(createProductSchema),
  asyncHandler(async (req, res) => {
    const {
      name,
      model,
      sku,
      barcode,
      description,
      categoryId,
      brandId,
      costCents,
      cost,
      sellCents,
      sell,
      msrpCents,
      msrp,
      minQuantity = 0,
      maxQuantity,
      reorderPoint = 0,
      taxable = true,
      trackInventory = true,
      isActive = true,
      weight,
      dimensions,
      imageUrl,
      notes
    } = req.body;

    // Convert dollars to cents if needed
    const finalCostCents = costCents || Math.round((cost || 0) * 100);
    const finalSellCents = sellCents || Math.round((sell || 0) * 100);
    const finalMsrpCents = msrpCents || (msrp ? Math.round(msrp * 100) : null);

    // Check for duplicate model
    const existingResult = await db.query(
      'SELECT id FROM products WHERE model = $1 AND deleted_at IS NULL',
      [model]
    );

    if (existingResult.rows.length > 0) {
      throw ApiError.conflict('Product with this model number already exists');
    }

    // Check for duplicate barcode if provided
    if (barcode) {
      const barcodeResult = await db.query(
        'SELECT id FROM products WHERE barcode = $1 AND deleted_at IS NULL',
        [barcode]
      );

      if (barcodeResult.rows.length > 0) {
        throw ApiError.conflict('Product with this barcode already exists');
      }
    }

    const result = await db.query(`
      INSERT INTO products (
        name, model, sku, barcode, description,
        category_id, brand_id,
        cost_cents, sell_cents, msrp_cents,
        min_quantity, max_quantity, reorder_point,
        taxable, track_inventory, is_active,
        weight, dimensions, image_url, notes,
        quantity_on_hand, quantity_reserved, quantity_available,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        0, 0, 0,
        $21
      )
      RETURNING *
    `, [
      name, model, sku || null, barcode || null, description || null,
      categoryId || null, brandId || null,
      finalCostCents, finalSellCents, finalMsrpCents,
      minQuantity, maxQuantity || null, reorderPoint,
      taxable, trackInventory, isActive,
      weight || null, dimensions ? JSON.stringify(dimensions) : null, imageUrl || null, notes || null,
      req.user.id
    ]);

    res.status(201).success(result.rows[0]);
  })
);

/**
 * GET /api/v1/products/:id
 * Get product details
 */
router.get('/:id',
  ...standardStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        p.*,
        cat.name as category_name,
        b.name as brand_name,
        u.username as created_by_name
      FROM products p
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Product not found');
    }

    const product = result.rows[0];

    // Get recent sales data
    const salesResult = await db.query(`
      SELECT
        COUNT(*) as times_sold,
        COALESCE(SUM(ti.quantity), 0) as total_quantity_sold,
        COALESCE(SUM(ti.line_total_cents), 0) as total_revenue_cents
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.transaction_id
      WHERE ti.product_id = $1 AND t.status = 'completed'
    `, [id]);

    // Get recent quote appearances
    const quoteResult = await db.query(`
      SELECT COUNT(*) as quote_appearances
      FROM quotation_items qi
      WHERE qi.product_id = $1
    `, [id]);

    res.success({
      ...product,
      salesStats: salesResult.rows[0],
      quoteAppearances: parseInt(quoteResult.rows[0]?.quote_appearances || 0)
    });
  })
);

/**
 * PUT /api/v1/products/:id
 * Update product
 */
router.put('/:id',
  ...managerStack,
  validateId('id'),
  validate(updateProductSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Check product exists
    const existingResult = await db.query(
      'SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw ApiError.notFound('Product not found');
    }

    // Check for duplicate model if being changed
    if (updates.model) {
      const modelResult = await db.query(
        'SELECT id FROM products WHERE model = $1 AND id != $2 AND deleted_at IS NULL',
        [updates.model, id]
      );

      if (modelResult.rows.length > 0) {
        throw ApiError.conflict('Another product with this model number already exists');
      }
    }

    // Check for duplicate barcode if being changed
    if (updates.barcode) {
      const barcodeResult = await db.query(
        'SELECT id FROM products WHERE barcode = $1 AND id != $2 AND deleted_at IS NULL',
        [updates.barcode, id]
      );

      if (barcodeResult.rows.length > 0) {
        throw ApiError.conflict('Another product with this barcode already exists');
      }
    }

    // Build update query dynamically
    const fieldMap = {
      name: 'name',
      model: 'model',
      sku: 'sku',
      barcode: 'barcode',
      description: 'description',
      categoryId: 'category_id',
      brandId: 'brand_id',
      minQuantity: 'min_quantity',
      maxQuantity: 'max_quantity',
      reorderPoint: 'reorder_point',
      taxable: 'taxable',
      trackInventory: 'track_inventory',
      isActive: 'is_active',
      weight: 'weight',
      imageUrl: 'image_url',
      notes: 'notes'
    };

    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(updates[key] === '' ? null : updates[key]);
      }
    }

    // Handle price fields (convert dollars to cents if needed)
    if (updates.costCents !== undefined || updates.cost !== undefined) {
      const costCents = updates.costCents || Math.round((updates.cost || 0) * 100);
      setClauses.push(`cost_cents = $${paramIndex++}`);
      params.push(costCents);
    }

    if (updates.sellCents !== undefined || updates.sell !== undefined) {
      const sellCents = updates.sellCents || Math.round((updates.sell || 0) * 100);
      setClauses.push(`sell_cents = $${paramIndex++}`);
      params.push(sellCents);
    }

    if (updates.msrpCents !== undefined || updates.msrp !== undefined) {
      const msrpCents = updates.msrpCents || (updates.msrp ? Math.round(updates.msrp * 100) : null);
      setClauses.push(`msrp_cents = $${paramIndex++}`);
      params.push(msrpCents);
    }

    // Handle dimensions
    if (updates.dimensions !== undefined) {
      setClauses.push(`dimensions = $${paramIndex++}`);
      params.push(updates.dimensions ? JSON.stringify(updates.dimensions) : null);
    }

    if (setClauses.length === 0) {
      return res.success(existingResult.rows[0]);
    }

    setClauses.push('updated_at = NOW()');

    const result = await db.query(`
      UPDATE products
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    res.success(result.rows[0]);
  })
);

/**
 * DELETE /api/v1/products/:id
 * Soft delete product
 */
router.delete('/:id',
  ...adminStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check product exists
    const existingResult = await db.query(
      'SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw ApiError.notFound('Product not found');
    }

    // Soft delete
    await db.query(
      'UPDATE products SET deleted_at = NOW(), is_active = false WHERE id = $1',
      [id]
    );

    res.success({ message: 'Product deleted successfully' });
  })
);

// ============================================================================
// INVENTORY OPERATIONS
// ============================================================================

/**
 * POST /api/v1/products/:id/inventory/adjust
 * Adjust inventory quantity
 */
router.post('/:id/inventory/adjust',
  ...managerStack,
  validateId('id'),
  validate(inventoryAdjustmentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { quantity, reason, notes } = req.body;

    const productResult = await db.query(
      'SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (productResult.rows.length === 0) {
      throw ApiError.notFound('Product not found');
    }

    const product = productResult.rows[0];

    if (!product.track_inventory) {
      throw ApiError.badRequest('This product does not track inventory');
    }

    const newQuantityOnHand = product.quantity_on_hand + quantity;

    if (newQuantityOnHand < 0) {
      throw ApiError.badRequest('Adjustment would result in negative inventory');
    }

    const newQuantityAvailable = newQuantityOnHand - product.quantity_reserved;

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Update product inventory
      const updateResult = await client.query(`
        UPDATE products
        SET quantity_on_hand = $2,
            quantity_available = $3,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, newQuantityOnHand, newQuantityAvailable]);

      // Log the adjustment
      await client.query(`
        INSERT INTO inventory_adjustments (
          product_id, quantity_change, reason, notes,
          previous_quantity, new_quantity, adjusted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, quantity, reason, notes || null, product.quantity_on_hand, newQuantityOnHand, req.user.id]);

      await client.query('COMMIT');

      res.success({
        ...updateResult.rows[0],
        adjustment: {
          quantityChange: quantity,
          previousQuantity: product.quantity_on_hand,
          newQuantity: newQuantityOnHand,
          reason
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/products/:id/inventory/history
 * Get inventory adjustment history
 */
router.get('/:id/inventory/history',
  ...standardStack,
  validateId('id'),
  parsePagination(50, 200),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { page, limit, offset } = req.pagination;

    const productResult = await db.query(
      'SELECT id, name, model FROM products WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (productResult.rows.length === 0) {
      throw ApiError.notFound('Product not found');
    }

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM inventory_adjustments WHERE product_id = $1',
      [id]
    );
    const total = parseInt(countResult.rows[0]?.total || 0);

    const result = await db.query(`
      SELECT
        ia.*,
        u.username as adjusted_by_name
      FROM inventory_adjustments ia
      LEFT JOIN users u ON ia.adjusted_by = u.id
      WHERE ia.product_id = $1
      ORDER BY ia.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    res.success(result.rows, {
      product: productResult.rows[0],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

// ============================================================================
// PRODUCT STATISTICS
// ============================================================================

/**
 * GET /api/v1/products/stats
 * Get product statistics
 */
router.get('/stats',
  ...standardStack,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active THEN 1 END) as active_products,
        COUNT(CASE WHEN quantity_available <= 0 AND track_inventory THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN quantity_available <= reorder_point AND quantity_available > 0 AND track_inventory THEN 1 END) as low_stock,
        COALESCE(SUM(quantity_on_hand * cost_cents), 0) as total_inventory_value_cents,
        COALESCE(AVG(sell_cents), 0) as average_sell_price_cents
      FROM products
      WHERE deleted_at IS NULL
    `);

    res.success(result.rows[0]);
  })
);

/**
 * GET /api/v1/products/low-stock
 * Get products with low stock
 */
router.get('/low-stock',
  ...standardStack,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT
        id, name, model, sku,
        quantity_on_hand, quantity_available, reorder_point, min_quantity
      FROM products
      WHERE deleted_at IS NULL
        AND is_active = true
        AND track_inventory = true
        AND quantity_available <= reorder_point
      ORDER BY (quantity_available - reorder_point) ASC
      LIMIT 50
    `);

    res.success(result.rows);
  })
);

module.exports = { router, init };
