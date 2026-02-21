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
const ProductRecommendationService = require('../services/ProductRecommendationService');
const { authenticate } = require('../middleware/auth');
const { validateJoi, productSchemas } = require('../middleware/validation');

// Module-level dependencies
let productService = null;
let recommendationService = null;
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
  recommendationService = new ProductRecommendationService(deps.pool);
  return router;
};

// ============================================
// PRODUCT ROUTES
// ============================================

/**
 * GET /api/products
 * Get all products with search, filter, and pagination
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await productService.getProducts(req.query);
  res.json(result.products || result);
}));

/**
 * GET /api/products/stats
 * Get product statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await productService.getStatsOverview();
  res.success(stats.overview);
}));

/**
 * GET /api/products/favorites
 * Get user's favorite products
 */
router.get('/favorites', authenticate, asyncHandler(async (req, res) => {
  // Use authenticated user's ID - don't allow accessing other users' favorites
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    throw ApiError.unauthorized('User ID not found in authentication token');
  }
  const favorites = await productService.getFavorites(userId);
  res.json(favorites);
}));

/**
 * GET /api/products/categories
 * Get all unique categories (legacy raw strings)
 */
router.get('/categories', authenticate, asyncHandler(async (req, res) => {
  // PERF: Cache categories list (static data)
  const categories = await cache.cacheQuery('products:categories', 'long', async () => {
    return productService.getCategories();
  });
  res.json(categories);
}));

/**
 * GET /api/products/categories/hierarchy
 * Get normalized category hierarchy with product counts
 */
router.get('/categories/hierarchy', authenticate, asyncHandler(async (req, res) => {
  // PERF: Cache category hierarchy (static data)
  const hierarchy = await cache.cacheQuery('products:categories:hierarchy', 'long', async () => {
    return productService.getCategoryHierarchy();
  });
  res.json({
    success: true,
    categories: hierarchy
  });
}));

/**
 * GET /api/products/categories/main
 * Get flat list of main level-2 categories
 */
router.get('/categories/main', authenticate, asyncHandler(async (req, res) => {
  // PERF: Cache main categories (static data)
  const categories = await cache.cacheQuery('products:categories:main', 'long', async () => {
    return productService.getMainCategories();
  });
  res.json({
    success: true,
    categories
  });
}));

/**
 * GET /api/products/categories/:slug
 * Get category by slug with subcategories
 */
router.get('/categories/:slug', authenticate, asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const category = await productService.getCategoryBySlug(slug);

  if (!category) {
    throw new ApiError('Category not found', 404);
  }

  res.json({
    success: true,
    category
  });
}));

/**
 * GET /api/products/manufacturers
 * Get all unique manufacturers
 */
router.get('/manufacturers', authenticate, asyncHandler(async (req, res) => {
  // PERF: Cache manufacturers list (rarely changes)
  const manufacturers = await cache.cacheQuery('products:manufacturers', 'medium', async () => {
    return productService.getManufacturers();
  });
  res.json(manufacturers);
}));

/**
 * GET /api/products/tags
 * Get all product tags grouped by type
 */
router.get('/tags', authenticate, asyncHandler(async (req, res) => {
  // PERF: Cache tags list (rarely changes)
  const grouped = await cache.cacheQuery('products:tags', 'medium', async () => {
    const result = await pool.query(`
      SELECT pt.*,
             COUNT(ptm.product_id) as product_count
      FROM product_tags pt
      LEFT JOIN product_tag_mappings ptm ON pt.id = ptm.tag_id
      WHERE pt.is_active = true
      GROUP BY pt.id
      ORDER BY pt.tag_type, pt.display_order, pt.name
    `);

    // Group by tag_type
    return result.rows.reduce((acc, tag) => {
      const type = tag.tag_type;
      if (!acc[type]) acc[type] = [];
      acc[type].push({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
        productCount: parseInt(tag.product_count) || 0
      });
      return acc;
    }, {});
  });

  res.json(grouped);
}));

/**
 * GET /api/products/by-tag/:tagId
 * Get products with a specific tag
 */
router.get('/by-tag/:tagId', authenticate, asyncHandler(async (req, res) => {
  const { tagId } = req.params;
  const { limit = 100, offset = 0 } = req.query;

  const result = await pool.query(`
    SELECT p.*
    FROM products p
    INNER JOIN product_tag_mappings ptm ON p.id = ptm.product_id
    WHERE ptm.tag_id = $1
    ORDER BY p.manufacturer, p.model
    LIMIT $2 OFFSET $3
  `, [tagId, limit, offset]);

  res.json(result.rows);
}));

/**
 * GET /api/products/search
 * Search products for autocomplete
 */
router.get('/search', authenticate, asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  const results = await productService.searchForAutocomplete(q || '', limit);
  res.json(results);
}));

/**
 * GET /api/products/recent
 * Get recently updated products
 */
router.get('/recent', authenticate, asyncHandler(async (req, res) => {
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
router.get('/recently-quoted', authenticate, asyncHandler(async (req, res) => {
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
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
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
router.post('/', authenticate, validateJoi(productSchemas.create), asyncHandler(async (req, res) => {
  try {
    const product = await productService.createProduct(req.body);
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
router.put('/:id', authenticate, validateJoi(productSchemas.update), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await productService.updateProduct(id, req.body);

  if (!product) {
    throw ApiError.notFound('Product');
  }

  res.success(product);
}));

/**
 * DELETE /api/products/:id
 * Delete a product
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
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
router.post('/favorites/:productId', authenticate, asyncHandler(async (req, res) => {
  const { productId } = req.params;
  // Use authenticated user's ID - don't allow adding to other users' favorites
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    throw ApiError.unauthorized('User ID not found in authentication token');
  }

  // Validate productId is a valid integer
  const prodId = parseInt(productId, 10);
  if (isNaN(prodId) || prodId <= 0) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const added = await productService.addToFavorites(prodId, userId);

  if (!added) {
    return res.success(null, { message: 'Product already in favorites' });
  }
  res.created(null, { message: 'Product added to favorites' });
}));

/**
 * DELETE /api/products/favorites/:productId
 * Remove product from favorites
 */
router.delete('/favorites/:productId', authenticate, asyncHandler(async (req, res) => {
  const { productId } = req.params;
  // Use authenticated user's ID - don't allow removing from other users' favorites
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    throw ApiError.unauthorized('User ID not found in authentication token');
  }

  // Validate productId is a valid integer
  const prodId = parseInt(productId, 10);
  if (isNaN(prodId) || prodId <= 0) {
    throw ApiError.badRequest('Invalid product ID');
  }

  await productService.removeFromFavorites(prodId, userId);
  res.success(null, { message: 'Product removed from favorites' });
}));

// ============================================
// CSV IMPORT (keeping specialized import logic in routes)
// ============================================

/**
 * POST /api/products/import-csv
 * Import products from CSV file
 */
router.post('/import-csv', authenticate, (req, res, next) => {
  upload.single('csvfile')(req, res, (err) => {
    if (err) return next(err);
    handleCsvImport(req, res).catch(next);
  });
});

async function handleCsvImport(req, res) {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }

  const filename = req.file.originalname;
  const startTime = Date.now();

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

  // Import to database
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < results.length; i++) {
      const row = results[i];

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

        if (result.rows.length > 0 && result.rows[0].inserted) {
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
router.post('/import-universal', authenticate, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return next(err);
    handleUniversalImport(req, res).catch(next);
  });
});

async function handleUniversalImport(req, res) {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }

  const filename = req.file.originalname;
  const fileExt = path.extname(filename).toLowerCase();
  const startTime = Date.now();

  // Parse column mappings from wizard (if provided)
  let columnMappings = {};
  try {
    if (req.body.columnMappings) {
      columnMappings = JSON.parse(req.body.columnMappings);
    }
  } catch (e) {
    console.warn('Could not parse columnMappings:', e.message);
  }

  const headerRowIndex = parseInt(req.body.headerRowIndex) || 1;

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

    // Handle custom header row
    if (headerRowIndex > 1) {
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Detect sheet's starting row (some files start at A2, not A1)
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const sheetStartRow = range.s.r + 1; // 1-indexed starting row

      // Adjust header index: if sheet starts at row 2 and user wants row 7,
      // the actual array index is 7 - 2 = 5
      const adjustedHeaderIndex = headerRowIndex - sheetStartRow;
      const headers = data[adjustedHeaderIndex] || [];
      const dataRows = data.slice(adjustedHeaderIndex + 1);

      // Fix blank headers - generate fallback names and detect model column
      const fixedHeaders = headers.map((h, i) => {
        if (!h || h.toString().trim() === '') {
          return `_Column_${i + 1}`;  // Generate fallback name for blank headers
        }
        return h;
      });

      // Check if first column might be model (common pattern - blank header but contains model data)
      const firstDataRow = dataRows[0] || [];
      const firstColValue = firstDataRow[0] ? firstDataRow[0].toString().trim() : '';
      const looksLikeModel = /^[A-Z]{1,4}[\d\-A-Z]{3,}/i.test(firstColValue);

      if (fixedHeaders[0].startsWith('_Column_') && looksLikeModel) {
        fixedHeaders[0] = 'Model';  // Rename to Model if it looks like model data
      }

      records = dataRows.map(row => {
        const obj = {};
        fixedHeaders.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      }).filter(row => {
        // Filter out completely empty rows
        const values = Object.values(row);
        return values.some(v => v !== '' && v !== null && v !== undefined);
      });
    } else {
      records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }
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
  } else {
    throw ApiError.badRequest(`Unsupported file type: ${fileExt}. Please use .csv, .xlsx, or .xls`);
  }

  // Helper function to get value using column mappings or fallback
  const getValue = (row, targetField, fallbackKeys = []) => {
    // First check if we have a mapping for this target field
    for (const [sourceCol, mapping] of Object.entries(columnMappings)) {
      if (mapping.targetField === targetField && row[sourceCol] !== undefined) {
        let value = row[sourceCol];
        // Apply transformation if needed (e.g., multiply_100 for prices)
        if (mapping.transform === 'multiply_100' && value) {
          value = parseFloat(value.toString().replace(/[$,]/g, '')) * 100;
        }
        return value;
      }
    }
    // Fallback to common column names
    for (const key of fallbackKeys) {
      if (row[key] !== undefined && row[key] !== '') {
        return row[key];
      }
    }
    return '';
  };

  // Normalize records using mappings or fallback detection
  const normalizedRecords = records.map((row, idx) => {
    // Skip empty rows - check if row has any non-empty values
    const rowValues = Object.values(row);
    const hasData = rowValues.some(val => val !== undefined && val !== null && val !== '' && val.toString().trim() !== '');
    if (!hasData) {
      return null; // Skip completely empty rows
    }

    totalRows++;

    // Use mappings if available, otherwise fallback to common column names
    // Include variations with colons (LG uses "Model:", "MSRP:", etc.)
    // Include GE columns (MATERIAL, BRAND, MG DESC, etc.)
    const model = getValue(row, 'model', [
      'MODEL', 'model', 'Model', 'Model:', 'Model Number', 'Model #', 'Model + Suffix:',
      'Part Number', 'SKU', 'Item', 'Part #', 'Item #', 'Item Number', 'Product Code',
      'MATERIAL', 'Material',
      '# Modèle / Model #', '# Modèle', 'Modèle', 'No. Modèle'
    ]);
    const manufacturer = getValue(row, 'manufacturer', [
      'MANUFACTURER', 'manufacturer', 'Manufacturer', 'Brand', 'BRAND', 'Vendor',
      'Vendor:', 'Make', 'Mfr', 'MFR'
    ]);
    const name = getValue(row, 'name', [
      'Product Name', 'Name', 'Title', 'Short Description:', 'Short Description',
      'Item Name', 'Product Title', 'DESCRIPTION', 'Description'
    ]);
    const description = getValue(row, 'description', [
      'Description', 'DESCRIPTION', 'description', 'Description:', 'DESCRIPTION:',
      'Product Name', 'Name', 'Item Description', 'Product Description',
      'Short Description:', 'Short Description', 'Long Description',
      'English Description', 'Description Française'
    ]);
    const category = getValue(row, 'category', [
      'CATEGORY', 'category', 'Category', 'Category:', 'Product Category',
      'Type', 'Division', 'Division:', 'Department', 'Class',
      'MG DESC', 'MG4 DESC',
      'Catégorie de produit / Product Category', 'Catégorie de produit', 'Catégorie'
    ]);
    const color = getValue(row, 'color', [
      'Color', 'COLOR', 'Colour', 'Colour:', 'Color:', 'Finish', 'Finish:'
    ]);

    // Price fields - check if already transformed (from mapping) or need conversion
    let cost_cents = getValue(row, 'cost_cents', [
      'ACTUAL_COST', 'actual_cost', 'COST', 'cost', 'Dealer Cost', 'Cost',
      'Unit Cost', 'Wholesale Price', 'Net Price', 'Net Dealer', 'Q1 Cost',
      'Regular', 'Dealer', 'Net', 'Your Cost', 'Invoice Cost',
      'DEALER COST', ' DEALER COST ', 'REGULAR COST', ' REGULAR COST ',
      'Marchand / Dealer', 'Marchand', 'Marchand\r\n/ Dealer'
    ]);
    let msrp_cents = getValue(row, 'msrp_cents', [
      'MSRP', 'msrp', 'MSRP:', 'Retail Price', 'Retail', 'List Price',
      'Suggested Retail', 'SRP', 'List', 'RRP', 'Retail:',
      ' MSRP ', ' MSRP',
      'PDSM / MSRP', 'PDSM', 'PDSM/MSRP'
    ]);
    let promo_cost_cents = getValue(row, 'promo_cost_cents', [
      'Avg Promo', 'Promo Cost', 'Better Cost', 'Special Price', 'Promo Price',
      'Q1 Promo', 'Sale Cost', 'Promotional Cost',
      'PROMO COST', ' PROMO COST ',
      'Promo Marchand / Dealer Promo', 'Promo Marchand', 'Dealer Promo'
    ]);
    let retail_price_cents = getValue(row, 'retail_price_cents', [
      'Go To Price', 'Retail Price', 'Go-To', 'GOTO:', 'Go To', 'GoTo',
      'Selling Price', 'Sale Price', 'PROMO RETAIL'
    ]);
    let map_price_cents = getValue(row, 'map_price_cents', [
      'MAP', 'Minimum Advertised', 'MAP Price', 'MAP:', 'Min Advertised',
      ' MAP ', ' MAP'
    ]);

    // Convert to cents if not already (check if it looks like dollars)
    const toCents = (val) => {
      if (!val) return 0;
      const num = parseFloat(val.toString().replace(/[$,]/g, ''));
      // If the value is less than 100000, assume it's dollars and convert to cents
      // (most products cost less than $1000)
      return num > 0 ? (num < 100000 ? Math.round(num * 100) : Math.round(num)) : 0;
    };

    cost_cents = toCents(cost_cents);
    msrp_cents = toCents(msrp_cents);
    promo_cost_cents = toCents(promo_cost_cents);
    retail_price_cents = toCents(retail_price_cents);
    map_price_cents = toCents(map_price_cents);

    if (!model) {
      // Check if this row has any price data - if not, it's likely a category header row
      const hasAnyPrice = cost_cents > 0 || msrp_cents > 0 || promo_cost_cents > 0 || retail_price_cents > 0 || map_price_cents > 0;
      if (!hasAnyPrice) {
        // Silently skip category header rows (e.g., "Gas Ranges", "Electric Cooktops")
        return null;
      }
      // Only report error if row has price data but missing model
      errors.push({ row: idx + 2, error: 'Missing MODEL/SKU field', data: row });
      failed++;
      return null;
    }

    successful++;

    // Truncate long text fields to fit database columns
    const truncate = (str, maxLen) => {
      if (!str) return '';
      const s = str.toString().trim();
      return s.length > maxLen ? s.substring(0, maxLen - 3) + '...' : s;
    };

    return {
      manufacturer: manufacturer.toString().trim().toUpperCase(),
      model: model.toString().trim().toUpperCase(),
      name: truncate((name || description || model).toString(), 450),
      description: truncate(description.toString(), 500),
      category: truncate(category.toString() || 'Uncategorized', 255),
      color: truncate(color.toString(), 100),
      cost_cents,
      msrp_cents,
      promo_cost_cents,
      retail_price_cents,
      map_price_cents
    };
  }).filter(Boolean);

  // Import to database - use individual transactions per row to prevent cascade failures
  const client = await pool.connect();
  try {
    for (let i = 0; i < normalizedRecords.length; i++) {
      const row = normalizedRecords[i];

      try {
        const result = await client.query(`
          INSERT INTO products (
            manufacturer, model, name, description, category, color,
            cost_cents, msrp_cents, promo_cost_cents, retail_price_cents, map_price_cents,
            import_source, import_date, import_file_name,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (model)
          DO UPDATE SET
            manufacturer = COALESCE(NULLIF(EXCLUDED.manufacturer, ''), products.manufacturer),
            name = COALESCE(NULLIF(EXCLUDED.name, ''), products.name),
            description = COALESCE(NULLIF(EXCLUDED.description, ''), products.description),
            category = COALESCE(NULLIF(EXCLUDED.category, 'Uncategorized'), products.category),
            color = COALESCE(NULLIF(EXCLUDED.color, ''), products.color),
            cost_cents = CASE WHEN EXCLUDED.cost_cents > 0 THEN EXCLUDED.cost_cents ELSE products.cost_cents END,
            msrp_cents = CASE WHEN EXCLUDED.msrp_cents > 0 THEN EXCLUDED.msrp_cents ELSE products.msrp_cents END,
            promo_cost_cents = CASE WHEN EXCLUDED.promo_cost_cents > 0 THEN EXCLUDED.promo_cost_cents ELSE products.promo_cost_cents END,
            retail_price_cents = CASE WHEN EXCLUDED.retail_price_cents > 0 THEN EXCLUDED.retail_price_cents ELSE products.retail_price_cents END,
            map_price_cents = CASE WHEN EXCLUDED.map_price_cents > 0 THEN EXCLUDED.map_price_cents ELSE products.map_price_cents END,
            import_date = EXCLUDED.import_date,
            import_file_name = EXCLUDED.import_file_name,
            updated_at = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS inserted
        `, [
          row.manufacturer, row.model, row.name, row.description, row.category, row.color,
          row.cost_cents, row.msrp_cents, row.promo_cost_cents, row.retail_price_cents, row.map_price_cents,
          'automatic', filename
        ]);

        if (result.rows.length > 0 && result.rows[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`Error importing row ${i}:`, err.message);
        errors.push({ row: i + 2, error: err.message, data: row });
        failed++;
      }
    }
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

// ============================================
// PRODUCT RECOMMENDATION ROUTES
// ============================================

/**
 * GET /api/products/recommendations/trending
 * Get trending products based on recent sales
 */
router.get('/recommendations/trending', authenticate, asyncHandler(async (req, res) => {
  const { days = 30, limit = 10 } = req.query;
  const trending = await recommendationService.getTrendingProducts(parseInt(days), parseInt(limit));
  res.json({ success: true, data: trending });
}));

/**
 * GET /api/products/:id/recommendations
 * Get all recommendations for a specific product
 */
router.get('/:id/recommendations', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const recommendations = await recommendationService.getAllRecommendations(productId);
  res.json({ success: true, data: recommendations });
}));

/**
 * GET /api/products/:id/recommendations/frequently-bought-together
 * Get products frequently purchased together
 */
router.get('/:id/recommendations/frequently-bought-together', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const { limit = 5 } = req.query;

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const recommendations = await recommendationService.getFrequentlyBoughtTogether(productId, parseInt(limit));
  res.json({ success: true, data: recommendations });
}));

/**
 * GET /api/products/:id/recommendations/customers-also-bought
 * Get "customers who bought X also bought Y" recommendations
 */
router.get('/:id/recommendations/customers-also-bought', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const { limit = 5 } = req.query;

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const recommendations = await recommendationService.getCustomersAlsoBought(productId, parseInt(limit));
  res.json({ success: true, data: recommendations });
}));

/**
 * GET /api/products/:id/recommendations/complementary
 * Get complementary product recommendations
 */
router.get('/:id/recommendations/complementary', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const { limit = 5 } = req.query;

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const recommendations = await recommendationService.getComplementaryProducts(productId, parseInt(limit));
  res.json({ success: true, data: recommendations });
}));

/**
 * GET /api/products/:id/recommendations/alternatives
 * Get alternative products (similar specs, different brand)
 */
router.get('/:id/recommendations/alternatives', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const { limit = 5 } = req.query;

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const recommendations = await recommendationService.getAlternativeProducts(productId, parseInt(limit));
  res.json({ success: true, data: recommendations });
}));

/**
 * GET /api/products/:id/recommendations/bundle
 * Get bundle suggestion for a product
 */
router.get('/:id/recommendations/bundle', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const { maxSize = 3 } = req.query;

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const bundle = await recommendationService.getBundleSuggestions(productId, parseInt(maxSize));
  res.json({ success: true, data: bundle });
}));

/**
 * GET /api/products/recommendations/personalized/:customerId
 * Get personalized recommendations for a customer
 */
router.get('/recommendations/personalized/:customerId', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  const { limit = 10 } = req.query;

  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  const recommendations = await recommendationService.getPersonalizedRecommendations(customerId, parseInt(limit));
  res.json({ success: true, data: recommendations });
}));

module.exports = { router, init };
