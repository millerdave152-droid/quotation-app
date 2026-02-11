/**
 * Import Templates API Routes
 * Handles manufacturer import template CRUD and matching operations
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: CSV, XLSX, XLS'), false);
    }
  }
});

// Dependencies (initialized in init function)
let templateService = null;
let columnDetectionEngine = null;

/**
 * Initialize routes with dependencies
 */
const init = (deps) => {
  const { pool, cache } = deps;
  const TemplateService = require('../services/TemplateService');
  const ColumnDetectionEngine = require('../services/ColumnDetectionEngine');

  templateService = new TemplateService(pool, cache);
  columnDetectionEngine = new ColumnDetectionEngine();

  return router;
};

// ========================================
// TEMPLATE CRUD OPERATIONS
// ========================================

/**
 * GET /api/import-templates
 * List all templates with optional filtering
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { manufacturer, active_only = 'true', file_type } = req.query;
  const templates = await templateService.listTemplates({
    manufacturer,
    activeOnly: active_only === 'true',
    fileType: file_type
  });
  res.json({ success: true, data: templates });
}));

/**
 * GET /api/import-templates/manufacturers
 * Get manufacturers with template counts
 */
router.get('/manufacturers', authenticate, asyncHandler(async (req, res) => {
  const manufacturers = await templateService.getManufacturersWithTemplates();
  res.json({ success: true, data: manufacturers });
}));

/**
 * GET /api/import-templates/target-fields
 * Get available target fields for mapping
 */
router.get('/target-fields', authenticate, asyncHandler(async (req, res) => {
  const fields = columnDetectionEngine.getAvailableTargetFields();
  res.json({ success: true, data: fields });
}));

/**
 * GET /api/import-templates/:id
 * Get template details by ID
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const template = await templateService.getTemplateById(req.params.id);
  if (!template) {
    throw ApiError.notFound('Template');
  }
  res.json({ success: true, data: template });
}));

/**
 * POST /api/import-templates
 * Create new template
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const templateId = await templateService.createTemplate(req.body);
  const template = await templateService.getTemplateById(templateId);
  res.status(201).json({ success: true, data: template });
}));

/**
 * PUT /api/import-templates/:id
 * Update existing template
 */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const template = await templateService.updateTemplate(req.params.id, req.body);
  if (!template) {
    throw ApiError.notFound('Template');
  }
  res.json({ success: true, data: template });
}));

/**
 * DELETE /api/import-templates/:id
 * Delete template
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const deleted = await templateService.deleteTemplate(req.params.id);
  if (!deleted) {
    throw ApiError.notFound('Template');
  }
  res.json({ success: true, message: 'Template deleted successfully' });
}));

/**
 * POST /api/import-templates/:id/clone
 * Clone a template
 */
router.post('/:id/clone', authenticate, asyncHandler(async (req, res) => {
  const { name, manufacturer } = req.body;
  const newTemplateId = await templateService.cloneTemplate(req.params.id, { name, manufacturer });
  const template = await templateService.getTemplateById(newTemplateId);
  res.status(201).json({ success: true, data: template });
}));

// ========================================
// TEMPLATE MATCHING & DETECTION
// ========================================

/**
 * POST /api/import-templates/match
 * Find matching template for file
 */
router.post('/match', authenticate, asyncHandler(async (req, res) => {
  const { filename, headers, sampleRows } = req.body;

  if (!filename || !headers) {
    throw ApiError.badRequest('Filename and headers are required');
  }

  const result = await templateService.findMatchingTemplate(filename, headers, sampleRows);
  res.json({ success: true, data: result });
}));

/**
 * POST /api/import-templates/detect-columns
 * Detect column mappings from headers and sample data
 */
router.post('/detect-columns', authenticate, asyncHandler(async (req, res) => {
  const { headers, sampleRows, manufacturer } = req.body;

  if (!headers || !Array.isArray(headers)) {
    throw ApiError.badRequest('Headers array is required');
  }

  const result = columnDetectionEngine.detectColumns(headers, sampleRows || [], manufacturer);
  res.json({ success: true, data: result });
}));

/**
 * POST /api/import-templates/parse-file
 * Parse uploaded file and extract headers + sample data
 */
router.post('/parse-file', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }

  const filename = req.file.originalname;
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  const headerRowIndex = parseInt(req.body.headerRowIndex) || 1;

  let headers = [];
  let sampleRows = [];
  let totalRows = 0;

  if (ext === '.csv') {
    // Parse CSV
    const results = await parseCSV(req.file.buffer, headerRowIndex);
    headers = results.headers;
    sampleRows = results.sampleRows;
    totalRows = results.totalRows;
  } else if (ext === '.xlsx' || ext === '.xls') {
    // Parse Excel
    const results = parseExcel(req.file.buffer, headerRowIndex, req.body.sheetName);
    headers = results.headers;
    sampleRows = results.sampleRows;
    totalRows = results.totalRows;
  } else {
    throw ApiError.badRequest('Unsupported file type');
  }

  // Detect columns automatically
  const detection = columnDetectionEngine.detectColumns(headers, sampleRows);

  // Try to match existing template
  const templateMatch = await templateService.findMatchingTemplate(filename, headers, sampleRows);

  res.json({
    success: true,
    data: {
      filename,
      fileType: ext.replace('.', ''),
      fileSize: req.file.size,
      headers,
      sampleRows: sampleRows.slice(0, 10),
      totalRows,
      detection,
      templateMatch,
      parsedAt: new Date().toISOString()
    }
  });
}));

/**
 * POST /api/import-templates/:id/test
 * Test template with sample data
 */
router.post('/:id/test', authenticate, asyncHandler(async (req, res) => {
  const { headers, sampleData } = req.body;

  const template = await templateService.getTemplateById(req.params.id);
  if (!template) {
    throw ApiError.notFound('Template');
  }

  const testResult = await templateService.testTemplate(template, headers, sampleData || []);
  res.json({ success: true, data: testResult });
}));

// ========================================
// TEMPLATE LEARNING
// ========================================

/**
 * POST /api/import-templates/:id/corrections
 * Record user correction for learning
 */
router.post('/:id/corrections', authenticate, asyncHandler(async (req, res) => {
  await templateService.recordCorrection(req.params.id, req.body);
  res.json({ success: true, message: 'Correction recorded' });
}));

/**
 * GET /api/import-templates/:id/learning-history
 * Get learning history for template
 */
router.get('/:id/learning-history', authenticate, asyncHandler(async (req, res) => {
  const history = await templateService.getLearningHistory(req.params.id);
  res.json({ success: true, data: history });
}));

/**
 * GET /api/import-templates/:id/usage-history
 * Get usage history for template
 */
router.get('/:id/usage-history', authenticate, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const history = await templateService.getUsageHistory(req.params.id, limit);
  res.json({ success: true, data: history });
}));

/**
 * POST /api/import-templates/:id/record-usage
 * Record template usage after import
 */
router.post('/:id/record-usage', authenticate, asyncHandler(async (req, res) => {
  await templateService.recordTemplateUsage(req.params.id, req.body);
  res.json({ success: true, message: 'Usage recorded' });
}));

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Parse CSV buffer
 */
function parseCSV(buffer, headerRowIndex = 1) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headers = [];
    let currentRow = 0;

    const stream = Readable.from(buffer.toString());

    stream
      .pipe(csvParser({ headers: false }))
      .on('data', (row) => {
        currentRow++;
        const values = Object.values(row);

        if (currentRow === headerRowIndex) {
          headers = values.map(v => (v || '').toString().trim());
        } else if (currentRow > headerRowIndex) {
          rows.push(values);
        }
      })
      .on('end', () => {
        resolve({
          headers,
          sampleRows: rows.slice(0, 50),
          totalRows: rows.length
        });
      })
      .on('error', reject);
  });
}

/**
 * Parse Excel buffer
 */
function parseExcel(buffer, headerRowIndex = 1, sheetName = null) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Get sheet
  const sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error('Sheet not found');
  }

  // Convert to array of arrays
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Extract headers and data
  const headers = (data[headerRowIndex - 1] || []).map(v => (v || '').toString().trim());
  const rows = data.slice(headerRowIndex);

  return {
    headers,
    sampleRows: rows.slice(0, 50),
    totalRows: rows.length,
    sheetNames: workbook.SheetNames
  };
}

module.exports = { router, init };
