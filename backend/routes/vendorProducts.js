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

// ============ PRODUCT BROWSING ============

/**
 * GET /api/vendor-products
 * List vendor products with filters and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
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
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await VendorScraperService.getStats();
  res.json(stats);
}));

/**
 * GET /api/vendor-products/categories
 * Get available categories
 */
router.get('/categories', asyncHandler(async (req, res) => {
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
router.get('/brands', asyncHandler(async (req, res) => {
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
router.get('/search', asyncHandler(async (req, res) => {
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

/**
 * GET /api/vendor-products/:id
 * Get single product details
 */
router.get('/:id', asyncHandler(async (req, res) => {
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
router.get('/:id/images', asyncHandler(async (req, res) => {
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
router.get('/:id/assets', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);

  if (isNaN(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const assets = await VendorScraperService.getProductAssets(productId);
  res.json(assets);
}));

// ============ SCRAPER CONTROL (Admin) ============

/**
 * POST /api/vendor-products/scrape
 * Start a scrape job
 */
router.post('/scrape', asyncHandler(async (req, res) => {
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
        console.log('Single product scrape completed:', result);
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
        await VendorScraperService.updateJobProgress(job.id, {
          productsFound: result?.found || 0,
          productsScraped: result?.scraped || 0,
          productsFailed: result?.failed || 0,
          imagesDownloaded: result?.images || 0
        });
        await VendorScraperService.completeJob(job.id, 'completed');
        await VendorScraperService.updateLastSync(vendorSource.id);
        await VendorScraperService.closeBrowser();
        console.log('Full catalog scrape completed:', result);
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
router.get('/scrape/status', asyncHandler(async (req, res) => {
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
router.get('/scrape/history', asyncHandler(async (req, res) => {
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

// ============ VENDOR SOURCE MANAGEMENT ============

/**
 * GET /api/vendor-sources
 * Get all vendor sources
 */
router.get('/sources', asyncHandler(async (req, res) => {
  const sources = await VendorScraperService.getAllVendorSources();
  res.json(sources);
}));

/**
 * GET /api/vendor-sources/:id
 * Get single vendor source
 */
router.get('/sources/:id', asyncHandler(async (req, res) => {
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
  console.log('Vendor products routes loaded');
};

// Also export router for testing
module.exports.router = router;
