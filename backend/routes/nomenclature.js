/**
 * Nomenclature Routes
 * API endpoints for model number decoding, quiz, and training features
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const NomenclatureService = require('../services/NomenclatureService');
const { authenticate } = require('../middleware/auth');

// Module-level dependencies
let nomenclatureService = null;
let pool = null;
let cache = null;

/**
 * Initialize the router with dependencies
 */
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  nomenclatureService = new NomenclatureService(deps.pool, deps.cache);
  return router;
};

// ============================================
// TEMPLATE ENDPOINTS
// ============================================

/**
 * GET /api/nomenclature/templates
 * Get all nomenclature templates
 */
router.get('/templates', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer, productType } = req.query;

  const templates = await nomenclatureService.getAllTemplates({
    manufacturer,
    productType,
    isActive: true
  });

  res.json({
    success: true,
    data: templates
  });
}));

/**
 * GET /api/nomenclature/templates/grouped
 * Get templates grouped by manufacturer
 */
router.get('/templates/grouped', authenticate, asyncHandler(async (req, res) => {
  const grouped = await nomenclatureService.getTemplatesGroupedByManufacturer();

  res.json({
    success: true,
    data: grouped
  });
}));

/**
 * GET /api/nomenclature/templates/:manufacturer
 * Get templates for a specific manufacturer
 */
router.get('/templates/:manufacturer', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer } = req.params;

  const templates = await nomenclatureService.getTemplatesByManufacturer(manufacturer);

  res.json({
    success: true,
    data: templates
  });
}));

/**
 * GET /api/nomenclature/templates/:manufacturer/:productType
 * Get specific template with rules and codes
 */
router.get('/templates/:manufacturer/:productType', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer, productType } = req.params;

  const template = await nomenclatureService.getTemplateByManufacturerAndType(manufacturer, productType);

  if (!template) {
    throw new ApiError(`No template found for ${manufacturer} ${productType}`, 404);
  }

  res.json({
    success: true,
    data: template
  });
}));

// ============================================
// DECODE ENDPOINTS
// ============================================

/**
 * POST /api/nomenclature/decode
 * Decode a model number
 */
router.post('/decode', authenticate, asyncHandler(async (req, res) => {
  const { modelNumber, manufacturer } = req.body;

  if (!modelNumber) {
    throw new ApiError('Model number is required', 400);
  }

  const result = await nomenclatureService.decodeModel(modelNumber, manufacturer);

  res.json(result);
}));

/**
 * GET /api/nomenclature/decode/:modelNumber
 * Decode a model number (GET version for tooltips)
 */
router.get('/decode/:modelNumber', authenticate, asyncHandler(async (req, res) => {
  const { modelNumber } = req.params;
  const { manufacturer } = req.query;

  const result = await nomenclatureService.decodeModel(modelNumber, manufacturer);

  res.json(result);
}));

/**
 * POST /api/nomenclature/decode/batch
 * Decode multiple model numbers
 */
router.post('/decode/batch', authenticate, asyncHandler(async (req, res) => {
  const { models } = req.body;

  if (!models || !Array.isArray(models)) {
    throw new ApiError('Models array is required', 400);
  }

  if (models.length > 50) {
    throw new ApiError('Maximum 50 models per batch', 400);
  }

  const results = await nomenclatureService.batchDecode(models);

  res.json({
    success: true,
    data: results
  });
}));

/**
 * POST /api/nomenclature/decode/fuzzy
 * Decode a model number with fuzzy matching for typos/OCR errors
 */
router.post('/decode/fuzzy', authenticate, asyncHandler(async (req, res) => {
  const { modelNumber, manufacturer, threshold = 0.8 } = req.body;

  if (!modelNumber) {
    throw new ApiError('Model number is required', 400);
  }

  const result = await nomenclatureService.decodeModelFuzzy(modelNumber, threshold, manufacturer);

  res.json({
    success: result.success,
    data: result
  });
}));

/**
 * POST /api/nomenclature/extract-attributes
 * Extract structured product attributes from a model number
 */
router.post('/extract-attributes', authenticate, asyncHandler(async (req, res) => {
  const { modelNumber, manufacturer } = req.body;

  if (!modelNumber) {
    throw new ApiError('Model number is required', 400);
  }

  const result = await nomenclatureService.extractProductAttributes(modelNumber, manufacturer);

  res.json({
    success: result.success,
    data: result
  });
}));

/**
 * POST /api/nomenclature/extract-attributes/batch
 * Batch extract attributes for multiple models
 */
router.post('/extract-attributes/batch', authenticate, asyncHandler(async (req, res) => {
  const { models } = req.body;

  if (!models || !Array.isArray(models)) {
    throw new ApiError('Models array is required', 400);
  }

  if (models.length > 50) {
    throw new ApiError('Maximum 50 models per batch', 400);
  }

  const results = await nomenclatureService.batchExtractAttributes(models);

  res.json({
    success: true,
    data: results
  });
}));

/**
 * POST /api/nomenclature/predict-code
 * Predict what an unknown code might mean based on context
 */
router.post('/predict-code', authenticate, asyncHandler(async (req, res) => {
  const { code, manufacturer, segmentName, productType } = req.body;

  if (!code) {
    throw new ApiError('Code is required', 400);
  }

  const result = await nomenclatureService.predictUnknownCode(code, {
    manufacturer,
    segmentName,
    productType
  });

  res.json({
    success: true,
    data: result
  });
}));

// ============================================
// QUIZ ENDPOINTS
// ============================================

/**
 * POST /api/nomenclature/quiz/generate
 * Generate quiz questions
 */
router.post('/quiz/generate', authenticate, asyncHandler(async (req, res) => {
  const {
    quizType = 'mixed',
    manufacturer,
    productType,
    questionCount = 10,
    difficulty = 'medium'
  } = req.body;

  // Validate question count
  if (questionCount < 5 || questionCount > 30) {
    throw new ApiError('Question count must be between 5 and 30', 400);
  }

  const quiz = await nomenclatureService.generateQuiz({
    quizType,
    manufacturer,
    productType,
    questionCount,
    difficulty
  });

  res.json({
    success: true,
    data: quiz
  });
}));

/**
 * POST /api/nomenclature/quiz/submit
 * Submit quiz answers and get results
 */
router.post('/quiz/submit', authenticate, asyncHandler(async (req, res) => {
  const { quizId, answers, quiz } = req.body;

  if (!quizId || !answers || !quiz) {
    throw new ApiError('Quiz ID, answers, and quiz data are required', 400);
  }

  const userId = req.user?.id;

  const results = await nomenclatureService.submitQuiz(userId, {
    quizId,
    answers,
    quiz
  });

  res.json({
    success: true,
    data: results
  });
}));

/**
 * GET /api/nomenclature/quiz/history
 * Get user's quiz history
 */
router.get('/quiz/history', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { limit = 20 } = req.query;

  if (!userId) {
    throw new ApiError('User not authenticated', 401);
  }

  const history = await nomenclatureService.getQuizHistory(userId, parseInt(limit));

  res.json({
    success: true,
    data: history
  });
}));

/**
 * GET /api/nomenclature/quiz/leaderboard
 * Get quiz leaderboard
 */
router.get('/quiz/leaderboard', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer, limit = 10 } = req.query;

  const leaderboard = await nomenclatureService.getLeaderboard({
    manufacturer,
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    data: leaderboard
  });
}));

// ============================================
// PROGRESS ENDPOINTS
// ============================================

/**
 * GET /api/nomenclature/progress
 * Get user's learning progress
 */
router.get('/progress', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError('User not authenticated', 401);
  }

  const progress = await nomenclatureService.getUserProgress(userId);

  res.json({
    success: true,
    data: progress
  });
}));

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * POST /api/nomenclature/admin/templates
 * Create new template (admin only)
 */
router.post('/admin/templates', authenticate, asyncHandler(async (req, res) => {
  // Check admin role
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { manufacturer, product_type, template_name, description, example_models } = req.body;

  if (!manufacturer || !product_type || !template_name) {
    throw new ApiError('Manufacturer, product_type, and template_name are required', 400);
  }

  const template = await nomenclatureService.createTemplate({
    manufacturer,
    product_type,
    template_name,
    description,
    example_models
  }, req.user.id);

  res.status(201).json({
    success: true,
    data: template
  });
}));

/**
 * PUT /api/nomenclature/admin/templates/:id
 * Update template (admin only)
 */
router.put('/admin/templates/:id', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { id } = req.params;
  const template = await nomenclatureService.updateTemplate(id, req.body);

  if (!template) {
    throw new ApiError('Template not found', 404);
  }

  res.json({
    success: true,
    data: template
  });
}));

/**
 * DELETE /api/nomenclature/admin/templates/:id
 * Delete template (admin only)
 */
router.delete('/admin/templates/:id', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { id } = req.params;
  await nomenclatureService.deleteTemplate(id);

  res.json({
    success: true,
    message: 'Template deleted'
  });
}));

/**
 * POST /api/nomenclature/admin/rules
 * Add rule to template (admin only)
 */
router.post('/admin/rules', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { template_id, position_start, position_end, segment_name, segment_description, color } = req.body;

  if (!template_id || !position_start || !position_end || !segment_name) {
    throw new ApiError('template_id, position_start, position_end, and segment_name are required', 400);
  }

  const rule = await nomenclatureService.addRule(template_id, {
    position_start,
    position_end,
    segment_name,
    segment_description,
    color
  });

  res.status(201).json({
    success: true,
    data: rule
  });
}));

/**
 * DELETE /api/nomenclature/admin/rules/:id
 * Delete rule (admin only)
 */
router.delete('/admin/rules/:id', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { id } = req.params;
  await nomenclatureService.deleteRule(id);

  res.json({
    success: true,
    message: 'Rule deleted'
  });
}));

/**
 * POST /api/nomenclature/admin/codes
 * Add code to rule (admin only)
 */
router.post('/admin/codes', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { rule_id, code_value, code_meaning, additional_info, is_common } = req.body;

  if (!rule_id || !code_value || !code_meaning) {
    throw new ApiError('rule_id, code_value, and code_meaning are required', 400);
  }

  const code = await nomenclatureService.addCode(rule_id, {
    code_value,
    code_meaning,
    additional_info,
    is_common
  });

  res.status(201).json({
    success: true,
    data: code
  });
}));

/**
 * DELETE /api/nomenclature/admin/codes/:id
 * Delete code (admin only)
 */
router.delete('/admin/codes/:id', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { id } = req.params;
  await nomenclatureService.deleteCode(id);

  res.json({
    success: true,
    message: 'Code deleted'
  });
}));

// ============================================
// SCRAPING ENDPOINTS
// ============================================

// Module-level scraper instance (lazy loaded)
let nomenclatureScraper = null;

const getNomenclatureScraper = () => {
  if (!nomenclatureScraper) {
    const NomenclatureScraper = require('../scrapers/NomenclatureScraper');
    nomenclatureScraper = new NomenclatureScraper(pool);
  }
  return nomenclatureScraper;
};

/**
 * POST /api/nomenclature/scrape/start
 * Start a full nomenclature scrape job (admin only)
 */
router.post('/scrape/start', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const scraper = getNomenclatureScraper();
  const userId = req.user.id;

  // Run scrape in background
  const jobId = await scraper.createJob(userId, 'full');

  // Start async scrape (don't await)
  scraper.runFullScrape(userId).catch(err => {
    console.error('Background scrape failed:', err);
  });

  res.json({
    success: true,
    data: {
      jobId,
      message: 'Nomenclature scrape started',
      statusUrl: `/api/nomenclature/scrape/status/${jobId}`
    }
  });
}));

/**
 * POST /api/nomenclature/scrape/brand/:brand
 * Scrape a single brand (admin only)
 */
router.post('/scrape/brand/:brand', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { brand } = req.params;
  const scraper = getNomenclatureScraper();
  const userId = req.user.id;

  // Run scrape in background
  const jobId = await scraper.createJob(userId, 'single_brand', brand);

  scraper.scrapeSingleBrand(userId, brand).catch(err => {
    console.error(`Background scrape for ${brand} failed:`, err);
  });

  res.json({
    success: true,
    data: {
      jobId,
      brand,
      message: `Scraping ${brand} nomenclature started`,
      statusUrl: `/api/nomenclature/scrape/status/${jobId}`
    }
  });
}));

/**
 * GET /api/nomenclature/scrape/status/:jobId
 * Get scrape job status
 */
router.get('/scrape/status/:jobId', authenticate, asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const scraper = getNomenclatureScraper();

  const status = await scraper.getJobStatus(jobId);

  if (!status) {
    throw new ApiError('Job not found', 404);
  }

  res.json({
    success: true,
    data: status
  });
}));

/**
 * GET /api/nomenclature/scrape/status
 * Get current/latest scrape job status
 */
router.get('/scrape/status', authenticate, asyncHandler(async (req, res) => {
  const scraper = getNomenclatureScraper();
  const jobs = await scraper.getRecentJobs(1);

  res.json({
    success: true,
    data: jobs[0] || null
  });
}));

/**
 * GET /api/nomenclature/scrape/history
 * Get scrape job history (admin only)
 */
router.get('/scrape/history', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { limit = 10 } = req.query;
  const scraper = getNomenclatureScraper();
  const jobs = await scraper.getRecentJobs(parseInt(limit));

  res.json({
    success: true,
    data: jobs
  });
}));

/**
 * GET /api/nomenclature/training-data
 * Export nomenclature data for ML training
 */
router.get('/training-data', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer } = req.query;

  // Get all templates with rules and codes
  const templates = await nomenclatureService.getAllTemplates({ manufacturer, isActive: true });

  const trainingData = {
    exportedAt: new Date().toISOString(),
    patterns: [],
    codes: []
  };

  for (const template of templates) {
    const fullTemplate = await nomenclatureService.getTemplateByManufacturerAndType(
      template.manufacturer,
      template.product_type
    );

    if (fullTemplate && fullTemplate.rules) {
      trainingData.patterns.push({
        manufacturer: template.manufacturer,
        productType: template.product_type,
        regex: template.pattern_regex || null,
        segments: fullTemplate.rules.map(rule => ({
          position: `${rule.position_start}-${rule.position_end}`,
          name: rule.segment_name,
          values: rule.codes?.map(c => c.code_value) || []
        }))
      });

      // Flatten codes
      for (const rule of fullTemplate.rules) {
        for (const code of rule.codes || []) {
          trainingData.codes.push({
            code: code.code_value,
            meaning: code.code_meaning,
            segment: rule.segment_name,
            manufacturer: template.manufacturer,
            productType: template.product_type
          });
        }
      }
    }
  }

  res.json({
    success: true,
    data: trainingData
  });
}));

/**
 * GET /api/nomenclature/changes
 * Get recent nomenclature changes (admin only)
 */
router.get('/changes', authenticate, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    throw new ApiError('Admin access required', 403);
  }

  const { limit = 50 } = req.query;

  const result = await pool.query(`
    SELECT cl.*, t.manufacturer, t.product_type
    FROM nomenclature_change_log cl
    LEFT JOIN nomenclature_templates t ON cl.template_id = t.id
    ORDER BY cl.detected_at DESC
    LIMIT $1
  `, [parseInt(limit)]);

  res.json({
    success: true,
    data: result.rows
  });
}));

module.exports = { router, init };
