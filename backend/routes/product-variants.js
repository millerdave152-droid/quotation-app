/**
 * Product Variant Routes
 * API endpoints for attributes, attribute values, category mappings, and variant management
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let variantService = null;

// ============================================================================
// ATTRIBUTES
// ============================================================================

router.get('/attributes', authenticate, requirePermission('products.view'), asyncHandler(async (req, res) => {
  const attributes = await variantService.listAttributes();
  res.success(attributes);
}));

router.get('/attributes/:id', authenticate, requirePermission('products.view'), asyncHandler(async (req, res) => {
  const attribute = await variantService.getAttribute(parseInt(req.params.id));
  res.success(attribute);
}));

router.post('/attributes', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) throw ApiError.badRequest('name and slug are required');
  const attribute = await variantService.createAttribute(name, slug);
  res.created(attribute);
}));

router.put('/attributes/:id', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const attribute = await variantService.updateAttribute(parseInt(req.params.id), req.body);
  res.success(attribute);
}));

// ============================================================================
// ATTRIBUTE VALUES
// ============================================================================

router.post('/attributes/:id/values', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const { value, slug, metadata } = req.body;
  if (!value || !slug) throw ApiError.badRequest('value and slug are required');
  const result = await variantService.addAttributeValue(parseInt(req.params.id), value, slug, metadata);
  res.created(result);
}));

router.put('/attribute-values/:id', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const result = await variantService.updateAttributeValue(parseInt(req.params.id), req.body);
  res.success(result);
}));

router.delete('/attribute-values/:id', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  await variantService.deleteAttributeValue(parseInt(req.params.id));
  res.success({ deleted: true });
}));

// ============================================================================
// CATEGORY ATTRIBUTES
// ============================================================================

router.get('/categories/:id/attributes', authenticate, requirePermission('products.view'), asyncHandler(async (req, res) => {
  const attrs = await variantService.getCategoryAttributes(parseInt(req.params.id));
  res.success(attrs);
}));

router.put('/categories/:id/attributes', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const { attributeIds } = req.body;
  if (!Array.isArray(attributeIds)) throw ApiError.badRequest('attributeIds array is required');
  const attrs = await variantService.setCategoryAttributes(parseInt(req.params.id), attributeIds);
  res.success(attrs);
}));

// ============================================================================
// VARIANT MATRIX
// ============================================================================

router.get('/products/:id/variants', authenticate, requirePermission('products.view'), asyncHandler(async (req, res) => {
  const matrix = await variantService.getVariantMatrix(parseInt(req.params.id));
  res.success(matrix);
}));

router.get('/products/:id/with-variants', authenticate, requirePermission('products.view'), asyncHandler(async (req, res) => {
  const result = await variantService.getProductWithVariants(parseInt(req.params.id));
  res.success(result);
}));

// ============================================================================
// GENERATE / ADD / UPDATE VARIANTS
// ============================================================================

router.post('/products/:id/variants', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const { combinations } = req.body;
  if (!Array.isArray(combinations) || !combinations.length) throw ApiError.badRequest('combinations array is required');
  const variants = await variantService.generateVariants(parseInt(req.params.id), combinations);
  res.created(variants);
}));

router.post('/products/:id/variants/single', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const { variantData, attributes } = req.body;
  if (!variantData || !attributes) throw ApiError.badRequest('variantData and attributes are required');
  const variant = await variantService.addVariant(parseInt(req.params.id), variantData, attributes);
  res.created(variant);
}));

router.put('/variants/:variantId', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const variant = await variantService.updateVariant(parseInt(req.params.variantId), req.body);
  res.success(variant);
}));

router.delete('/variants/:variantId', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  await variantService.deleteVariant(parseInt(req.params.variantId));
  res.success({ deleted: true });
}));

// ============================================================================
// CONVERT / MERGE
// ============================================================================

router.post('/products/:id/convert-to-parent', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const result = await variantService.convertToParent(parseInt(req.params.id));
  res.success(result);
}));

router.post('/products/:id/merge-variants', authenticate, requirePermission('products.edit'), asyncHandler(async (req, res) => {
  const { childProductIds, attributeValues } = req.body;
  if (!Array.isArray(childProductIds) || !childProductIds.length) throw ApiError.badRequest('childProductIds array is required');
  const result = await variantService.mergeAsVariants(parseInt(req.params.id), childProductIds, attributeValues || []);
  res.success(result);
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  variantService = deps.variantService;
  return router;
};

module.exports = { init };
