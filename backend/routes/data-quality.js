/**
 * Data Quality Routes
 * Endpoints for data quality monitoring and maintenance
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const DataQualityService = require('../services/DataQualityService');

let dataQualityService = null;

/**
 * Initialize the router with dependencies
 */
const init = (deps) => {
  dataQualityService = new DataQualityService(deps.pool, deps.cache);
  return router;
};

/**
 * GET /api/data-quality/report
 * Get comprehensive data quality report
 */
router.get('/report', authenticate, asyncHandler(async (req, res) => {
  const report = await dataQualityService.getDataQualityReport();
  res.success(report);
}));

/**
 * GET /api/data-quality/health
 * Get data health score
 */
router.get('/health', authenticate, asyncHandler(async (req, res) => {
  const health = await dataQualityService.calculateOverallHealth();
  res.success(health);
}));

/**
 * GET /api/data-quality/issues/customers
 * Get customer data issues
 */
router.get('/issues/customers', authenticate, asyncHandler(async (req, res) => {
  const issues = await dataQualityService.getCustomerDataIssues();
  res.success(issues);
}));

/**
 * GET /api/data-quality/issues/leads
 * Get lead data issues
 */
router.get('/issues/leads', authenticate, asyncHandler(async (req, res) => {
  const issues = await dataQualityService.getLeadDataIssues();
  res.success(issues);
}));

/**
 * GET /api/data-quality/issues/products
 * Get product data issues
 */
router.get('/issues/products', authenticate, asyncHandler(async (req, res) => {
  const issues = await dataQualityService.getProductDataIssues();
  res.success(issues);
}));

/**
 * GET /api/data-quality/duplicates
 * Get all duplicates
 */
router.get('/duplicates', authenticate, asyncHandler(async (req, res) => {
  const duplicates = await dataQualityService.getAllDuplicates();
  res.success(duplicates);
}));

/**
 * GET /api/data-quality/duplicates/customers
 * Get customer duplicates
 */
router.get('/duplicates/customers', authenticate, asyncHandler(async (req, res) => {
  const duplicates = await dataQualityService.findCustomerDuplicates();
  res.success(duplicates);
}));

/**
 * GET /api/data-quality/duplicates/leads
 * Get lead duplicates
 */
router.get('/duplicates/leads', authenticate, asyncHandler(async (req, res) => {
  const duplicates = await dataQualityService.findLeadDuplicates();
  res.success(duplicates);
}));

/**
 * POST /api/data-quality/auto-fix/:type
 * Run automatic fix for a specific issue type
 */
router.post('/auto-fix/:type', authenticate, asyncHandler(async (req, res) => {
  const { type } = req.params;

  const allowedFixes = ['trim_emails', 'standardize_phones', 'close_stale_leads'];
  if (!allowedFixes.includes(type)) {
    throw ApiError.badRequest(`Invalid fix type. Allowed: ${allowedFixes.join(', ')}`);
  }

  const result = await dataQualityService.autoFix(type);
  res.success(result);
}));

/**
 * POST /api/data-quality/merge
 * Merge duplicate records
 */
router.post('/merge', authenticate, asyncHandler(async (req, res) => {
  const { entityType, primaryId, duplicateIds } = req.body;

  if (!entityType || !primaryId || !duplicateIds || !Array.isArray(duplicateIds)) {
    throw ApiError.badRequest('entityType, primaryId, and duplicateIds array are required');
  }

  if (!['customer', 'lead'].includes(entityType)) {
    throw ApiError.badRequest('entityType must be "customer" or "lead"');
  }

  const result = await dataQualityService.mergeDuplicates(entityType, primaryId, duplicateIds);
  res.success(result);
}));

module.exports = { router, init };
