/**
 * Vendor Products API Routes
 * Handles vendor product browsing, scraping, and asset management
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const VendorScraperService = require('../services/VendorScraperService');
const WhirlpoolCentralScraper = require('../scrapers/WhirlpoolCentralScraper');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// ============ PRODUCT BROWSING ============

/**
 * GET /api/vendor-products
 * List vendor products with filters and pagination
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const {
    vendor_source_id,
    category,
    subcategory,
    brand,
    search,
    sort_by = 'name',
    sort_order = 'ASC'
  } = req.query;

  // Validate pagination params
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

  const result = await VendorScraperService.getProducts({
    vendorSourceId: vendor_source_id ? parseInt(vendor_source_id) : null,
    category,
    subcategory,
    brand,
    search,
    page,
    limit,
    sortBy: sort_by,
    sortOrder: sort_order
  });

  res.json(result);
}));

/**
 * GET /api/vendor-products/stats
 * Get overall statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await VendorScraperService.getStats();
  res.json(stats);
}));

/**
 * GET /api/vendor-products/categories
 * Get available categories
 */
router.get('/categories', authenticate, asyncHandler(async (req, res) => {
  const { vendor_source_id } = req.query;
  const categories = await VendorScraperService.getCategories(
    vendor_source_id ? parseInt(vendor_source_id) : null
  );
  res.json(categories);
}));

/**
 * GET /api/vendor-products/brands
 * Get available brands
 */
router.get('/brands', authenticate, asyncHandler(async (req, res) => {
  const { vendor_source_id } = req.query;
  const brands = await VendorScraperService.getBrands(
    vendor_source_id ? parseInt(vendor_source_id) : null
  );
  res.json(brands);
}));

/**
 * GET /api/vendor-products/search
 * Search products
 */
router.get('/search', authenticate, asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q) {
    throw ApiError.badRequest('Search query is required');
  }

  // Validate pagination params
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

  const result = await VendorScraperService.getProducts({
    search: q,
    page,
    limit
  });

  res.json(result);
}));

// ============ SCRAPER CONTROL (Admin) ============
// NOTE: These routes MUST be defined before /:id to avoid route conflicts

/**
 * POST /api/vendor-products/scrape
 * Start a scrape job
 */
router.post('/scrape', authenticate, asyncHandler(async (req, res) => {
  const {
    vendor = 'whirlpool',
    job_type = 'full',
    categories = null,
    model_number = null,
    download_images = true,
    max_products = 500
  } = req.body;

  // Get vendor source
  const vendorSource = await VendorScraperService.getVendorSourceByName(vendor);

  if (!vendorSource) {
    throw ApiError.notFound(`Vendor: ${vendor}`);
  }

  // Create page for scraper
  const page = await VendorScraperService.createPage();

  // Initialize scraper based on vendor
  let scraper;
  if (vendor.toLowerCase().includes('whirlpool')) {
    scraper = new WhirlpoolCentralScraper(page, vendorSource);
  } else {
    throw ApiError.badRequest(`Unsupported vendor: ${vendor}`);
  }

  // Start scrape in background with proper job tracking
  if (job_type === 'single_product' && model_number) {
    // Create job record first
    const job = await VendorScraperService.startScrapeJob(vendorSource.id, 'single_product');

    // Single product scrape with status tracking
    scraper.scrapeSingleProduct(model_number, { downloadImages: download_images })
      .then(async (result) => {
        await VendorScraperService.updateJobProgress(job.id, {
          productsFound: 1,
          productsScraped: 1,
          productsFailed: 0,
          imagesDownloaded: result?.images?.length || 0
        });
        await VendorScraperService.completeJob(job.id, 'completed');
        await VendorScraperService.updateLastSync(vendorSource.id);
        await VendorScraperService.closeBrowser();
      })
      .catch(async (err) => {
        await VendorScraperService.completeJob(job.id, 'failed', err.message);
        await VendorScraperService.closeBrowser();
        console.error('Single product scrape failed:', err);
      });

    res.json({
      message: `Started single product scrape for ${model_number}`,
      vendor: vendorSource.name,
      jobId: job.id
    });

  } else {
    // Create job record first
    const job = await VendorScraperService.startScrapeJob(vendorSource.id, job_type);

    // Full or category scrape with status tracking
    scraper.scrapeFullCatalog({
      categories,
      maxProductsPerCategory: max_products,
      downloadImages: download_images
    })
      .then(async (result) => {
        // Extract stats from scraper result (stats object contains camelCase properties)
        const stats = result?.stats || {};
        await VendorScraperService.updateJobProgress(job.id, {
          productsFound: stats.productsFound || 0,
          productsScraped: stats.productsScraped || 0,
          productsFailed: stats.productsFailed || 0,
          imagesDownloaded: stats.imagesDownloaded || 0
        });
        await VendorScraperService.completeJob(job.id, 'completed');
        await VendorScraperService.updateLastSync(vendorSource.id);
        await VendorScraperService.closeBrowser();
        console.log(`✅ Scrape completed: ${stats.productsScraped || 0} products, ${stats.imagesDownloaded || 0} images`);
      })
      .catch(async (err) => {
        await VendorScraperService.completeJob(job.id, 'failed', err.message);
        await VendorScraperService.closeBrowser();
        console.error('Full catalog scrape failed:', err);
      });

    res.json({
      message: `Started ${job_type} scrape`,
      vendor: vendorSource.name,
      categories: categories || 'all',
      jobId: job.id
    });
  }
}));

/**
 * GET /api/vendor-products/scrape/status
 * Get status of current/recent scrape jobs
 */
router.get('/scrape/status', authenticate, asyncHandler(async (req, res) => {
  const { vendor_source_id, job_id } = req.query;

  if (job_id) {
    const job = await VendorScraperService.getJobStatus(parseInt(job_id));
    return res.json(job);
  }

  // Get all vendor sources
  const sources = await VendorScraperService.getAllVendorSources();
  const status = [];

  for (const source of sources) {
    const jobs = await VendorScraperService.getJobHistory(source.id, 5);
    status.push({
      vendor: source.name,
      lastSync: source.last_sync,
      recentJobs: jobs
    });
  }

  res.json(status);
}));

/**
 * GET /api/vendor-products/scrape/history
 * Get scrape job history
 */
router.get('/scrape/history', authenticate, asyncHandler(async (req, res) => {
  const { vendor_source_id, limit = 20 } = req.query;

  if (!vendor_source_id) {
    throw ApiError.badRequest('vendor_source_id is required');
  }

  const history = await VendorScraperService.getJobHistory(
    parseInt(vendor_source_id),
    parseInt(limit)
  );

  res.json(history);
}));

// ============ MANUAL PRODUCT IMPORT ============

/**
 * POST /api/vendor-products/manual-import
 * Manually import a product with images (for use with AI assistants like Comet)
 *
 * Body: {
 *   vendor: string (e.g., 'whirlpool'),
 *   modelNumber: string,
 *   name: string,
 *   description?: string,
 *   category?: string,
 *   subcategory?: string,
 *   brand?: string,
 *   msrp?: number (in dollars),
 *   dealerPrice?: number (in dollars),
 *   specifications?: object,
 *   features?: array,
 *   dimensions?: object,
 *   imageUrls?: array of strings (URLs to download images from)
 * }
 */
router.post('/manual-import', authenticate, asyncHandler(async (req, res) => {
  const {
    vendor = 'whirlpool',
    modelNumber,
    name,
    description,
    category,
    subcategory,
    brand,
    msrp,
    dealerPrice,
    specifications,
    features,
    dimensions,
    imageUrls = []
  } = req.body;

  if (!modelNumber || !name) {
    throw ApiError.badRequest('modelNumber and name are required');
  }

  // Get or create vendor source
  let vendorSource = await VendorScraperService.getVendorSourceByName(vendor);

  if (!vendorSource) {
    // Create a generic vendor source for manual imports
    const pool = require('../db');
    const result = await pool.query(
      `INSERT INTO vendor_sources (name, base_url, requires_auth, is_active)
       VALUES ($1, $2, false, true)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [vendor, `https://${vendor.toLowerCase().replace(/\s+/g, '')}.com`]
    );
    vendorSource = result.rows[0];
  }

  // Upsert the product
  const product = await VendorScraperService.upsertProduct(vendorSource.id, {
    externalId: `manual-${modelNumber}`,
    modelNumber,
    name,
    description,
    category,
    subcategory,
    brand,
    msrpCents: msrp ? Math.round(msrp * 100) : null,
    dealerPriceCents: dealerPrice ? Math.round(dealerPrice * 100) : null,
    specifications,
    features,
    dimensions
  });

  // Download and process images if URLs provided
  const processedImages = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    try {
      const imageResult = await VendorScraperService.processAndSaveImage(product, {
        url,
        imageType: i === 0 ? 'primary' : 'gallery',
        sortOrder: i,
        isPrimary: i === 0
      });
      if (imageResult) {
        processedImages.push(imageResult);
      }
    } catch (err) {
      console.error(`Failed to process image ${url}:`, err.message);
    }
  }

  res.json({
    success: true,
    message: `Product "${name}" imported successfully`,
    product: {
      id: product.id,
      modelNumber: product.model_number,
      name: product.name,
      category: product.category,
      brand: product.brand
    },
    imagesProcessed: processedImages.length
  });
}));

/**
 * POST /api/vendor-products/manual-import/bulk
 * Bulk import multiple products (JSON array)
 */
router.post('/manual-import/bulk', authenticate, asyncHandler(async (req, res) => {
  const { products } = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    throw ApiError.badRequest('products array is required');
  }

  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const productData of products) {
    try {
      const {
        vendor = 'whirlpool',
        modelNumber,
        name,
        description,
        category,
        subcategory,
        brand,
        msrp,
        dealerPrice,
        specifications,
        features,
        dimensions,
        imageUrls = []
      } = productData;

      if (!modelNumber || !name) {
        results.failed++;
        results.errors.push({ modelNumber, error: 'modelNumber and name are required' });
        continue;
      }

      let vendorSource = await VendorScraperService.getVendorSourceByName(vendor);
      if (!vendorSource) {
        const pool = require('../db');
        const result = await pool.query(
          `INSERT INTO vendor_sources (name, base_url, requires_auth, is_active)
           VALUES ($1, $2, false, true)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING *`,
          [vendor, `https://${vendor.toLowerCase().replace(/\s+/g, '')}.com`]
        );
        vendorSource = result.rows[0];
      }

      const product = await VendorScraperService.upsertProduct(vendorSource.id, {
        externalId: `manual-${modelNumber}`,
        modelNumber,
        name,
        description,
        category,
        subcategory,
        brand,
        msrpCents: msrp ? Math.round(msrp * 100) : null,
        dealerPriceCents: dealerPrice ? Math.round(dealerPrice * 100) : null,
        specifications,
        features,
        dimensions
      });

      // Process images
      for (let i = 0; i < imageUrls.length; i++) {
        try {
          await VendorScraperService.processAndSaveImage(product, {
            url: imageUrls[i],
            imageType: i === 0 ? 'primary' : 'gallery',
            sortOrder: i,
            isPrimary: i === 0
          });
        } catch (err) {
          console.error(`Failed to process image for ${modelNumber}:`, err.message);
        }
      }

      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ modelNumber: productData.modelNumber, error: err.message });
    }
  }

  res.json({
    message: `Bulk import completed: ${results.success} succeeded, ${results.failed} failed`,
    ...results
  });
}));

// ============ PRICING UPDATE ============

/**
 * POST /api/vendor-products/bulk-pricing
 * Bulk update pricing for products by model number
 *
 * Body: {
 *   updates: [
 *     { modelNumber: "WFW9620HW", msrp: 1299.99, dealerPrice: 999.99 },
 *     { modelNumber: "WED9620HW", msrp: 1199.99, dealerPrice: 899.99 }
 *   ]
 * }
 *
 * Or CSV format in body.csv:
 *   "modelNumber,msrp,dealerPrice\nWFW9620HW,1299.99,999.99\nWED9620HW,1199.99,899.99"
 */
router.post('/bulk-pricing', authenticate, asyncHandler(async (req, res) => {
  const pool = require('../db');
  let updates = req.body.updates;

  // If CSV format provided, parse it
  if (req.body.csv) {
    updates = [];
    const lines = req.body.csv.trim().split('\n');
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());

    const modelIdx = headers.indexOf('modelnumber') >= 0 ? headers.indexOf('modelnumber') : headers.indexOf('model');
    const msrpIdx = headers.indexOf('msrp');
    const dealerIdx = headers.indexOf('dealerprice') >= 0 ? headers.indexOf('dealerprice') : headers.indexOf('dealer');

    if (modelIdx < 0) {
      throw ApiError.badRequest('CSV must have a modelNumber or model column');
    }

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values[modelIdx]) {
        updates.push({
          modelNumber: values[modelIdx],
          msrp: msrpIdx >= 0 && values[msrpIdx] ? parseFloat(values[msrpIdx]) : null,
          dealerPrice: dealerIdx >= 0 && values[dealerIdx] ? parseFloat(values[dealerIdx]) : null
        });
      }
    }
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    throw ApiError.badRequest('updates array is required (or csv string)');
  }

  const results = {
    updated: 0,
    notFound: 0,
    errors: [],
    details: []
  };

  for (const update of updates) {
    const { modelNumber, msrp, dealerPrice } = update;

    if (!modelNumber) {
      results.errors.push({ modelNumber: null, error: 'modelNumber is required' });
      continue;
    }

    try {
      // Find and update product by model number
      const result = await pool.query(`
        UPDATE vendor_products
        SET
          msrp_cents = COALESCE($2, msrp_cents),
          dealer_price_cents = COALESCE($3, dealer_price_cents),
          updated_at = CURRENT_TIMESTAMP
        WHERE model_number ILIKE $1
        RETURNING id, model_number, msrp_cents, dealer_price_cents
      `, [
        modelNumber,
        msrp ? Math.round(msrp * 100) : null,
        dealerPrice ? Math.round(dealerPrice * 100) : null
      ]);

      if (result.rows.length > 0) {
        results.updated++;
        results.details.push({
          modelNumber,
          status: 'updated',
          msrp,
          dealerPrice
        });
      } else {
        results.notFound++;
        results.details.push({
          modelNumber,
          status: 'not_found'
        });
      }
    } catch (err) {
      results.errors.push({ modelNumber, error: err.message });
    }
  }

  res.json({
    message: `Pricing update completed: ${results.updated} updated, ${results.notFound} not found, ${results.errors.length} errors`,
    ...results
  });
}));

/**
 * GET /api/vendor-products/export
 * Export all products as JSON (for backup or transfer)
 */
router.get('/export', authenticate, asyncHandler(async (req, res) => {
  const pool = require('../db');
  const { format = 'json', category, brand } = req.query;

  let query = `
    SELECT
      vp.model_number,
      vp.name,
      vp.brand,
      vp.category,
      vp.subcategory,
      vp.description,
      vp.msrp_cents,
      vp.dealer_price_cents,
      vp.specifications,
      vp.features,
      vs.name as vendor
    FROM vendor_products vp
    JOIN vendor_sources vs ON vp.vendor_source_id = vs.id
    WHERE vp.is_active = true
  `;
  const params = [];

  if (category) {
    params.push(`%${category}%`);
    query += ` AND vp.category ILIKE $${params.length}`;
  }

  if (brand) {
    params.push(`%${brand}%`);
    query += ` AND vp.brand ILIKE $${params.length}`;
  }

  query += ' ORDER BY vp.category, vp.brand, vp.model_number';

  const result = await pool.query(query, params);

  // Format for export
  const products = result.rows.map(row => ({
    vendor: row.vendor,
    modelNumber: row.model_number,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    msrp: row.msrp_cents ? row.msrp_cents / 100 : null,
    dealerPrice: row.dealer_price_cents ? row.dealer_price_cents / 100 : null,
    specifications: row.specifications,
    features: row.features
  }));

  if (format === 'csv') {
    // Generate CSV
    const headers = 'modelNumber,name,brand,category,subcategory,msrp,dealerPrice\n';
    const rows = products.map(p =>
      `"${p.modelNumber}","${(p.name || '').replace(/"/g, '""')}","${p.brand || ''}","${p.category || ''}","${p.subcategory || ''}",${p.msrp || ''},${p.dealerPrice || ''}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vendor_products.csv');
    res.send(headers + rows);
  } else {
    res.json({
      count: products.length,
      products
    });
  }
}));

// ============ PRODUCT DETAIL ROUTES ============
// NOTE: /:id routes must come AFTER all named routes like /scrape, /stats, etc.

/**
 * GET /api/vendor-products/:id
 * Get single product details
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const product = await VendorScraperService.getProduct(productId);

  if (!product) {
    throw ApiError.notFound('Product');
  }

  // Include images and assets
  const images = await VendorScraperService.getProductImages(product.id);
  const assets = await VendorScraperService.getProductAssets(product.id);

  res.json({
    ...product,
    images,
    assets
  });
}));

/**
 * GET /api/vendor-products/:id/images
 * Get all images for a product
 */
router.get('/:id/images', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const { type } = req.query;

  let images;
  if (type) {
    images = await VendorScraperService.getProductImagesByType(productId, type);
  } else {
    images = await VendorScraperService.getProductImages(productId);
  }

  res.json(images);
}));

/**
 * GET /api/vendor-products/:id/assets
 * Get all assets for a product
 */
router.get('/:id/assets', authenticate, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const assets = await VendorScraperService.getProductAssets(productId);
  res.json(assets);
}));

// ============ VENDOR SOURCE MANAGEMENT ============

/**
 * GET /api/vendor-sources
 * Get all vendor sources
 */
router.get('/sources', authenticate, asyncHandler(async (req, res) => {
  const sources = await VendorScraperService.getAllVendorSources();
  res.json(sources);
}));

/**
 * GET /api/vendor-sources/:id
 * Get single vendor source
 */
router.get('/sources/:id', authenticate, asyncHandler(async (req, res) => {
  const sourceId = parseInt(req.params.id);

  if (isNaN(sourceId)) {
    throw ApiError.badRequest('Invalid vendor source ID');
  }

  const source = await VendorScraperService.getVendorSource(sourceId);

  if (!source) {
    throw ApiError.notFound('Vendor source');
  }

  res.json(source);
}));

// Module initialization for Express
module.exports = function(app) {
  app.use('/api/vendor-products', router);
  app.use('/api/vendor-sources', router);
};

// Also export router for testing
module.exports.router = router;
