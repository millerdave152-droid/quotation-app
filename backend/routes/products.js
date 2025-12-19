/**
 * Product Routes Module
 * Handles all product-related API endpoints including CRUD, imports, and favorites
 * Uses ProductService for business logic
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const ProductService = require('../services/ProductService');

// Module-level dependencies
let productService = null;
let pool = null;
let cache = null;
let upload = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.cache - Cache module
 * @param {object} deps.upload - Multer upload middleware
 */
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  upload = deps.upload;
  productService = new ProductService(deps.pool, deps.cache);
  return router;
};

// ============================================
// PRODUCT ROUTES
// ============================================

/**
 * GET /api/products
 * Get all products with search, filter, and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const result = await productService.getProducts(req.query);
  res.json(result.products || result);
}));

/**
 * GET /api/products/stats
 * Get product statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await productService.getStatsOverview();
  res.success(stats.overview);
}));

/**
 * GET /api/products/favorites
 * Get user's favorite products
 */
router.get('/favorites', asyncHandler(async (req, res) => {
  const userId = req.query.user_id || 1;
  const favorites = await productService.getFavorites(userId);
  res.json(favorites);
}));

/**
 * GET /api/products/categories
 * Get all unique categories
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await productService.getCategories();
  res.json(categories);
}));

/**
 * GET /api/products/manufacturers
 * Get all unique manufacturers
 */
router.get('/manufacturers', asyncHandler(async (req, res) => {
  const manufacturers = await productService.getManufacturers();
  res.json(manufacturers);
}));

/**
 * GET /api/products/search
 * Search products for autocomplete
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  const results = await productService.searchForAutocomplete(q || '', limit);
  res.json(results);
}));

/**
 * GET /api/products/recent
 * Get recently updated products
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const limit = req.query.limit || 10;
  const result = await pool.query(`
    SELECT * FROM products
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $1
  `, [limit]);
  res.json(result.rows);
}));

/**
 * GET /api/products/recently-quoted
 * Get products recently used in quotations
 */
router.get('/recently-quoted', asyncHandler(async (req, res) => {
  const limit = req.query.limit || 10;
  const result = await pool.query(`
    SELECT p.*, MAX(qi.created_at) as last_used
    FROM products p
    INNER JOIN quotation_items qi ON p.id = qi.product_id
    GROUP BY p.id
    ORDER BY MAX(qi.created_at) DESC
    LIMIT $1
  `, [limit]);
  res.json(result.rows);
}));

/**
 * GET /api/products/:id
 * Get single product by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await productService.getProductById(id);

  if (!product) {
    throw ApiError.notFound('Product');
  }

  res.json(product);
}));

/**
 * POST /api/products
 * Create a new product
 */
router.post('/', asyncHandler(async (req, res) => {
  const { model, manufacturer } = req.body;

  console.log('➕ CREATE PRODUCT REQUEST:', { model, manufacturer });

  try {
    const product = await productService.createProduct(req.body);
    console.log('✅ Product created successfully:', product.id);
    res.created(product);
  } catch (error) {
    if (error.code === '23505' && error.constraint && error.constraint.includes('model')) {
      throw ApiError.conflict('Model already exists', {
        details: 'This model number is already in use'
      });
    }
    throw error;
  }
}));

/**
 * PUT /api/products/:id
 * Update an existing product
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  console.log('📝 UPDATE PRODUCT REQUEST:', { id });

  const product = await productService.updateProduct(id, req.body);

  if (!product) {
    throw ApiError.notFound('Product');
  }

  console.log('✅ Product updated successfully:', product.id);
  res.success(product);
}));

/**
 * DELETE /api/products/:id
 * Delete a product
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await productService.deleteProduct(id);

  if (!result) {
    throw ApiError.notFound('Product');
  }

  res.success(null, { message: 'Product deleted successfully' });
}));

/**
 * POST /api/products/favorites/:productId
 * Add product to favorites
 */
router.post('/favorites/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const userId = req.body.user_id || 1;

  const added = await productService.addToFavorites(productId, userId);

  if (!added) {
    return res.success(null, { message: 'Product already in favorites' });
  }
  res.created(null, { message: 'Product added to favorites' });
}));

/**
 * DELETE /api/products/favorites/:productId
 * Remove product from favorites
 */
router.delete('/favorites/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const userId = req.query.user_id || 1;

  await productService.removeFromFavorites(productId, userId);
  res.success(null, { message: 'Product removed from favorites' });
}));

// ============================================
// CSV IMPORT (keeping specialized import logic in routes)
// ============================================

/**
 * POST /api/products/import-csv
 * Import products from CSV file
 */
router.post('/import-csv', (req, res, next) => {
  upload.single('csvfile')(req, res, (err) => {
    if (err) return next(err);
    handleCsvImport(req, res).catch(next);
  });
});

async function handleCsvImport(req, res) {
  console.log('📥 CSV Import Started');

  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }

  const filename = req.file.originalname;
  const startTime = Date.now();

  console.log(`📄 Processing file: ${filename}`);

  const results = [];
  const errors = [];
  let totalRows = 0;
  let successful = 0;
  let failed = 0;
  let inserted = 0;
  let updated = 0;

  // Parse CSV from buffer
  const stream = Readable.from(req.file.buffer.toString());

  await new Promise((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (row) => {
        totalRows++;

        if (!row.MODEL && !row.model) {
          errors.push({ row: totalRows, error: 'Missing MODEL field', data: row });
          failed++;
          return;
        }

        const normalizedRow = {
          manufacturer: row.MANUFACTURER || row.manufacturer || '',
          model: row.MODEL || row.model || '',
          name: row.Description || row.DESCRIPTION || row.description || '',
          description: row.Description || row.DESCRIPTION || row.description || '',
          category: row.CATEGORY || row.category || '',
          actual_cost: row.ACTUAL_COST || row.actual_cost || row.COST || row.cost || row['Dealer Cost'] || 0,
          msrp: row.MSRP || row.msrp || 0
        };

        results.push(normalizedRow);
        successful++;
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });

  console.log(`✓ Parsed ${successful} valid rows`);

  // Import to database
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < results.length; i++) {
      const row = results[i];

      if (i % 100 === 0) {
        console.log(`Processed ${i}/${results.length} products...`);
      }

      try {
        const costCents = Math.round(parseFloat(row.actual_cost) * 100) || 0;
        const msrpCents = Math.round(parseFloat(row.msrp) * 100) || 0;

        const result = await client.query(`
          INSERT INTO products (
            manufacturer, model, name, description, category,
            cost_cents, msrp_cents,
            import_source, import_date, import_file_name,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (model)
          DO UPDATE SET
            manufacturer = EXCLUDED.manufacturer,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            cost_cents = EXCLUDED.cost_cents,
            msrp_cents = EXCLUDED.msrp_cents,
            import_date = EXCLUDED.import_date,
            import_file_name = EXCLUDED.import_file_name,
            updated_at = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS inserted
        `, [
          row.manufacturer, row.model, row.name, row.description, row.category,
          costCents, msrpCents, 'automatic', filename
        ]);

        if (result.rows[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`Error importing row ${i}:`, err.message);
        errors.push({ row: i + 1, error: err.message, data: row });
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Import committed to database`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Log to import history
  try {
    await pool.query(`
      INSERT INTO import_history (
        filename, total_rows, successful, failed,
        new_products, updated_products, import_date
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [filename, totalRows, successful, failed, inserted, updated]);
  } catch (err) {
    console.warn('Could not log to import_history:', err.message);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  productService.invalidateCache();

  console.log('✅ IMPORT COMPLETED');
  console.log(`   Total: ${totalRows}, New: ${inserted}, Updated: ${updated}`);

  res.success({
    filename,
    total: totalRows,
    successful,
    failed,
    inserted,
    updated,
    validationErrors: errors.slice(0, 10),
    importErrors: errors.length > 10 ? `${errors.length - 10} more errors...` : []
  }, { message: 'Import completed successfully', meta: { duration: `${duration}s` } });
}

// ============================================
// UNIVERSAL IMPORT (CSV + Excel)
// ============================================

/**
 * POST /api/products/import-universal
 * Import products from CSV or Excel file
 */
router.post('/import-universal', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return next(err);
    handleUniversalImport(req, res).catch(next);
  });
});

async function handleUniversalImport(req, res) {
  console.log('📥 Universal Product Import Started');

  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }

  const filename = req.file.originalname;
  const fileExt = path.extname(filename).toLowerCase();
  const startTime = Date.now();

  console.log(`📄 Processing file: ${filename} (type: ${fileExt})`);

  let records = [];
  const errors = [];
  let totalRows = 0;
  let successful = 0;
  let failed = 0;
  let inserted = 0;
  let updated = 0;

  // Parse file based on extension
  if (fileExt === '.xlsx' || fileExt === '.xls') {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`📊 Parsed ${records.length} rows from Excel sheet: ${sheetName}`);
  } else if (fileExt === '.csv') {
    const stream = Readable.from(req.file.buffer.toString());
    records = await new Promise((resolve, reject) => {
      const rows = [];
      stream
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', (err) => reject(err));
    });
    console.log(`📊 Parsed ${records.length} rows from CSV`);
  } else {
    throw ApiError.badRequest(`Unsupported file type: ${fileExt}. Please use .csv, .xlsx, or .xls`);
  }

  // Normalize records
  const normalizedRecords = records.map((row, idx) => {
    totalRows++;

    const model = row.MODEL || row.model || row['Model'] || row['Model Number'] ||
                 row['Part Number'] || row['SKU'] || row['Item'] || '';
    const manufacturer = row.MANUFACTURER || row.manufacturer || row['Manufacturer'] ||
                        row['Brand'] || row['BRAND'] || row['Vendor'] || '';
    const description = row.Description || row.DESCRIPTION || row.description ||
                       row['Product Name'] || row['Name'] || row['Item Description'] || '';
    const category = row.CATEGORY || row.category || row['Category'] ||
                    row['Product Category'] || row['Type'] || '';
    const cost = row.ACTUAL_COST || row.actual_cost || row.COST || row.cost ||
                row['Dealer Cost'] || row['Cost'] || row['Unit Cost'] ||
                row['Wholesale Price'] || row['Net Price'] || 0;
    const msrp = row.MSRP || row.msrp || row['Retail Price'] ||
                row['Retail'] || row['List Price'] || row['Suggested Retail'] || 0;

    if (!model) {
      errors.push({ row: idx + 2, error: 'Missing MODEL/SKU field', data: row });
      failed++;
      return null;
    }

    successful++;
    return {
      manufacturer: manufacturer.toString().trim().toUpperCase(),
      model: model.toString().trim().toUpperCase(),
      name: description.toString().trim() || model.toString().trim(),
      description: description.toString().trim(),
      category: category.toString().trim() || 'Uncategorized',
      cost_cents: Math.round(parseFloat(cost.toString().replace(/[$,]/g, '')) * 100) || 0,
      msrp_cents: Math.round(parseFloat(msrp.toString().replace(/[$,]/g, '')) * 100) || 0
    };
  }).filter(Boolean);

  console.log(`✓ Normalized ${normalizedRecords.length} valid records`);

  // Import to database
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < normalizedRecords.length; i++) {
      const row = normalizedRecords[i];

      if (i % 100 === 0 && i > 0) {
        console.log(`Processed ${i}/${normalizedRecords.length} products...`);
      }

      try {
        const result = await client.query(`
          INSERT INTO products (
            manufacturer, model, name, description, category,
            cost_cents, msrp_cents,
            import_source, import_date, import_file_name,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (model)
          DO UPDATE SET
            manufacturer = COALESCE(NULLIF(EXCLUDED.manufacturer, ''), products.manufacturer),
            name = COALESCE(NULLIF(EXCLUDED.name, ''), products.name),
            description = COALESCE(NULLIF(EXCLUDED.description, ''), products.description),
            category = COALESCE(NULLIF(EXCLUDED.category, 'Uncategorized'), products.category),
            cost_cents = CASE WHEN EXCLUDED.cost_cents > 0 THEN EXCLUDED.cost_cents ELSE products.cost_cents END,
            msrp_cents = CASE WHEN EXCLUDED.msrp_cents > 0 THEN EXCLUDED.msrp_cents ELSE products.msrp_cents END,
            import_date = EXCLUDED.import_date,
            import_file_name = EXCLUDED.import_file_name,
            updated_at = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS inserted
        `, [
          row.manufacturer, row.model, row.name, row.description, row.category,
          row.cost_cents, row.msrp_cents, 'automatic', filename
        ]);

        if (result.rows[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`Error importing row ${i}:`, err.message);
        errors.push({ row: i + 2, error: err.message, data: row });
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Universal import committed`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Log to import history
  try {
    await pool.query(`
      INSERT INTO import_history (
        filename, total_rows, successful, failed,
        new_products, updated_products, import_date
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [filename, totalRows, successful, failed, inserted, updated]);
  } catch (err) {
    console.warn('Could not log to import_history:', err.message);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  productService.invalidateCache();

  console.log('✅ UNIVERSAL IMPORT COMPLETED');
  console.log(`   Total: ${totalRows}, New: ${inserted}, Updated: ${updated}`);

  res.success({
    filename,
    fileType: fileExt,
    total: totalRows,
    successful,
    failed,
    inserted,
    updated,
    validationErrors: errors.slice(0, 10),
    hasMoreErrors: errors.length > 10
  }, { message: 'Universal import completed successfully', meta: { duration: `${duration}s` } });
}

module.exports = { router, init };
