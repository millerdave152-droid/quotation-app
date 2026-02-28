/**
 * TeleTime - Order Modifications Routes
 *
 * API endpoints for modifying orders that originated from quotes
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const OrderModificationService = require('../services/OrderModificationService');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================

let pool = null;
let cache = null;
let modificationService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const setPriceLockSchema = Joi.object({
  locked: Joi.boolean().required(),
  lockUntil: Joi.date().iso().optional().allow(null),
});

const addItemSchema = Joi.object({
  productId: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).required(),
  overridePrice: Joi.number().min(0).optional(),
  notes: Joi.string().max(500).optional(),
});

const removeItemSchema = Joi.object({
  productId: Joi.number().integer().required(),
  reason: Joi.string().max(500).optional(),
});

const modifyItemSchema = Joi.object({
  productId: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(0).optional(),
  overridePrice: Joi.number().min(0).optional(),
  notes: Joi.string().max(500).optional(),
});

const createAmendmentSchema = Joi.object({
  amendmentType: Joi.string()
    .valid('item_added', 'item_removed', 'item_modified', 'quantity_changed', 'price_changed')
    .required(),
  reason: Joi.string().max(1000).optional(),
  useQuotePrices: Joi.boolean().default(false),
  addItems: Joi.array().items(addItemSchema).optional(),
  removeItems: Joi.array().items(removeItemSchema).optional(),
  modifyItems: Joi.array().items(modifyItemSchema).optional(),
});

const approveAmendmentSchema = Joi.object({
  notes: Joi.string().max(500).optional().allow('', null),
});

const rejectAmendmentSchema = Joi.object({
  reason: Joi.string().min(3).max(500).required(),
});

const createShipmentSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        orderItemId: Joi.number().integer().required(),
        quantityShipped: Joi.number().integer().min(1).required(),
        serialNumbers: Joi.array().items(Joi.string()).optional(),
      })
    )
    .min(1)
    .required(),
  carrier: Joi.string().max(100).optional(),
  trackingNumber: Joi.string().max(200).optional(),
  trackingUrl: Joi.string().uri().optional(),
  shippingCostCents: Joi.number().integer().min(0).optional(),
  notes: Joi.string().max(500).optional(),
});

const markBackorderedSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        orderItemId: Joi.number().integer().required(),
        quantity: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .required(),
});

// ============================================================================
// PERMISSION / AUDIT / TAX ROUTES (must be before parameterized /:orderId)
// ============================================================================

/**
 * GET /api/order-modifications/check-permission/:orderId
 * Pre-check whether the current user can edit a specific order
 */
router.get('/check-permission/:orderId',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get order status
    const orderResult = await pool.query(
      'SELECT id, status, order_number FROM orders WHERE id = $1',
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      throw ApiError.notFound('Order not found');
    }
    const order = orderResult.rows[0];

    // Get role permissions from amendment_permissions table
    const permResult = await pool.query(
      'SELECT * FROM amendment_permissions WHERE role_name = $1',
      [userRole]
    );

    const isPostInvoice = ['invoiced', 'paid', 'order_completed', 'completed'].includes(order.status);
    let canEdit = false;
    let requiresApproval = true;
    let maxAdjustmentCents = null;
    let reason = '';

    if (permResult.rows.length > 0) {
      const perm = permResult.rows[0];
      canEdit = isPostInvoice ? perm.can_edit_post_invoice : perm.can_edit_pre_invoice;
      requiresApproval = perm.requires_approval;
      maxAdjustmentCents = perm.max_adjustment_cents;

      if (!canEdit) {
        reason = isPostInvoice
          ? 'Your role cannot edit post-invoice orders'
          : 'Your role cannot edit orders';
      }
    } else {
      // No permission entry for this role — default to no access
      reason = 'No amendment permissions configured for your role';
    }

    res.json({
      success: true,
      data: {
        canEdit,
        requiresApproval,
        maxAdjustmentCents,
        maxAdjustmentDollars: maxAdjustmentCents ? maxAdjustmentCents / 100 : null,
        orderStatus: order.status,
        isPostInvoice,
        reason,
      }
    });
  })
);

/**
 * GET /api/order-modifications/audit-report
 * Date-range audit export — admin only
 */
router.get('/audit-report',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw ApiError.badRequest('startDate and endDate query parameters are required');
    }

    const result = await pool.query(
      `SELECT * FROM v_amendment_audit_report
       WHERE amendment_date >= $1 AND amendment_date < ($2::date + INTERVAL '1 day')
       ORDER BY amendment_date`,
      [startDate, endDate]
    );

    res.json({
      success: true,
      data: result.rows,
      meta: {
        startDate,
        endDate,
        totalRecords: result.rows.length,
      }
    });
  })
);

/**
 * GET /api/order-modifications/year-end-summary/:year
 * Year-end tax summary — admin only
 */
router.get('/year-end-summary/:year',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const year = parseInt(req.params.year);

    if (isNaN(year) || year < 2000 || year > 2100) {
      throw ApiError.badRequest('Invalid year');
    }

    const result = await pool.query(
      `SELECT * FROM v_year_end_tax_summary
       WHERE EXTRACT(YEAR FROM month) = $1
       ORDER BY month`,
      [year]
    );

    // Also get annual totals
    const totalsResult = await pool.query(
      `SELECT
        SUM(total_amendments)::integer as total_amendments,
        SUM(applied_amendments)::integer as applied_amendments,
        SUM(rejected_amendments)::integer as rejected_amendments,
        SUM(net_adjustment_total) as net_adjustment_total,
        SUM(total_increases) as total_increases,
        SUM(total_decreases) as total_decreases,
        SUM(credit_memos_issued)::integer as credit_memos_issued,
        SUM(credit_memo_total) as credit_memo_total
       FROM v_year_end_tax_summary
       WHERE EXTRACT(YEAR FROM month) = $1`,
      [year]
    );

    res.json({
      success: true,
      data: {
        year,
        monthly: result.rows,
        annual: totalsResult.rows[0] || {},
      }
    });
  })
);

// ============================================================================
// ORDER ROUTES
// ============================================================================

/**
 * GET /api/order-modifications/:orderId
 * Get order with quote info and modification details
 */
router.get(
  '/:orderId',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const order = await modificationService.getOrderWithQuoteInfo(orderId);

    if (!order) {
      throw ApiError.notFound('Order');
    }

    res.json({
      success: true,
      data: order,
    });
  })
);

/**
 * GET /api/order-modifications/:orderId/price-options/:productId
 * Get price options for an item (quote vs current price)
 */
router.get(
  '/:orderId/price-options/:productId',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const productId = parseInt(req.params.productId);

    const options = await modificationService.getItemPriceOptions(orderId, productId);

    if (!options) {
      throw ApiError.notFound('Order or product');
    }

    res.json({
      success: true,
      data: options,
    });
  })
);

// ============================================================================
// PRICE LOCK ROUTES
// ============================================================================

/**
 * PUT /api/order-modifications/:orderId/price-lock
 * Set or clear price lock on order
 */
router.put(
  '/:orderId/price-lock',
  authenticate,
  requireRole('admin', 'manager', 'sales'),
  asyncHandler(async (req, res) => {
    const { error, value } = setPriceLockSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const orderId = parseInt(req.params.orderId);
    const result = await modificationService.setPriceLock(
      orderId,
      value.locked,
      value.lockUntil,
      req.user.id
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      message: value.locked ? 'Price lock enabled' : 'Price lock disabled',
      data: result,
    });
  })
);

/**
 * GET /api/order-modifications/:orderId/price-locked
 * Check if order prices are locked
 */
router.get(
  '/:orderId/price-locked',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const isLocked = await modificationService.isPriceLocked(orderId);

    res.json({
      success: true,
      data: { priceLocked: isLocked },
    });
  })
);

// ============================================================================
// AMENDMENT ROUTES
// ============================================================================

/**
 * POST /api/order-modifications/:orderId/amendments
 * Create a new amendment for order modification
 */
router.post(
  '/:orderId/amendments',
  authenticate,
  asyncHandler(async (req, res) => {
    const { error, value } = createAmendmentSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const orderId = parseInt(req.params.orderId);
    const result = await modificationService.createAmendment(
      orderId,
      value.amendmentType,
      value,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/order-modifications/:orderId/amendments
 * Get all amendments for an order
 */
router.get(
  '/:orderId/amendments',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const amendments = await modificationService.getOrderAmendments(orderId);

    res.json({
      success: true,
      data: amendments,
    });
  })
);

/**
 * GET /api/order-modifications/amendments/pending
 * Get all pending amendments for approval
 */
router.get(
  '/amendments/pending',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const amendments = await modificationService.getPendingAmendments(limit);

    res.json({
      success: true,
      data: amendments,
    });
  })
);

/**
 * GET /api/order-modifications/amendments/:amendmentId
 * Get amendment details
 */
router.get(
  '/amendments/:amendmentId',
  authenticate,
  asyncHandler(async (req, res) => {
    const amendmentId = parseInt(req.params.amendmentId);
    const amendment = await modificationService.getAmendment(amendmentId);

    if (!amendment) {
      throw ApiError.notFound('Amendment');
    }

    res.json({
      success: true,
      data: amendment,
    });
  })
);

/**
 * POST /api/order-modifications/amendments/:amendmentId/approve
 * Approve a pending amendment
 */
router.post(
  '/amendments/:amendmentId/approve',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { error, value } = approveAmendmentSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const amendmentId = parseInt(req.params.amendmentId);
    const result = await modificationService.approveAmendment(
      amendmentId,
      req.user.id,
      value.notes
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      message: 'Amendment approved',
      data: result.amendment,
    });
  })
);

/**
 * POST /api/order-modifications/amendments/:amendmentId/reject
 * Reject a pending amendment
 */
router.post(
  '/amendments/:amendmentId/reject',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { error, value } = rejectAmendmentSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const amendmentId = parseInt(req.params.amendmentId);
    const result = await modificationService.rejectAmendment(
      amendmentId,
      req.user.id,
      value.reason
    );

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    res.json({
      success: true,
      message: 'Amendment rejected',
      data: result.amendment,
    });
  })
);

/**
 * POST /api/order-modifications/amendments/:amendmentId/apply
 * Apply an approved amendment to the order
 */
router.post(
  '/amendments/:amendmentId/apply',
  authenticate,
  asyncHandler(async (req, res) => {
    const amendmentId = parseInt(req.params.amendmentId);
    const result = await modificationService.applyAmendment(
      amendmentId,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Amendment applied successfully',
      data: result,
    });
  })
);

// ============================================================================
// VERSION ROUTES
// ============================================================================

/**
 * GET /api/order-modifications/:orderId/versions
 * Get order version history
 */
router.get(
  '/:orderId/versions',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const versions = await modificationService.getOrderVersions(orderId);

    res.json({
      success: true,
      data: versions,
    });
  })
);

/**
 * GET /api/order-modifications/:orderId/versions/compare
 * Compare two order versions
 */
router.get(
  '/:orderId/versions/compare',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const version1 = parseInt(req.query.v1);
    const version2 = parseInt(req.query.v2);

    if (!version1 || !version2) {
      throw ApiError.badRequest('Both v1 and v2 query parameters are required');
    }

    const comparison = await modificationService.compareVersions(
      orderId,
      version1,
      version2
    );

    if (!comparison) {
      throw ApiError.notFound('One or both versions');
    }

    res.json({
      success: true,
      data: comparison,
    });
  })
);

// ============================================================================
// FULFILLMENT ROUTES
// ============================================================================

/**
 * GET /api/order-modifications/:orderId/fulfillment
 * Get fulfillment summary for an order
 */
router.get(
  '/:orderId/fulfillment',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const summary = await modificationService.getFulfillmentSummary(orderId);

    res.json({
      success: true,
      data: summary,
    });
  })
);

/**
 * POST /api/order-modifications/:orderId/shipments
 * Create a new shipment (partial or full)
 */
router.post(
  '/:orderId/shipments',
  authenticate,
  requireRole('admin', 'manager', 'warehouse'),
  asyncHandler(async (req, res) => {
    const { error, value } = createShipmentSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const orderId = parseInt(req.params.orderId);
    const result = await modificationService.createShipment(
      orderId,
      value.items,
      {
        carrier: value.carrier,
        trackingNumber: value.trackingNumber,
        trackingUrl: value.trackingUrl,
        shippingCostCents: value.shippingCostCents,
        notes: value.notes,
      },
      req.user.id
    );

    res.status(201).json({
      success: true,
      message: 'Shipment created',
      data: result,
    });
  })
);

/**
 * GET /api/order-modifications/:orderId/shipments
 * Get all shipments for an order
 */
router.get(
  '/:orderId/shipments',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    const shipments = await modificationService.getOrderShipments(orderId);

    res.json({
      success: true,
      data: shipments,
    });
  })
);

/**
 * POST /api/order-modifications/:orderId/backorder
 * Mark items as backordered
 */
router.post(
  '/:orderId/backorder',
  authenticate,
  requireRole('admin', 'manager', 'warehouse'),
  asyncHandler(async (req, res) => {
    const { error, value } = markBackorderedSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const orderId = parseInt(req.params.orderId);
    const result = await modificationService.markBackordered(
      orderId,
      value.items,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Items marked as backordered',
      data: result,
    });
  })
);

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  modificationService = new OrderModificationService(pool, cache);

  // Wire CreditMemoService so amendments can auto-generate credit memos
  const CreditMemoService = require('../services/CreditMemoService');
  const cms = new CreditMemoService(pool, cache);
  modificationService.setCreditMemoService(cms);

  return router;
};

module.exports = { init };
