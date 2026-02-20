/**
 * TeleTime POS - Price Override Approval Routes
 *
 * API endpoints for the tiered price-override approval workflow.
 *
 * Route groups:
 *   Salesperson  – create requests, respond to counter-offers, cancel
 *   Manager      – approve / deny / counter, view pending queue, product history
 *   Admin        – analytics, tier settings, audit log
 *   Internal     – token consumption (called by cart/checkout service)
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const wsService = require('../services/WebSocketService');
const pool = require('../db');

/** Look up a product's display name by ID. Returns null if not found. */
async function getProductName(dbPool, productId) {
  if (!productId) return null;
  const { rows: [row] } = await dbPool.query(
    `SELECT name FROM products WHERE id = $1`, [productId]
  );
  return row?.name || null;
}

/**
 * Middleware: allow access if the user has one of the listed roles OR
 * holds an active delegation from someone who does.
 */
function requireRoleOrDelegation(...allowedRoles) {
  return async (req, res, next) => {
    const userRole = req.user?.role;
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // Check for active delegation
    try {
      const { rows } = await pool.query(
        `SELECT md.id, u.role AS delegator_role
         FROM manager_delegations md
         JOIN users u ON u.id = md.delegator_id
         WHERE md.delegate_id = $1
           AND md.active = TRUE
           AND md.starts_at <= NOW()
           AND md.expires_at > NOW()
         LIMIT 1`,
        [req.user.id]
      );

      if (rows.length > 0 && allowedRoles.includes(rows[0].delegator_role)) {
        req.activeDelegation = rows[0];
        return next();
      }
    } catch (err) {
      console.error('[Auth] Delegation check failed:', err.message);
    }

    return res.status(403).json({
      success: false,
      error: `Requires one of: ${allowedRoles.join(', ')}`,
    });
  };
}

/**
 * Initialise routes with the ApprovalService instance.
 * @param {ApprovalService} approvalService
 */
module.exports = function (approvalService) {
  // All routes require authentication
  router.use(authenticate);

  // ============================================================================
  // SALESPERSON ROUTES
  // ============================================================================

  /**
   * POST /api/approvals/request
   * Create a new price-override approval request.
   * Tier 1 requests are auto-approved and return immediately.
   */
  router.post('/request', asyncHandler(async (req, res) => {
    const { cartId, cartItemId, productId, managerId, requestedPrice } = req.body;

    if (productId == null || requestedPrice == null) {
      throw ApiError.badRequest('productId and requestedPrice are required');
    }

    const result = await approvalService.createRequest({
      cartId: cartId || null,
      cartItemId: cartItemId || null,
      productId: parseInt(productId, 10),
      salespersonId: req.user.id,
      managerId: managerId ? parseInt(managerId, 10) : null,
      requestedPrice: parseFloat(requestedPrice),
    });

    const statusCode = result.autoApproved ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: result,
    });

    // WS: notify manager(s) of new pending request
    if (!result.autoApproved) {
      try {
        const pool = approvalService.pool;
        const productName = await getProductName(pool, result.product_id);
        const salespersonName = `${req.user.firstName} ${req.user.lastName}`;
        const requestData = {
          requestId:      result.id,
          productName,
          requestedPrice: parseFloat(result.requested_price),
          originalPrice:  parseFloat(result.original_price),
          cost:           parseFloat(result.cost_at_time),
          marginAmount:   parseFloat(result.margin_amount),
          marginPercent:  parseFloat(result.margin_percent),
          salespersonName,
          tier:           result.tier,
          tierName:       result.tierName,
          createdAt:      result.created_at,
        };
        if (result.manager_id) {
          wsService.sendToUser(result.manager_id, 'approval:request', requestData);
        } else {
          wsService.broadcastToRoles(['manager', 'senior_manager', 'admin'], 'approval:request', requestData);
        }
      } catch (err) {
        console.error('[WS] approval:request notification failed:', err.message);
      }
    }
  }));

  /**
   * GET /api/approvals/:id/status
   * Polling endpoint – returns current status of a request.
   */
  router.get('/:id/status', asyncHandler(async (req, res) => {
    const details = await approvalService.getRequestWithDetails({
      requestId: parseInt(req.params.id, 10),
    });

    res.json({
      success: true,
      data: {
        id: details.id,
        status: details.status,
        tier: details.tier,
        tierName: details.tier_name,
        originalPrice: details.original_price,
        requestedPrice: details.requested_price,
        approvedPrice: details.approved_price,
        marginPercent: details.margin_percent,
        method: details.method,
        managerName: details.manager_name,
        responseTimeMs: details.response_time_ms,
        createdAt: details.created_at,
        respondedAt: details.responded_at,
        counterOffers: details.counterOffers,
      },
    });
  }));

  /**
   * POST /api/approvals/:id/accept-counter
   * Salesperson accepts the manager's counter-offer.
   */
  router.post('/:id/accept-counter', asyncHandler(async (req, res) => {
    const { counterOfferId } = req.body;
    if (!counterOfferId) {
      throw ApiError.badRequest('counterOfferId is required');
    }

    const coId = parseInt(counterOfferId, 10);
    const result = await approvalService.acceptCounterOffer({
      counterOfferId: coId,
      salespersonId: req.user.id,
    });

    res.json({ success: true, data: result });

    // WS: notify manager that their counter-offer was accepted
    try {
      if (result.manager_id) {
        const salespersonName = `${req.user.firstName} ${req.user.lastName}`;
        wsService.sendToUser(result.manager_id, 'approval:counter-accepted', {
          requestId:     result.id,
          counterOfferId: coId,
          approvedPrice: parseFloat(result.approved_price),
          salespersonName,
        });
      }
    } catch (err) {
      console.error('[WS] approval:counter-accepted notification failed:', err.message);
    }
  }));

  /**
   * POST /api/approvals/:id/decline-counter
   * Salesperson declines the manager's counter-offer.
   */
  router.post('/:id/decline-counter', asyncHandler(async (req, res) => {
    const { counterOfferId } = req.body;
    if (!counterOfferId) {
      throw ApiError.badRequest('counterOfferId is required');
    }

    const coId = parseInt(counterOfferId, 10);
    const result = await approvalService.declineCounterOffer({
      counterOfferId: coId,
      salespersonId: req.user.id,
    });

    res.json({ success: true, data: result });

    // WS: notify manager that their counter-offer was declined
    try {
      if (result.manager_id) {
        const salespersonName = `${req.user.firstName} ${req.user.lastName}`;
        wsService.sendToUser(result.manager_id, 'approval:counter-declined', {
          requestId:      result.id,
          counterOfferId: coId,
          salespersonName,
        });
      }
    } catch (err) {
      console.error('[WS] approval:counter-declined notification failed:', err.message);
    }
  }));

  /**
   * POST /api/approvals/:id/cancel
   * Salesperson cancels their own pending/countered request.
   */
  router.post('/:id/cancel', asyncHandler(async (req, res) => {
    const result = await approvalService.cancelRequest({
      requestId: parseInt(req.params.id, 10),
      salespersonId: req.user.id,
    });

    res.json({ success: true, data: result });

    // WS: notify the assigned manager that the request was cancelled
    try {
      if (result.manager_id) {
        const salespersonName = `${req.user.firstName} ${req.user.lastName}`;
        wsService.sendToUser(result.manager_id, 'approval:cancelled', {
          requestId: result.id,
          salespersonName,
        });
      }
    } catch (err) {
      console.error('[WS] approval:cancelled notification failed:', err.message);
    }
  }));

  /**
   * GET /api/approvals/managers/available
   * List managers who are online/away and authorised for the given tier.
   */
  router.get('/managers/available', asyncHandler(async (req, res) => {
    const { tier } = req.query;
    if (!tier) {
      throw ApiError.badRequest('tier query parameter is required');
    }

    const managers = await approvalService.getAvailableManagers({
      tier: parseInt(tier, 10),
    });

    res.json({ success: true, data: managers });
  }));

  // ============================================================================
  // MANAGER ROUTES (manager / admin)
  // ============================================================================

  /**
   * GET /api/approvals/pending
   * All pending requests assigned to (or available for) the current manager.
   */
  router.get('/pending', requireRoleOrDelegation('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const pool = approvalService.pool;

    const { rows } = await pool.query(
      `SELECT
         ar.*,
         ar.request_type,
         ar.batch_label,
         ar.parent_request_id,
         p.name   AS product_name,
         p.sku    AS product_sku,
         CONCAT(s.first_name, ' ', s.last_name) AS salesperson_name,
         ats.name AS tier_name,
         ats.timeout_seconds,
         ats.requires_reason_code
       FROM approval_requests ar
       LEFT JOIN products p ON ar.product_id = p.id
       JOIN users s    ON ar.salesperson_id = s.id
       LEFT JOIN approval_tier_settings ats ON ats.tier = ar.tier
       WHERE ar.status IN ('pending', 'countered')
         AND (ar.manager_id = $1 OR ar.manager_id IS NULL)
         AND (ar.request_type IS NULL OR ar.request_type IN ('single', 'batch'))
       ORDER BY ar.created_at ASC`,
      [req.user.id]
    );

    res.json({ success: true, data: rows });
  }));

  /**
   * POST /api/approvals/:id/approve
   * Manager approves a pending request.
   */
  router.post('/:id/approve', requireRoleOrDelegation('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const { method } = req.body;

    const result = await approvalService.approveRequest({
      requestId: parseInt(req.params.id, 10),
      managerId: req.user.id,
      method: method || 'remote',
    });

    res.json({ success: true, data: result });

    // WS: notify salesperson of approval
    try {
      const managerName = `${req.user.firstName} ${req.user.lastName}`;
      const delegation = result._delegation;
      wsService.sendToUser(result.salesperson_id, 'approval:approved', {
        requestId:     result.id,
        approvedPrice: parseFloat(result.approved_price),
        originalPrice: parseFloat(result.original_price),
        marginPercent: result.margin_percent,
        managerName:   delegation
          ? `${managerName} (delegated by ${delegation.delegator_name})`
          : managerName,
        managerId:     req.user.id,
        method:        result.method,
        approvalToken: result.approval_token,
        respondedAt:   result.responded_at,
      });
      // Notify delegator that their delegation was used
      if (delegation) {
        wsService.sendToUser(delegation.delegator_id, 'delegation:used', {
          delegationId: delegation.id,
          delegateName: managerName,
          action: 'approved',
          requestId: result.id,
        });
      }
    } catch (err) {
      console.error('[WS] approval:approved notification failed:', err.message);
    }
  }));

  /**
   * POST /api/approvals/:id/deny
   * Manager denies a pending request.
   */
  router.post('/:id/deny', requireRoleOrDelegation('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const { reasonCode, reasonNote } = req.body;

    const result = await approvalService.denyRequest({
      requestId: parseInt(req.params.id, 10),
      managerId: req.user.id,
      reasonCode: reasonCode || null,
      reasonNote: reasonNote || null,
    });

    res.json({ success: true, data: result });

    // WS: notify salesperson of denial
    try {
      const managerName = `${req.user.firstName} ${req.user.lastName}`;
      const delegation = result._delegation;
      wsService.sendToUser(result.salesperson_id, 'approval:denied', {
        requestId:  result.id,
        reasonCode: result.reason_code,
        reasonNote: result.reason_note,
        managerName: delegation
          ? `${managerName} (delegated by ${delegation.delegator_name})`
          : managerName,
      });
      if (delegation) {
        wsService.sendToUser(delegation.delegator_id, 'delegation:used', {
          delegationId: delegation.id,
          delegateName: managerName,
          action: 'denied',
          requestId: result.id,
        });
      }
    } catch (err) {
      console.error('[WS] approval:denied notification failed:', err.message);
    }
  }));

  /**
   * POST /api/approvals/:id/counter
   * Manager proposes a counter-price.
   */
  router.post('/:id/counter', requireRoleOrDelegation('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const { counterPrice } = req.body;
    if (counterPrice == null) {
      throw ApiError.badRequest('counterPrice is required');
    }

    const requestId = parseInt(req.params.id, 10);
    const result = await approvalService.createCounterOffer({
      requestId,
      managerId: req.user.id,
      counterPrice: parseFloat(counterPrice),
    });

    res.json({ success: true, data: result });

    // WS: notify salesperson of counter-offer
    try {
      const { rows: [parentReq] } = await approvalService.pool.query(
        `SELECT salesperson_id FROM approval_requests WHERE id = $1`, [requestId]
      );
      if (parentReq) {
        const managerName = `${req.user.firstName} ${req.user.lastName}`;
        wsService.sendToUser(parentReq.salesperson_id, 'approval:countered', {
          requestId,
          counterOfferId:  result.id,
          counterPrice:    parseFloat(result.price),
          marginAmount:    parseFloat(result.marginAmount),
          marginPercent:   parseFloat(result.marginPercent),
          managerName,
        });
      }
    } catch (err) {
      console.error('[WS] approval:countered notification failed:', err.message);
    }
  }));

  /**
   * GET /api/approvals/:id/product-history
   * Recent approved overrides for the product in this request.
   */
  router.get('/:id/product-history', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
    const details = await approvalService.getRequestWithDetails({
      requestId: parseInt(req.params.id, 10),
    });

    const history = await approvalService.getProductOverrideHistory({
      productId: details.product_id,
      limit: parseInt(req.query.limit, 10) || 10,
    });

    res.json({ success: true, data: history });
  }));

  /**
   * GET /api/approvals/:id/intelligence
   * Aggregated pricing intelligence for a pending approval request.
   * Returns floor price, price history, customer context, and quick math.
   * Query params: customerId (optional) — cart customer if known.
   */
  router.get('/:id/intelligence', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
    const pool = approvalService.pool;
    const requestId = parseInt(req.params.id, 10);
    const customerId = req.query.customerId ? parseInt(req.query.customerId, 10) : null;

    // 1. Fetch the approval request
    const { rows: [ar] } = await pool.query(
      `SELECT ar.*, p.name AS product_name, p.sku AS product_sku
       FROM approval_requests ar
       JOIN products p ON ar.product_id = p.id
       WHERE ar.id = $1`,
      [requestId]
    );
    if (!ar) throw ApiError.notFound('Approval request not found');

    const cost = parseFloat(ar.cost_at_time) || 0;
    const retail = parseFloat(ar.original_price) || 0;
    const requested = parseFloat(ar.requested_price) || 0;

    // Run all aggregation queries in parallel
    const [tierResult, historyResult, customerResult] = await Promise.all([
      // 2. Tier settings — for floor price calculation
      pool.query(
        `SELECT min_margin_percent, allows_below_cost FROM approval_tier_settings WHERE tier = $1`,
        [ar.tier]
      ),

      // 3. Last 5 approved overrides for this product + average
      pool.query(
        `SELECT
           ar2.id,
           ar2.approved_price,
           ar2.margin_percent,
           ar2.responded_at,
           CONCAT(u.first_name, ' ', u.last_name) AS manager_name
         FROM approval_requests ar2
         LEFT JOIN users u ON ar2.manager_id = u.id
         WHERE ar2.product_id = $1
           AND ar2.status = 'approved'
           AND ar2.id != $2
         ORDER BY ar2.responded_at DESC
         LIMIT 5`,
        [ar.product_id, requestId]
      ),

      // 4. Customer context (only if customerId provided)
      customerId
        ? pool.query(
            `SELECT
               c.id, c.name, c.email, c.created_at AS customer_since,
               COALESCE(stats.total_spend, 0) AS total_spend,
               COALESCE(stats.transaction_count, 0) AS transaction_count,
               COALESCE(overrides.override_count, 0) AS override_count,
               last_override.product_name AS last_override_product,
               last_override.approved_price AS last_override_price,
               last_override.responded_at AS last_override_date
             FROM customers c
             LEFT JOIN LATERAL (
               SELECT
                 SUM(t.total_amount) AS total_spend,
                 COUNT(*)::int AS transaction_count
               FROM transactions t
               WHERE t.customer_id = c.id AND t.status = 'completed'
             ) stats ON true
             LEFT JOIN LATERAL (
               SELECT COUNT(*)::int AS override_count
               FROM approval_requests ar3
               JOIN transactions t2 ON t2.customer_id = c.id
                 AND t2.salesperson_id = ar3.salesperson_id
                 AND t2.completed_at >= ar3.created_at - INTERVAL '1 hour'
                 AND t2.completed_at <= ar3.created_at + INTERVAL '1 hour'
               WHERE ar3.status = 'approved'
             ) overrides ON true
             LEFT JOIN LATERAL (
               SELECT p.name AS product_name, ar4.approved_price, ar4.responded_at
               FROM approval_requests ar4
               JOIN products p ON ar4.product_id = p.id
               JOIN transactions t3 ON t3.customer_id = c.id
                 AND t3.salesperson_id = ar4.salesperson_id
                 AND t3.completed_at >= ar4.created_at - INTERVAL '1 hour'
                 AND t3.completed_at <= ar4.created_at + INTERVAL '1 hour'
               WHERE ar4.status = 'approved'
               ORDER BY ar4.responded_at DESC
               LIMIT 1
             ) last_override ON true
             WHERE c.id = $1`,
            [customerId]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    // ---- Assemble: Floor Price ----
    const tierSettings = tierResult.rows[0] || {};
    const minMarginPct = parseFloat(tierSettings.min_margin_percent) || 0;
    // Floor = cost / (1 - minMarginPct/100)  → guarantees min margin %
    const floorPrice = minMarginPct > 0
      ? Math.ceil((cost / (1 - minMarginPct / 100)) * 100) / 100
      : cost;
    const aboveFloor = requested >= floorPrice;

    // ---- Assemble: Price History ----
    const priceHistory = historyResult.rows.map(h => ({
      id: h.id,
      approvedPrice: parseFloat(h.approved_price),
      marginPercent: parseFloat(h.margin_percent),
      date: h.responded_at,
      managerName: h.manager_name,
    }));

    const avgApprovedPrice = priceHistory.length > 0
      ? Math.round(priceHistory.reduce((s, h) => s + h.approvedPrice, 0) / priceHistory.length * 100) / 100
      : null;

    const lowestPrevious = priceHistory.length > 0
      ? Math.min(...priceHistory.map(h => h.approvedPrice))
      : null;
    const isLowestEver = lowestPrevious !== null && requested < lowestPrevious;

    // ---- Assemble: Customer Context ----
    const customerRow = customerResult.rows[0] || null;
    const customerContext = customerRow ? {
      id: customerRow.id,
      name: customerRow.name,
      email: customerRow.email,
      customerSince: customerRow.customer_since,
      totalSpend: parseFloat(customerRow.total_spend) || 0,
      transactionCount: parseInt(customerRow.transaction_count) || 0,
      overrideCount: parseInt(customerRow.override_count) || 0,
      lastOverride: customerRow.last_override_date ? {
        product: customerRow.last_override_product,
        price: parseFloat(customerRow.last_override_price),
        date: customerRow.last_override_date,
      } : null,
    } : null;

    // ---- Assemble: Quick Math ----
    const marginAtRequested = requested - cost;
    const marginAtRetail = retail - cost;
    const givingUp = marginAtRetail - marginAtRequested;

    res.json({
      success: true,
      data: {
        floorPrice: {
          price: floorPrice,
          minMarginPct,
          aboveFloor,
          belowFloorBy: aboveFloor ? 0 : Math.round((floorPrice - requested) * 100) / 100,
        },
        priceHistory: {
          recent: priceHistory,
          avgApprovedPrice,
          isLowestEver,
          lowestPrevious,
        },
        customerContext,
        quickMath: {
          marginAtRequested,
          marginAtRetail,
          givingUp,
          marginPctAtRequested: requested > 0
            ? Math.round(((requested - cost) / requested) * 10000) / 100
            : 0,
          marginPctAtRetail: retail > 0
            ? Math.round(((retail - cost) / retail) * 10000) / 100
            : 0,
        },
      },
    });
  }));

  // ============================================================================
  // BATCH APPROVAL ROUTES
  // ============================================================================

  /**
   * POST /api/approvals/batch-request
   * Create a batch approval request covering multiple cart items.
   */
  router.post('/batch-request', asyncHandler(async (req, res) => {
    const { cartId, managerId, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('items array is required');
    }

    // Validate each item before passing to service
    const mappedItems = items.map((i, idx) => {
      const productId = parseInt(i.productId, 10);
      const requestedPrice = parseFloat(i.requestedPrice);
      if (isNaN(productId)) {
        throw ApiError.badRequest(`items[${idx}].productId is required and must be a number`);
      }
      if (isNaN(requestedPrice)) {
        throw ApiError.badRequest(`items[${idx}].requestedPrice is required and must be a number`);
      }
      return {
        cartItemId: i.cartItemId || null,
        productId,
        requestedPrice,
      };
    });

    const result = await approvalService.createBatchRequest({
      salespersonId: req.user.id,
      cartId: cartId || null,
      managerId: managerId ? parseInt(managerId, 10) : null,
      items: mappedItems,
    });

    const statusCode = result.allAutoApproved ? 200 : 201;
    res.status(statusCode).json({ success: true, data: result });

    // WS: notify manager(s) of new batch request
    if (!result.allAutoApproved) {
      try {
        const salespersonName = `${req.user.firstName} ${req.user.lastName}`;
        const requestData = {
          requestId:      result.parent.id,
          requestType:    'batch',
          batchLabel:     result.parent.batch_label,
          itemCount:      result.children.length,
          totalOriginal:  parseFloat(result.parent.original_price),
          totalRequested: parseFloat(result.parent.requested_price),
          salespersonName,
          tier:           result.parent.tier,
          createdAt:      result.parent.created_at,
        };
        if (result.parent.manager_id) {
          wsService.sendToUser(result.parent.manager_id, 'approval:batch-request', requestData);
        } else {
          wsService.broadcastToRoles(['manager', 'senior_manager', 'admin'], 'approval:batch-request', requestData);
        }
      } catch (err) {
        console.error('[WS] approval:batch-request notification failed:', err.message);
      }
    }
  }));

  /**
   * GET /api/approvals/batch/:parentId
   * Get full batch details (parent + all children).
   */
  router.get('/batch/:parentId', asyncHandler(async (req, res) => {
    const result = await approvalService.getBatchDetails({
      parentRequestId: parseInt(req.params.parentId, 10),
    });
    res.json({ success: true, data: result });
  }));

  /**
   * POST /api/approvals/batch/:parentId/approve
   * Manager approves a batch request.
   */
  router.post('/batch/:parentId/approve', requireRoleOrDelegation('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const { method, adjustments } = req.body;

    const result = await approvalService.approveBatchRequest({
      parentRequestId: parseInt(req.params.parentId, 10),
      managerId: req.user.id,
      method: method || 'remote',
      adjustments: Array.isArray(adjustments) ? adjustments : [],
    });

    res.json({ success: true, data: result });

    // WS: notify salesperson of batch approval
    try {
      const managerName = `${req.user.firstName} ${req.user.lastName}`;
      wsService.sendToUser(result.parent.salesperson_id, 'approval:batch-approved', {
        parentRequestId: result.parent.id,
        managerName,
        method: result.parent.method,
        childCount: result.children.length,
        totalApproved: result.children.reduce((s, c) => s + parseFloat(c.approved_price), 0),
      });
    } catch (err) {
      console.error('[WS] approval:batch-approved notification failed:', err.message);
    }
  }));

  /**
   * POST /api/approvals/batch/:parentId/deny
   * Manager denies a batch request.
   */
  router.post('/batch/:parentId/deny', requireRoleOrDelegation('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const { reasonCode, reasonNote } = req.body;

    const result = await approvalService.denyBatchRequest({
      parentRequestId: parseInt(req.params.parentId, 10),
      managerId: req.user.id,
      reasonCode: reasonCode || null,
      reasonNote: reasonNote || null,
    });

    res.json({ success: true, data: result });

    // WS: notify salesperson of batch denial
    try {
      const managerName = `${req.user.firstName} ${req.user.lastName}`;
      wsService.sendToUser(result.salesperson_id, 'approval:batch-denied', {
        parentRequestId: result.id,
        reasonCode: result.reason_code,
        reasonNote: result.reason_note,
        managerName,
      });
    } catch (err) {
      console.error('[WS] approval:batch-denied notification failed:', err.message);
    }
  }));

  /**
   * POST /api/approvals/batch/:parentId/consume-tokens
   * Consume all child tokens in a batch at once.
   */
  router.post('/batch/:parentId/consume-tokens', asyncHandler(async (req, res) => {
    const { cartId } = req.body;

    try {
      const result = await approvalService.consumeBatchTokens({
        parentRequestId: parseInt(req.params.parentId, 10),
        cartId: cartId || null,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  }));

  // ============================================================================
  // ADMIN ROUTES
  // ============================================================================

  /**
   * GET /api/approvals/analytics
   * Aggregate statistics for the override approval system.
   * Returns summary, previousPeriod, byTier, dailyTimeSeries,
   * bySalesperson, byManager, and byProduct breakdowns.
   */
  router.get('/analytics', requireRole('admin'), asyncHandler(async (req, res) => {
    const pool = approvalService.pool;
    const { startDate, endDate, salespersonId, managerId } = req.query;

    // ---- Build WHERE clause for the current period ----
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (startDate) {
      conditions.push(`ar.created_at >= $${paramIdx++}::timestamptz`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`ar.created_at <= $${paramIdx++}::timestamptz`);
      params.push(endDate);
    }
    if (salespersonId) {
      conditions.push(`ar.salesperson_id = $${paramIdx++}`);
      params.push(parseInt(salespersonId, 10));
    }
    if (managerId) {
      conditions.push(`ar.manager_id = $${paramIdx++}`);
      params.push(parseInt(managerId, 10));
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // ---- Build WHERE clause for the previous period ----
    const now = new Date();
    const currentEnd = endDate ? new Date(endDate) : now;
    const currentStart = startDate
      ? new Date(startDate)
      : new Date(now.getTime() - 30 * 86400000);
    const periodMs = currentEnd.getTime() - currentStart.getTime();
    const prevEnd = currentStart;
    const prevStart = new Date(currentStart.getTime() - periodMs);

    const prevConditions = [
      `ar.created_at >= $1::timestamptz`,
      `ar.created_at <= $2::timestamptz`,
    ];
    const prevParams = [prevStart.toISOString(), prevEnd.toISOString()];
    let prevIdx = 3;
    if (salespersonId) {
      prevConditions.push(`ar.salesperson_id = $${prevIdx++}`);
      prevParams.push(parseInt(salespersonId, 10));
    }
    if (managerId) {
      prevConditions.push(`ar.manager_id = $${prevIdx++}`);
      prevParams.push(parseInt(managerId, 10));
    }
    const prevWhereClause = 'WHERE ' + prevConditions.join(' AND ');

    // Shared summary SQL fragment
    const summarySQL = (wc) => `
      SELECT
        COUNT(*)::int                                                    AS total_requests,
        COUNT(*) FILTER (WHERE status = 'approved')::int                AS approved_count,
        COUNT(*) FILTER (WHERE status = 'denied')::int                  AS denied_count,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int               AS cancelled_count,
        COUNT(*) FILTER (WHERE status = 'timed_out')::int               AS timed_out_count,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'approved')::numeric
                     / COUNT(*)::numeric * 100, 1)
          ELSE 0 END                                                    AS approval_rate,
        ROUND(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL))::int
                                                                        AS avg_response_time_ms,
        ROUND(AVG(margin_percent) FILTER (WHERE status = 'approved'), 2) AS avg_approved_margin_pct,
        ROUND(AVG(
          CASE WHEN status = 'approved'
               THEN original_price - approved_price
               ELSE NULL END
        ), 2)                                                           AS avg_discount_amount,
        ROUND(SUM(
          CASE WHEN status = 'approved'
               THEN original_price - approved_price
               ELSE 0 END
        ), 2)                                                           AS total_margin_impact,
        ROUND(AVG(
          CASE WHEN status = 'approved'
               THEN approved_price - cost_at_time
               ELSE NULL END
        ), 2)                                                           AS avg_approved_margin_amt
      FROM approval_requests ar
      ${wc}`;

    // Run all queries in parallel
    const [
      summaryResult,
      prevSummaryResult,
      byTierResult,
      dailyResult,
      bySalespersonResult,
      byManagerResult,
      byProductResult,
    ] = await Promise.all([
      // 1. Current period summary
      pool.query(summarySQL(whereClause), params),

      // 2. Previous period summary
      pool.query(summarySQL(prevWhereClause), prevParams),

      // 3. Per-tier breakdown
      pool.query(
        `SELECT
           ar.tier,
           ats.name AS tier_name,
           COUNT(*)::int                                             AS total,
           COUNT(*) FILTER (WHERE ar.status = 'approved')::int       AS approved,
           COUNT(*) FILTER (WHERE ar.status = 'denied')::int         AS denied,
           ROUND(AVG(ar.response_time_ms)
                 FILTER (WHERE ar.response_time_ms IS NOT NULL))::int AS avg_response_ms,
           ROUND(AVG(ar.margin_percent)
                 FILTER (WHERE ar.status = 'approved'), 2)           AS avg_margin_pct
         FROM approval_requests ar
         LEFT JOIN approval_tier_settings ats ON ats.tier = ar.tier
         ${whereClause}
         GROUP BY ar.tier, ats.name
         ORDER BY ar.tier`,
        params
      ),

      // 4. Daily time series
      pool.query(
        `SELECT
           ar.created_at::date                                        AS date,
           COUNT(*)::int                                              AS total_requests,
           COUNT(*) FILTER (WHERE ar.status = 'approved')::int        AS approved,
           COUNT(*) FILTER (WHERE ar.status = 'denied')::int          AS denied,
           CASE WHEN COUNT(*) > 0
             THEN ROUND(COUNT(*) FILTER (WHERE ar.status = 'approved')::numeric
                        / COUNT(*)::numeric * 100, 1)
             ELSE 0 END                                               AS approval_rate,
           ROUND(SUM(CASE WHEN ar.status = 'approved'
             THEN ar.original_price - ar.approved_price ELSE 0 END), 2) AS margin_impact,
           ROUND(AVG(ar.response_time_ms)
                 FILTER (WHERE ar.response_time_ms IS NOT NULL))::int AS avg_response_ms
         FROM approval_requests ar
         ${whereClause}
         GROUP BY ar.created_at::date
         ORDER BY date ASC`,
        params
      ),

      // 5. By salesperson
      pool.query(
        `SELECT
           ar.salesperson_id,
           CONCAT(u.first_name, ' ', u.last_name) AS salesperson_name,
           COUNT(*)::int                           AS total_requests,
           CASE WHEN COUNT(*) > 0
             THEN ROUND(COUNT(*) FILTER (WHERE ar.status = 'approved')::numeric
                        / COUNT(*)::numeric * 100, 1)
             ELSE 0 END                            AS approval_rate,
           ROUND(AVG(
             CASE WHEN ar.status = 'approved'
                  THEN ROUND((ar.original_price - ar.approved_price)
                              / NULLIF(ar.original_price, 0) * 100, 1)
                  ELSE NULL END
           ), 1)                                   AS avg_discount_pct,
           ROUND(SUM(
             CASE WHEN ar.status = 'approved'
                  THEN ar.original_price - ar.approved_price
                  ELSE 0 END
           ), 2)                                   AS total_margin_impact
         FROM approval_requests ar
         JOIN users u ON ar.salesperson_id = u.id
         ${whereClause}
         GROUP BY ar.salesperson_id, u.first_name, u.last_name
         ORDER BY total_requests DESC`,
        params
      ),

      // 6. By manager
      pool.query(
        `SELECT
           ar.manager_id,
           CONCAT(u.first_name, ' ', u.last_name) AS manager_name,
           COUNT(*)::int                           AS total_decisions,
           CASE WHEN COUNT(*) > 0
             THEN ROUND(COUNT(*) FILTER (WHERE ar.status = 'approved')::numeric
                        / COUNT(*)::numeric * 100, 1)
             ELSE 0 END                            AS approval_rate,
           ROUND(AVG(ar.response_time_ms)
                 FILTER (WHERE ar.response_time_ms IS NOT NULL))::int AS avg_response_ms,
           CASE WHEN COUNT(*) > 0
             THEN ROUND(COUNT(DISTINCT co.id)::numeric
                        / COUNT(DISTINCT ar.id)::numeric * 100, 1)
             ELSE 0 END                            AS counter_offer_rate
         FROM approval_requests ar
         JOIN users u ON ar.manager_id = u.id
         LEFT JOIN approval_counter_offers co ON co.approval_request_id = ar.id
         WHERE ar.manager_id IS NOT NULL
         ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
         GROUP BY ar.manager_id, u.first_name, u.last_name
         ORDER BY total_decisions DESC`,
        params
      ),

      // 7. By product (top 50)
      pool.query(
        `SELECT
           ar.product_id,
           p.name   AS product_name,
           p.sku    AS product_sku,
           COUNT(*)::int AS times_overridden,
           ROUND(AVG(
             CASE WHEN ar.status = 'approved'
                  THEN ROUND((ar.original_price - ar.approved_price)
                              / NULLIF(ar.original_price, 0) * 100, 1)
                  ELSE NULL END
           ), 1)         AS avg_approved_discount_pct,
           MODE() WITHIN GROUP (ORDER BY ar.approved_price)
             FILTER (WHERE ar.status = 'approved') AS most_common_approved_price
         FROM approval_requests ar
         JOIN products p ON ar.product_id = p.id
         ${whereClause}
         GROUP BY ar.product_id, p.name, p.sku
         ORDER BY times_overridden DESC
         LIMIT 50`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        previousPeriod: prevSummaryResult.rows[0],
        byTier: byTierResult.rows,
        dailyTimeSeries: dailyResult.rows,
        bySalesperson: bySalespersonResult.rows,
        byManager: byManagerResult.rows,
        byProduct: byProductResult.rows,
      },
    });
  }));

  /**
   * GET /api/approvals/settings/tiers
   * Fetch all tier settings, ordered by tier number.
   */
  router.get('/settings/tiers', requireRole('admin'), asyncHandler(async (req, res) => {
    const pool = approvalService.pool;
    const { rows } = await pool.query(
      `SELECT * FROM approval_tier_settings ORDER BY tier ASC`
    );
    res.json({ success: true, data: rows });
  }));

  /**
   * PUT /api/approvals/settings/tiers
   * Bulk-update tier settings.
   * Body: { tiers: [{ tier, name, minDiscountPercent, maxDiscountPercent, ... }] }
   */
  router.put('/settings/tiers', requireRole('admin'), asyncHandler(async (req, res) => {
    const { tiers } = req.body;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      throw ApiError.badRequest('tiers array is required');
    }

    const pool = approvalService.pool;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const updated = [];
      for (const t of tiers) {
        if (!t.tier || !t.name || !t.required_role) {
          throw ApiError.badRequest(`Each tier must have tier, name, and required_role (got tier=${t.tier})`);
        }

        const { rows: [row] } = await client.query(
          `INSERT INTO approval_tier_settings (
             tier, name,
             min_discount_percent, max_discount_percent, min_margin_percent,
             allows_below_cost, required_role, timeout_seconds, requires_reason_code,
             updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (tier) DO UPDATE SET
             name                 = EXCLUDED.name,
             min_discount_percent = EXCLUDED.min_discount_percent,
             max_discount_percent = EXCLUDED.max_discount_percent,
             min_margin_percent   = EXCLUDED.min_margin_percent,
             allows_below_cost    = EXCLUDED.allows_below_cost,
             required_role        = EXCLUDED.required_role,
             timeout_seconds      = EXCLUDED.timeout_seconds,
             requires_reason_code = EXCLUDED.requires_reason_code,
             updated_at           = NOW()
           RETURNING *`,
          [
            t.tier,
            t.name,
            t.min_discount_percent ?? null,
            t.max_discount_percent ?? null,
            t.min_margin_percent ?? null,
            t.allows_below_cost ?? false,
            t.required_role,
            t.timeout_seconds ?? 180,
            t.requires_reason_code ?? false,
          ]
        );
        updated.push(row);
      }

      await client.query('COMMIT');
      res.json({ success: true, data: updated });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  /**
   * GET /api/approvals/audit-log
   * Paginated audit trail of all override requests with full details.
   */
  router.get('/audit-log', requireRole('admin'), asyncHandler(async (req, res) => {
    const pool = approvalService.pool;
    const {
      startDate, endDate,
      salespersonId, managerId,
      tier, status,
      page = 1, limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * pageSize;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (startDate) { conditions.push(`ar.created_at >= $${idx++}::timestamptz`); params.push(startDate); }
    if (endDate) { conditions.push(`ar.created_at <= $${idx++}::timestamptz`); params.push(endDate); }
    if (salespersonId) { conditions.push(`ar.salesperson_id = $${idx++}`); params.push(parseInt(salespersonId, 10)); }
    if (managerId) { conditions.push(`ar.manager_id = $${idx++}`); params.push(parseInt(managerId, 10)); }
    if (tier) { conditions.push(`ar.tier = $${idx++}`); params.push(parseInt(tier, 10)); }
    if (status) { conditions.push(`ar.status = $${idx++}`); params.push(status); }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // Total count
    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM approval_requests ar ${whereClause}`,
      params
    );

    // Paginated rows
    const { rows } = await pool.query(
      `SELECT
         ar.*,
         p.name   AS product_name,
         p.sku    AS product_sku,
         CONCAT(s.first_name, ' ', s.last_name) AS salesperson_name,
         CONCAT(m.first_name, ' ', m.last_name) AS manager_name,
         ats.name AS tier_name
       FROM approval_requests ar
       JOIN products p ON ar.product_id = p.id
       JOIN users s    ON ar.salesperson_id = s.id
       LEFT JOIN users m ON ar.manager_id = m.id
       LEFT JOIN approval_tier_settings ats ON ats.tier = ar.tier
       ${whereClause}
       ORDER BY ar.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  }));

  // ============================================================================
  // TOKEN CONSUMPTION (internal — called by cart/checkout service)
  // ============================================================================

  /**
   * POST /api/approvals/consume-token
   * Consume a one-time approval token and return the approved price.
   */
  router.post('/consume-token', asyncHandler(async (req, res) => {
    const { token, cartId, cartItemId } = req.body;
    if (!token) {
      throw ApiError.badRequest('token is required');
    }

    try {
      const result = await approvalService.consumeToken({
        token,
        cartId: cartId != null ? parseInt(cartId, 10) : null,
        cartItemId: cartItemId != null ? parseInt(cartItemId, 10) : null,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  }));

  // ============================================================================
  // OFFLINE SYNC
  // ============================================================================

  /**
   * POST /api/approvals/sync-offline
   * Batch-sync offline PIN approvals to the server.
   * Deduplicates by client_request_id.
   */
  router.post('/sync-offline', asyncHandler(async (req, res) => {
    const { approvals } = req.body;
    if (!Array.isArray(approvals) || approvals.length === 0) {
      throw ApiError.badRequest('approvals array is required');
    }

    const pool = approvalService.pool;
    const results = [];
    let syncedCount = 0;

    for (const entry of approvals) {
      const {
        clientRequestId,
        productId,
        requestedPrice,
        managerId,
        managerName,
        approvalLevel,
        offlineApprovedAt,
        deviceId,
        reason,
      } = entry;

      if (!clientRequestId || !productId || requestedPrice == null) {
        results.push({ clientRequestId, success: false, error: 'Missing required fields' });
        continue;
      }

      try {
        // 1. Check dedup
        const { rows: existing } = await pool.query(
          `SELECT id FROM approval_requests WHERE client_request_id = $1`,
          [clientRequestId]
        );

        if (existing.length > 0) {
          results.push({ clientRequestId, success: true, deduplicated: true, requestId: existing[0].id });
          continue;
        }

        // 2. Lookup product price/cost
        const { rows: [product] } = await pool.query(
          `SELECT id, name,
                  COALESCE(msrp_cents, retail_price_cents, 0) / 100.0 AS price,
                  COALESCE(cost_cents, 0) / 100.0 AS cost
           FROM products WHERE id = $1`,
          [parseInt(productId, 10)]
        );

        if (!product) {
          results.push({ clientRequestId, success: false, error: 'Product not found' });
          continue;
        }

        const originalPrice = parseFloat(product.price) || 0;
        const cost = parseFloat(product.cost) || 0;
        const reqPrice = parseFloat(requestedPrice);
        const marginAmount = reqPrice - cost;
        const marginPercent = reqPrice > 0 ? ((reqPrice - cost) / reqPrice) * 100 : 0;

        // Determine tier from discount %
        const discountPct = originalPrice > 0
          ? ((originalPrice - reqPrice) / originalPrice) * 100
          : 0;
        let tier = 1;
        if (discountPct > 25) tier = 4;
        else if (discountPct > 15) tier = 3;
        else if (discountPct > 5) tier = 2;

        // 3. INSERT with dedup safety
        const { rows: [inserted] } = await pool.query(
          `INSERT INTO approval_requests (
             product_id, salesperson_id, manager_id,
             status, tier,
             original_price, requested_price, approved_price,
             cost_at_time, margin_amount, margin_percent,
             reason_note, method,
             client_request_id, offline_approved_at, synced_at, device_id,
             responded_at
           ) VALUES (
             $1, $2, $3,
             'approved', $4,
             $5, $6, $6,
             $7, $8, $9,
             $10, 'pin_offline',
             $11, $12, NOW(), $13,
             $12
           ) RETURNING id`,
          [
            parseInt(productId, 10),
            req.user.id,
            managerId ? parseInt(managerId, 10) : null,
            tier,
            originalPrice,
            reqPrice,
            cost,
            Math.round(marginAmount * 100) / 100,
            Math.round(marginPercent * 100) / 100,
            reason || `Offline PIN approval by ${managerName || 'manager'}`,
            clientRequestId,
            offlineApprovedAt ? new Date(offlineApprovedAt) : new Date(),
            deviceId || null,
          ]
        );

        results.push({ clientRequestId, success: true, deduplicated: false, requestId: inserted.id });
        syncedCount++;
      } catch (err) {
        // Catch unique constraint violation (23505) as secondary dedup
        if (err.code === '23505' && err.constraint?.includes('client_request_id')) {
          const { rows: dup } = await pool.query(
            `SELECT id FROM approval_requests WHERE client_request_id = $1`,
            [clientRequestId]
          );
          results.push({ clientRequestId, success: true, deduplicated: true, requestId: dup[0]?.id });
        } else {
          console.error('[sync-offline] Error syncing entry:', clientRequestId, err.message);
          results.push({ clientRequestId, success: false, error: err.message });
        }
      }
    }

    res.json({ success: true, results, syncedCount });
  }));

  // ============================================================================
  // DELEGATION ROUTES
  // ============================================================================

  /**
   * POST /api/approvals/delegations
   * Create a new delegation (manager+ only).
   */
  router.post('/delegations', requireRole('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const { delegateId, maxTier, expiresAt, reason } = req.body;

    if (!delegateId || !expiresAt) {
      throw ApiError.badRequest('delegateId and expiresAt are required');
    }

    const delegation = await approvalService.createDelegation({
      delegatorId: req.user.id,
      delegateId: parseInt(delegateId, 10),
      maxTier: parseInt(maxTier, 10) || 2,
      expiresAt: new Date(expiresAt),
      reason: reason || null,
    });

    res.status(201).json({ success: true, data: delegation });

    // WS: notify delegate
    try {
      const delegatorName = `${req.user.firstName} ${req.user.lastName}`;
      wsService.sendToUser(parseInt(delegateId, 10), 'delegation:granted', {
        delegationId: delegation.id,
        delegatorName,
        maxTier: delegation.max_tier,
        expiresAt: delegation.expires_at,
      });
    } catch (err) {
      console.error('[WS] delegation:granted notification failed:', err.message);
    }
  }));

  /**
   * GET /api/approvals/delegations/active
   * Get active delegations for the current user.
   */
  router.get('/delegations/active', asyncHandler(async (req, res) => {
    const result = await approvalService.getActiveDelegations(req.user.id);
    res.json({ success: true, data: result });
  }));

  /**
   * DELETE /api/approvals/delegations/:id
   * Revoke a delegation.
   */
  router.delete('/delegations/:id', asyncHandler(async (req, res) => {
    const delegation = await approvalService.revokeDelegation(
      parseInt(req.params.id, 10),
      req.user.id
    );

    res.json({ success: true, data: delegation });

    // WS: notify delegate
    try {
      const delegatorName = `${req.user.firstName} ${req.user.lastName}`;
      wsService.sendToUser(delegation.delegate_id, 'delegation:revoked', {
        delegationId: delegation.id,
        delegatorName,
      });
    } catch (err) {
      console.error('[WS] delegation:revoked notification failed:', err.message);
    }
  }));

  /**
   * GET /api/approvals/delegations/eligible
   * Get users eligible to receive delegation.
   */
  router.get('/delegations/eligible', requireRole('manager', 'senior_manager', 'admin'), asyncHandler(async (req, res) => {
    const users = await approvalService.getEligibleDelegates(req.user.id);
    res.json({ success: true, data: users });
  }));

  return router;
};
