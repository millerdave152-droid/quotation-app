/**
 * Rebate Routes
 * API endpoints for manufacturer rebate management
 */

const express = require('express');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function createRebateRoutes(pool, authMiddleware) {
  const router = express.Router();
  const RebateService = require('../services/RebateService');
  const RebateFollowUpService = require('../services/RebateFollowUpService');

  const rebateService = new RebateService(pool);
  const followUpService = new RebateFollowUpService(pool);

  // ============================================================================
  // PRODUCT REBATES
  // ============================================================================

  /**
   * GET /api/rebates/product/:productId
   * Get all active rebates for a product
   */
  router.get('/product/:productId', authMiddleware, asyncHandler(async (req, res) => {
    const { productId } = req.params;

    const rebates = await rebateService.getProductRebates(parseInt(productId));

    res.json({
      success: true,
      productId: parseInt(productId),
      rebates,
      count: rebates.length,
    });
  }));

  // ============================================================================
  // CART REBATES
  // ============================================================================

  /**
   * POST /api/rebates/cart
   * Analyze cart for rebates
   */
  router.post('/cart', authMiddleware, asyncHandler(async (req, res) => {
    const { cartItems } = req.body;

    if (!cartItems || !Array.isArray(cartItems)) {
      throw ApiError.badRequest('cartItems array is required');
    }

    const rebates = await rebateService.getCartRebates(cartItems);

    res.json({
      success: true,
      ...rebates,
    });
  }));

  // ============================================================================
  // APPLY/REMOVE REBATES
  // ============================================================================

  /**
   * POST /api/rebates/apply
   * Apply instant rebate to transaction
   */
  router.post('/apply', authMiddleware, asyncHandler(async (req, res) => {
    const { transactionId, rebateId, productId } = req.body;
    const userId = req.user?.id || req.user?.userId;

    if (!transactionId || !rebateId || !productId) {
      throw ApiError.badRequest('transactionId, rebateId, and productId are required');
    }

    const result = await rebateService.applyInstantRebate(
      transactionId,
      rebateId,
      productId,
      userId
    );

    res.json(result);
  }));

  // ============================================================================
  // REBATE CLAIMS
  // ============================================================================

  /**
   * POST /api/rebates/claim
   * Create rebate claim for mail-in/online rebate
   */
  router.post('/claim', authMiddleware, asyncHandler(async (req, res) => {
    const { orderId, rebateId, customerId, ...options } = req.body;

    if (!orderId || !rebateId) {
      throw ApiError.badRequest('orderId and rebateId are required');
    }

    const claim = await rebateService.createRebateClaim(
      orderId,
      rebateId,
      customerId,
      options
    );

    res.json({
      success: true,
      ...claim,
    });
  }));

  /**
   * GET /api/rebates/claims/customer/:customerId
   * Get customer's rebate claims
   */
  router.get('/claims/customer/:customerId', authMiddleware, asyncHandler(async (req, res) => {
    const { customerId } = req.params;
    const { status, includeExpired } = req.query;

    const claims = await rebateService.getCustomerRebateClaims(
      parseInt(customerId),
      {
        status,
        includeExpired: includeExpired === 'true',
      }
    );

    res.json({
      success: true,
      customerId: parseInt(customerId),
      claims,
      count: claims.length,
    });
  }));

  /**
   * PATCH /api/rebates/claims/:claimId/status
   * Update claim status
   */
  router.patch('/claims/:claimId/status', authMiddleware, asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { status, ...options } = req.body;
    const userId = req.user?.id || req.user?.userId;

    if (!status) {
      throw ApiError.badRequest('status is required');
    }

    const claim = await rebateService.updateClaimStatus(
      parseInt(claimId),
      status,
      { ...options, userId }
    );

    res.json({
      success: true,
      claim,
    });
  }));

  // ============================================================================
  // CUSTOMER PORTAL - Rebate Lookup and Status Update
  // ============================================================================

  /**
   * GET /api/rebates/customer/:customerId
   * Get all pending rebates for a customer with full details
   * Used by customer portal and staff lookup
   */
  router.get('/customer/:customerId', authMiddleware, asyncHandler(async (req, res) => {
    const { customerId } = req.params;
    const { includeAll = 'false' } = req.query;

    // Get pending rebates with detailed info
    const query = `
      SELECT
        rc.id as claim_id,
        rc.rebate_id,
        rc.order_id,
        rc.transaction_id,
        rc.claim_status,
        rc.rebate_amount,
        rc.quantity,
        rc.customer_name,
        rc.customer_email,
        rc.submitted_at,
        rc.claim_reference,
        rc.created_at as claim_created_at,
        r.name as rebate_name,
        r.description as rebate_description,
        r.manufacturer,
        r.rebate_type,
        r.submission_url,
        r.terms_url,
        r.requires_upc,
        r.requires_receipt,
        r.requires_registration,
        r.claim_deadline_days,
        o.created_at as order_date,
        (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline,
        EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW())::INTEGER as days_remaining,
        CASE
          WHEN rc.claim_status != 'pending' THEN 'completed'
          WHEN (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) < NOW() THEN 'expired'
          WHEN EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW()) <= 3 THEN 'critical'
          WHEN EXTRACT(DAY FROM (o.created_at + (r.claim_deadline_days || ' days')::INTERVAL) - NOW()) <= 7 THEN 'urgent'
          ELSE 'pending'
        END as urgency,
        -- Products covered by this rebate
        (
          SELECT json_agg(json_build_object(
            'productId', oi.product_id,
            'productName', p.name,
            'sku', p.sku,
            'quantity', oi.quantity,
            'price', oi.price
          ))
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          JOIN rebate_products rp ON (
            rp.rebate_id = r.id
            AND (rp.product_id = oi.product_id OR rp.category_id = p.category_id)
          )
          WHERE oi.order_id = o.id
        ) as products,
        -- Reminders sent
        (
          SELECT COUNT(*)
          FROM rebate_reminders rr
          WHERE rr.claim_id = rc.id
        ) as reminders_sent_count
      FROM rebate_claims rc
      JOIN rebates r ON rc.rebate_id = r.id
      LEFT JOIN orders o ON rc.order_id = o.id
      WHERE rc.customer_id = $1
        ${includeAll !== 'true' ? "AND rc.claim_status IN ('pending', 'submitted', 'processing')" : ''}
      ORDER BY
        CASE rc.claim_status
          WHEN 'pending' THEN 1
          WHEN 'submitted' THEN 2
          WHEN 'processing' THEN 3
          ELSE 4
        END,
        days_remaining ASC NULLS LAST,
        rc.rebate_amount DESC
    `;

    const result = await pool.query(query, [parseInt(customerId)]);

    // Format response
    const claims = result.rows.map(row => ({
      claimId: row.claim_id,
      rebateId: row.rebate_id,
      orderId: row.order_id,
      transactionId: row.transaction_id,
      status: row.claim_status,
      urgency: row.urgency,
      rebate: {
        name: row.rebate_name,
        description: row.rebate_description,
        manufacturer: row.manufacturer,
        type: row.rebate_type,
        amount: parseFloat(row.rebate_amount),
        submissionUrl: row.submission_url,
        termsUrl: row.terms_url,
        requirements: {
          upc: row.requires_upc,
          receipt: row.requires_receipt,
          registration: row.requires_registration,
        },
      },
      deadline: row.deadline,
      daysRemaining: row.days_remaining,
      orderDate: row.order_date,
      submittedAt: row.submitted_at,
      claimReference: row.claim_reference,
      products: row.products || [],
      remindersSentCount: parseInt(row.reminders_sent_count || 0),
    }));

    // Calculate summary stats
    const summary = {
      totalPending: claims.filter(c => c.status === 'pending').length,
      totalAmount: claims
        .filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + c.rebate.amount, 0),
      urgentCount: claims.filter(c => c.urgency === 'urgent' || c.urgency === 'critical').length,
      expiringCount: claims.filter(c => c.daysRemaining <= 7 && c.status === 'pending').length,
    };

    res.json({
      success: true,
      customerId: parseInt(customerId),
      claims,
      summary,
    });
  }));

  /**
   * PATCH /api/rebates/customer/:customerId/claims/:claimId
   * Customer submits rebate claim - updates status to 'submitted'
   */
  router.patch('/customer/:customerId/claims/:claimId', authMiddleware, asyncHandler(async (req, res) => {
    const { customerId, claimId } = req.params;
    const { claimReference, submissionMethod = 'online' } = req.body;

    // Verify claim belongs to customer
    const verifyQuery = `
      SELECT id, claim_status
      FROM rebate_claims
      WHERE id = $1 AND customer_id = $2
    `;
    const verifyResult = await pool.query(verifyQuery, [parseInt(claimId), parseInt(customerId)]);

    if (verifyResult.rows.length === 0) {
      throw ApiError.notFound('Rebate claim');
    }

    if (verifyResult.rows[0].claim_status !== 'pending') {
      throw ApiError.badRequest('Only pending claims can be marked as submitted');
    }

    // Update claim status to submitted
    const updateQuery = `
      UPDATE rebate_claims
      SET
        claim_status = 'submitted',
        submitted_at = NOW(),
        submission_method = $3,
        claim_reference = $4,
        updated_at = NOW()
      WHERE id = $1 AND customer_id = $2
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      parseInt(claimId),
      parseInt(customerId),
      submissionMethod,
      claimReference || null,
    ]);

    res.json({
      success: true,
      message: 'Rebate claim marked as submitted',
      claim: {
        claimId: result.rows[0].id,
        status: result.rows[0].claim_status,
        submittedAt: result.rows[0].submitted_at,
        claimReference: result.rows[0].claim_reference,
      },
    });
  }));

  // ============================================================================
  // REBATE INFO EMAIL
  // ============================================================================

  /**
   * POST /api/rebates/email-info
   * Send rebate info email to customer
   */
  router.post('/email-info', authMiddleware, asyncHandler(async (req, res) => {
    const { email, orderId, rebates } = req.body;

    if (!email || !orderId || !rebates) {
      throw ApiError.badRequest('email, orderId, and rebates array are required');
    }

    const result = await followUpService.sendRebateInfoEmail(email, orderId, rebates);

    res.json(result);
  }));

  // ============================================================================
  // FOLLOW-UP / REMINDERS
  // ============================================================================

  /**
   * GET /api/rebates/expiring
   * Get claims expiring soon
   */
  router.get('/expiring', authMiddleware, asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;

    const claims = await followUpService.getExpiringClaims(parseInt(days));

    res.json({
      success: true,
      daysThreshold: parseInt(days),
      claims,
      count: claims.length,
    });
  }));

  /**
   * GET /api/rebates/reminders/pending
   * Get claims needing reminders
   */
  router.get('/reminders/pending', authMiddleware, asyncHandler(async (req, res) => {
    const { limit = 100 } = req.query;

    const reminders = await followUpService.getPendingReminders({ limit: parseInt(limit) });

    res.json({
      success: true,
      reminders,
      count: reminders.length,
    });
  }));

  /**
   * POST /api/rebates/reminders/send/:claimId
   * Send reminder for specific claim
   */
  router.post('/reminders/send/:claimId', authMiddleware, asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { reminderType, customMessage } = req.body;

    const result = await followUpService.sendReminderEmail(
      parseInt(claimId),
      { reminderType, customMessage }
    );

    res.json(result);
  }));

  /**
   * POST /api/rebates/reminders/process
   * Process all pending reminders (batch)
   */
  router.post('/reminders/process', authMiddleware, asyncHandler(async (req, res) => {
    const { dryRun = false, limit = 50 } = req.body;

    const results = await followUpService.processReminders({
      dryRun,
      limit,
    });

    res.json({
      success: true,
      ...results,
    });
  }));

  /**
   * GET /api/rebates/reminders/post-purchase
   * Get pending post-purchase reminders (7 days after purchase)
   */
  router.get('/reminders/post-purchase', authMiddleware, asyncHandler(async (req, res) => {
    const { limit = 100 } = req.query;

    const reminders = await followUpService.getPostPurchaseReminders({
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      reminders,
      count: reminders.length,
    });
  }));

  /**
   * POST /api/rebates/reminders/post-purchase/process
   * Process 7-day post-purchase reminders (batch)
   * Sends reminders to customers who haven't submitted rebates
   */
  router.post('/reminders/post-purchase/process', authMiddleware, asyncHandler(async (req, res) => {
    const { dryRun = false, limit = 50 } = req.body;

    const results = await followUpService.processPostPurchaseReminders({
      dryRun,
      limit,
    });

    res.json({
      success: true,
      reminderType: 'post_purchase',
      ...results,
    });
  }));

  /**
   * GET /api/rebates/reminders/history
   * Get reminder history
   */
  router.get('/reminders/history', authMiddleware, asyncHandler(async (req, res) => {
    const { claimId, customerId, limit = 50 } = req.query;

    const history = await followUpService.getReminderHistory({
      claimId: claimId ? parseInt(claimId) : undefined,
      customerId: customerId ? parseInt(customerId) : undefined,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      history,
      count: history.length,
    });
  }));

  /**
   * POST /api/rebates/mark-expired
   * Mark expired claims
   */
  router.post('/mark-expired', authMiddleware, asyncHandler(async (req, res) => {
    const result = await followUpService.markExpiredClaims();

    res.json({
      success: true,
      ...result,
    });
  }));

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  /**
   * GET /api/rebates/dashboard
   * Get rebate follow-up dashboard data
   */
  router.get('/dashboard', authMiddleware, asyncHandler(async (req, res) => {
    const data = await followUpService.getDashboardData();

    res.json({
      success: true,
      ...data,
    });
  }));

  // ============================================================================
  // JOB CONTROL - Manual trigger for reminder jobs
  // ============================================================================

  // Create job instance (lazy initialization)
  let reminderJob = null;
  const getReminderJob = () => {
    if (!reminderJob) {
      const RebateReminderJob = require('../services/RebateReminderJob');
      reminderJob = new RebateReminderJob(pool, null); // No email service for now
    }
    return reminderJob;
  };

  /**
   * GET /api/rebates/job/status
   * Get reminder job status
   */
  router.get('/job/status', authMiddleware, asyncHandler(async (req, res) => {
    const job = getReminderJob();
    res.json({
      success: true,
      ...job.getStatus(),
    });
  }));

  /**
   * GET /api/rebates/job/preview
   * Preview pending reminders without sending
   */
  router.get('/job/preview', authMiddleware, asyncHandler(async (req, res) => {
    const job = getReminderJob();
    const preview = await job.getPreview();

    res.json({
      success: true,
      ...preview,
    });
  }));

  /**
   * POST /api/rebates/job/run
   * Manually trigger the reminder job
   */
  router.post('/job/run', authMiddleware, asyncHandler(async (req, res) => {
    const { dryRun = false, postPurchaseOnly = false, deadlineOnly = false } = req.body;
    const job = getReminderJob();

    let results;
    if (postPurchaseOnly) {
      results = await job.runPostPurchaseOnly({ dryRun });
    } else if (deadlineOnly) {
      results = await job.runDeadlineOnly({ dryRun });
    } else {
      results = await job.run({ dryRun });
    }

    res.json({
      success: true,
      ...results,
    });
  }));

  /**
   * POST /api/rebates/job/dry-run
   * Dry run - see what would be sent without sending
   */
  router.post('/job/dry-run', authMiddleware, asyncHandler(async (req, res) => {
    const job = getReminderJob();
    const results = await job.dryRun();

    res.json({
      success: true,
      ...results,
    });
  }));

  // ============================================================================
  // REBATE MANAGEMENT (ADMIN)
  // ============================================================================

  /**
   * GET /api/rebates
   * List active rebates
   */
  router.get('/', authMiddleware, asyncHandler(async (req, res) => {
    const { manufacturer, rebateType, page = 1, limit = 50 } = req.query;

    const result = await rebateService.listActiveRebates({
      manufacturer,
      rebateType,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      ...result,
    });
  }));

  /**
   * GET /api/rebates/:rebateId
   * Get rebate by ID
   */
  router.get('/:rebateId', authMiddleware, asyncHandler(async (req, res) => {
    const { rebateId } = req.params;

    const rebate = await rebateService.getRebateById(parseInt(rebateId));

    if (!rebate) {
      throw ApiError.notFound('Rebate');
    }

    res.json({
      success: true,
      rebate,
    });
  }));

  return router;
}

module.exports = createRebateRoutes;
