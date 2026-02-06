/**
 * MARKETPLACE SYNC SCHEDULER
 * ==========================
 * Automatically syncs orders, products, and inventory with Best Buy Marketplace via Mirakl API
 *
 * Features:
 * - Scheduled order syncing from Mirakl
 * - Automated product/offer updates to Mirakl
 * - Inventory synchronization
 * - Configurable sync intervals
 * - Error handling and retry logic
 * - Sync history logging
 */

const miraklService = require('./miraklService');
let pool = require('../db');

class MarketplaceSyncScheduler {
  constructor(config = {}) {
    this.config = {
      orderSyncIntervalMinutes: config.orderSyncIntervalMinutes || parseInt(process.env.MARKETPLACE_ORDER_SYNC_INTERVAL) || 15,
      productSyncIntervalMinutes: config.productSyncIntervalMinutes || parseInt(process.env.MARKETPLACE_PRODUCT_SYNC_INTERVAL) || 60,
      inventorySyncIntervalMinutes: config.inventorySyncIntervalMinutes || parseInt(process.env.MARKETPLACE_INVENTORY_SYNC_INTERVAL) || 30,
      autoSyncEnabled: config.autoSyncEnabled !== false && process.env.MARKETPLACE_AUTO_SYNC === 'true'
    };

    this.orderSyncInterval = null;
    this.productSyncInterval = null;
    this.inventorySyncInterval = null;
    this.isSyncing = false;
    this.lastOrderSync = null;
    this.lastProductSync = null;
    this.lastInventorySync = null;
  }

  /**
   * Start the marketplace sync scheduler
   */
  async start() {
    if (!this.config.autoSyncEnabled) {
      return;
    }

    // Start scheduled syncs
    this.startOrderSync();
    this.startProductSync();
    this.startInventorySync();

    // Run initial syncs
    await this.syncOrders();

    // Also run initial product sync to catch any unsynced products
    await this.syncProducts();
  }

  /**
   * Stop the sync scheduler
   */
  async stop() {
    if (this.orderSyncInterval) {
      clearInterval(this.orderSyncInterval);
      this.orderSyncInterval = null;
    }

    if (this.productSyncInterval) {
      clearInterval(this.productSyncInterval);
      this.productSyncInterval = null;
    }

    if (this.inventorySyncInterval) {
      clearInterval(this.inventorySyncInterval);
      this.inventorySyncInterval = null;
    }
  }

  // ============================================
  // ORDER SYNC
  // ============================================

  /**
   * Start scheduled order syncing
   */
  startOrderSync() {
    const intervalMs = this.config.orderSyncIntervalMinutes * 60 * 1000;

    this.orderSyncInterval = setInterval(async () => {
      await this.syncOrders();
    }, intervalMs);
  }

  /**
   * Sync orders from Mirakl to local database
   */
  async syncOrders() {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      // Get orders from last 7 days
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const miraklOrders = await miraklService.getOrders({
        start_date: startDate.toISOString(),
        order_state_codes: 'WAITING_ACCEPTANCE,WAITING_DEBIT,SHIPPING,SHIPPED'
      });

      let succeeded = 0;
      let failed = 0;
      const errors = [];

      for (const miraklOrder of miraklOrders) {
        try {
          await miraklService.syncOrderToDatabase(miraklOrder);
          succeeded++;
        } catch (error) {
          failed++;
          errors.push({
            order_id: miraklOrder.order_id,
            error: error.message
          });
          console.error(`Failed to sync order ${miraklOrder.order_id}:`, error.message);
        }
      }

      this.lastOrderSync = new Date();

      const duration = Date.now() - startTime;

      return { succeeded, failed, errors, duration };

    } catch (error) {
      console.error('❌ Order sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  // ============================================
  // PRODUCT SYNC
  // ============================================

  /**
   * Start scheduled product syncing
   */
  startProductSync() {
    const intervalMs = this.config.productSyncIntervalMinutes * 60 * 1000;

    this.productSyncInterval = setInterval(async () => {
      await this.syncProducts();
    }, intervalMs);
  }

  /**
   * Sync products that need updates to Mirakl
   */
  async syncProducts() {
    const startTime = Date.now();

    try {
      // Get products that haven't been synced in the last hour or were updated
      // PRIORITY: Products never synced (last_synced_at IS NULL) get synced first
      // INCREASED LIMIT: Process up to 500 products per cycle to catch up faster
      const productsQuery = await pool.query(`
        SELECT id, sku, model, name, manufacturer, stock_quantity, msrp_cents, active
        FROM products
        WHERE active = true
        AND (
          last_synced_at IS NULL
          OR last_synced_at < NOW() - INTERVAL '1 hour'
          OR updated_at > last_synced_at
        )
        ORDER BY
          CASE WHEN last_synced_at IS NULL THEN 0 ELSE 1 END,
          last_synced_at ASC NULLS FIRST
        LIMIT 500
      `);

      const products = productsQuery.rows;

      if (products.length === 0) {
        return;
      }

      let succeeded = 0;
      let failed = 0;
      const errors = [];

      for (const product of products) {
        try {
          await miraklService.syncProductToMirakl(product.id);
          succeeded++;
        } catch (error) {
          failed++;
          errors.push({
            product_id: product.id,
            sku: product.sku || product.model,
            error: error.message
          });
          console.error(`Failed to sync product ${product.id}:`, error.message);
        }
      }

      this.lastProductSync = new Date();

      const duration = Date.now() - startTime;

      return { succeeded, failed, errors, duration };

    } catch (error) {
      console.error('❌ Product sync failed:', error);
      throw error;
    }
  }

  // ============================================
  // INVENTORY SYNC
  // ============================================

  /**
   * Start scheduled inventory syncing
   */
  startInventorySync() {
    const intervalMs = this.config.inventorySyncIntervalMinutes * 60 * 1000;

    this.inventorySyncInterval = setInterval(async () => {
      await this.syncInventory();
    }, intervalMs);
  }

  /**
   * Sync inventory quantities to Mirakl
   */
  async syncInventory() {
    const startTime = Date.now();

    try {
      // Get products with Mirakl offers that have quantity changes
      // INCREASED LIMIT: Process up to 500 products per cycle
      const productsQuery = await pool.query(`
        SELECT id, mirakl_offer_id, stock_quantity, model
        FROM products
        WHERE mirakl_offer_id IS NOT NULL
        AND active = true
        LIMIT 500
      `);

      const products = productsQuery.rows;

      if (products.length === 0) {
        return;
      }

      let succeeded = 0;
      let failed = 0;
      const errors = [];

      for (const product of products) {
        try {
          await miraklService.updateOfferQuantity(
            product.mirakl_offer_id,
            product.stock_quantity || 0
          );
          succeeded++;
        } catch (error) {
          failed++;
          errors.push({
            product_id: product.id,
            offer_id: product.mirakl_offer_id,
            error: error.message
          });
          console.error(`Failed to update inventory for ${product.model}:`, error.message);
        }
      }

      this.lastInventorySync = new Date();

      const duration = Date.now() - startTime;

      return { succeeded, failed, errors, duration };

    } catch (error) {
      console.error('❌ Inventory sync failed:', error);
      throw error;
    }
  }

  // ============================================
  // STATUS & MONITORING
  // ============================================

  /**
   * Get sync status
   */
  getStatus() {
    return {
      enabled: this.config.autoSyncEnabled,
      syncing: this.isSyncing,
      lastOrderSync: this.lastOrderSync,
      lastProductSync: this.lastProductSync,
      lastInventorySync: this.lastInventorySync,
      config: {
        orderSyncIntervalMinutes: this.config.orderSyncIntervalMinutes,
        productSyncIntervalMinutes: this.config.productSyncIntervalMinutes,
        inventorySyncIntervalMinutes: this.config.inventorySyncIntervalMinutes
      }
    };
  }

  /**
   * Trigger manual sync of all
   */
  async syncAll() {
    const results = {
      orders: null,
      products: null,
      inventory: null
    };

    try {
      results.orders = await this.syncOrders();
      results.products = await this.syncProducts();
      results.inventory = await this.syncInventory();

      return results;
    } catch (error) {
      console.error('Manual sync failed:', error);
      throw error;
    }
  }
}

MarketplaceSyncScheduler.prototype._setPool = function(p) { pool = p; };

// Export class for instantiation
module.exports = MarketplaceSyncScheduler;
