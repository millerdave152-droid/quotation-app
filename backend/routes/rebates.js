/**
 * Rebate Routes
 * API endpoints for manufacturer rebate management
 */

const express = require('express');

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
  router.get('/product/:productId', authMiddleware, async (req, res) => {
    try {
      const { productId } = req.params;

      const rebates = await rebateService.getProductRebates(parseInt(productId));

      res.json({
        success: true,
        productId: parseInt(productId),
        rebates,
        count: rebates.length,
      });
    } catch (error) {
      console.error('[Rebates] Get product rebates error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get product rebates',
      });
    }
  });

  // ============================================================================
  // CART REBATES
  // ============================================================================

  /**
   * POST /api/rebates/cart
   * Analyze cart for rebates
   */
  router.post('/cart', authMiddleware, async (req, res) => {
    try {
      const { cartItems } = req.body;

      if (!cartItems || !Array.isArray(cartItems)) {
        return res.status(400).json({
          success: false,
          message: 'cartItems array is required',
        });
      }

      const rebates = await rebateService.getCartRebates(cartItems);

      res.json({
        success: true,
        ...rebates,
      });
    } catch (error) {
      console.error('[Rebates] Get cart rebates error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to analyze cart rebates',
      });
    }
  });

  // ============================================================================
  // APPLY/REMOVE REBATES
  // ============================================================================

  /**
   * POST /api/rebates/apply
   * Apply instant rebate to transaction
   */
  router.post('/apply', authMiddleware, async (req, res) => {
    try {
      const { transactionId, rebateId, productId } = req.body;
      const userId = req.user?.id || req.user?.userId;

      if (!transactionId || !rebateId || !productId) {
        return res.status(400).json({
          success: false,
          message: 'transactionId, rebateId, and productId are required',
        });
      }

      const result = await rebateService.applyInstantRebate(
        transactionId,
        rebateId,
        productId,
        userId
      );

      res.json(result);
    } catch (error) {
      console.error('[Rebates] Apply rebate error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to apply rebate',
      });
    }
  });

  // ============================================================================
  // REBATE CLAIMS
  // ============================================================================

  /**
   * POST /api/rebates/claim
   * Create rebate claim for mail-in/online rebate
   */
  router.post('/claim', authMiddleware, async (req, res) => {
    try {
      const { orderId, rebateId, customerId, ...options } = req.body;

      if (!orderId || !rebateId) {
        return res.status(400).json({
          success: false,
          message: 'orderId and rebateId are required',
        });
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
    } catch (error) {
      console.error('[Rebates] Create claim error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create rebate claim',
      });
    }
  });

  /**
   * GET /api/rebates/claims/customer/:customerId
   * Get customer's rebate claims
   */
  router.get('/claims/customer/:customerId', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Rebates] Get customer claims error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get customer claims',
      });
    }
  });

  /**
   * PATCH /api/rebates/claims/:claimId/status
   * Update claim status
   */
  router.patch('/claims/:claimId/status', authMiddleware, async (req, res) => {
    try {
      const { claimId } = req.params;
      const { status, ...options } = req.body;
      const userId = req.user?.id || req.user?.userId;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'status is required',
        });
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
    } catch (error) {
      console.error('[Rebates] Update claim status error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update claim status',
      });
    }
  });

  // ============================================================================
  // CUSTOMER PORTAL - Rebate Lookup and Status Update
  // ============================================================================

  /**
   * GET /api/rebates/customer/:customerId
   * Get all pending rebates for a customer with full details
   * Used by customer portal and staff lookup
   */
  router.get('/customer/:customerId', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Rebates] Get customer rebates error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get customer rebates',
      });
    }
  });

  /**
   * PATCH /api/rebates/customer/:customerId/claims/:claimId
   * Customer submits rebate claim - updates status to 'submitted'
   */
  router.patch('/customer/:customerId/claims/:claimId', authMiddleware, async (req, res) => {
    try {
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
        return res.status(404).json({
          success: false,
          message: 'Rebate claim not found',
        });
      }

      if (verifyResult.rows[0].claim_status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending claims can be marked as submitted',
        });
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
    } catch (error) {
      console.error('[Rebates] Update customer claim error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update rebate claim',
      });
    }
  });

  // ============================================================================
  // REBATE INFO EMAIL
  // ============================================================================

  /**
   * POST /api/rebates/email-info
   * Send rebate info email to customer
   */
  router.post('/email-info', authMiddleware, async (req, res) => {
    try {
      const { email, orderId, rebates } = req.body;

      if (!email || !orderId || !rebates) {
        return res.status(400).json({
          success: false,
          message: 'email, orderId, and rebates array are required',
        });
      }

      const result = await followUpService.sendRebateInfoEmail(email, orderId, rebates);

      res.json(result);
    } catch (error) {
      console.error('[Rebates] Send email info error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send rebate info email',
      });
    }
  });

  // ============================================================================
  // FOLLOW-UP / REMINDERS
  // ============================================================================

  /**
   * GET /api/rebates/expiring
   * Get claims expiring soon
   */
  router.get('/expiring', authMiddleware, async (req, res) => {
    try {
      const { days = 7 } = req.query;

      const claims = await followUpService.getExpiringClaims(parseInt(days));

      res.json({
        success: true,
        daysThreshold: parseInt(days),
        claims,
        count: claims.length,
      });
    } catch (error) {
      console.error('[Rebates] Get expiring claims error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get expiring claims',
      });
    }
  });

  /**
   * GET /api/rebates/reminders/pending
   * Get claims needing reminders
   */
  router.get('/reminders/pending', authMiddleware, async (req, res) => {
    try {
      const { limit = 100 } = req.query;

      const reminders = await followUpService.getPendingReminders({ limit: parseInt(limit) });

      res.json({
        success: true,
        reminders,
        count: reminders.length,
      });
    } catch (error) {
      console.error('[Rebates] Get pending reminders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get pending reminders',
      });
    }
  });

  /**
   * POST /api/rebates/reminders/send/:claimId
   * Send reminder for specific claim
   */
  router.post('/reminders/send/:claimId', authMiddleware, async (req, res) => {
    try {
      const { claimId } = req.params;
      const { reminderType, customMessage } = req.body;

      const result = await followUpService.sendReminderEmail(
        parseInt(claimId),
        { reminderType, customMessage }
      );

      res.json(result);
    } catch (error) {
      console.error('[Rebates] Send reminder error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send reminder',
      });
    }
  });

  /**
   * POST /api/rebates/reminders/process
   * Process all pending reminders (batch)
   */
  router.post('/reminders/process', authMiddleware, async (req, res) => {
    try {
      const { dryRun = false, limit = 50 } = req.body;

      const results = await followUpService.processReminders({
        dryRun,
        limit,
      });

      res.json({
        success: true,
        ...results,
      });
    } catch (error) {
      console.error('[Rebates] Process reminders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process reminders',
      });
    }
  });

  /**
   * GET /api/rebates/reminders/post-purchase
   * Get pending post-purchase reminders (7 days after purchase)
   */
  router.get('/reminders/post-purchase', authMiddleware, async (req, res) => {
    try {
      const { limit = 100 } = req.query;

      const reminders = await followUpService.getPostPurchaseReminders({
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        reminders,
        count: reminders.length,
      });
    } catch (error) {
      console.error('[Rebates] Get post-purchase reminders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get post-purchase reminders',
      });
    }
  });

  /**
   * POST /api/rebates/reminders/post-purchase/process
   * Process 7-day post-purchase reminders (batch)
   * Sends reminders to customers who haven't submitted rebates
   */
  router.post('/reminders/post-purchase/process', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Rebates] Process post-purchase reminders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process post-purchase reminders',
      });
    }
  });

  /**
   * GET /api/rebates/reminders/history
   * Get reminder history
   */
  router.get('/reminders/history', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Rebates] Get reminder history error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get reminder history',
      });
    }
  });

  /**
   * POST /api/rebates/mark-expired
   * Mark expired claims
   */
  router.post('/mark-expired', authMiddleware, async (req, res) => {
    try {
      const result = await followUpService.markExpiredClaims();

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[Rebates] Mark expired error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to mark expired claims',
      });
    }
  });

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  /**
   * GET /api/rebates/dashboard
   * Get rebate follow-up dashboard data
   */
  router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
      const data = await followUpService.getDashboardData();

      res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error('[Rebates] Get dashboard error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get dashboard data',
      });
    }
  });

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
  router.get('/job/status', authMiddleware, async (req, res) => {
    try {
      const job = getReminderJob();
      res.json({
        success: true,
        ...job.getStatus(),
      });
    } catch (error) {
      console.error('[Rebates] Get job status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get job status',
      });
    }
  });

  /**
   * GET /api/rebates/job/preview
   * Preview pending reminders without sending
   */
  router.get('/job/preview', authMiddleware, async (req, res) => {
    try {
      const job = getReminderJob();
      const preview = await job.getPreview();

      res.json({
        success: true,
        ...preview,
      });
    } catch (error) {
      console.error('[Rebates] Get job preview error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get job preview',
      });
    }
  });

  /**
   * POST /api/rebates/job/run
   * Manually trigger the reminder job
   */
  router.post('/job/run', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Rebates] Run job error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to run reminder job',
      });
    }
  });

  /**
   * POST /api/rebates/job/dry-run
   * Dry run - see what would be sent without sending
   */
  router.post('/job/dry-run', authMiddleware, async (req, res) => {
    try {
      const job = getReminderJob();
      const results = await job.dryRun();

      res.json({
        success: true,
        ...results,
      });
    } catch (error) {
      console.error('[Rebates] Dry run error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to run dry run',
      });
    }
  });

  // ============================================================================
  // REBATE MANAGEMENT (ADMIN)
  // ============================================================================

  /**
   * GET /api/rebates
   * List active rebates
   */
  router.get('/', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
      console.error('[Rebates] List rebates error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to list rebates',
      });
    }
  });

  /**
   * GET /api/rebates/:rebateId
   * Get rebate by ID
   */
  router.get('/:rebateId', authMiddleware, async (req, res) => {
    try {
      const { rebateId } = req.params;

      const rebate = await rebateService.getRebateById(parseInt(rebateId));

      if (!rebate) {
        return res.status(404).json({
          success: false,
          message: 'Rebate not found',
        });
      }

      res.json({
        success: true,
        rebate,
      });
    } catch (error) {
      console.error('[Rebates] Get rebate error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get rebate',
      });
    }
  });

  return router;
}

module.exports = createRebateRoutes;
