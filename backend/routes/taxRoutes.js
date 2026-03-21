/**
 * Tax Engine Routes
 * Province-aware tax calculation, exemption certificates, and rate management.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(req, file, cb) {
    if (/^application\/pdf$|^image\/(jpeg|png)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, and PNG files are allowed'));
    }
  },
});

let taxService = null;

// ============================================================================
// TAX CALCULATION
// ============================================================================

/**
 * POST /api/tax/calculate
 * Body: { subtotalCents, provinceCode?, customerId?, transactionId?, transactionType? }
 * If provinceCode not provided, resolves from customer's address.
 */
router.post('/calculate', authenticate, asyncHandler(async (req, res) => {
  let { subtotalCents, provinceCode, customerId, transactionId, transactionType } = req.body;

  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw ApiError.badRequest('subtotalCents must be a non-negative integer');
  }

  // Resolve province from customer if not provided
  let isEstimated = false;
  if (!provinceCode && customerId) {
    const resolved = await taxService.getProvinceForCustomer(customerId);
    provinceCode = resolved.provinceCode;
    isEstimated = resolved.isEstimated;
  } else if (!provinceCode) {
    provinceCode = 'ON';
    isEstimated = true;
  }

  const result = await taxService.calculateTax({
    subtotalCents,
    provinceCode,
    customerId: customerId || null,
    transactionId: transactionId || null,
    transactionType: transactionType || null,
  });

  // Override isEstimated if province was resolved from fallback
  result.isEstimated = isEstimated || result.isEstimated;

  res.success(result);
}));

// ============================================================================
// TAX RATES
// ============================================================================

/**
 * GET /api/tax/rates
 * Returns all active rates grouped by province.
 */
router.get('/rates', authenticate, requirePermission('tax.rates.view'), asyncHandler(async (req, res) => {
  const rates = await taxService.getActiveRates();
  res.success(rates);
}));

// ============================================================================
// CUSTOMER PROVINCE
// ============================================================================

/**
 * GET /api/tax/customer/:customerId/province
 */
router.get('/customer/:customerId/province', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  if (isNaN(customerId)) throw ApiError.badRequest('customerId must be an integer');

  try {
    const result = await taxService.getProvinceForCustomer(customerId);
    res.success(result);
  } catch (err) {
    if (err.code === 'CUSTOMER_NOT_FOUND') throw ApiError.notFound('Customer');
    throw err;
  }
}));

// ============================================================================
// EXEMPTION CERTIFICATES
// ============================================================================

/**
 * GET /api/tax/customer/:customerId/exemptions
 */
router.get('/customer/:customerId/exemptions', authenticate, requirePermission('tax.exemptions.view'), asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  if (isNaN(customerId)) throw ApiError.badRequest('customerId must be an integer');

  const exemptions = await taxService.getActiveExemptions(customerId);
  res.success(exemptions);
}));

/**
 * POST /api/tax/exemptions
 * Multipart form: file + certData fields.
 */
router.post('/exemptions', authenticate, requirePermission('tax.exemptions.edit'), upload.single('file'), asyncHandler(async (req, res) => {
  const { customerId, provinceCode, certificate_number, exempt_tax_types, issued_date, expiry_date, notes } = req.body;

  if (!customerId || !provinceCode || !certificate_number || !exempt_tax_types || !issued_date) {
    throw ApiError.badRequest('customerId, provinceCode, certificate_number, exempt_tax_types, and issued_date are required');
  }

  // exempt_tax_types comes as JSON string or comma-separated from form
  let parsedTypes;
  try {
    parsedTypes = typeof exempt_tax_types === 'string'
      ? JSON.parse(exempt_tax_types)
      : exempt_tax_types;
  } catch {
    parsedTypes = exempt_tax_types.split(',').map(t => t.trim());
  }

  const cert = await taxService.uploadExemptionCertificate(
    parseInt(customerId),
    provinceCode,
    {
      certificate_number,
      exempt_tax_types: parsedTypes,
      issued_date,
      expiry_date: expiry_date || null,
      notes: notes || null,
    },
    req.file?.buffer || null,
    req.user.id
  );

  res.created(cert);
}));

/**
 * PUT /api/tax/exemptions/:certId/verify
 * Manager + admin only.
 */
router.put('/exemptions/:certId/verify', authenticate, requirePermission('tax.exemptions.edit'), asyncHandler(async (req, res) => {
  const { certId } = req.params;

  try {
    const cert = await taxService.verifyExemptionCertificate(certId, req.user.id);
    res.success(cert);
  } catch (err) {
    if (err.code === 'CERT_NOT_FOUND') throw ApiError.notFound('Exemption certificate');
    throw err;
  }
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  taxService = deps.taxService;
  return router;
};

module.exports = { init };
