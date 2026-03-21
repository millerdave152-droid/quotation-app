const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLogMiddleware } = require('../middleware/auditLog');

let catalogService = null;

// List exports
router.get('/', authenticate, requirePermission('catalog_exports.view'), asyncHandler(async (req, res) => {
  const exports = await catalogService.listExports();
  res.success(exports);
}));

// Create export config
router.post('/', authenticate, requirePermission('catalog_exports.create'), asyncHandler(async (req, res) => {
  const exp = await catalogService.createExport(req.body, req.user.userId);
  res.created(exp);
}));

// Update export config
router.put('/:id', authenticate, requirePermission('catalog_exports.edit'), asyncHandler(async (req, res) => {
  const exp = await catalogService.updateExport(parseInt(req.params.id), req.body);
  res.success(exp);
}));

// Run export
router.post('/:id/run', authenticate, requirePermission('catalog_exports.run'), auditLogMiddleware('data_export', 'export'), asyncHandler(async (req, res) => {
  const result = await catalogService.runExport(parseInt(req.params.id));
  res.success({ logId: result.logId, productsExported: result.productsExported, format: result.format });
}));

// Download export file
router.post('/:id/download', authenticate, requirePermission('catalog_exports.view'), auditLogMiddleware('data_export', 'export'), asyncHandler(async (req, res) => {
  const result = await catalogService.runExport(parseInt(req.params.id));
  const contentType = result.format === 'xml' ? 'application/xml' : 'text/csv';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="catalog-export.${result.format}"`);
  res.send(result.content);
}));

// Get export logs
router.get('/:id/logs', authenticate, requirePermission('catalog_exports.view'), asyncHandler(async (req, res) => {
  const logs = await catalogService.getExportLogs(parseInt(req.params.id));
  res.success(logs);
}));

const init = (deps) => {
  catalogService = deps.catalogService;
  return router;
};

module.exports = { init };
