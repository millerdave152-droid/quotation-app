/**
 * TeleTime POS - Batch Email Routes
 * Handles batch receipt emails, retry logic, and queue management
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let batchEmailService = null;
let receiptService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createShiftBatchSchema = Joi.object({
  shiftId: Joi.number().integer().required(),
});

const createManualBatchSchema = Joi.object({
  transactionIds: Joi.array().items(Joi.number().integer()).min(1).max(50).required(),
});

const createRetryBatchSchema = Joi.object({
  batchId: Joi.number().integer().optional(), // If not provided, retry all eligible failed
});

const getUnsentSchema = Joi.object({
  shiftId: Joi.number().integer(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
}).or('shiftId', 'startDate');

const listBatchesSchema = Joi.object({
  status: Joi.string().valid('pending', 'processing', 'completed', 'cancelled'),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// ============================================================================
// ROUTES - UNSENT RECEIPTS
// ============================================================================

/**
 * GET /api/batch-email/unsent
 * Get list of transactions that haven't had receipts emailed
 */
router.get('/unsent', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = getUnsentSchema.validate(req.query);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  let unsent;

  if (value.shiftId) {
    unsent = await batchEmailService.getUnsentReceiptsForShift(value.shiftId);
  } else {
    unsent = await batchEmailService.getUnsentReceiptsByDateRange(
      value.startDate,
      value.endDate
    );
  }

  res.json({
    success: true,
    data: unsent,
    count: unsent.length,
  });
}));

// ============================================================================
// ROUTES - BATCH CREATION
// ============================================================================

/**
 * POST /api/batch-email/batches/shift
 * Create a batch for all unsent receipts in a shift
 */
router.post('/batches/shift', authenticate, requireRole('admin', 'manager', 'cashier'), asyncHandler(async (req, res) => {
  const { error, value } = createShiftBatchSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await batchEmailService.createShiftReceiptBatch(
    value.shiftId,
    req.user.id
  );

  if (!result.batch) {
    return res.json({
      success: true,
      message: result.message,
      data: null,
    });
  }

  res.status(201).json({
    success: true,
    message: `Batch created with ${result.queuedCount} emails queued`,
    data: {
      batch: result.batch,
      queuedCount: result.queuedCount,
      skippedCount: result.skippedCount,
    },
  });
}));

/**
 * POST /api/batch-email/batches/manual
 * Create a batch for manually selected transactions
 */
router.post('/batches/manual', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { error, value } = createManualBatchSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await batchEmailService.createManualBatch(
    value.transactionIds,
    req.user.id
  );

  if (!result.batch) {
    return res.json({
      success: true,
      message: result.message,
      data: null,
    });
  }

  res.status(201).json({
    success: true,
    message: `Batch created with ${result.queuedCount} emails queued`,
    data: {
      batch: result.batch,
      queuedCount: result.queuedCount,
    },
  });
}));

/**
 * POST /api/batch-email/batches/retry
 * Create a retry batch for failed emails
 */
router.post('/batches/retry', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { error, value } = createRetryBatchSchema.validate(req.body);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const result = await batchEmailService.createRetryBatch(
    value.batchId,
    req.user.id
  );

  if (!result.batch) {
    return res.json({
      success: true,
      message: result.message,
      data: null,
    });
  }

  res.status(201).json({
    success: true,
    message: `Retry batch created with ${result.queuedCount} emails queued`,
    data: {
      batch: result.batch,
      queuedCount: result.queuedCount,
    },
  });
}));

// ============================================================================
// ROUTES - BATCH PROCESSING
// ============================================================================

/**
 * POST /api/batch-email/batches/:id/process
 * Start processing a batch (send emails)
 */
router.post('/batches/:id/process', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const batchId = parseInt(req.params.id, 10);

  if (isNaN(batchId)) {
    throw ApiError.badRequest('Invalid batch ID');
  }

  // Process asynchronously - return immediately
  const processAsync = req.query.async === 'true';

  if (processAsync) {
    // Start processing in background
    batchEmailService.processBatch(batchId, { receiptService })
      .then(result => {
        console.log(`[BatchEmail] Batch ${batchId} completed:`, result);
      })
      .catch(error => {
        console.error(`[BatchEmail] Batch ${batchId} failed:`, error);
      });

    return res.json({
      success: true,
      message: 'Batch processing started',
      data: { batchId, status: 'processing' },
    });
  }

  // Process synchronously
  const result = await batchEmailService.processBatch(batchId, { receiptService });

  res.json({
    success: true,
    message: `Batch processing complete: ${result.sent} sent, ${result.failed} failed`,
    data: result,
  });
}));

/**
 * POST /api/batch-email/batches/:id/cancel
 * Cancel a pending or processing batch
 */
router.post('/batches/:id/cancel', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const batchId = parseInt(req.params.id, 10);

  if (isNaN(batchId)) {
    throw ApiError.badRequest('Invalid batch ID');
  }

  await batchEmailService.cancelBatch(batchId);

  res.json({
    success: true,
    message: 'Batch cancelled',
  });
}));

// ============================================================================
// ROUTES - BATCH STATUS
// ============================================================================

/**
 * GET /api/batch-email/batches
 * List recent batches
 */
router.get('/batches', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = listBatchesSchema.validate(req.query);

  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const batches = await batchEmailService.getRecentBatches(value);

  res.json({
    success: true,
    data: batches,
  });
}));

/**
 * GET /api/batch-email/batches/:id
 * Get batch status with details
 */
router.get('/batches/:id', authenticate, asyncHandler(async (req, res) => {
  const batchId = parseInt(req.params.id, 10);

  if (isNaN(batchId)) {
    throw ApiError.badRequest('Invalid batch ID');
  }

  const batch = await batchEmailService.getBatchStatus(batchId);

  if (!batch) {
    throw ApiError.notFound('Batch');
  }

  res.json({
    success: true,
    data: batch,
  });
}));

/**
 * GET /api/batch-email/batches/:id/items
 * Get queue items for a batch
 */
router.get('/batches/:id/items', authenticate, asyncHandler(async (req, res) => {
  const batchId = parseInt(req.params.id, 10);
  const status = req.query.status;
  const limit = parseInt(req.query.limit, 10) || 100;

  if (isNaN(batchId)) {
    throw ApiError.badRequest('Invalid batch ID');
  }

  const items = await batchEmailService.getBatchQueueItems(batchId, { status, limit });

  res.json({
    success: true,
    data: items,
    count: items.length,
  });
}));

// ============================================================================
// ROUTES - UTILITIES
// ============================================================================

/**
 * GET /api/batch-email/check/:transactionId
 * Check if a transaction receipt has been emailed
 */
router.get('/check/:transactionId', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.transactionId, 10);

  if (isNaN(transactionId)) {
    throw ApiError.badRequest('Invalid transaction ID');
  }

  const emailed = await batchEmailService.hasReceiptBeenEmailed(transactionId);

  res.json({
    success: true,
    data: { transactionId, emailed },
  });
}));

/**
 * GET /api/batch-email/config
 * Get current batch email configuration
 */
router.get('/config', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      maxBatchSize: batchEmailService.config.maxBatchSize,
      sendDelayMs: batchEmailService.config.sendDelayMs,
      maxRetries: batchEmailService.config.maxRetries,
      retryDelayMinutes: batchEmailService.config.retryDelayMinutes,
    },
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 */
function init(deps) {
  batchEmailService = deps.batchEmailService;
  receiptService = deps.receiptService;
  return router;
}

module.exports = { init };
