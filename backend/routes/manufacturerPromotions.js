/**
 * Manufacturer Promotions Routes
 *
 * Handles API endpoints for:
 * - Promotion CRUD
 * - Excel file import
 * - Watch folder configuration
 * - Quote promotion detection and application
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/promotions');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Module-level service instances
let pool = null;
let importService = null;
let detectionService = null;
let quotePromotionService = null;

/**
 * Initialize the router with dependencies
 */
const init = (deps) => {
  pool = deps.pool;

  const PromotionImportService = require('../services/PromotionImportService');
  const PromotionDetectionService = require('../services/PromotionDetectionService');
  const QuotePromotionService = require('../services/QuotePromotionService');

  importService = new PromotionImportService(pool);
  detectionService = new PromotionDetectionService(pool);
  quotePromotionService = new QuotePromotionService(pool, detectionService);

  return router;
};

// ============================================
// PROMOTION CRUD ROUTES
// ============================================

/**
 * GET /api/promotions/manufacturer
 * List all manufacturer promotions
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer, promo_type, active_only, include_expired, limit, offset } = req.query;

  const promotions = await detectionService.getPromotions({
    manufacturer,
    promo_type,
    active_only: active_only !== 'false',
    include_expired: include_expired === 'true',
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });

  res.json({
    success: true,
    data: promotions,
    count: promotions.length
  });
}));

/**
 * GET /api/promotions/manufacturer/active
 * Get only currently active promotions
 */
router.get('/active', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer } = req.query;
  const promotions = await detectionService.getActivePromotions(manufacturer);

  res.json({
    success: true,
    data: promotions
  });
}));

/**
 * GET /api/promotions/manufacturer/:id
 * Get single promotion with eligible models
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const promotion = await detectionService.getPromotionById(parseInt(id));

  if (!promotion) {
    throw ApiError.notFound('Promotion');
  }

  res.json({
    success: true,
    data: promotion
  });
}));

/**
 * POST /api/promotions/manufacturer
 * Create a new promotion manually
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const {
    promo_code, promo_name, manufacturer, promo_type,
    min_qualifying_items, tier_discounts,
    gift_description, gift_value_cents, redemption_type,
    badge_text, badge_color,
    start_date, end_date,
    exclusion_rules, claimback_info, notes
  } = req.body;

  if (!promo_code || !promo_name || !manufacturer || !promo_type) {
    throw ApiError.validation('promo_code, promo_name, manufacturer, and promo_type are required');
  }

  if (!['bundle_savings', 'bonus_gift', 'guarantee'].includes(promo_type)) {
    throw ApiError.validation('promo_type must be bundle_savings, bonus_gift, or guarantee');
  }

  const result = await pool.query(`
    INSERT INTO manufacturer_promotions (
      promo_code, promo_name, manufacturer, promo_type,
      min_qualifying_items, tier_discounts,
      gift_description, gift_value_cents, redemption_type,
      badge_text, badge_color,
      start_date, end_date,
      exclusion_rules, claimback_info, notes,
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true)
    RETURNING *
  `, [
    promo_code, promo_name, manufacturer, promo_type,
    min_qualifying_items,
    tier_discounts ? JSON.stringify(tier_discounts) : null,
    gift_description, gift_value_cents, redemption_type,
    badge_text, badge_color || '#059669',
    start_date, end_date,
    exclusion_rules ? JSON.stringify(exclusion_rules) : null,
    claimback_info, notes
  ]);

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
}));

/**
 * PUT /api/promotions/manufacturer/:id
 * Update a promotion
 */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Build dynamic update query
  const allowedFields = [
    'promo_name', 'min_qualifying_items', 'tier_discounts',
    'gift_description', 'gift_value_cents', 'redemption_type',
    'badge_text', 'badge_color', 'start_date', 'end_date',
    'exclusion_rules', 'claimback_info', 'notes', 'is_active'
  ];

  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      let value = updates[field];
      if (['tier_discounts', 'exclusion_rules'].includes(field) && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      setClauses.push(`${field} = $${paramIdx++}`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) {
    throw ApiError.validation('No valid fields to update');
  }

  values.push(parseInt(id));
  const result = await pool.query(`
    UPDATE manufacturer_promotions
    SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${paramIdx}
    RETURNING *
  `, values);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Promotion');
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
}));

/**
 * DELETE /api/promotions/manufacturer/:id
 * Soft delete (deactivate) a promotion
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    UPDATE manufacturer_promotions
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, promo_code
  `, [parseInt(id)]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Promotion');
  }

  res.json({
    success: true,
    message: 'Promotion deactivated',
    data: result.rows[0]
  });
}));

// ============================================
// IMPORT ROUTES
// ============================================

/**
 * POST /api/promotions/manufacturer/import
 * Upload and import an Excel file
 */
router.post('/import', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.validation('No file uploaded');
  }

  const result = await importService.importPromotionFile(req.file.path, {
    source: 'manual_upload',
    userId: req.user?.id,
    promotionOverrides: req.body.overrides ? JSON.parse(req.body.overrides) : {}
  });

  res.json({
    success: true,
    message: 'Import completed successfully',
    data: result
  });
}));

/**
 * GET /api/promotions/manufacturer/import/logs
 * Get import history
 */
router.get('/import/logs', authenticate, asyncHandler(async (req, res) => {
  const { status, manufacturer, limit, offset } = req.query;

  const logs = await importService.getImportLogs({
    status,
    manufacturer,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });

  res.json({
    success: true,
    data: logs
  });
}));

/**
 * GET /api/promotions/manufacturer/import/logs/:id
 * Get single import log details
 */
router.get('/import/logs/:id', authenticate, asyncHandler(async (req, res) => {
  const log = await importService.getImportLogById(parseInt(req.params.id));

  if (!log) {
    throw ApiError.notFound('Import log');
  }

  res.json({
    success: true,
    data: log
  });
}));

// ============================================
// WATCH FOLDER ROUTES
// ============================================

/**
 * GET /api/promotions/manufacturer/watch-folders
 * List configured watch folders
 */
router.get('/watch-folders', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT * FROM promotion_watch_folders
    ORDER BY created_at DESC
  `);

  res.json({
    success: true,
    data: result.rows
  });
}));

/**
 * POST /api/promotions/manufacturer/watch-folders
 * Add a new watch folder
 */
router.post('/watch-folders', authenticate, asyncHandler(async (req, res) => {
  const { folder_path, manufacturer, check_interval_minutes } = req.body;

  if (!folder_path) {
    throw ApiError.validation('folder_path is required');
  }

  // Verify folder exists
  try {
    await fs.access(folder_path);
  } catch {
    throw ApiError.validation('Folder path does not exist or is not accessible');
  }

  const result = await pool.query(`
    INSERT INTO promotion_watch_folders (folder_path, manufacturer, check_interval_minutes, is_active)
    VALUES ($1, $2, $3, true)
    ON CONFLICT (folder_path) DO UPDATE SET
      manufacturer = EXCLUDED.manufacturer,
      check_interval_minutes = EXCLUDED.check_interval_minutes,
      is_active = true,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [folder_path, manufacturer, check_interval_minutes || 60]);

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
}));

/**
 * PUT /api/promotions/manufacturer/watch-folders/:id
 * Update a watch folder
 */
router.put('/watch-folders/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { folder_path, manufacturer, check_interval_minutes, is_active } = req.body;

  const result = await pool.query(`
    UPDATE promotion_watch_folders
    SET folder_path = COALESCE($1, folder_path),
        manufacturer = COALESCE($2, manufacturer),
        check_interval_minutes = COALESCE($3, check_interval_minutes),
        is_active = COALESCE($4, is_active),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `, [folder_path, manufacturer, check_interval_minutes, is_active, parseInt(id)]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Watch folder');
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
}));

/**
 * DELETE /api/promotions/manufacturer/watch-folders/:id
 * Remove a watch folder
 */
router.delete('/watch-folders/:id', authenticate, asyncHandler(async (req, res) => {
  // Validate ID is a valid integer
  const folderId = parseInt(req.params.id, 10);
  if (isNaN(folderId) || folderId <= 0) {
    throw ApiError.badRequest('Invalid watch folder ID');
  }

  const result = await pool.query(
    'DELETE FROM promotion_watch_folders WHERE id = $1 RETURNING id',
    [folderId]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Watch folder');
  }

  res.json({
    success: true,
    message: 'Watch folder removed'
  });
}));

/**
 * POST /api/promotions/manufacturer/watch-folders/scan
 * Trigger manual scan of all watch folders
 */
router.post('/watch-folders/scan', authenticate, asyncHandler(async (req, res) => {
  // Get all active watch folders
  const folders = await pool.query(
    'SELECT * FROM promotion_watch_folders WHERE is_active = true'
  );

  const results = [];

  for (const folder of folders.rows) {
    try {
      const files = await fs.readdir(folder.folder_path);
      const excelFiles = files.filter(f =>
        ['.xlsx', '.xls'].includes(path.extname(f).toLowerCase())
      );

      for (const file of excelFiles) {
        const filePath = path.join(folder.folder_path, file);
        try {
          const importResult = await importService.importPromotionFile(filePath, {
            source: 'folder_watch',
            userId: req.user?.id
          });
          results.push({ file, status: 'success', ...importResult.stats });
        } catch (err) {
          results.push({ file, status: 'failed', error: err.message });
        }
      }

      // Update last checked timestamp
      await pool.query(
        'UPDATE promotion_watch_folders SET last_checked_at = CURRENT_TIMESTAMP WHERE id = $1',
        [folder.id]
      );
    } catch (err) {
      results.push({ folder: folder.folder_path, status: 'error', error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Scanned ${folders.rows.length} folder(s)`,
    data: results
  });
}));

// ============================================
// QUOTE PROMOTION ROUTES
// ============================================

/**
 * GET /api/promotions/manufacturer/quote/:quoteId/eligible
 * Detect eligible promotions for a quote
 */
router.get('/quote/:quoteId/eligible', authenticate, asyncHandler(async (req, res) => {
  const { quoteId } = req.params;

  // Get quote items
  const itemsResult = await pool.query(`
    SELECT qi.*, p.model, p.manufacturer, p.category
    FROM quotation_items qi
    LEFT JOIN products p ON qi.product_id = p.id
    WHERE qi.quotation_id = $1
  `, [parseInt(quoteId)]);

  const products = itemsResult.rows.map(item => ({
    id: item.product_id,
    model: item.model,
    manufacturer: item.manufacturer,
    category: item.category,
    name: item.description
  }));

  const eligible = await detectionService.detectEligiblePromotions(products);

  res.json({
    success: true,
    data: eligible
  });
}));

/**
 * GET /api/promotions/manufacturer/quote/:quoteId/applied
 * Get promotions applied to a quote
 */
router.get('/quote/:quoteId/applied', authenticate, asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const promotions = await quotePromotionService.getQuotePromotions(parseInt(quoteId));

  res.json({
    success: true,
    data: promotions
  });
}));

/**
 * POST /api/promotions/manufacturer/quote/:quoteId/apply/:promotionId
 * Apply a promotion to a quote
 */
router.post('/quote/:quoteId/apply/:promotionId', authenticate, asyncHandler(async (req, res) => {
  const { quoteId, promotionId } = req.params;

  const result = await quotePromotionService.applyPromotion(
    parseInt(quoteId),
    parseInt(promotionId),
    req.user?.id
  );

  res.json({
    success: true,
    message: 'Promotion applied successfully',
    data: result
  });
}));

/**
 * DELETE /api/promotions/manufacturer/quote/:quoteId/remove/:promotionId
 * Remove a promotion from a quote
 */
router.delete('/quote/:quoteId/remove/:promotionId', authenticate, asyncHandler(async (req, res) => {
  const { quoteId, promotionId } = req.params;
  const { reason } = req.body;

  const result = await quotePromotionService.removePromotion(
    parseInt(quoteId),
    parseInt(promotionId),
    req.user?.id,
    reason
  );

  res.json({
    success: true,
    message: 'Promotion removed',
    data: result
  });
}));

/**
 * GET /api/promotions/manufacturer/quote/:quoteId/summary
 * Get promotion summary for a quote
 */
router.get('/quote/:quoteId/summary', authenticate, asyncHandler(async (req, res) => {
  const summary = await quotePromotionService.getQuotePromotionSummary(parseInt(req.params.quoteId));

  res.json({
    success: true,
    data: summary
  });
}));

// ============================================
// PRODUCT BADGE ROUTES
// ============================================

/**
 * GET /api/promotions/manufacturer/product/:productId/badges
 * Get promotion badges for a product
 */
router.get('/product/:productId/badges', authenticate, asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { model, manufacturer } = req.query;

  const badges = await detectionService.getProductPromotionBadges(
    parseInt(productId) || null,
    model,
    manufacturer
  );

  res.json({
    success: true,
    data: badges
  });
}));

/**
 * GET /api/promotions/manufacturer/products/badges
 * Get all products with active badges
 */
router.get('/products/badges', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer } = req.query;
  const products = await detectionService.getProductsWithBadges(manufacturer);

  res.json({
    success: true,
    data: products
  });
}));

module.exports = { router, init };
