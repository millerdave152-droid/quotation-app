/**
 * TeleTime - Credit Memo Routes
 * CRA-compliant credit memo endpoints
 */
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const CreditMemoService = require('../services/CreditMemoService');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

// ============================================================================
// MODULE STATE
// ============================================================================

let pool = null;
let cache = null;
let creditMemoService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createCreditMemoSchema = Joi.object({
  orderId: Joi.number().integer().required(),
  reason: Joi.string().required(),
  reasonCode: Joi.string().required(),
  internalNotes: Joi.string().allow('', null),
  lines: Joi.array().items(Joi.object({
    productId: Joi.number().integer().required(),
    productSku: Joi.string().allow('', null),
    productName: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required(),
    originalUnitPriceCents: Joi.number().integer().required(),
    creditedUnitPriceCents: Joi.number().integer().required(),
    description: Joi.string().allow('', null),
  })).min(1).required(),
});

const applyCreditMemoSchema = Joi.object({
  applicationMethod: Joi.string()
    .valid('refund_to_original', 'store_credit', 'manual_adjustment')
    .required(),
});

const voidCreditMemoSchema = Joi.object({
  reason: Joi.string().required(),
});

// ============================================================================
// STATIC ROUTES (must be defined before parameterized routes)
// ============================================================================

/**
 * GET /api/credit-memos/reason-codes
 * List active credit memo reason codes
 */
router.get(
  '/reason-codes',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT code, label, description
       FROM credit_memo_reason_codes
       WHERE active = true
       ORDER BY sort_order`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * GET /api/credit-memos/order/:orderId
 * List credit memos for an order
 */
router.get(
  '/order/:orderId',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const memos = await creditMemoService.listByOrder(parseInt(req.params.orderId));

    res.json({
      success: true,
      data: memos,
    });
  })
);

// ============================================================================
// LIST / CRUD ROUTES
// ============================================================================

/**
 * GET /api/credit-memos
 * List all credit memos with filters
 */
router.get(
  '/',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const { status, customerId, orderId, dateFrom, dateTo, page, limit } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (customerId) filters.customerId = parseInt(customerId);
    if (orderId) filters.orderId = parseInt(orderId);
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (page) filters.page = parseInt(page);
    if (limit) filters.limit = parseInt(limit);

    const result = await creditMemoService.listAll(filters);

    res.json({
      success: true,
      ...result,
    });
  })
);

/**
 * GET /api/credit-memos/:id
 * Get single credit memo by ID
 */
router.get(
  '/:id',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const memo = await creditMemoService.getById(parseInt(req.params.id));

    if (!memo) {
      throw ApiError.notFound('Credit memo');
    }

    res.json({
      success: true,
      data: memo,
    });
  })
);

/**
 * POST /api/credit-memos
 * Create a manual credit memo
 */
router.post(
  '/',
  authenticate,
  checkPermission('credit_memos.create'),
  asyncHandler(async (req, res) => {
    const { error, value } = createCreditMemoSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const memo = await creditMemoService.createManual(
      value.orderId,
      value,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: memo,
    });
  })
);

// ============================================================================
// LIFECYCLE ROUTES
// ============================================================================

/**
 * POST /api/credit-memos/:id/issue
 * Issue a draft credit memo
 */
router.post(
  '/:id/issue',
  authenticate,
  checkPermission('credit_memos.create'),
  asyncHandler(async (req, res) => {
    const memo = await creditMemoService.issue(
      parseInt(req.params.id),
      req.user.id
    );

    res.json({
      success: true,
      data: memo,
    });
  })
);

/**
 * POST /api/credit-memos/:id/apply
 * Apply an issued credit memo
 */
router.post(
  '/:id/apply',
  authenticate,
  checkPermission('credit_memos.apply'),
  asyncHandler(async (req, res) => {
    const { error, value } = applyCreditMemoSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const memo = await creditMemoService.apply(
      parseInt(req.params.id),
      value.applicationMethod,
      req.user.id
    );

    res.json({
      success: true,
      data: memo,
    });
  })
);

/**
 * POST /api/credit-memos/:id/void
 * Void a credit memo
 */
router.post(
  '/:id/void',
  authenticate,
  checkPermission('credit_memos.void'),
  asyncHandler(async (req, res) => {
    const { error, value } = voidCreditMemoSchema.validate(req.body);
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const memo = await creditMemoService.void(
      parseInt(req.params.id),
      value.reason,
      req.user.id
    );

    res.json({
      success: true,
      data: memo,
    });
  })
);

// ============================================================================
// PDF & EMAIL ROUTES
// ============================================================================

/**
 * GET /api/credit-memos/:id/pdf
 * Download credit memo PDF
 */
router.get(
  '/:id/pdf',
  authenticate,
  checkPermission('credit_memos.view'),
  asyncHandler(async (req, res) => {
    const creditMemoId = parseInt(req.params.id);
    const pdfBuffer = await creditMemoService.generatePdf(creditMemoId);
    const memo = await creditMemoService.getById(creditMemoId);

    const filename = memo
      ? `Credit_Memo_${memo.creditMemoNumber}.pdf`
      : `Credit_Memo_${creditMemoId}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });

    res.send(pdfBuffer);
  })
);

/**
 * POST /api/credit-memos/:id/email
 * Email credit memo to customer
 */
router.post(
  '/:id/email',
  authenticate,
  checkPermission('credit_memos.create'),
  asyncHandler(async (req, res) => {
    await creditMemoService.emailCreditMemo(parseInt(req.params.id));

    res.json({
      success: true,
      message: 'Credit memo emailed successfully',
    });
  })
);

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  creditMemoService = new CreditMemoService(pool, cache);
  return router;
};

module.exports = { init };
