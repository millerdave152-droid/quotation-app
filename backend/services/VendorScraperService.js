/**
 * VendorScraperService
 *
 * Core service for scraping vendor product data from manufacturer portals.
 * Handles authentication, rate limiting, image processing, and job management.
 */

const pool = require('../db');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const http = require('http');

class VendorScraperService {
  constructor() {
    this.browser = null;
    this.currentSession = null;
    this.imagesDir = path.join(__dirname, '..', 'public', 'vendor-images');
  }

  // ============ BROWSER MANAGEMENT ============

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async createPage() {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set default timeout
    page.setDefaultTimeout(30000);

    return page;
  }

  // ============ VENDOR SOURCE MANAGEMENT ============

  async getVendorSource(vendorSourceId) {
    const result = await pool.query(
      'SELECT * FROM vendor_sources WHERE id = $1',
      [vendorSourceId]
    );
    return result.rows[0];
  }

  async getVendorSourceByName(name) {
    const result = await pool.query(
      'SELECT * FROM vendor_sources WHERE name ILIKE $1',
      [`%${name}%`]
    );
    return result.rows[0];
  }

  async getAllVendorSources() {
    const result = await pool.query(
      'SELECT * FROM vendor_sources WHERE is_active = true ORDER BY name'
    );
    return result.rows;
  }

  async updateLastSync(vendorSourceId) {
    await pool.query(
      'UPDATE vendor_sources SET last_sync = CURRENT_TIMESTAMP WHERE id = $1',
      [vendorSourceId]
    );
  }

  // ============ RATE LIMITING ============

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async respectRateLimit(vendorSource) {
    const rateLimit = vendorSource.rate_limit_ms || 2000;
    await this.delay(rateLimit);
  }

  // ============ JOB MANAGEMENT ============

  async startScrapeJob(vendorSourceId, jobType) {
    const result = await pool.query(
      `INSERT INTO scrape_jobs (vendor_source_id, job_type, status, started_at)
       VALUES ($1, $2, 'running', CURRENT_TIMESTAMP)
       RETURNING *`,
      [vendorSourceId, jobType]
    );
    return result.rows[0];
  }

  async updateJobProgress(jobId, stats) {
    const { productsFound, productsScraped, productsFailed, imagesDownloaded } = stats;
    await pool.query(
      `UPDATE scrape_jobs SET
        products_found = COALESCE($2, products_found),
        products_scraped = COALESCE($3, products_scraped),
        products_failed = COALESCE($4, products_failed),
        images_downloaded = COALESCE($5, images_downloaded)
       WHERE id = $1`,
      [jobId, productsFound, productsScraped, productsFailed, imagesDownloaded]
    );
  }

  async completeJob(jobId, status, errorLog = null) {
    await pool.query(
      `UPDATE scrape_jobs SET
        status = $2,
        completed_at = CURRENT_TIMESTAMP,
        error_log = $3
       WHERE id = $1`,
      [jobId, status, errorLog]
    );
  }

  async getJobStatus(jobId) {
    const result = await pool.query(
      'SELECT * FROM scrape_jobs WHERE id = $1',
      [jobId]
    );
    return result.rows[0];
  }

  async getJobHistory(vendorSourceId, limit = 10) {
    const result = await pool.query(
      `SELECT * FROM scrape_jobs
       WHERE vendor_source_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [vendorSourceId, limit]
    );
    return result.rows;
  }

  // ============ PRODUCT MANAGEMENT ============

  async upsertProduct(vendorSourceId, productData) {
    const {
      externalId,
      modelNumber,
      name,
      description,
      category,
      subcategory,
      brand,
      msrpCents,
      dealerPriceCents,
      specifications,
      features,
      dimensions,
      energyRating,
      colorFinish
    } = productData;

    const result = await pool.query(
      `INSERT INTO vendor_products (
        vendor_source_id, external_id, model_number, name, description,
        category, subcategory, brand, msrp_cents, dealer_price_cents,
        specifications, features, dimensions, energy_rating, color_finish,
        last_scraped, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (vendor_source_id, model_number)
      DO UPDATE SET
        external_id = COALESCE(EXCLUDED.external_id, vendor_products.external_id),
        name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, vendor_products.description),
        category = COALESCE(EXCLUDED.category, vendor_products.category),
        subcategory = COALESCE(EXCLUDED.subcategory, vendor_products.subcategory),
        brand = COALESCE(EXCLUDED.brand, vendor_products.brand),
        msrp_cents = COALESCE(EXCLUDED.msrp_cents, vendor_products.msrp_cents),
        dealer_price_cents = COALESCE(EXCLUDED.dealer_price_cents, vendor_products.dealer_price_cents),
        specifications = COALESCE(EXCLUDED.specifications, vendor_products.specifications),
        features = COALESCE(EXCLUDED.features, vendor_products.features),
        dimensions = COALESCE(EXCLUDED.dimensions, vendor_products.dimensions),
        energy_rating = COALESCE(EXCLUDED.energy_rating, vendor_products.energy_rating),
        color_finish = COALESCE(EXCLUDED.color_finish, vendor_products.color_finish),
        last_scraped = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        vendorSourceId, externalId, modelNumber, name, description,
        category, subcategory, brand, msrpCents, dealerPriceCents,
        JSON.stringify(specifications || {}),
        JSON.stringify(features || []),
        JSON.stringify(dimensions || {}),
        energyRating, colorFinish
      ]
    );

    return result.rows[0];
  }

  async getProduct(productId) {
    const result = await pool.query(
      `SELECT vp.*, vs.name as vendor_name
       FROM vendor_products vp
       JOIN vendor_sources vs ON vp.vendor_source_id = vs.id
       WHERE vp.id = $1`,
      [productId]
    );
    return result.rows[0];
  }

  async getProducts(filters = {}) {
    const {
      vendorSourceId,
      category,
      subcategory,
      brand,
      search,
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'ASC'
    } = filters;

    let query = `
      SELECT vp.*, vs.name as vendor_name,
        (SELECT COUNT(*) FROM vendor_product_images WHERE vendor_product_id = vp.id) as image_count
      FROM vendor_products vp
      JOIN vendor_sources vs ON vp.vendor_source_id = vs.id
      WHERE vp.is_active = true
    `;
    const params = [];
    let paramCount = 0;

    if (vendorSourceId) {
      paramCount++;
      query += ` AND vp.vendor_source_id = $${paramCount}`;
      params.push(vendorSourceId);
    }

    if (category) {
      paramCount++;
      query += ` AND vp.category ILIKE $${paramCount}`;
      params.push(`%${category}%`);
    }

    if (subcategory) {
      paramCount++;
      query += ` AND vp.subcategory ILIKE $${paramCount}`;
      params.push(`%${subcategory}%`);
    }

    if (brand) {
      paramCount++;
      query += ` AND vp.brand ILIKE $${paramCount}`;
      params.push(`%${brand}%`);
    }

    if (search) {
      paramCount++;
      query += ` AND (vp.name ILIKE $${paramCount} OR vp.model_number ILIKE $${paramCount} OR vp.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Add sorting
    const validSortColumns = ['name', 'model_number', 'brand', 'category', 'msrp_cents', 'created_at', 'updated_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    query += ` ORDER BY vp.${sortColumn} ${order}`;

    // Add pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM vendor_products vp
      WHERE vp.is_active = true
    `;
    const countParams = [];
    let countParamIdx = 0;

    if (vendorSourceId) {
      countParamIdx++;
      countQuery += ` AND vp.vendor_source_id = $${countParamIdx}`;
      countParams.push(vendorSourceId);
    }
    if (category) {
      countParamIdx++;
      countQuery += ` AND vp.category ILIKE $${countParamIdx}`;
      countParams.push(`%${category}%`);
    }
    if (subcategory) {
      countParamIdx++;
      countQuery += ` AND vp.subcategory ILIKE $${countParamIdx}`;
      countParams.push(`%${subcategory}%`);
    }
    if (brand) {
      countParamIdx++;
      countQuery += ` AND vp.brand ILIKE $${countParamIdx}`;
      countParams.push(`%${brand}%`);
    }
    if (search) {
      countParamIdx++;
      countQuery += ` AND (vp.name ILIKE $${countParamIdx} OR vp.model_number ILIKE $${countParamIdx} OR vp.description ILIKE $${countParamIdx})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return {
      products: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getCategories(vendorSourceId = null) {
    let query = `
      SELECT DISTINCT category, COUNT(*) as count
      FROM vendor_products
      WHERE is_active = true AND category IS NOT NULL
    `;
    const params = [];

    if (vendorSourceId) {
      query += ` AND vendor_source_id = $1`;
      params.push(vendorSourceId);
    }

    query += ` GROUP BY category ORDER BY category`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  async getBrands(vendorSourceId = null) {
    let query = `
      SELECT DISTINCT brand, COUNT(*) as count
      FROM vendor_products
      WHERE is_active = true AND brand IS NOT NULL
    `;
    const params = [];

    if (vendorSourceId) {
      query += ` AND vendor_source_id = $1`;
      params.push(vendorSourceId);
    }

    query += ` GROUP BY brand ORDER BY brand`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  // ============ IMAGE MANAGEMENT ============

  async ensureImageDirectory(vendorName, modelNumber) {
    const dir = path.join(this.imagesDir, this.sanitizeFilename(vendorName), this.sanitizeFilename(modelNumber));

    await fs.mkdir(path.join(dir, 'original'), { recursive: true });
    await fs.mkdir(path.join(dir, 'thumbnail'), { recursive: true });
    await fs.mkdir(path.join(dir, 'web'), { recursive: true });
    await fs.mkdir(path.join(dir, 'print'), { recursive: true });

    return dir;
  }

  sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
  }

  async downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, { timeout: 30000 }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          return this.downloadImage(response.headers.location, destPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            await fs.writeFile(destPath, buffer);
            resolve({ size: buffer.length, path: destPath });
          } catch (err) {
            reject(err);
          }
        });
        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async generateResolutions(originalPath, outputDir, filename) {
    const sizes = {
      thumbnail: { width: 150, height: 150, fit: 'cover' },
      web: { width: 800, height: 800, fit: 'inside' },
      print: { width: 2000, height: 2000, fit: 'inside' }
    };

    const results = {};

    for (const [sizeName, options] of Object.entries(sizes)) {
      const outputPath = path.join(outputDir, sizeName, filename);
      try {
        await sharp(originalPath)
          .resize(options.width, options.height, { fit: options.fit })
          .jpeg({ quality: 85 })
          .toFile(outputPath);
        results[sizeName] = outputPath;
      } catch (err) {
        console.error(`Failed to generate ${sizeName} for ${filename}:`, err.message);
      }
    }

    return results;
  }

  async processAndSaveImage(vendorProduct, imageData) {
    const {
      url,
      imageType = 'gallery',
      angle = null,
      altText = null,
      sortOrder = 0,
      isPrimary = false
    } = imageData;

    try {
      // Get vendor name for directory structure
      const vendorResult = await pool.query(
        'SELECT name FROM vendor_sources WHERE id = $1',
        [vendorProduct.vendor_source_id]
      );
      const vendorName = vendorResult.rows[0]?.name || 'unknown';

      // Ensure directory exists
      const baseDir = await this.ensureImageDirectory(vendorName, vendorProduct.model_number);

      // Generate filename
      const ext = path.extname(new URL(url).pathname) || '.jpg';
      const filename = `${imageType}-${angle || sortOrder}${ext}`;
      const originalPath = path.join(baseDir, 'original', filename);

      // Download image
      const downloadResult = await this.downloadImage(url, originalPath);

      // Get image dimensions
      const metadata = await sharp(originalPath).metadata();

      // Generate resolutions
      const jpgFilename = filename.replace(ext, '.jpg');
      const resolutions = await this.generateResolutions(originalPath, baseDir, jpgFilename);

      // Convert paths to relative URLs
      const relativeBase = `/vendor-images/${this.sanitizeFilename(vendorName)}/${this.sanitizeFilename(vendorProduct.model_number)}`;

      // Save to database
      const result = await pool.query(
        `INSERT INTO vendor_product_images (
          vendor_product_id, image_type, angle, original_url, local_path,
          thumbnail_path, web_path, print_path, alt_text, sort_order,
          is_primary, file_size_bytes, width, height
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          vendorProduct.id,
          imageType,
          angle,
          url,
          `${relativeBase}/original/${filename}`,
          resolutions.thumbnail ? `${relativeBase}/thumbnail/${jpgFilename}` : null,
          resolutions.web ? `${relativeBase}/web/${jpgFilename}` : null,
          resolutions.print ? `${relativeBase}/print/${jpgFilename}` : null,
          altText,
          sortOrder,
          isPrimary,
          downloadResult.size,
          metadata.width,
          metadata.height
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error(`Failed to process image ${url}:`, error.message);
      return null;
    }
  }

  async getProductImages(productId) {
    const result = await pool.query(
      `SELECT * FROM vendor_product_images
       WHERE vendor_product_id = $1
       ORDER BY is_primary DESC, sort_order ASC`,
      [productId]
    );
    return result.rows;
  }

  async getProductImagesByType(productId, imageType) {
    const result = await pool.query(
      `SELECT * FROM vendor_product_images
       WHERE vendor_product_id = $1 AND image_type = $2
       ORDER BY sort_order ASC`,
      [productId, imageType]
    );
    return result.rows;
  }

  // ============ ASSET MANAGEMENT ============

  async saveProductAsset(vendorProductId, assetData) {
    const { assetType, name, url, localPath, fileSize, mimeType } = assetData;

    const result = await pool.query(
      `INSERT INTO vendor_product_assets (
        vendor_product_id, asset_type, name, original_url, local_path, file_size_bytes, mime_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
      RETURNING *`,
      [vendorProductId, assetType, name, url, localPath, fileSize, mimeType]
    );

    return result.rows[0];
  }

  async getProductAssets(productId) {
    const result = await pool.query(
      `SELECT * FROM vendor_product_assets
       WHERE vendor_product_id = $1
       ORDER BY asset_type, name`,
      [productId]
    );
    return result.rows;
  }

  // ============ STATISTICS ============

  async getStats() {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM vendor_sources WHERE is_active = true) as vendor_count,
        (SELECT COUNT(*) FROM vendor_products WHERE is_active = true) as product_count,
        (SELECT COUNT(*) FROM vendor_product_images) as image_count,
        (SELECT COUNT(*) FROM vendor_product_assets) as asset_count,
        (SELECT COUNT(*) FROM scrape_jobs WHERE status = 'running') as running_jobs,
        (SELECT MAX(completed_at) FROM scrape_jobs WHERE status = 'completed') as last_completed_job
    `);
    return result.rows[0];
  }
}

module.exports = new VendorScraperService();
