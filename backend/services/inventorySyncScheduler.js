/**
 * Inventory Sync Scheduler Service
 * Handles automated inventory synchronization with Best Buy Marketplace
 */
const cron = require('node-cron');
const pool = require('../db');
const miraklService = require('./miraklService');

class InventorySyncScheduler {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.miraklService = miraklService; // Use the exported singleton instance
  }

  /**
   * Get sync settings from database
   */
  async getSyncSettings() {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT setting_key, setting_value
        FROM marketplace_sync_settings
      `);

      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });
      return settings;
    } finally {
      client.release();
    }
  }

  /**
   * Update a sync setting
   */
  async updateSetting(key, value) {
    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE marketplace_sync_settings
        SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = $2
      `, [JSON.stringify(value), key]);
    } finally {
      client.release();
    }
  }

  /**
   * Get global stock buffer
   */
  async getGlobalStockBuffer() {
    const settings = await this.getSyncSettings();
    return settings.global_stock_buffer?.value || 0;
  }

  /**
   * Calculate effective stock for a product
   * @param {number} actualStock - The actual stock quantity
   * @param {number|null} productBuffer - Product-specific buffer (null = use global)
   * @param {number} globalBuffer - Global buffer value
   */
  calculateEffectiveStock(actualStock, productBuffer, globalBuffer) {
    const buffer = productBuffer !== null ? productBuffer : globalBuffer;
    const effectiveStock = Math.max(0, actualStock - buffer);
    return effectiveStock;
  }

  /**
   * Get products that need syncing
   * @param {boolean} onlyChanged - Only return products modified since last sync
   */
  async getProductsToSync(onlyChanged = true) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT
          p.id,
          p.name,
          p.manufacturer,
          p.mirakl_sku,
          p.price,
          p.cost,
          COALESCE(p.stock_quantity, 0) as stock_quantity,
          p.marketplace_stock_buffer,
          p.marketplace_price,
          p.marketplace_price_rule_id,
          p.marketplace_last_synced,
          p.bestbuy_category_code,
          p.updated_at
        FROM products p
        WHERE p.bestbuy_category_code IS NOT NULL
          AND p.active = true
      `;

      if (onlyChanged) {
        query += `
          AND (
            p.marketplace_last_synced IS NULL
            OR p.updated_at > p.marketplace_last_synced
          )
        `;
      }

      query += ' ORDER BY p.updated_at DESC';

      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Apply price rules to a product
   */
  async calculateMarketplacePrice(product) {
    const client = await pool.connect();
    try {
      // Get applicable price rules, ordered by priority
      const rulesResult = await client.query(`
        SELECT * FROM marketplace_price_rules
        WHERE enabled = true
        AND (
          apply_globally = true
          OR category_code = $1
          OR manufacturer = $2
        )
        AND (min_price IS NULL OR $3 >= min_price)
        AND (max_price IS NULL OR $3 <= max_price)
        ORDER BY priority DESC
      `, [product.bestbuy_category_code, product.manufacturer, product.price]);

      let price = parseFloat(product.price);
      const cost = parseFloat(product.cost) || 0;

      // Apply rules in priority order
      for (const rule of rulesResult.rows) {
        switch (rule.rule_type) {
          case 'markup_percent':
            price = price * (1 + parseFloat(rule.value) / 100);
            break;
          case 'markup_fixed':
            price = price + parseFloat(rule.value);
            break;
          case 'minimum_margin':
            const minMarginPercent = parseFloat(rule.value);
            const minPrice = cost * (1 + minMarginPercent / 100);
            if (price < minPrice) {
              price = minPrice;
            }
            break;
          case 'round_to':
            const roundTo = parseFloat(rule.value);
            price = Math.floor(price) + roundTo;
            break;
        }
      }

      return Math.round(price * 100) / 100; // Round to 2 decimal places
    } finally {
      client.release();
    }
  }

  /**
   * Preview price calculations for products
   */
  async previewPrices(productIds = null, limit = 50) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT
          p.id,
          p.name,
          p.manufacturer,
          p.mirakl_sku,
          p.price,
          p.cost,
          COALESCE(p.stock_quantity, 0) as stock_quantity,
          p.marketplace_stock_buffer,
          p.bestbuy_category_code,
          c.name as category_name
        FROM products p
        LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
        WHERE p.bestbuy_category_code IS NOT NULL
          AND p.active = true
      `;

      const params = [];
      if (productIds && productIds.length > 0) {
        query += ` AND p.id = ANY($1)`;
        params.push(productIds);
      }

      query += ` LIMIT ${limit}`;

      const result = await client.query(query, params);
      const globalBuffer = await this.getGlobalStockBuffer();

      const previews = await Promise.all(result.rows.map(async (product) => {
        const marketplacePrice = await this.calculateMarketplacePrice(product);
        const effectiveStock = this.calculateEffectiveStock(
          product.stock_quantity || 0,
          product.marketplace_stock_buffer,
          globalBuffer
        );

        return {
          id: product.id,
          name: product.name,
          manufacturer: product.manufacturer,
          sku: product.mirakl_sku,
          category: product.category_name,
          original_price: parseFloat(product.price),
          cost: parseFloat(product.cost) || 0,
          marketplace_price: marketplacePrice,
          price_difference: marketplacePrice - parseFloat(product.price),
          margin_percent: product.cost ? ((marketplacePrice - parseFloat(product.cost)) / marketplacePrice * 100).toFixed(1) : null,
          actual_stock: product.stock_quantity || 0,
          buffer: product.marketplace_stock_buffer !== null ? product.marketplace_stock_buffer : globalBuffer,
          effective_stock: effectiveStock
        };
      }));

      return previews;
    } finally {
      client.release();
    }
  }

  /**
   * Sync a single product to marketplace
   */
  async syncProduct(product, globalBuffer) {
    const client = await pool.connect();
    try {
      // Calculate marketplace price
      const marketplacePrice = await this.calculateMarketplacePrice(product);

      // Calculate effective stock
      const effectiveStock = this.calculateEffectiveStock(
        product.stock_quantity,
        product.marketplace_stock_buffer,
        globalBuffer
      );

      // Prepare offer data for Mirakl
      const offerData = {
        shop_sku: product.mirakl_sku || product.name,
        product_id: product.name,
        product_id_type: 'SHOP_SKU',
        price: marketplacePrice,
        quantity: effectiveStock,
        state_code: effectiveStock > 0 ? '11' : '12', // 11 = available, 12 = out of stock
        update_delete: 'update'
      };

      // Update local marketplace_price
      await client.query(`
        UPDATE products
        SET
          marketplace_price = $1,
          marketplace_last_synced = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [marketplacePrice, product.id]);

      // Attempt to sync to Mirakl (will fail gracefully if API unavailable)
      try {
        await this.miraklService.createOffer(offerData);
        return { success: true, product_id: product.id };
      } catch (apiError) {
        // Log but don't fail - local update still succeeded
        console.log(`⚠️ Mirakl API sync failed for product ${product.id}:`, apiError.message);
        return { success: true, product_id: product.id, api_warning: apiError.message };
      }

    } catch (error) {
      console.error(`❌ Failed to sync product ${product.id}:`, error.message);
      return { success: false, product_id: product.id, error: error.message };
    } finally {
      client.release();
    }
  }

  /**
   * Run full inventory sync
   */
  async runSync(options = {}) {
    if (this.isRunning) {
      console.log('⚠️ Sync already in progress, skipping...');
      return { success: false, message: 'Sync already in progress' };
    }

    this.isRunning = true;
    const client = await pool.connect();
    const startTime = new Date();

    try {
      console.log('🔄 Starting inventory sync...');

      // Create sync job record
      const jobResult = await client.query(`
        INSERT INTO marketplace_sync_jobs (job_type, status, started_at)
        VALUES ('inventory_sync', 'running', CURRENT_TIMESTAMP)
        RETURNING id
      `);
      const jobId = jobResult.rows[0].id;

      // Get settings
      const settings = await this.getSyncSettings();
      const onlyChanged = options.forceFullSync ? false : settings.sync_only_changed?.enabled !== false;
      const globalBuffer = settings.global_stock_buffer?.value || 0;

      // Get products to sync
      const products = await this.getProductsToSync(onlyChanged);
      console.log(`📦 Found ${products.length} products to sync`);

      let synced = 0;
      let failed = 0;
      const errors = [];

      // Sync products in batches
      const batchSize = 10;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        const results = await Promise.all(
          batch.map(product => this.syncProduct(product, globalBuffer))
        );

        results.forEach(result => {
          if (result.success) {
            synced++;
          } else {
            failed++;
            errors.push(result.error);
          }
        });

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < products.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Update sync job
      await client.query(`
        UPDATE marketplace_sync_jobs
        SET
          status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          products_checked = $1,
          products_synced = $2,
          products_failed = $3,
          details = $4
        WHERE id = $5
      `, [products.length, synced, failed, JSON.stringify({ errors: errors.slice(0, 10) }), jobId]);

      // Update last sync time
      await this.updateSetting('last_sync_time', { timestamp: new Date().toISOString() });

      const duration = (new Date() - startTime) / 1000;
      console.log(`✅ Sync completed in ${duration}s: ${synced} synced, ${failed} failed`);

      return {
        success: true,
        job_id: jobId,
        products_checked: products.length,
        products_synced: synced,
        products_failed: failed,
        duration_seconds: duration
      };

    } catch (error) {
      console.error('❌ Sync failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.isRunning = false;
      client.release();
    }
  }

  /**
   * Get sync job history
   */
  async getSyncHistory(limit = 20) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT *
        FROM marketplace_sync_jobs
        ORDER BY started_at DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Convert hours to cron expression
   */
  hoursToCron(hours) {
    if (hours >= 24) {
      return '0 0 * * *'; // Daily at midnight
    } else if (hours >= 12) {
      return '0 0,12 * * *'; // Every 12 hours
    } else if (hours >= 6) {
      return '0 0,6,12,18 * * *'; // Every 6 hours
    } else if (hours >= 4) {
      return '0 0,4,8,12,16,20 * * *'; // Every 4 hours
    } else if (hours >= 2) {
      return '0 */2 * * *'; // Every 2 hours
    } else {
      return '0 * * * *'; // Every hour
    }
  }

  /**
   * Start the scheduler
   */
  async start() {
    try {
      const settings = await this.getSyncSettings();

      if (!settings.auto_sync_enabled?.enabled) {
        console.log('📅 Auto-sync is disabled');
        return;
      }

      const hours = settings.sync_frequency_hours?.value || 4;
      const cronExpression = this.hoursToCron(hours);

      console.log(`📅 Starting inventory sync scheduler (every ${hours} hours)`);

      this.cronJob = cron.schedule(cronExpression, async () => {
        console.log('⏰ Running scheduled inventory sync...');
        await this.runSync();
      });

      this.cronJob.start();
    } catch (error) {
      console.error('❌ Failed to start scheduler:', error);
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('📅 Inventory sync scheduler stopped');
    }
  }

  /**
   * Restart the scheduler with new settings
   */
  async restart() {
    this.stop();
    await this.start();
  }
}

module.exports = new InventorySyncScheduler();
