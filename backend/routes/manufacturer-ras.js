/**
 * Manufacturer Return Authorization (RA) Routes
 * CRUD, status transitions, communication log, aging reports.
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

let raService = null;
let pool = null;

// Audit helper
function auditLog(req, eventType, severity, entityId, details) {
  const svc = req.app.get('auditLogService');
  if (!svc) return;
  svc.logEvent({
    eventType,
    eventCategory: 'manufacturer_ra',
    severity,
    employeeId: req.user?.id,
    entityType: 'manufacturer_ra',
    entityId,
    details,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
}

// ============================================================================
// POST — create RA (admin/manager)
// ============================================================================
router.post('/', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const data = { ...req.body, created_by: req.user?.id };

  if (!data.manufacturer) throw ApiError.badRequest('manufacturer is required');
  if (!data.reason) throw ApiError.badRequest('reason is required');

  const ra = await raService.createRA(data);

  auditLog(req, 'MANUFACTURER_RA_CREATED', 'info', ra.id, {
    ra_number: ra.ra_number,
    manufacturer: ra.manufacturer,
    product_id: ra.product_id,
    serial_number: ra.serial_number,
    reason: ra.reason
  });

  res.created(ra);
}));

// ============================================================================
// GET — list all RAs with filters
// ============================================================================
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer, status, overdue_only, limit, offset } = req.query;
  const result = await raService.getOpenRAs({
    manufacturer,
    status,
    overdue_only: overdue_only === 'true',
    limit: parseInt(limit) || 100,
    offset: parseInt(offset) || 0
  });
  res.success(result);
}));

// ============================================================================
// GET — aging report grouped by manufacturer
// ============================================================================
router.get('/report/aging', authenticate, asyncHandler(async (req, res) => {
  const report = await raService.getAgingReport();
  res.success(report);
}));

// ============================================================================
// GET — grouped by manufacturer summary
// ============================================================================
router.get('/report/by-manufacturer', authenticate, asyncHandler(async (req, res) => {
  const data = await raService.getRAsByManufacturer();
  res.success(data);
}));

// ============================================================================
// GET — single RA detail
// ============================================================================
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid RA ID');

  const ra = await raService.getRA(id);
  if (!ra) throw ApiError.notFound('Return Authorization');

  res.success(ra);
}));

// ============================================================================
// PATCH — update status (admin/manager)
// ============================================================================
router.patch('/:id/status', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid RA ID');

  const { status: newStatus, ...data } = req.body;
  if (!newStatus) throw ApiError.badRequest('status is required');

  try {
    const { before, after } = await raService.updateStatus(id, newStatus, data);

    auditLog(req, 'MANUFACTURER_RA_STATUS_CHANGED', 'warning', id, {
      ra_number: before.ra_number,
      manufacturer: before.manufacturer,
      from_status: before.status,
      to_status: newStatus,
      updated_by: req.user?.id,
      additional_data: data
    });

    res.success({ ra: after, previousStatus: before.status });
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
}));

// ============================================================================
// PATCH — add communication note
// ============================================================================
router.patch('/:id/note', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid RA ID');

  const { note } = req.body;
  if (!note || !note.trim()) throw ApiError.badRequest('note is required');

  const userName = req.user?.name || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Unknown';
  const ra = await raService.addCommunicationNote(id, req.user?.id, userName, note.trim());

  res.success(ra);
}));

// ============================================================================
// PATCH — mark credited (admin only)
// ============================================================================
router.patch('/:id/credit', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid RA ID');

  const { credit_amount, credit_reference } = req.body;
  if (credit_amount === undefined || credit_amount === null) {
    throw ApiError.badRequest('credit_amount is required (in cents)');
  }

  try {
    const { before, after } = await raService.markCredited(id, credit_amount, credit_reference);

    auditLog(req, 'MANUFACTURER_RA_CREDITED', 'info', id, {
      ra_number: before.ra_number,
      manufacturer: before.manufacturer,
      credit_amount,
      credit_reference,
      credited_by: req.user?.id
    });

    res.success({ ra: after, previousStatus: before.status });
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
}));

// ============================================================================
// GET — export CSV
// ============================================================================
router.get('/report/export', authenticate, asyncHandler(async (req, res) => {
  const { rows } = await raService.getOpenRAs({ limit: 5000 });

  const header = 'RA Number,Manufacturer,Mfr RA#,Product,SKU,Serial,Reason,Status,Shipped,Days Outstanding,Expected Credit,Credit Amount,Tracking\n';
  const csv = rows.map(r =>
    [
      r.ra_number, r.manufacturer, r.manufacturer_ra_number || '',
      `"${(r.product_name || '').replace(/"/g, '""')}"`, r.product_sku || '', r.serial_number || '',
      r.reason, r.status, r.shipped_date || '', r.days_outstanding || 0,
      (r.credit_amount / 100).toFixed(2), (r.credit_amount / 100).toFixed(2),
      r.shipping_tracking_number || ''
    ].join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="manufacturer-ras.csv"');
  res.send(header + csv);
}));

// ============================================================================
// INIT
// ============================================================================
const init = (deps) => {
  raService = deps.manufacturerRAService;
  pool = deps.pool;
  return router;
};

module.exports = { init };
