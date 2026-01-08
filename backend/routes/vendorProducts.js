/**
 * Vendor Products API Routes
 *
 * Endpoints for browsing scraped vendor products, images, and managing scrape jobs.
 */

const express = require('express');
const router = express.Router();
const VendorScraperService = require('../services/VendorScraperService');
const WhirlpoolCentralScraper = require('../scrapers/WhirlpoolCentralScraper');

// ============ PRODUCT BROWSING ============

/**
 * GET /api/vendor-products
 * List vendor products with filters and pagination
 */
router.get('/', async (req, res) => {
  try {
    const {
      vendor_source_id,
      category,
      subcategory,
      brand,
      search,
      page = 1,
      limit = 50,
      sort_by = 'name',
      sort_order = 'ASC'
    } = req.query;

    const result = await VendorScraperService.getProducts({
      vendorSourceId: vendor_source_id ? parseInt(vendor_source_id) : null,
      category,
      subcategory,
      brand,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy: sort_by,
      sortOrder: sort_order
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching vendor products:', error);
    res.status(500).json({ error: 'Failed to fetch vendor products' });
  }
});

/**
 * GET /api/vendor-products/stats
 * Get overall statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await VendorScraperService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/vendor-products/categories
 * Get available categories
 */
router.get('/categories', async (req, res) => {
  try {
    const { vendor_source_id } = req.query;
    const categories = await VendorScraperService.getCategories(
      vendor_source_id ? parseInt(vendor_source_id) : null
    );
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/vendor-products/brands
 * Get available brands
 */
router.get('/brands', async (req, res) => {
  try {
    const { vendor_source_id } = req.query;
    const brands = await VendorScraperService.getBrands(
      vendor_source_id ? parseInt(vendor_source_id) : null
    );
    res.json(brands);
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

/**
 * GET /api/vendor-products/search
 * Search products
 */
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const result = await VendorScraperService.getProducts({
      search: q,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(result);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/vendor-products/:id
 * Get single product details
 */
router.get('/:id', async (req, res) => {
  try {
    const product = await VendorScraperService.getProduct(parseInt(req.params.id));

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Include images and assets
    const images = await VendorScraperService.getProductImages(product.id);
    const assets = await VendorScraperService.getProductAssets(product.id);

    res.json({
      ...product,
      images,
      assets
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * GET /api/vendor-products/:id/images
 * Get all images for a product
 */
router.get('/:id/images', async (req, res) => {
  try {
    const { type } = req.query;

    let images;
    if (type) {
      images = await VendorScraperService.getProductImagesByType(parseInt(req.params.id), type);
    } else {
      images = await VendorScraperService.getProductImages(parseInt(req.params.id));
    }

    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

/**
 * GET /api/vendor-products/:id/assets
 * Get all assets for a product
 */
router.get('/:id/assets', async (req, res) => {
  try {
    const assets = await VendorScraperService.getProductAssets(parseInt(req.params.id));
    res.json(assets);
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// ============ SCRAPER CONTROL (Admin) ============

/**
 * POST /api/vendor-products/scrape
 * Start a scrape job
 */
router.post('/scrape', async (req, res) => {
  try {
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
      return res.status(404).json({ error: `Vendor not found: ${vendor}` });
    }

    // Create page for scraper
    const page = await VendorScraperService.createPage();

    // Initialize scraper based on vendor
    let scraper;
    if (vendor.toLowerCase().includes('whirlpool')) {
      scraper = new WhirlpoolCentralScraper(page, vendorSource);
    } else {
      return res.status(400).json({ error: `Unsupported vendor: ${vendor}` });
    }

    // Start scrape in background
    if (job_type === 'single_product' && model_number) {
      // Single product scrape
      scraper.scrapeSingleProduct(model_number, { downloadImages: download_images })
        .then(result => console.log('Single product scrape completed:', result))
        .catch(err => console.error('Single product scrape failed:', err))
        .finally(() => VendorScraperService.closeBrowser());

      res.json({
        message: `Started single product scrape for ${model_number}`,
        vendor: vendorSource.name
      });

    } else {
      // Full or category scrape
      scraper.scrapeFullCatalog({
        categories,
        maxProductsPerCategory: max_products,
        downloadImages: download_images
      })
        .then(result => console.log('Full catalog scrape completed:', result))
        .catch(err => console.error('Full catalog scrape failed:', err))
        .finally(() => VendorScraperService.closeBrowser());

      res.json({
        message: `Started ${job_type} scrape`,
        vendor: vendorSource.name,
        categories: categories || 'all'
      });
    }

  } catch (error) {
    console.error('Error starting scrape:', error);
    res.status(500).json({ error: 'Failed to start scrape job' });
  }
});

/**
 * GET /api/vendor-products/scrape/status
 * Get status of current/recent scrape jobs
 */
router.get('/scrape/status', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error fetching scrape status:', error);
    res.status(500).json({ error: 'Failed to fetch scrape status' });
  }
});

/**
 * GET /api/vendor-products/scrape/history
 * Get scrape job history
 */
router.get('/scrape/history', async (req, res) => {
  try {
    const { vendor_source_id, limit = 20 } = req.query;

    if (!vendor_source_id) {
      return res.status(400).json({ error: 'vendor_source_id required' });
    }

    const history = await VendorScraperService.getJobHistory(
      parseInt(vendor_source_id),
      parseInt(limit)
    );

    res.json(history);
  } catch (error) {
    console.error('Error fetching job history:', error);
    res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

// ============ VENDOR SOURCE MANAGEMENT ============

/**
 * GET /api/vendor-sources
 * Get all vendor sources
 */
router.get('/sources', async (req, res) => {
  try {
    const sources = await VendorScraperService.getAllVendorSources();
    res.json(sources);
  } catch (error) {
    console.error('Error fetching vendor sources:', error);
    res.status(500).json({ error: 'Failed to fetch vendor sources' });
  }
});

/**
 * GET /api/vendor-sources/:id
 * Get single vendor source
 */
router.get('/sources/:id', async (req, res) => {
  try {
    const source = await VendorScraperService.getVendorSource(parseInt(req.params.id));

    if (!source) {
      return res.status(404).json({ error: 'Vendor source not found' });
    }

    res.json(source);
  } catch (error) {
    console.error('Error fetching vendor source:', error);
    res.status(500).json({ error: 'Failed to fetch vendor source' });
  }
});

// Module initialization for Express
module.exports = function(app) {
  app.use('/api/vendor-products', router);
  app.use('/api/vendor-sources', router);
  console.log('Vendor products routes loaded');
};

// Also export router for testing
module.exports.router = router;
