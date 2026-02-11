/**
 * TeleTime POS - Chargeback Management Routes
 * Handles chargeback cases, evidence, and dispute tracking
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let fraudService = null;

// ============================================================================
// CHARGEBACK CASES
// ============================================================================

router.get('/', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 25 } = req.query;
  const filters = {};
  if (status) filters.status = status;

  const cases = await fraudService.getChargebacks(filters, { page: parseInt(page), limit: parseInt(limit) });
  res.json({ success: true, data: cases });
}));

router.post('/', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { transaction_id, payment_id, case_number, amount, reason_code, deadline, customer_id, notes } = req.body;

  if (!transaction_id || !payment_id || !amount) {
    throw ApiError.badRequest('transaction_id, payment_id, and amount are required');
  }

  const chargeback = await fraudService.createChargeback({
    transaction_id,
    payment_id,
    case_number,
    amount,
    reason_code,
    deadline,
    customer_id,
    notes,
    created_by: req.user.id
  });

  await fraudService.logAuditEntry(req.user.id, 'chargeback.create', 'chargeback', chargeback.id, {
    transaction_id,
    amount,
    reason_code
  }, req);

  res.status(201).json({ success: true, data: chargeback });
}));

router.get('/:id', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const chargeback = await fraudService.getChargebackById(parseInt(req.params.id));
  if (!chargeback) {
    throw ApiError.notFound('Chargeback case');
  }
  res.json({ success: true, data: chargeback });
}));

router.put('/:id', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const chargeback = await fraudService.updateChargeback(parseInt(req.params.id), req.body);
  if (!chargeback) {
    throw ApiError.notFound('Chargeback case');
  }

  await fraudService.logAuditEntry(req.user.id, 'chargeback.update', 'chargeback', parseInt(req.params.id), {
    updates: req.body
  }, req);

  res.json({ success: true, data: chargeback });
}));

router.post('/:id/evidence', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { evidence_type, file_path, description } = req.body;

  if (!evidence_type) {
    throw ApiError.badRequest('evidence_type is required');
  }

  const evidence = await fraudService.addChargebackEvidence(parseInt(req.params.id), {
    evidence_type,
    file_path,
    description,
    uploaded_by: req.user.id
  });

  res.status(201).json({ success: true, data: evidence });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  fraudService = deps.fraudService;
  return router;
};

module.exports = { init };
