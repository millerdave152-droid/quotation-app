/**
 * TeleTime POS - Financing Routes
 * API endpoints for financing plans, applications, and payments
 */

const express = require('express');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Initialize financing routes
 * @param {object} deps - Dependencies
 * @param {object} deps.financingService - FinancingService instance
 * @returns {express.Router}
 */
function init({ financingService }) {
  const router = express.Router();

  // ===========================================================================
  // CUSTOMER-FACING ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/financing/plans
   * Get available financing plans for an order amount
   * Query: amount (required, in cents), customerId (optional)
   */
  router.get('/plans', asyncHandler(async (req, res) => {
    const { amount, customerId } = req.query;

    if (!amount) {
      throw ApiError.badRequest('Amount is required');
    }

    const amountCents = parseInt(amount, 10);
    if (isNaN(amountCents) || amountCents <= 0) {
      throw ApiError.badRequest('Invalid amount');
    }

    const result = await financingService.getAvailablePlans(
      amountCents,
      customerId ? parseInt(customerId, 10) : null
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * GET /api/financing/plans/:planId/calculate
   * Calculate payment details for a specific plan
   * Query: amount (required, in cents)
   */
  router.get('/plans/:planId/calculate', asyncHandler(async (req, res) => {
    const { planId } = req.params;
    const { amount } = req.query;

    if (!amount) {
      throw ApiError.badRequest('Amount is required');
    }

    const amountCents = parseInt(amount, 10);
    if (isNaN(amountCents) || amountCents <= 0) {
      throw ApiError.badRequest('Invalid amount');
    }

    const result = await financingService.calculatePaymentPlan(
      parseInt(planId, 10),
      amountCents
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * POST /api/financing/apply
   * Initiate financing application
   * Body: { orderId, planId, customerId, amountCents?, transactionId? }
   */
  router.post('/apply', asyncHandler(async (req, res) => {
    const { orderId, planId, customerId, amountCents, transactionId } = req.body;

    if (!planId || !customerId) {
      throw ApiError.badRequest('planId and customerId are required');
    }

    const userId = req.user?.id || req.body.userId;

    const result = await financingService.initiateFinancing(
      orderId ? parseInt(orderId, 10) : null,
      parseInt(planId, 10),
      parseInt(customerId, 10),
      {
        userId,
        amountCents: amountCents ? parseInt(amountCents, 10) : null,
        transactionId: transactionId ? parseInt(transactionId, 10) : null,
      }
    );

    res.json({
      success: result.success,
      data: result,
    });
  }));

  /**
   * GET /api/financing/applications
   * Get all applications with optional filters (for admin pages)
   * Query: status, provider, customerId, includeAll, page, limit
   */
  router.get('/applications', asyncHandler(async (req, res) => {
    const { status, provider, customerId, includeAll, page = 1, limit = 100 } = req.query;

    let query = `
      SELECT
        fa.id,
        fa.application_number,
        fa.customer_id,
        fa.financing_option_id,
        fa.provider,
        fa.requested_amount_cents AS amount_cents,
        fa.term_months,
        fa.apr,
        fa.monthly_payment_cents,
        fa.total_interest_cents,
        fa.status,
        fa.decision_reason AS decline_reason,
        fa.decision_at AS decision_date,
        fa.created_at,
        c.name AS customer_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        fo.name AS plan_name
      FROM financing_applications fa
      JOIN customers c ON c.id = fa.customer_id
      LEFT JOIN financing_options fo ON fo.id = fa.financing_option_id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (status) {
      query += ` AND fa.status = $${paramIdx++}`;
      params.push(status);
    }

    if (provider) {
      query += ` AND fa.provider = $${paramIdx++}`;
      params.push(provider);
    }

    if (customerId) {
      query += ` AND fa.customer_id = $${paramIdx++}`;
      params.push(parseInt(customerId, 10));
    }

    query += ` ORDER BY fa.created_at DESC`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const pool = financingService.pool;
    const { rows } = await pool.query(query, params);

    res.json({
      success: true,
      applications: rows,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }));

  /**
   * GET /api/financing/applications/:id
   * Get financing application details
   */
  router.get('/applications/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const application = await financingService.getApplication(parseInt(id, 10));

    if (!application) {
      throw ApiError.notFound('Application');
    }

    res.json({
      success: true,
      data: application,
    });
  }));

  /**
   * POST /api/financing/applications/:id/manual-approve
   * Manually approve application (manager override)
   * Body: { notes? }
   */
  router.post('/applications/:id/manual-approve', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id;

    const pool = financingService.pool;

    // Get application
    const { rows: appRows } = await pool.query(
      `SELECT * FROM financing_applications WHERE id = $1 AND status IN ('pending', 'more_info')`,
      [parseInt(id, 10)]
    );

    if (appRows.length === 0) {
      throw ApiError.notFound('Application not found or not in pending/more_info status');
    }

    const app = appRows[0];

    // Update application to approved
    await pool.query(
      `UPDATE financing_applications
       SET status = 'approved',
           approved_amount_cents = requested_amount_cents,
           decision_at = NOW(),
           decision_reason = $1,
           processed_by = $2
       WHERE id = $3`,
      [notes || 'Manual manager approval', userId, parseInt(id, 10)]
    );

    // Create agreement if service method exists
    let agreement = null;
    if (typeof financingService._createAgreement === 'function') {
      agreement = await financingService._createAgreement(parseInt(id, 10), {
        customerId: app.customer_id,
        planId: app.financing_option_id,
        principalCents: app.requested_amount_cents,
        termMonths: app.term_months,
        apr: app.apr,
      });

      // Update to active
      await pool.query(
        `UPDATE financing_applications SET status = 'active' WHERE id = $1`,
        [parseInt(id, 10)]
      );
    }

    res.json({
      success: true,
      data: {
        applicationId: parseInt(id, 10),
        status: agreement ? 'active' : 'approved',
        agreementId: agreement?.agreementId,
        agreementNumber: agreement?.agreementNumber,
      },
    });
  }));

  /**
   * POST /api/financing/applications/:id/manual-decline
   * Manually decline application (manager override)
   * Body: { reason }
   */
  router.post('/applications/:id/manual-decline', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!reason) {
      throw ApiError.badRequest('Decline reason is required');
    }

    const pool = financingService.pool;

    const { rowCount } = await pool.query(
      `UPDATE financing_applications
       SET status = 'declined',
           decision_at = NOW(),
           decision_reason = $1,
           decline_code = 'manager_decline',
           processed_by = $2
       WHERE id = $3 AND status IN ('pending', 'more_info')`,
      [reason, userId, parseInt(id, 10)]
    );

    if (rowCount === 0) {
      throw ApiError.notFound('Application not found or not in pending/more_info status');
    }

    res.json({
      success: true,
      data: {
        applicationId: parseInt(id, 10),
        status: 'declined',
        reason,
      },
    });
  }));

  /**
   * GET /api/financing/agreements/:id
   * Get agreement details
   */
  router.get('/agreements/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const pool = financingService.pool;

    // Get agreement
    const { rows } = await pool.query(`
      SELECT
        fg.*,
        c.name AS customer_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        fo.name AS plan_name,
        fo.provider
      FROM financing_agreements fg
      JOIN customers c ON c.id = fg.customer_id
      LEFT JOIN financing_options fo ON fo.id = fg.financing_option_id
      WHERE fg.id = $1
    `, [parseInt(id, 10)]);

    if (rows.length === 0) {
      throw ApiError.notFound('Agreement');
    }

    // Get payments
    const { rows: payments } = await pool.query(`
      SELECT * FROM financing_payments
      WHERE agreement_id = $1
      ORDER BY payment_number ASC
    `, [parseInt(id, 10)]);

    res.json({
      success: true,
      data: {
        agreement: rows[0],
        payments,
      },
    });
  }));

  /**
   * GET /api/financing/customer/:customerId
   * Get customer's financing information
   */
  router.get('/customer/:customerId', asyncHandler(async (req, res) => {
    const { customerId } = req.params;
    const result = await financingService.getCustomerFinancing(parseInt(customerId, 10));

    res.json({
      success: true,
      data: result,
    });
  }));

  // ===========================================================================
  // PAYMENT ENDPOINTS
  // ===========================================================================

  /**
   * POST /api/financing/agreements/:agreementId/payments
   * Record a payment on a financing agreement
   * Body: { amountCents, paymentMethod?, externalPaymentId? }
   */
  router.post('/agreements/:agreementId/payments', asyncHandler(async (req, res) => {
    const { agreementId } = req.params;
    const { amountCents, paymentMethod, externalPaymentId } = req.body;

    if (!amountCents || amountCents <= 0) {
      throw ApiError.badRequest('Valid amountCents is required');
    }

    const result = await financingService.recordPayment(
      parseInt(agreementId, 10),
      parseInt(amountCents, 10),
      { paymentMethod, externalPaymentId }
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * GET /api/financing/agreements/:agreementId/payoff
   * Calculate early payoff amount
   */
  router.get('/agreements/:agreementId/payoff', asyncHandler(async (req, res) => {
    const { agreementId } = req.params;
    const result = await financingService.calculatePayoffAmount(parseInt(agreementId, 10));

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * POST /api/financing/agreements/:agreementId/payoff
   * Process early payoff
   * Body: { paymentMethod?, externalPaymentId? }
   */
  router.post('/agreements/:agreementId/payoff', asyncHandler(async (req, res) => {
    const { agreementId } = req.params;
    const { paymentMethod, externalPaymentId } = req.body;

    const result = await financingService.processEarlyPayoff(
      parseInt(agreementId, 10),
      { paymentMethod, externalPaymentId }
    );

    res.json({
      success: true,
      data: result,
    });
  }));

  /**
   * POST /api/financing/link-transaction
   * Link a transaction to financing
   * Body: { transactionId, applicationId, agreementId? }
   */
  router.post('/link-transaction', asyncHandler(async (req, res) => {
    const { transactionId, applicationId, agreementId } = req.body;

    if (!transactionId || !applicationId) {
      throw ApiError.badRequest('transactionId and applicationId are required');
    }

    await financingService.linkToTransaction(
      parseInt(transactionId, 10),
      parseInt(applicationId, 10),
      agreementId ? parseInt(agreementId, 10) : null
    );

    res.json({
      success: true,
      message: 'Transaction linked to financing',
    });
  }));

  // ===========================================================================
  // EXTERNAL PROVIDER WEBHOOKS
  // ===========================================================================

  /**
   * POST /api/financing/webhooks/affirm
   * Handle Affirm webhook callbacks
   */
  router.post('/webhooks/affirm', async (req, res) => {
    try {
      const result = await financingService.processExternalCallback('affirm', req.body);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      // Return 200 to acknowledge receipt even on error
      res.status(200).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/financing/webhooks/klarna
   * Handle Klarna webhook callbacks
   */
  router.post('/webhooks/klarna', async (req, res) => {
    try {
      const result = await financingService.processExternalCallback('klarna', req.body);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      // Return 200 to acknowledge receipt even on error
      res.status(200).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/financing/webhooks/synchrony
   * Handle Synchrony webhook callbacks
   */
  router.post('/webhooks/synchrony', async (req, res) => {
    try {
      const result = await financingService.processExternalCallback('synchrony', req.body);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      // Return 200 to acknowledge receipt even on error
      res.status(200).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ===========================================================================
  // ADMIN ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/financing/admin/applications
   * List financing applications with filters
   * Query: status, customerId, provider, page, limit
   */
  router.get('/admin/applications', asyncHandler(async (req, res) => {
    const { status, customerId, provider, page = 1, limit = 50 } = req.query;

    let query = `
      SELECT
        fa.*,
        fo.name AS plan_name,
        fo.financing_code,
        c.name AS customer_name
      FROM financing_applications fa
      JOIN financing_options fo ON fo.id = fa.financing_option_id
      JOIN customers c ON c.id = fa.customer_id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (status) {
      query += ` AND fa.status = $${paramIdx++}`;
      params.push(status);
    }

    if (customerId) {
      query += ` AND fa.customer_id = $${paramIdx++}`;
      params.push(parseInt(customerId, 10));
    }

    if (provider) {
      query += ` AND fa.provider = $${paramIdx++}`;
      params.push(provider);
    }

    query += ` ORDER BY fa.created_at DESC`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const pool = financingService.pool;
    const { rows } = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        applications: rows,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
    });
  }));

  /**
   * GET /api/financing/admin/agreements
   * List financing agreements with filters
   */
  router.get('/admin/agreements', asyncHandler(async (req, res) => {
    const { status, customerId, page = 1, limit = 50 } = req.query;

    let query = `
      SELECT
        fg.*,
        fo.name AS plan_name,
        fo.financing_code,
        c.name AS customer_name,
        c.email AS customer_email
      FROM financing_agreements fg
      JOIN financing_options fo ON fo.id = fg.financing_option_id
      JOIN customers c ON c.id = fg.customer_id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (status) {
      query += ` AND fg.status = $${paramIdx++}`;
      params.push(status);
    }

    if (customerId) {
      query += ` AND fg.customer_id = $${paramIdx++}`;
      params.push(parseInt(customerId, 10));
    }

    query += ` ORDER BY fg.created_at DESC`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const pool = financingService.pool;
    const { rows } = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        agreements: rows,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
    });
  }));

  /**
   * GET /api/financing/admin/upcoming-payments
   * Get payments due soon (for collections/reminders)
   */
  router.get('/admin/upcoming-payments', asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;

    const pool = financingService.pool;
    const { rows } = await pool.query(`
      SELECT * FROM v_upcoming_financing_payments
      WHERE due_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
      ORDER BY due_date ASC
      LIMIT 100
    `, [parseInt(days, 10)]);

    res.json({
      success: true,
      data: {
        payments: rows,
        daysAhead: parseInt(days, 10),
      },
    });
  }));

  /**
   * GET /api/financing/admin/overdue
   * Get overdue payments
   */
  router.get('/admin/overdue', asyncHandler(async (req, res) => {
    const pool = financingService.pool;
    const { rows } = await pool.query(`
      SELECT
        fp.*,
        fg.agreement_number,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        CURRENT_DATE - fp.due_date AS days_overdue
      FROM financing_payments fp
      JOIN financing_agreements fg ON fg.id = fp.agreement_id
      JOIN customers c ON c.id = fp.customer_id
      WHERE fp.status = 'scheduled'
        AND fp.due_date < CURRENT_DATE
        AND fg.status = 'active'
      ORDER BY fp.due_date ASC
    `);

    res.json({
      success: true,
      data: {
        overduePayments: rows,
        count: rows.length,
      },
    });
  }));

  /**
   * POST /api/financing/admin/applications/:id/approve
   * Manually approve a pending application (admin override)
   */
  router.post('/admin/applications/:id/approve', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { approvedAmount } = req.body;
    const userId = req.user?.id;

    const pool = financingService.pool;

    // Get application
    const { rows: appRows } = await pool.query(
      `SELECT * FROM financing_applications WHERE id = $1 AND status = 'pending'`,
      [parseInt(id, 10)]
    );

    if (appRows.length === 0) {
      throw ApiError.notFound('Application not found or not pending');
    }

    const app = appRows[0];
    const amount = approvedAmount ? parseInt(approvedAmount, 10) : app.requested_amount_cents;

    // Update application
    await pool.query(
      `UPDATE financing_applications
       SET status = 'approved',
           approved_amount_cents = $1,
           decision_at = NOW(),
           decision_reason = 'Manual admin approval',
           processed_by = $2
       WHERE id = $3`,
      [amount, userId, parseInt(id, 10)]
    );

    // Create agreement
    const agreement = await financingService._createAgreement(parseInt(id, 10), {
      customerId: app.customer_id,
      planId: app.financing_option_id,
      principalCents: amount,
      termMonths: app.term_months,
      apr: app.apr,
    });

    // Update to active
    await pool.query(
      `UPDATE financing_applications SET status = 'active' WHERE id = $1`,
      [parseInt(id, 10)]
    );

    res.json({
      success: true,
      data: {
        applicationId: parseInt(id, 10),
        agreementId: agreement.agreementId,
        agreementNumber: agreement.agreementNumber,
        status: 'active',
      },
    });
  }));

  /**
   * POST /api/financing/admin/applications/:id/decline
   * Manually decline a pending application
   */
  router.post('/admin/applications/:id/decline', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason, declineCode } = req.body;
    const userId = req.user?.id;

    const pool = financingService.pool;

    const { rowCount } = await pool.query(
      `UPDATE financing_applications
       SET status = 'declined',
           decision_at = NOW(),
           decision_reason = $1,
           decline_code = $2,
           processed_by = $3
       WHERE id = $4 AND status = 'pending'`,
      [reason || 'Manual admin decline', declineCode || 'admin_decline', userId, parseInt(id, 10)]
    );

    if (rowCount === 0) {
      throw ApiError.notFound('Application not found or not pending');
    }

    res.json({
      success: true,
      data: {
        applicationId: parseInt(id, 10),
        status: 'declined',
      },
    });
  }));

  /**
   * GET /api/financing/admin/collections
   * Get collections data (past due accounts)
   * Query: riskLevel, minDaysOverdue, limit
   */
  router.get('/admin/collections', asyncHandler(async (req, res) => {
    const { riskLevel, minDaysOverdue, limit } = req.query;

    const result = await financingService.getCollections({
      riskLevel,
      minDaysOverdue: minDaysOverdue ? parseInt(minDaysOverdue, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 100,
    });

    // Map to snake_case for frontend compatibility
    const collections = result.accounts.map(a => ({
      payment_id: a.paymentId,
      agreement_id: a.agreementId,
      agreement_number: a.agreementNumber,
      customer_id: a.customerId,
      customer_name: a.customerName,
      customer_email: a.customerEmail,
      customer_phone: a.customerPhone,
      payment_number: a.paymentNumber,
      due_date: a.dueDate,
      amount_due_cents: a.amountDueCents,
      days_overdue: a.daysOverdue,
      late_fee_cents: a.lateFeeCents,
      total_balance_cents: a.totalBalanceCents,
      provider: a.provider,
      risk_level: a.riskLevel,
    }));

    res.json({
      success: true,
      collections,
      summary: result.summary,
      data: result,
    });
  }));

  /**
   * GET /api/financing/admin/dashboard
   * Get financing dashboard summary
   */
  router.get('/admin/dashboard', asyncHandler(async (req, res) => {
    const pool = financingService.pool;

    // Get summary stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_applications,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved_applications,
        COUNT(*) FILTER (WHERE status = 'declined') AS declined_applications,
        COUNT(*) FILTER (WHERE status = 'active') AS active_applications
      FROM financing_applications
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const agreements = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_agreements,
        COALESCE(SUM(balance_remaining_cents) FILTER (WHERE status = 'active'), 0) AS total_outstanding_cents,
        COALESCE(SUM(monthly_payment_cents) FILTER (WHERE status = 'active'), 0) AS total_monthly_revenue_cents,
        COUNT(*) FILTER (WHERE status = 'paid_off' AND paid_off_date > NOW() - INTERVAL '30 days') AS paid_off_this_month
      FROM financing_agreements
    `);

    const collections = await pool.query(`
      SELECT COUNT(*) as overdue_count,
             COALESCE(SUM(amount_due_cents), 0) as overdue_amount_cents
      FROM financing_payments fp
      JOIN financing_agreements fg ON fg.id = fp.agreement_id
      WHERE fp.status = 'scheduled'
        AND fp.due_date < CURRENT_DATE
        AND fg.status = 'active'
    `);

    res.json({
      success: true,
      // Flat structure for frontend compatibility
      pendingApplications: parseInt(stats.rows[0].pending_applications) || 0,
      approvedMTD: parseInt(stats.rows[0].approved_applications) || 0,
      declinedMTD: parseInt(stats.rows[0].declined_applications) || 0,
      activeAgreements: parseInt(agreements.rows[0].active_agreements) || 0,
      totalOutstandingCents: parseInt(agreements.rows[0].total_outstanding_cents) || 0,
      totalMonthlyRevenueCents: parseInt(agreements.rows[0].total_monthly_revenue_cents) || 0,
      paidOffThisMonth: parseInt(agreements.rows[0].paid_off_this_month) || 0,
      overdueCount: parseInt(collections.rows[0].overdue_count) || 0,
      overdueAmountCents: parseInt(collections.rows[0].overdue_amount_cents) || 0,
      // Also keep nested structure for flexibility
      data: {
        applications: {
          pending: parseInt(stats.rows[0].pending_applications) || 0,
          approved: parseInt(stats.rows[0].approved_applications) || 0,
          declined: parseInt(stats.rows[0].declined_applications) || 0,
          active: parseInt(stats.rows[0].active_applications) || 0,
        },
        agreements: {
          active: parseInt(agreements.rows[0].active_agreements) || 0,
          totalOutstandingCents: parseInt(agreements.rows[0].total_outstanding_cents) || 0,
          totalOutstanding: (parseInt(agreements.rows[0].total_outstanding_cents) || 0) / 100,
          totalMonthlyRevenueCents: parseInt(agreements.rows[0].total_monthly_revenue_cents) || 0,
          totalMonthlyRevenue: (parseInt(agreements.rows[0].total_monthly_revenue_cents) || 0) / 100,
          paidOffThisMonth: parseInt(agreements.rows[0].paid_off_this_month) || 0,
        },
        collections: {
          overdueCount: parseInt(collections.rows[0].overdue_count) || 0,
          overdueAmountCents: parseInt(collections.rows[0].overdue_amount_cents) || 0,
          overdueAmount: (parseInt(collections.rows[0].overdue_amount_cents) || 0) / 100,
        },
      },
    });
  }));

  return router;
}

module.exports = { init };
