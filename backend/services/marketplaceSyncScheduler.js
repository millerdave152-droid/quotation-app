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
const pool = require('../db');

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
    console.log('\n' + '='.repeat(70));
    console.log('MARKETPLACE SYNC SCHEDULER STARTING');
    console.log('='.repeat(70));
    console.log(`Order sync interval: ${this.config.orderSyncIntervalMinutes} minutes`);
    console.log(`Product sync interval: ${this.config.productSyncIntervalMinutes} minutes`);
    console.log(`Inventory sync interval: ${this.config.inventorySyncIntervalMinutes} minutes`);
    console.log(`Auto-sync enabled: ${this.config.autoSyncEnabled}`);
    console.log('='.repeat(70));

    if (!this.config.autoSyncEnabled) {
      console.log('⚠️  Marketplace auto-sync is DISABLED. Enable MARKETPLACE_AUTO_SYNC in .env file.');
      return;
    }

    // Start scheduled syncs
    this.startOrderSync();
    this.startProductSync();
    this.startInventorySync();

    // Run initial syncs
    console.log('🔄 Running initial syncs...');
    await this.syncOrders();

    console.log('✓ Marketplace sync scheduler started successfully\n');
  }

  /**
   * Stop the sync scheduler
   */
  async stop() {
    console.log('\n🛑 Stopping marketplace sync scheduler...');

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

    console.log('✓ Marketplace sync scheduler stopped\n');
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

    console.log(`✓ Order sync scheduled every ${this.config.orderSyncIntervalMinutes} minutes`);
  }

  /**
   * Sync orders from Mirakl to local database
   */
  async syncOrders() {
    if (this.isSyncing) {
      console.log('⏩ Order sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      console.log('\n' + '─'.repeat(60));
      console.log('📥 SYNCING ORDERS FROM MIRAKL');
      console.log('─'.repeat(60));

      // Get orders from last 7 days
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const miraklOrders = await miraklService.getOrders({
        start_date: startDate.toISOString(),
        order_state_codes: 'WAITING_ACCEPTANCE,WAITING_DEBIT,SHIPPING,SHIPPED'
      });

      console.log(`📋 Found ${miraklOrders.length} orders to process`);

      let succeeded = 0;
      let failed = 0;
      const errors = [];

      for (const miraklOrder of miraklOrders) {
        try {
          await miraklService.syncOrderToDatabase(miraklOrder);
          succeeded++;

          if (succeeded % 10 === 0) {
            console.log(`   Processed ${succeeded}/${miraklOrders.length} orders...`);
          }
        } catch (error) {
          failed++;
          errors.push({
            order_id: miraklOrder.order_id,
            error: error.message
          });
          console.error(`   ❌ Failed to sync order ${miraklOrder.order_id}:`, error.message);
        }
      }

      this.lastOrderSync = new Date();

      const duration = Date.now() - startTime;
      console.log('\n📊 Order Sync Summary:');
      console.log(`   Total: ${miraklOrders.length}`);
      console.log(`   ✅ Succeeded: ${succeeded}`);
      console.log(`   ❌ Failed: ${failed}`);
      console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log('─'.repeat(60) + '\n');

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

    console.log(`✓ Product sync scheduled every ${this.config.productSyncIntervalMinutes} minutes`);
  }

  /**
   * Sync products that need updates to Mirakl
   */
  async syncProducts() {
    const startTime = Date.now();

    try {
      console.log('\n' + '─'.repeat(60));
      console.log('📤 SYNCING PRODUCTS TO MIRAKL');
      console.log('─'.repeat(60));

      // Get products that haven't been synced in the last hour or were updated
      const productsQuery = await pool.query(`
        SELECT id, sku, model, name, manufacturer, stock_quantity, msrp_cents, active
        FROM products
        WHERE active = true
        AND (
          last_synced_at IS NULL
          OR last_synced_at < NOW() - INTERVAL '1 hour'
          OR updated_at > last_synced_at
        )
        LIMIT 100
      `);

      const products = productsQuery.rows;

      if (products.length === 0) {
        console.log('✓ No products need syncing');
        console.log('─'.repeat(60) + '\n');
        return;
      }

      console.log(`📋 Found ${products.length} products to sync`);

      let succeeded = 0;
      let failed = 0;
      const errors = [];

      for (const product of products) {
        try {
          await miraklService.syncProductToMirakl(product.id);
          succeeded++;

          if (succeeded % 10 === 0) {
            console.log(`   Processed ${succeeded}/${products.length} products...`);
          }
        } catch (error) {
          failed++;
          errors.push({
            product_id: product.id,
            sku: product.sku || product.model,
            error: error.message
          });
          console.error(`   ❌ Failed to sync product ${product.id}:`, error.message);
        }
      }

      this.lastProductSync = new Date();

      const duration = Date.now() - startTime;
      console.log('\n📊 Product Sync Summary:');
      console.log(`   Total: ${products.length}`);
      console.log(`   ✅ Succeeded: ${succeeded}`);
      console.log(`   ❌ Failed: ${failed}`);
      console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log('─'.repeat(60) + '\n');

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

    console.log(`✓ Inventory sync scheduled every ${this.config.inventorySyncIntervalMinutes} minutes`);
  }

  /**
   * Sync inventory quantities to Mirakl
   */
  async syncInventory() {
    const startTime = Date.now();

    try {
      console.log('\n' + '─'.repeat(60));
      console.log('📊 SYNCING INVENTORY TO MIRAKL');
      console.log('─'.repeat(60));

      // Get products with Mirakl offers that have quantity changes
      const productsQuery = await pool.query(`
        SELECT id, mirakl_offer_id, stock_quantity, model
        FROM products
        WHERE mirakl_offer_id IS NOT NULL
        AND active = true
        LIMIT 100
      `);

      const products = productsQuery.rows;

      if (products.length === 0) {
        console.log('✓ No inventory updates needed');
        console.log('─'.repeat(60) + '\n');
        return;
      }

      console.log(`📋 Updating inventory for ${products.length} products`);

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

          if (succeeded % 10 === 0) {
            console.log(`   Updated ${succeeded}/${products.length} products...`);
          }
        } catch (error) {
          failed++;
          errors.push({
            product_id: product.id,
            offer_id: product.mirakl_offer_id,
            error: error.message
          });
          console.error(`   ❌ Failed to update inventory for ${product.model}:`, error.message);
        }
      }

      this.lastInventorySync = new Date();

      const duration = Date.now() - startTime;
      console.log('\n📊 Inventory Sync Summary:');
      console.log(`   Total: ${products.length}`);
      console.log(`   ✅ Succeeded: ${succeeded}`);
      console.log(`   ❌ Failed: ${failed}`);
      console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log('─'.repeat(60) + '\n');

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
    console.log('🔄 Triggering manual sync of all marketplace data...');

    const results = {
      orders: null,
      products: null,
      inventory: null
    };

    try {
      results.orders = await this.syncOrders();
      results.products = await this.syncProducts();
      results.inventory = await this.syncInventory();

      console.log('✅ Manual sync completed successfully');
      return results;
    } catch (error) {
      console.error('❌ Manual sync failed:', error);
      throw error;
    }
  }
}

// Export class for instantiation
module.exports = MarketplaceSyncScheduler;
