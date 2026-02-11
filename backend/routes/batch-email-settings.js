/**
 * TeleTime POS - Batch Email Settings Routes
 * API endpoints for scheduled batch email configuration
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = (pool, scheduledBatchEmailService) => {
  // ============================================================================
  // SETTINGS
  // ============================================================================

  /**
   * GET /api/batch-email-settings
   * Get current batch email settings
   */
  router.get('/', asyncHandler(async (req, res) => {
    const settings = await scheduledBatchEmailService.getSettings();

    res.json({
      success: true,
      data: settings,
    });
  }));

  /**
   * PUT /api/batch-email-settings
   * Update batch email settings
   */
  router.put('/', asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;

    const settings = await scheduledBatchEmailService.updateSettings(req.body, userId);

    res.json({
      success: true,
      data: settings,
      message: 'Settings updated successfully',
    });
  }));

  // ============================================================================
  // TEST
  // ============================================================================

  /**
   * POST /api/batch-email-settings/test
   * Send a test email to verify configuration
   */
  router.post('/test', asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      throw ApiError.badRequest('Email address is required');
    }

    await scheduledBatchEmailService.testEmailConfig(email);

    res.json({
      success: true,
      message: `Test email sent to ${email}`,
    });
  }));

  /**
   * POST /api/batch-email-settings/test-batch
   * Run a test batch (dry run without actually sending)
   */
  router.post('/test-batch', asyncHandler(async (req, res) => {
    const { shiftId, date } = req.body;

    // Get unsent receipts count without actually sending
    let query;
    let params;

    if (shiftId) {
      query = `
        SELECT COUNT(*) as count
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.customer_id
        LEFT JOIN receipt_email_tracking ret ON t.transaction_id = ret.transaction_id
        WHERE t.shift_id = $1
          AND t.status = 'completed'
          AND c.email IS NOT NULL
          AND c.email != ''
          AND ret.id IS NULL
      `;
      params = [shiftId];
    } else if (date) {
      const startDate = new Date(date + 'T00:00:00');
      const endDate = new Date(date + 'T23:59:59');
      query = `
        SELECT COUNT(*) as count
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.customer_id
        LEFT JOIN receipt_email_tracking ret ON t.transaction_id = ret.transaction_id
        WHERE t.created_at BETWEEN $1 AND $2
          AND t.status = 'completed'
          AND c.email IS NOT NULL
          AND c.email != ''
          AND ret.id IS NULL
      `;
      params = [startDate, endDate];
    } else {
      // Today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      query = `
        SELECT COUNT(*) as count
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.customer_id
        LEFT JOIN receipt_email_tracking ret ON t.transaction_id = ret.transaction_id
        WHERE t.created_at BETWEEN $1 AND $2
          AND t.status = 'completed'
          AND c.email IS NOT NULL
          AND c.email != ''
          AND ret.id IS NULL
      `;
      params = [today, endOfDay];
    }

    const result = await pool.query(query, params);
    const count = parseInt(result.rows[0].count, 10);

    res.json({
      success: true,
      data: {
        unsentCount: count,
        message: count > 0
          ? `${count} receipt${count !== 1 ? 's' : ''} would be emailed`
          : 'No unsent receipts found',
      },
    });
  }));

  // ============================================================================
  // MANUAL TRIGGER
  // ============================================================================

  /**
   * POST /api/batch-email-settings/trigger
   * Manually trigger a scheduled batch run
   */
  router.post('/trigger', asyncHandler(async (req, res) => {
    const { shiftId } = req.body;
    const userId = req.user?.id || req.user?.userId;

    let result;
    if (shiftId) {
      result = await scheduledBatchEmailService.runShiftBatch(shiftId, userId);
    } else {
      result = await scheduledBatchEmailService.runScheduledBatch();
    }

    res.json({
      success: true,
      data: result,
      message: result.total
        ? `Batch completed: ${result.sent} sent, ${result.failed} failed`
        : 'No unsent receipts found',
    });
  }));

  // ============================================================================
  // SCHEDULE LOG
  // ============================================================================

  /**
   * GET /api/batch-email-settings/log
   * Get schedule log entries
   */
  router.get('/log', asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0, shiftId, status } = req.query;

    const logs = await scheduledBatchEmailService.getScheduleLog({
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      shiftId: shiftId ? parseInt(shiftId, 10) : null,
      status,
    });

    res.json({
      success: true,
      data: logs,
    });
  }));

  return router;
};
