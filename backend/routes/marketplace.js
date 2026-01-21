const express = require('express');
const router = express.Router();
const pool = require('../db');
const miraklService = require('../services/miraklService');
const { validateJoi, marketplaceSchemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

// Helper to generate unique return/refund numbers
const generateReturnNumber = () => `RET-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
const generateRefundNumber = () => `REF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

// ============================================
// MARKETPLACE ORDERS
// ============================================

// Get all marketplace orders
router.get('/orders', authenticate, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // PERF: Specify columns instead of SELECT * to reduce data transfer
    let query = `SELECT id, order_id, order_state, order_date, total_price_cents,
      customer_name, customer_email, shipping_address, items_count, created_at, updated_at
    FROM marketplace_orders WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND order_state = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY order_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get count
    const countQuery = 'SELECT COUNT(*) as total FROM marketplace_orders' +
                      (status ? ' WHERE order_state = $1' : '');
    const countParams = status ? [status] : [];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('❌ Error fetching marketplace orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single marketplace order
router.get('/orders/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // PERF: Specify columns instead of SELECT * to reduce data transfer
    const orderQuery = await pool.query(
      `SELECT id, order_id, order_state, order_date, total_price_cents,
        customer_name, customer_email, shipping_address, items_count,
        shipping_carrier, tracking_number, created_at, updated_at
      FROM marketplace_orders WHERE id = $1`,
      [id]
    );

    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const itemsQuery = await pool.query(
      `SELECT oi.*, p.name as product_name, p.manufacturer
       FROM marketplace_order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [id]
    );

    // Get shipments
    const shipmentsQuery = await pool.query(
      'SELECT * FROM marketplace_shipments WHERE order_id = $1',
      [id]
    );

    const order = orderQuery.rows[0];
    order.items = itemsQuery.rows;
    order.shipments = shipmentsQuery.rows;

    res.json(order);
  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Pull orders from Mirakl (GET endpoint for frontend button)
router.get('/pull-orders', authenticate, async (req, res) => {
  try {
    const miraklOrders = await miraklService.getOrders({
      order_state_codes: 'WAITING_ACCEPTANCE,SHIPPING,SHIPPED'
    });

    let imported = 0;
    let failed = 0;

    for (const miraklOrder of miraklOrders) {
      try {
        await miraklService.syncOrderToDatabase(miraklOrder);
        imported++;
      } catch (error) {
        failed++;
        console.error(`❌ Failed to import order ${miraklOrder.order_id}:`, error.message);
      }
    }

    res.json({
      success: true,
      imported: imported,
      failed: failed,
      total: miraklOrders.length
    });
  } catch (error) {
    console.error('❌ Error pulling orders:', error);
    res.status(500).json({ success: false, error: 'Failed to pull orders', details: error.message });
  }
});

// Sync orders from Mirakl (with database transaction support)
router.post('/orders/sync', authenticate, validateJoi(marketplaceSchemas.orderSync), async (req, res) => {
  const client = await pool.connect();
  const syncStartTime = new Date();

  try {
    const { start_date, order_state_codes } = req.body;

    // Start transaction
    await client.query('BEGIN');

    // Log sync start
    const syncLogResult = await client.query(`
      INSERT INTO marketplace_sync_log
      (sync_type, sync_direction, entity_type, status, sync_start_time)
      VALUES ('order', 'inbound', 'order', 'in_progress', $1)
      RETURNING id
    `, [syncStartTime]);
    const syncLogId = syncLogResult.rows[0].id;

    // Fetch orders from Mirakl
    const miraklOrders = await miraklService.getOrders({
      start_date,
      order_state_codes
    });

    const results = {
      total: miraklOrders.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    // Sync each order to database within the transaction
    for (const miraklOrder of miraklOrders) {
      try {
        await miraklService.syncOrderToDatabase(miraklOrder, client);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          order_id: miraklOrder.order_id,
          error: error.message
        });
        // Log individual order error but continue processing
        console.error(`⚠️ Failed to sync order ${miraklOrder.order_id}:`, error.message);
      }
    }

    const syncEndTime = new Date();
    const durationMs = syncEndTime - syncStartTime;

    // Update sync log with results
    await client.query(`
      UPDATE marketplace_sync_log
      SET status = $1,
          records_processed = $2,
          records_succeeded = $3,
          records_failed = $4,
          sync_end_time = $5,
          duration_ms = $6,
          error_details = $7
      WHERE id = $8
    `, [
      results.failed > 0 && results.succeeded === 0 ? 'FAILED' : 'SUCCESS',
      results.total,
      results.succeeded,
      results.failed,
      syncEndTime,
      durationMs,
      results.errors.length > 0 ? JSON.stringify(results.errors) : null,
      syncLogId
    ]);

    // Commit transaction
    await client.query('COMMIT');

    res.json({
      ...results,
      sync_id: syncLogId,
      duration_ms: durationMs
    });
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('❌ Error syncing orders:', error);
    res.status(500).json({ error: 'Failed to sync orders', details: error.message });
  } finally {
    client.release();
  }
});

// Accept an order
router.post('/orders/:id/accept', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get order from database
    const orderQuery = await pool.query(
      'SELECT * FROM marketplace_orders WHERE id = $1',
      [id]
    );

    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderQuery.rows[0];

    // Accept order on Mirakl
    const orderLines = order.order_lines.map(line => ({ id: line.order_line_id }));
    await miraklService.acceptOrder(order.mirakl_order_id, orderLines);

    // Update order status in database
    await pool.query(
      `UPDATE marketplace_orders
       SET order_state = 'SHIPPING', acceptance_decision_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Order accepted successfully' });
  } catch (error) {
    console.error('❌ Error accepting order:', error);
    res.status(500).json({ error: 'Failed to accept order', details: error.message });
  }
});

// Refuse an order
router.post('/orders/:id/refuse', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Get order from database
    const orderQuery = await pool.query(
      'SELECT * FROM marketplace_orders WHERE id = $1',
      [id]
    );

    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderQuery.rows[0];

    // Refuse order on Mirakl
    const orderLines = order.order_lines.map(line => ({ id: line.order_line_id }));
    await miraklService.refuseOrder(order.mirakl_order_id, orderLines, reason);

    // Update order status in database
    await pool.query(
      `UPDATE marketplace_orders
       SET order_state = 'REFUSED', canceled_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Order refused successfully' });
  } catch (error) {
    console.error('❌ Error refusing order:', error);
    res.status(500).json({ error: 'Failed to refuse order', details: error.message });
  }
});

// ============================================
// SHIPMENTS
// ============================================

// Create shipment for an order
router.post('/orders/:id/shipments', authenticate, validateJoi(marketplaceSchemas.shipment), async (req, res) => {
  try {
    const { id } = req.params;
    const { tracking_number, carrier_code, carrier_name, shipped_items } = req.body;

    // Get order
    const orderQuery = await pool.query(
      'SELECT * FROM marketplace_orders WHERE id = $1',
      [id]
    );

    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderQuery.rows[0];

    // Create shipment on Mirakl
    await miraklService.createShipment({
      order_id: order.mirakl_order_id,
      tracking_number,
      carrier_code,
      carrier_name,
      shipped_items
    });

    // Save shipment to database
    const result = await pool.query(
      `INSERT INTO marketplace_shipments
       (order_id, tracking_number, carrier_code, carrier_name, shipment_date, shipment_status, shipped_items)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'SHIPPED', $5)
       RETURNING *`,
      [id, tracking_number, carrier_code, carrier_name, JSON.stringify(shipped_items)]
    );

    // Update order status
    await pool.query(
      `UPDATE marketplace_orders
       SET order_state = 'SHIPPED', shipped_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating shipment:', error);
    res.status(500).json({ error: 'Failed to create shipment', details: error.message });
  }
});

// ============================================
// PRODUCT SYNC
// ============================================

// Sync all active products to Mirakl (inventory sync)
router.post('/sync-offers', authenticate, async (req, res) => {
  try {
    // Get all active products that need syncing
    // INCREASED LIMIT: Process up to 500 products, prioritizing unsynced ones
    const productsQuery = await pool.query(`
      SELECT id, model, name, msrp_cents, active, mirakl_sku
      FROM products
      WHERE active = true
      ORDER BY
        CASE WHEN last_synced_at IS NULL THEN 0 ELSE 1 END,
        last_synced_at ASC NULLS FIRST
      LIMIT 500
    `);

    const products = productsQuery.rows;

    if (products.length === 0) {
      return res.json({ success: true, synced: 0, message: 'No products to sync' });
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
          model: product.model,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      synced: succeeded,
      failed: failed,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('❌ Error syncing offers:', error);
    res.status(500).json({ success: false, error: 'Failed to sync offers', details: error.message });
  }
});

// Sync single product to Mirakl
router.post('/products/:id/sync', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await miraklService.syncProductToMirakl(id);

    res.json({
      message: 'Product synced successfully',
      offer_id: result.offer_id
    });
  } catch (error) {
    console.error('❌ Error syncing product:', error);
    res.status(500).json({ error: 'Failed to sync product', details: error.message });
  }
});

// Bulk sync products to Mirakl
router.post('/products/sync-bulk', authenticate, async (req, res) => {
  try {
    const { product_ids } = req.body;

    if (!product_ids || !Array.isArray(product_ids)) {
      return res.status(400).json({ error: 'product_ids array is required' });
    }

    const results = {
      total: product_ids.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const productId of product_ids) {
      try {
        await miraklService.syncProductToMirakl(productId);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          product_id: productId,
          error: error.message
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('❌ Error in bulk sync:', error);
    res.status(500).json({ error: 'Bulk sync failed', details: error.message });
  }
});

// Batch sync products using bulk API (more efficient, avoids rate limits)
router.post('/products/batch-sync', authenticate, async (req, res) => {
  try {
    const batchSize = req.body.batch_size || 100; // Mirakl supports up to 100 offers per request
    const delayBetweenBatches = req.body.delay_ms || 5000; // 5 second delay between batches

    // Get all unsynced products
    const productsQuery = await pool.query(`
      SELECT id, model, name, msrp_cents, stock_quantity, active, mirakl_sku
      FROM products
      WHERE active = true
      AND last_synced_at IS NULL
      ORDER BY id
    `);

    const products = productsQuery.rows;

    if (products.length === 0) {
      return res.json({
        success: true,
        synced: 0,
        message: 'All products are already synced'
      });
    }

    let totalSucceeded = 0;
    let totalFailed = 0;
    const errors = [];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Process in batches
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(products.length / batchSize);

      const result = await miraklService.batchImportOffers(batch);

      if (result.success) {
        // Update last_synced_at for all products in batch
        const productIds = batch.map(p => p.id);
        await pool.query(
          `UPDATE products SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ANY($1)`,
          [productIds]
        );
        totalSucceeded += batch.length;
      } else {
        totalFailed += batch.length;
        errors.push({
          batch: batchNum,
          error: result.error,
          details: result.details
        });
      }

      // Delay between batches
      if (i + batchSize < products.length) {
        await delay(delayBetweenBatches);
      }
    }

    res.json({
      success: true,
      total: products.length,
      synced: totalSucceeded,
      failed: totalFailed,
      batches_processed: Math.ceil(products.length / batchSize),
      errors: errors.length > 5 ? errors.slice(0, 5) : errors,
      totalErrors: errors.length
    });
  } catch (error) {
    console.error('❌ Error in batch sync:', error);
    res.status(500).json({ error: 'Batch sync failed', details: error.message });
  }
});

// Set default stock quantity for products with zero stock
router.post('/products/set-default-stock', authenticate, async (req, res) => {
  try {
    const { default_stock = 10, manufacturer } = req.body;

    let query = `
      UPDATE products
      SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP
      WHERE active = true
      AND (stock_quantity IS NULL OR stock_quantity = 0)
    `;
    const params = [default_stock];

    if (manufacturer) {
      query += ` AND LOWER(manufacturer) = LOWER($2)`;
      params.push(manufacturer);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      updated_count: result.rowCount,
      default_stock: default_stock,
      message: `Set stock to ${default_stock} for ${result.rowCount} products`
    });
  } catch (error) {
    console.error('❌ Error setting default stock:', error);
    res.status(500).json({ error: 'Failed to set default stock', details: error.message });
  }
});

// Sync ALL unsynced products to Mirakl (no limit - for catch-up)
router.post('/products/sync-all-unsynced', authenticate, async (req, res) => {
  try {
    // Rate limiting settings - Mirakl typically allows ~60-120 requests/minute
    const requestDelayMs = req.body.delay_ms || 500; // 500ms = 120 requests/min
    const retryDelayMs = 5000; // Wait 5 seconds on rate limit before retry
    const maxRetries = 3;

    // Get ALL active products that have never been synced
    const productsQuery = await pool.query(`
      SELECT id, model, name, msrp_cents, stock_quantity
      FROM products
      WHERE active = true
      AND last_synced_at IS NULL
      ORDER BY id
    `);

    const products = productsQuery.rows;

    if (products.length === 0) {
      return res.json({
        success: true,
        synced: 0,
        message: 'All products are already synced'
      });
    }

    let succeeded = 0;
    let failed = 0;
    let rateLimited = 0;
    const errors = [];
    const batchSize = 50;
    let processed = 0;

    // Helper to delay
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper to sync with retry on rate limit
    const syncWithRetry = async (productId, retries = 0) => {
      try {
        await miraklService.syncProductToMirakl(productId);
        return { success: true };
      } catch (error) {
        const isRateLimited = error.message?.includes('Too Many Requests') ||
                             error.details?.status === 429;

        if (isRateLimited && retries < maxRetries) {
          rateLimited++;
          const waitTime = retryDelayMs * (retries + 1); // Exponential backoff
          await delay(waitTime);
          return syncWithRetry(productId, retries + 1);
        }
        return { success: false, error: error.message };
      }
    };

    // Process in batches with rate limiting
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      for (const product of batch) {
        const result = await syncWithRetry(product.id);

        if (result.success) {
          succeeded++;
        } else {
          failed++;
          errors.push({
            product_id: product.id,
            model: product.model,
            error: result.error
          });
        }

        // Delay between requests to respect rate limits
        await delay(requestDelayMs);
      }

      processed += batch.length;

      // Extra delay between batches
      if (i + batchSize < products.length) {
        await delay(2000);
      }
    }

    res.json({
      success: true,
      total: products.length,
      synced: succeeded,
      failed: failed,
      rate_limit_retries: rateLimited,
      errors: errors.length > 10 ? errors.slice(0, 10) : errors,
      totalErrors: errors.length
    });
  } catch (error) {
    console.error('❌ Error syncing all unsynced products:', error);
    res.status(500).json({ success: false, error: 'Failed to sync unsynced products', details: error.message });
  }
});

// ============================================
// SYNC LOGS
// ============================================

// Get sync logs
router.get('/sync-logs', authenticate, async (req, res) => {
  try {
    const { sync_type, status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM marketplace_sync_log WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (sync_type) {
      query += ` AND sync_type = $${paramIndex}`;
      params.push(sync_type);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching sync logs:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// Get sync stats
router.get('/sync-stats', authenticate, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        sync_type,
        COUNT(*) as total_syncs,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful_syncs,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed_syncs,
        SUM(records_processed) as total_records,
        AVG(duration_ms) as avg_duration_ms
      FROM marketplace_sync_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY sync_type
    `);

    res.json(stats.rows);
  } catch (error) {
    console.error('❌ Error fetching sync stats:', error);
    res.status(500).json({ error: 'Failed to fetch sync stats' });
  }
});

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

// Webhook receiver for Mirakl events
router.post('/webhooks/mirakl', authenticate, async (req, res) => {
  try {
    const webhookData = req.body;

    // Save webhook event to database
    await pool.query(
      `INSERT INTO marketplace_webhook_events
       (event_type, event_id, marketplace_name, order_id, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        webhookData.event_type,
        webhookData.event_id,
        'BestBuy',
        webhookData.order_id || null,
        JSON.stringify(webhookData)
      ]
    );

    // Process webhook based on event type
    switch (webhookData.event_type) {
      case 'ORDER_CREATED':
      case 'ORDER_UPDATED':
        // Could trigger background job here
        break;

      case 'ORDER_CANCELLED':
        break;

      default:
        break;
    }

    // Always respond with 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    // Still return 200 to prevent retries
    res.json({ received: true, error: error.message });
  }
});

// ============================================
// MARKETPLACE CREDENTIALS
// ============================================

// Get marketplace credentials (masked)
router.get('/credentials', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, marketplace_name, environment, shop_id, is_active, last_validated_at, created_at
       FROM marketplace_credentials
       ORDER BY marketplace_name, environment`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching credentials:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

// Update marketplace credentials
router.put('/credentials/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { api_key, api_secret, shop_id, is_active } = req.body;

    const result = await pool.query(
      `UPDATE marketplace_credentials
       SET api_key = COALESCE($1, api_key),
           api_secret = COALESCE($2, api_secret),
           shop_id = COALESCE($3, shop_id),
           is_active = COALESCE($4, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, marketplace_name, environment, shop_id, is_active`,
      [api_key, api_secret, shop_id, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credentials not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating credentials:', error);
    res.status(500).json({ error: 'Failed to update credentials' });
  }
});

// ============================================
// SYNC STATUS
// ============================================

// Get sync scheduler status
router.get('/sync-status', authenticate, async (req, res) => {
  try {
    // Get recent sync activity
    const recentSyncs = await pool.query(`
      SELECT
        sync_type,
        status,
        created_at,
        duration_ms,
        records_processed,
        records_succeeded,
        records_failed
      FROM marketplace_sync_log
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Get overall stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_syncs,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful_syncs,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed_syncs,
        MAX(created_at) as last_sync_time
      FROM marketplace_sync_log
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    // Get order counts
    const orderCounts = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE order_state = 'WAITING_ACCEPTANCE') as pending_orders,
        COUNT(*) FILTER (WHERE order_state = 'SHIPPING') as shipping_orders,
        COUNT(*) FILTER (WHERE order_state = 'SHIPPED') as shipped_orders
      FROM marketplace_orders
    `);

    // Get product sync info
    const productSync = await pool.query(`
      SELECT
        COUNT(*) as total_products,
        COUNT(*) FILTER (WHERE mirakl_offer_id IS NOT NULL) as synced_products,
        COUNT(*) FILTER (WHERE last_synced_at IS NULL) as never_synced,
        COUNT(*) FILTER (WHERE active = true AND last_synced_at < NOW() - INTERVAL '24 hours') as needs_sync
      FROM products
    `);

    res.json({
      status: 'operational',
      auto_sync_enabled: process.env.MARKETPLACE_AUTO_SYNC === 'true',
      recent_syncs: recentSyncs.rows,
      sync_stats: stats.rows[0],
      orders: orderCounts.rows[0],
      products: productSync.rows[0],
      config: {
        order_sync_interval: process.env.MARKETPLACE_ORDER_SYNC_INTERVAL || 15,
        product_sync_interval: process.env.MARKETPLACE_PRODUCT_SYNC_INTERVAL || 60,
        inventory_sync_interval: process.env.MARKETPLACE_INVENTORY_SYNC_INTERVAL || 30
      }
    });
  } catch (error) {
    console.error('❌ Error fetching sync status:', error);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

// Detailed sync diagnostics - helps debug why products aren't syncing
router.get('/sync-diagnostics', authenticate, async (req, res) => {
  try {
    // Get breakdown of product sync status
    const productBreakdown = await pool.query(`
      SELECT
        COUNT(*) as total_active_products,
        COUNT(*) FILTER (WHERE last_synced_at IS NULL) as never_synced,
        COUNT(*) FILTER (WHERE last_synced_at IS NOT NULL) as synced_at_least_once,
        COUNT(*) FILTER (WHERE mirakl_offer_id IS NOT NULL) as has_mirakl_offer,
        COUNT(*) FILTER (WHERE COALESCE(stock_quantity, 0) = 0) as zero_stock,
        COUNT(*) FILTER (WHERE COALESCE(stock_quantity, 0) > 0) as has_stock,
        COUNT(*) FILTER (WHERE last_synced_at IS NULL AND COALESCE(stock_quantity, 0) = 0) as unsynced_no_stock,
        COUNT(*) FILTER (WHERE last_synced_at IS NULL AND COALESCE(stock_quantity, 0) > 0) as unsynced_with_stock
      FROM products
      WHERE active = true
    `);

    // Get sample of unsynced products
    const unsyncedSample = await pool.query(`
      SELECT id, model, name, manufacturer, stock_quantity, msrp_cents, created_at
      FROM products
      WHERE active = true AND last_synced_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Get recent sync errors from log
    const recentErrors = await pool.query(`
      SELECT entity_id, error_message, created_at
      FROM marketplace_sync_log
      WHERE status = 'FAILED' AND sync_type = 'product_sync'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Check environment configuration
    const envConfig = {
      mirakl_api_url_set: !!process.env.MIRAKL_API_URL,
      mirakl_api_key_set: !!process.env.MIRAKL_API_KEY,
      mirakl_shop_id_set: !!process.env.MIRAKL_SHOP_ID,
      auto_sync_enabled: process.env.MARKETPLACE_AUTO_SYNC === 'true',
      product_sync_interval_minutes: parseInt(process.env.MARKETPLACE_PRODUCT_SYNC_INTERVAL) || 60
    };

    res.json({
      summary: productBreakdown.rows[0],
      sample_unsynced_products: unsyncedSample.rows,
      recent_sync_errors: recentErrors.rows,
      environment: envConfig,
      recommendations: generateSyncRecommendations(productBreakdown.rows[0], envConfig)
    });
  } catch (error) {
    console.error('❌ Error fetching sync diagnostics:', error);
    res.status(500).json({ error: 'Failed to fetch sync diagnostics' });
  }
});

// Helper function to generate sync recommendations
function generateSyncRecommendations(stats, env) {
  const recommendations = [];

  if (!env.auto_sync_enabled) {
    recommendations.push({
      priority: 'high',
      issue: 'Auto-sync is disabled',
      action: 'Set MARKETPLACE_AUTO_SYNC=true in .env file'
    });
  }

  if (!env.mirakl_api_key_set || !env.mirakl_shop_id_set) {
    recommendations.push({
      priority: 'critical',
      issue: 'Mirakl API credentials not configured',
      action: 'Set MIRAKL_API_KEY and MIRAKL_SHOP_ID in .env file'
    });
  }

  const neverSynced = parseInt(stats.never_synced) || 0;
  if (neverSynced > 100) {
    recommendations.push({
      priority: 'high',
      issue: `${neverSynced} products have never been synced`,
      action: 'Call POST /api/marketplace/products/sync-all-unsynced to sync all unsynced products'
    });
  }

  const zeroStock = parseInt(stats.zero_stock) || 0;
  const total = parseInt(stats.total_active_products) || 0;
  if (zeroStock > total * 0.5) {
    recommendations.push({
      priority: 'medium',
      issue: `${zeroStock} of ${total} products have zero stock`,
      action: 'Update stock quantities via POST /api/marketplace/bulk/stock-update or import from inventory file'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      issue: 'No critical issues detected',
      action: 'Sync is operating normally'
    });
  }

  return recommendations;
}

// ============================================
// BEST BUY CATEGORIES & PRODUCT MAPPING
// ============================================

// Get all Best Buy categories (alias for /categories for frontend compatibility)
router.get('/categories', authenticate, async (req, res) => {
  try {
    const { group } = req.query;

    let query = `
      SELECT id, code, name, description, category_group, is_active
      FROM bestbuy_categories
      WHERE is_active = true
    `;
    const params = [];

    if (group) {
      query += ' AND category_group = $1';
      params.push(group);
    }

    query += ' ORDER BY category_group, name';

    const result = await pool.query(query, params);

    // Group categories by category_group for easier frontend use
    const grouped = {};
    result.rows.forEach(cat => {
      if (!grouped[cat.category_group]) {
        grouped[cat.category_group] = [];
      }
      grouped[cat.category_group].push(cat);
    });

    res.json({
      categories: result.rows,
      grouped: grouped,
      total: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get all Best Buy categories (legacy endpoint)
router.get('/bestbuy-categories', authenticate, async (req, res) => {
  try {
    const { group } = req.query;

    let query = `
      SELECT id, code, name, description, category_group, is_active
      FROM bestbuy_categories
      WHERE is_active = true
    `;
    const params = [];

    if (group) {
      query += ' AND category_group = $1';
      params.push(group);
    }

    query += ' ORDER BY category_group, name';

    const result = await pool.query(query, params);

    // Group categories by category_group for easier frontend use
    const grouped = {};
    result.rows.forEach(cat => {
      if (!grouped[cat.category_group]) {
        grouped[cat.category_group] = [];
      }
      grouped[cat.category_group].push(cat);
    });

    res.json({
      categories: result.rows,
      grouped: grouped,
      total: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error fetching Best Buy categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get unmapped products (products without bestbuy_category_code)
router.get('/products/unmapped', authenticate, async (req, res) => {
  try {
    const { search, manufacturer, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT id, model, name, manufacturer, msrp_cents, active, bestbuy_category_code
      FROM products
      WHERE (bestbuy_category_code IS NULL OR bestbuy_category_code = '')
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR model ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (manufacturer) {
      query += ` AND manufacturer = $${paramIndex}`;
      params.push(manufacturer);
      paramIndex++;
    }

    // Get count first
    const countQuery = query.replace('SELECT id, model, name, manufacturer, msrp_cents, active, bestbuy_category_code', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add ordering and pagination
    query += ` ORDER BY manufacturer, name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      products: result.rows,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('❌ Error fetching unmapped products:', error);
    res.status(500).json({ error: 'Failed to fetch unmapped products' });
  }
});

// Get mapped products (products with bestbuy_category_code)
router.get('/products/mapped', authenticate, async (req, res) => {
  try {
    const { category_code, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT p.id, p.model, p.name, p.manufacturer, p.msrp_cents, p.active,
             p.bestbuy_category_code, bc.name as category_name, bc.category_group
      FROM products p
      LEFT JOIN bestbuy_categories bc ON p.bestbuy_category_code = bc.code
      WHERE p.bestbuy_category_code IS NOT NULL AND p.bestbuy_category_code != ''
    `;
    const params = [];
    let paramIndex = 1;

    if (category_code) {
      query += ` AND p.bestbuy_category_code = $${paramIndex}`;
      params.push(category_code);
      paramIndex++;
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.model ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Get count
    const countQuery = query.replace(
      'SELECT p.id, p.model, p.name, p.manufacturer, p.msrp_cents, p.active, p.bestbuy_category_code, bc.name as category_name, bc.category_group',
      'SELECT COUNT(*)'
    );
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY bc.category_group, bc.name, p.name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      products: result.rows,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('❌ Error fetching mapped products:', error);
    res.status(500).json({ error: 'Failed to fetch mapped products' });
  }
});

// Map a single product to a Best Buy category
router.post('/products/:id/map-category', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { category_code } = req.body;

    if (!category_code) {
      return res.status(400).json({ error: 'category_code is required' });
    }

    // Verify category exists
    const categoryCheck = await pool.query(
      'SELECT code, name FROM bestbuy_categories WHERE code = $1',
      [category_code]
    );

    if (categoryCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category code' });
    }

    // Update product
    const result = await pool.query(
      `UPDATE products
       SET bestbuy_category_code = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, model, name, bestbuy_category_code`,
      [category_code, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      success: true,
      product: result.rows[0],
      category: categoryCheck.rows[0]
    });
  } catch (error) {
    console.error('❌ Error mapping product:', error);
    res.status(500).json({ error: 'Failed to map product' });
  }
});

// Bulk map products to a category
router.post('/products/bulk-map', authenticate, async (req, res) => {
  try {
    const { product_ids, category_code } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'product_ids array is required' });
    }

    if (!category_code) {
      return res.status(400).json({ error: 'category_code is required' });
    }

    // Verify category exists
    const categoryCheck = await pool.query(
      'SELECT code, name FROM bestbuy_categories WHERE code = $1',
      [category_code]
    );

    if (categoryCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category code' });
    }

    // Bulk update products
    const result = await pool.query(
      `UPDATE products
       SET bestbuy_category_code = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::int[])
       RETURNING id, model, name`,
      [category_code, product_ids]
    );

    res.json({
      success: true,
      mapped_count: result.rows.length,
      category: categoryCheck.rows[0],
      products: result.rows
    });
  } catch (error) {
    console.error('❌ Error bulk mapping products:', error);
    res.status(500).json({ error: 'Failed to bulk map products' });
  }
});

// Get mapping statistics
router.get('/mapping-stats', authenticate, async (req, res) => {
  try {
    // Total products
    const totalProducts = await pool.query('SELECT COUNT(*) FROM products');

    // Mapped products count
    const mappedProducts = await pool.query(
      `SELECT COUNT(*) FROM products
       WHERE bestbuy_category_code IS NOT NULL AND bestbuy_category_code != ''`
    );

    // Unmapped products count
    const unmappedProducts = await pool.query(
      `SELECT COUNT(*) FROM products
       WHERE bestbuy_category_code IS NULL OR bestbuy_category_code = ''`
    );

    // Active products needing mapping
    const activeUnmapped = await pool.query(
      `SELECT COUNT(*) FROM products
       WHERE active = true AND (bestbuy_category_code IS NULL OR bestbuy_category_code = '')`
    );

    // Products by category
    const byCategory = await pool.query(`
      SELECT bc.code, bc.name, bc.category_group, COUNT(p.id) as product_count
      FROM bestbuy_categories bc
      LEFT JOIN products p ON bc.code = p.bestbuy_category_code
      GROUP BY bc.code, bc.name, bc.category_group
      HAVING COUNT(p.id) > 0
      ORDER BY COUNT(p.id) DESC
    `);

    // Products by manufacturer that need mapping
    const byManufacturer = await pool.query(`
      SELECT manufacturer, COUNT(*) as unmapped_count
      FROM products
      WHERE bestbuy_category_code IS NULL OR bestbuy_category_code = ''
      GROUP BY manufacturer
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);

    res.json({
      total_products: parseInt(totalProducts.rows[0].count),
      mapped_products: parseInt(mappedProducts.rows[0].count),
      unmapped_products: parseInt(unmappedProducts.rows[0].count),
      active_unmapped: parseInt(activeUnmapped.rows[0].count),
      mapping_percentage: totalProducts.rows[0].count > 0
        ? Math.round((mappedProducts.rows[0].count / totalProducts.rows[0].count) * 100)
        : 0,
      by_category: byCategory.rows,
      by_manufacturer: byManufacturer.rows
    });
  } catch (error) {
    console.error('❌ Error fetching mapping stats:', error);
    res.status(500).json({ error: 'Failed to fetch mapping stats' });
  }
});

// Remove category mapping from a product
router.delete('/products/:id/map-category', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE products
       SET bestbuy_category_code = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, model, name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      success: true,
      product: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error removing mapping:', error);
    res.status(500).json({ error: 'Failed to remove mapping' });
  }
});

// ============================================
// DASHBOARD ANALYTICS
// ============================================

// Get comprehensive dashboard analytics
router.get('/dashboard-analytics', authenticate, async (req, res) => {
  try {
    // Revenue and order metrics
    const revenueStats = await pool.query(`
      SELECT
        COALESCE(SUM(total_price_cents), 0) / 100.0 as total_revenue,
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE DATE(order_date) = CURRENT_DATE) as orders_today,
        COUNT(*) FILTER (WHERE order_date >= DATE_TRUNC('week', CURRENT_DATE)) as orders_this_week,
        COUNT(*) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)) as orders_this_month,
        COALESCE(SUM(total_price_cents) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) / 100.0 as revenue_this_month,
        COALESCE(SUM(total_price_cents) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                                          AND order_date < DATE_TRUNC('month', CURRENT_DATE)), 0) / 100.0 as revenue_last_month
      FROM marketplace_orders
    `);

    // Products listed count
    const productsListed = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE bestbuy_category_code IS NOT NULL) as mapped_count,
        COUNT(*) as total_count
      FROM products
      WHERE active = true
    `);

    // Get sync status indicator
    const lastSync = await pool.query(`
      SELECT status, created_at
      FROM marketplace_sync_log
      ORDER BY created_at DESC
      LIMIT 1
    `);

    let syncIndicator = 'green';
    if (lastSync.rows.length > 0) {
      const lastSyncStatus = lastSync.rows[0].status;
      const lastSyncTime = new Date(lastSync.rows[0].created_at);
      const hoursSinceSync = (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60);

      if (lastSyncStatus === 'FAILED') {
        syncIndicator = 'red';
      } else if (hoursSinceSync > 2) {
        syncIndicator = 'yellow';
      }
    } else {
      syncIndicator = 'yellow';
    }

    res.json({
      revenue: {
        total: parseFloat(revenueStats.rows[0].total_revenue) || 0,
        this_month: parseFloat(revenueStats.rows[0].revenue_this_month) || 0,
        last_month: parseFloat(revenueStats.rows[0].revenue_last_month) || 0
      },
      orders: {
        total: parseInt(revenueStats.rows[0].total_orders) || 0,
        today: parseInt(revenueStats.rows[0].orders_today) || 0,
        this_week: parseInt(revenueStats.rows[0].orders_this_week) || 0,
        this_month: parseInt(revenueStats.rows[0].orders_this_month) || 0
      },
      products: {
        listed: parseInt(productsListed.rows[0].mapped_count) || 0,
        total: parseInt(productsListed.rows[0].total_count) || 0
      },
      sync_status: syncIndicator,
      last_sync: lastSync.rows[0]?.created_at || null
    });
  } catch (error) {
    console.error('❌ Error fetching dashboard analytics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard analytics' });
  }
});

// Get sales chart data (last 30 days)
router.get('/sales-chart', authenticate, async (req, res) => {
  try {
    const salesData = await pool.query(`
      SELECT
        DATE(order_date) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total_price_cents), 0) / 100.0 as revenue
      FROM marketplace_orders
      WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(order_date)
      ORDER BY DATE(order_date)
    `);

    // Fill in missing dates with zeros
    const result = [];
    const dataMap = new Map(salesData.rows.map(r => [r.date.toISOString().split('T')[0], r]));

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      if (dataMap.has(dateStr)) {
        result.push({
          date: dateStr,
          order_count: parseInt(dataMap.get(dateStr).order_count),
          revenue: parseFloat(dataMap.get(dateStr).revenue)
        });
      } else {
        result.push({
          date: dateStr,
          order_count: 0,
          revenue: 0
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching sales chart data:', error);
    res.status(500).json({ error: 'Failed to fetch sales chart data' });
  }
});

// Get top selling products
router.get('/top-products', authenticate, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const topProducts = await pool.query(`
      SELECT
        p.id,
        p.model,
        p.name,
        p.manufacturer,
        COUNT(oi.id) as units_sold,
        COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0) / 100.0 as total_revenue
      FROM products p
      INNER JOIN marketplace_order_items oi ON p.id = oi.product_id
      INNER JOIN marketplace_orders mo ON oi.order_id = mo.id
      GROUP BY p.id, p.model, p.name, p.manufacturer
      ORDER BY units_sold DESC
      LIMIT $1
    `, [limit]);

    res.json(topProducts.rows);
  } catch (error) {
    console.error('❌ Error fetching top products:', error);
    res.status(500).json({ error: 'Failed to fetch top products' });
  }
});

// Get sales by category
router.get('/sales-by-category', authenticate, async (req, res) => {
  try {
    const salesByCategory = await pool.query(`
      SELECT
        bc.code,
        bc.name as category_name,
        COUNT(DISTINCT mo.id) as order_count,
        COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0) / 100.0 as revenue
      FROM bestbuy_categories bc
      INNER JOIN products p ON bc.code = p.bestbuy_category_code
      INNER JOIN marketplace_order_items oi ON p.id = oi.product_id
      INNER JOIN marketplace_orders mo ON oi.order_id = mo.id
      GROUP BY bc.code, bc.name
      ORDER BY revenue DESC
      LIMIT 10
    `);

    res.json(salesByCategory.rows);
  } catch (error) {
    console.error('❌ Error fetching sales by category:', error);
    res.status(500).json({ error: 'Failed to fetch sales by category' });
  }
});

// Get inventory health metrics
router.get('/inventory-health', authenticate, async (req, res) => {
  try {
    // Low stock, out of stock, overstocked counts
    // Note: Using a placeholder for quantity since the schema may vary
    const inventoryHealth = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE active = true AND bestbuy_category_code IS NOT NULL) as listed_products,
        COUNT(*) FILTER (WHERE active = false) as inactive_products,
        COUNT(*) FILTER (WHERE bestbuy_category_code IS NULL) as unmapped_products,
        COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days' AND bestbuy_category_code IS NOT NULL) as needs_sync
      FROM products
    `);

    // Products changed since last sync
    const changedProducts = await pool.query(`
      SELECT COUNT(*) as count
      FROM products p
      WHERE p.bestbuy_category_code IS NOT NULL
        AND p.updated_at > COALESCE(p.last_synced_at, '1970-01-01')
    `);

    res.json({
      listed_products: parseInt(inventoryHealth.rows[0].listed_products) || 0,
      inactive_products: parseInt(inventoryHealth.rows[0].inactive_products) || 0,
      unmapped_products: parseInt(inventoryHealth.rows[0].unmapped_products) || 0,
      needs_sync: parseInt(changedProducts.rows[0].count) || 0,
      low_stock: 0,  // Placeholder - implement when inventory tracking is added
      out_of_stock: 0,
      overstocked: 0
    });
  } catch (error) {
    console.error('❌ Error fetching inventory health:', error);
    res.status(500).json({ error: 'Failed to fetch inventory health' });
  }
});

// Get recent activity feed
router.get('/activity-feed', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Combine multiple sources into activity feed
    const activities = [];

    // Recent orders
    const recentOrders = await pool.query(`
      SELECT
        'order' as event_type,
        id,
        mirakl_order_id as reference,
        order_state as status,
        total_price_cents / 100.0 as amount,
        created_at as timestamp,
        'New order received' as description
      FROM marketplace_orders
      ORDER BY created_at DESC
      LIMIT 10
    `);
    activities.push(...recentOrders.rows.map(o => ({
      type: 'order',
      icon: '📦',
      title: `Order #${o.reference?.substring(0, 8) || o.id}`,
      description: `${o.status} - $${parseFloat(o.amount || 0).toFixed(2)}`,
      timestamp: o.timestamp,
      status: o.status
    })));

    // Recent syncs
    const recentSyncs = await pool.query(`
      SELECT
        'sync' as event_type,
        id,
        sync_type,
        status,
        records_processed,
        records_succeeded,
        records_failed,
        created_at as timestamp
      FROM marketplace_sync_log
      ORDER BY created_at DESC
      LIMIT 10
    `);
    activities.push(...recentSyncs.rows.map(s => ({
      type: 'sync',
      icon: s.status === 'SUCCESS' ? '✅' : '❌',
      title: `${s.sync_type} Sync`,
      description: `${s.records_succeeded || 0} succeeded, ${s.records_failed || 0} failed`,
      timestamp: s.timestamp,
      status: s.status
    })));

    // Recent shipments
    const recentShipments = await pool.query(`
      SELECT
        'shipment' as event_type,
        s.id,
        s.tracking_number,
        s.carrier_name,
        s.shipment_status,
        s.created_at as timestamp,
        mo.mirakl_order_id
      FROM marketplace_shipments s
      LEFT JOIN marketplace_orders mo ON s.order_id = mo.id
      ORDER BY s.created_at DESC
      LIMIT 5
    `);
    activities.push(...recentShipments.rows.map(sh => ({
      type: 'shipment',
      icon: '🚚',
      title: `Shipment Created`,
      description: `${sh.carrier_name || 'Carrier'} - ${sh.tracking_number || 'No tracking'}`,
      timestamp: sh.timestamp,
      status: sh.shipment_status
    })));

    // Recent webhook events
    const recentWebhooks = await pool.query(`
      SELECT
        'webhook' as event_type,
        id,
        event_type as webhook_type,
        processed_at,
        created_at as timestamp
      FROM marketplace_webhook_events
      ORDER BY created_at DESC
      LIMIT 5
    `);
    activities.push(...recentWebhooks.rows.map(w => ({
      type: 'webhook',
      icon: '📨',
      title: `Webhook: ${w.webhook_type}`,
      description: w.processed_at ? 'Processed' : 'Pending',
      timestamp: w.timestamp,
      status: w.processed_at ? 'processed' : 'pending'
    })));

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(activities.slice(0, parseInt(limit)));
  } catch (error) {
    console.error('❌ Error fetching activity feed:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// Get orders by state for dashboard
router.get('/orders-by-state', authenticate, async (req, res) => {
  try {
    const ordersByState = await pool.query(`
      SELECT
        order_state,
        COUNT(*) as count
      FROM marketplace_orders
      GROUP BY order_state
      ORDER BY count DESC
    `);

    res.json(ordersByState.rows);
  } catch (error) {
    console.error('❌ Error fetching orders by state:', error);
    res.status(500).json({ error: 'Failed to fetch orders by state' });
  }
});

// ============================================
// NOTIFICATION SYSTEM
// ============================================

// Get all notifications with pagination
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, unread_only = false } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT n.*, mo.customer_name, mo.order_state
      FROM marketplace_notifications n
      LEFT JOIN marketplace_orders mo ON n.order_id = mo.id
      WHERE n.dismissed = false
    `;

    if (unread_only === 'true') {
      query += ` AND n.read = false`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT $1 OFFSET $2`;

    const notifications = await pool.query(query, [limit, offset]);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM marketplace_notifications WHERE dismissed = false`;
    if (unread_only === 'true') {
      countQuery += ` AND read = false`;
    }
    const totalCount = await pool.query(countQuery);

    // Get unread count
    const unreadCount = await pool.query(`
      SELECT COUNT(*) FROM marketplace_notifications WHERE read = false AND dismissed = false
    `);

    res.json({
      notifications: notifications.rows,
      total: parseInt(totalCount.rows[0].count),
      unread_count: parseInt(unreadCount.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread notification count
router.get('/notifications/unread-count', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM marketplace_notifications WHERE read = false AND dismissed = false
    `);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('❌ Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE marketplace_notifications
      SET read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/notifications/mark-all-read', authenticate, async (req, res) => {
  try {
    await pool.query(`
      UPDATE marketplace_notifications
      SET read = true, read_at = CURRENT_TIMESTAMP
      WHERE read = false
    `);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Dismiss notification
router.put('/notifications/:id/dismiss', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`
      UPDATE marketplace_notifications
      SET dismissed = true, dismissed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error dismissing notification:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

// Create notification (internal use)
async function createNotification(type, title, message, orderId = null, miraklOrderId = null, priority = 'normal', metadata = {}) {
  try {
    const result = await pool.query(`
      INSERT INTO marketplace_notifications (type, title, message, order_id, mirakl_order_id, priority, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [type, title, message, orderId, miraklOrderId, priority, JSON.stringify(metadata)]);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    return null;
  }
}

// ============================================
// ORDER SETTINGS
// ============================================

// Get all settings
router.get('/order-settings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM marketplace_order_settings ORDER BY setting_key`);

    // Convert to key-value object
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching order settings:', error);
    res.status(500).json({ error: 'Failed to fetch order settings' });
  }
});

// Update a setting
router.put('/order-settings/:key', authenticate, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const result = await pool.query(`
      UPDATE marketplace_order_settings
      SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
      WHERE setting_key = $2
      RETURNING *
    `, [JSON.stringify(value), key]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// ============================================
// BATCH ORDER PROCESSING
// ============================================

// Batch accept orders
router.post('/orders/batch-accept', authenticate, async (req, res) => {
  try {
    const { order_ids } = req.body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'order_ids array is required' });
    }

    const results = {
      success: [],
      failed: []
    };

    // OPTIMIZED: Batch fetch all orders at once instead of N+1 pattern
    const ordersResult = await pool.query(
      `SELECT * FROM marketplace_orders WHERE id = ANY($1)`,
      [order_ids]
    );
    const ordersMap = new Map(ordersResult.rows.map(o => [o.id, o]));

    // Track successful order IDs for batch update
    const successfulOrderIds = [];
    const successfulOrders = [];

    for (const orderId of order_ids) {
      try {
        const order = ordersMap.get(orderId);

        if (!order) {
          results.failed.push({ id: orderId, error: 'Order not found' });
          continue;
        }

        // Check if order can be accepted
        if (order.order_state !== 'WAITING_ACCEPTANCE') {
          results.failed.push({ id: orderId, error: `Order state is ${order.order_state}, cannot accept` });
          continue;
        }

        // Call Mirakl API to accept
        try {
          await miraklService.acceptOrder(order.mirakl_order_id);
          successfulOrderIds.push(orderId);
          successfulOrders.push(order);
          results.success.push({ id: orderId, mirakl_order_id: order.mirakl_order_id });
        } catch (apiError) {
          results.failed.push({ id: orderId, error: apiError.message || 'Mirakl API error' });
        }
      } catch (err) {
        results.failed.push({ id: orderId, error: err.message });
      }
    }

    // OPTIMIZED: Batch update all successful orders at once
    if (successfulOrderIds.length > 0) {
      await pool.query(`
        UPDATE marketplace_orders
        SET order_state = 'SHIPPING',
            acceptance_decision_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1)
      `, [successfulOrderIds]);

      // Create notifications for all successful orders
      for (const order of successfulOrders) {
        await createNotification(
          'order_accepted',
          'Order Accepted',
          `Order #${order.mirakl_order_id.substring(0, 8)} has been accepted`,
          order.id,
          order.mirakl_order_id,
          'normal'
        );
      }
    }

    res.json({
      success: true,
      accepted: results.success.length,
      failed: results.failed.length,
      results
    });
  } catch (error) {
    console.error('❌ Error batch accepting orders:', error);
    res.status(500).json({ error: 'Failed to batch accept orders' });
  }
});

// Batch reject orders
router.post('/orders/batch-reject', authenticate, async (req, res) => {
  try {
    const { order_ids, reason } = req.body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'order_ids array is required' });
    }

    const rejectReason = reason || 'Out of stock';
    const results = {
      success: [],
      failed: []
    };

    // OPTIMIZED: Batch fetch all orders at once instead of N+1 pattern
    const ordersResult = await pool.query(
      `SELECT * FROM marketplace_orders WHERE id = ANY($1)`,
      [order_ids]
    );
    const ordersMap = new Map(ordersResult.rows.map(o => [o.id, o]));

    // Track successful order IDs for batch update
    const successfulOrderIds = [];
    const successfulOrders = [];

    for (const orderId of order_ids) {
      try {
        const order = ordersMap.get(orderId);

        if (!order) {
          results.failed.push({ id: orderId, error: 'Order not found' });
          continue;
        }

        // Check if order can be rejected
        if (order.order_state !== 'WAITING_ACCEPTANCE') {
          results.failed.push({ id: orderId, error: `Order state is ${order.order_state}, cannot reject` });
          continue;
        }

        // Call Mirakl API to reject
        try {
          await miraklService.rejectOrder(order.mirakl_order_id, rejectReason);
          successfulOrderIds.push(orderId);
          successfulOrders.push(order);
          results.success.push({ id: orderId, mirakl_order_id: order.mirakl_order_id });
        } catch (apiError) {
          results.failed.push({ id: orderId, error: apiError.message || 'Mirakl API error' });
        }
      } catch (err) {
        results.failed.push({ id: orderId, error: err.message });
      }
    }

    // OPTIMIZED: Batch update all rejected orders at once
    if (successfulOrderIds.length > 0) {
      await pool.query(`
        UPDATE marketplace_orders
        SET order_state = 'REFUSED',
            canceled_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1)
      `, [successfulOrderIds]);

      // Create notifications for all rejected orders
      for (const order of successfulOrders) {
        await createNotification(
          'order_rejected',
          'Order Rejected',
          `Order #${order.mirakl_order_id.substring(0, 8)} has been rejected: ${rejectReason}`,
          order.id,
          order.mirakl_order_id,
          'normal'
        );
      }
    }

    res.json({
      success: true,
      rejected: results.success.length,
      failed: results.failed.length,
      results
    });
  } catch (error) {
    console.error('❌ Error batch rejecting orders:', error);
    res.status(500).json({ error: 'Failed to batch reject orders' });
  }
});

// Export orders as CSV
router.post('/orders/export', authenticate, async (req, res) => {
  try {
    const { order_ids, format = 'csv' } = req.body;

    let query = `
      SELECT
        mo.id,
        mo.mirakl_order_id,
        mo.order_state,
        mo.customer_name,
        mo.customer_email,
        mo.total_price_cents / 100.0 as total_price,
        mo.currency,
        mo.shipping_price_cents / 100.0 as shipping_price,
        mo.tax_cents / 100.0 as tax,
        mo.order_date,
        mo.created_at
      FROM marketplace_orders mo
    `;

    let params = [];
    if (order_ids && Array.isArray(order_ids) && order_ids.length > 0) {
      query += ` WHERE mo.id = ANY($1)`;
      params = [order_ids];
    }

    query += ` ORDER BY mo.order_date DESC`;

    const result = await pool.query(query, params);

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Order ID', 'Mirakl Order ID', 'Status', 'Customer', 'Email', 'Total', 'Currency', 'Shipping', 'Tax', 'Order Date', 'Created'];
      const csvRows = [headers.join(',')];

      result.rows.forEach(row => {
        csvRows.push([
          row.id,
          row.mirakl_order_id,
          row.order_state,
          `"${(row.customer_name || '').replace(/"/g, '""')}"`,
          row.customer_email,
          row.total_price,
          row.currency,
          row.shipping_price,
          row.tax,
          row.order_date ? new Date(row.order_date).toISOString() : '',
          row.created_at ? new Date(row.created_at).toISOString() : ''
        ].join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=orders_export_${Date.now()}.csv`);
      res.send(csvRows.join('\n'));
    } else {
      // Return JSON
      res.json(result.rows);
    }
  } catch (error) {
    console.error('❌ Error exporting orders:', error);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

// Generate packing slip data for orders
router.post('/orders/packing-slips', authenticate, async (req, res) => {
  try {
    const { order_ids } = req.body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'order_ids array is required' });
    }

    const orders = await pool.query(`
      SELECT
        mo.*,
        mo.total_price_cents / 100.0 as total_price,
        mo.shipping_price_cents / 100.0 as shipping_price,
        mo.tax_cents / 100.0 as tax
      FROM marketplace_orders mo
      WHERE mo.id = ANY($1)
      ORDER BY mo.order_date DESC
    `, [order_ids]);

    // OPTIMIZED: Batch fetch all order items at once instead of N+1 pattern
    const allItems = await pool.query(`
      SELECT
        oi.*,
        oi.unit_price_cents / 100.0 as unit_price,
        oi.total_price_cents / 100.0 as total_price,
        p.name as product_name,
        p.manufacturer
      FROM marketplace_order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ANY($1)
      ORDER BY oi.order_id
    `, [order_ids]);

    // Group items by order_id
    const itemsByOrder = new Map();
    for (const item of allItems.rows) {
      if (!itemsByOrder.has(item.order_id)) {
        itemsByOrder.set(item.order_id, []);
      }
      itemsByOrder.get(item.order_id).push(item);
    }

    // Build packing slips
    const packingSlips = orders.rows.map(order => {
      const items = itemsByOrder.get(order.id) || [];
      return {
        order_id: order.id,
        mirakl_order_id: order.mirakl_order_id,
        order_date: order.order_date,
        customer: {
          name: order.customer_name,
          email: order.customer_email
        },
        shipping_address: order.shipping_address,
        billing_address: order.billing_address,
        items: items,
        totals: {
          subtotal: items.reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0),
          shipping: parseFloat(order.shipping_price || 0),
          tax: parseFloat(order.tax || 0),
          total: parseFloat(order.total_price || 0)
        }
      };
    });

    res.json(packingSlips);
  } catch (error) {
    console.error('❌ Error generating packing slips:', error);
    res.status(500).json({ error: 'Failed to generate packing slips' });
  }
});

// ============================================
// AUTO-ACCEPT RULES
// ============================================

// Get all auto-rules
router.get('/auto-rules', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM marketplace_auto_rules
      ORDER BY priority ASC, created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching auto-rules:', error);
    res.status(500).json({ error: 'Failed to fetch auto-rules' });
  }
});

// Get single auto-rule
router.get('/auto-rules/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM marketplace_auto_rules WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching auto-rule:', error);
    res.status(500).json({ error: 'Failed to fetch auto-rule' });
  }
});

// Create auto-rule
router.post('/auto-rules', authenticate, async (req, res) => {
  try {
    const { name, description, rule_type, conditions, action, action_params, priority, enabled } = req.body;

    if (!name || !rule_type || !action) {
      return res.status(400).json({ error: 'name, rule_type, and action are required' });
    }

    const result = await pool.query(`
      INSERT INTO marketplace_auto_rules (name, description, rule_type, conditions, action, action_params, priority, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      name,
      description || null,
      rule_type,
      JSON.stringify(conditions || []),
      action,
      JSON.stringify(action_params || {}),
      priority || 100,
      enabled !== false
    ]);

    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    console.error('❌ Error creating auto-rule:', error);
    res.status(500).json({ error: 'Failed to create auto-rule' });
  }
});

// Update auto-rule
router.put('/auto-rules/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, rule_type, conditions, action, action_params, priority, enabled } = req.body;

    const result = await pool.query(`
      UPDATE marketplace_auto_rules
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        rule_type = COALESCE($3, rule_type),
        conditions = COALESCE($4, conditions),
        action = COALESCE($5, action),
        action_params = COALESCE($6, action_params),
        priority = COALESCE($7, priority),
        enabled = COALESCE($8, enabled),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [
      name,
      description,
      rule_type,
      conditions ? JSON.stringify(conditions) : null,
      action,
      action_params ? JSON.stringify(action_params) : null,
      priority,
      enabled,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating auto-rule:', error);
    res.status(500).json({ error: 'Failed to update auto-rule' });
  }
});

// Toggle auto-rule enabled status
router.put('/auto-rules/:id/toggle', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE marketplace_auto_rules
      SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    console.error('❌ Error toggling auto-rule:', error);
    res.status(500).json({ error: 'Failed to toggle auto-rule' });
  }
});

// Delete auto-rule
router.delete('/auto-rules/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`DELETE FROM marketplace_auto_rules WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting auto-rule:', error);
    res.status(500).json({ error: 'Failed to delete auto-rule' });
  }
});

// Get rule logs
router.get('/auto-rules/:id/logs', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const result = await pool.query(`
      SELECT rl.*, mo.customer_name, mo.order_state
      FROM marketplace_rule_logs rl
      LEFT JOIN marketplace_orders mo ON rl.order_id = mo.id
      WHERE rl.rule_id = $1
      ORDER BY rl.created_at DESC
      LIMIT $2
    `, [id, limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching rule logs:', error);
    res.status(500).json({ error: 'Failed to fetch rule logs' });
  }
});

// Evaluate rules for an order (internal function)
async function evaluateRulesForOrder(order, orderItems) {
  try {
    // Get all enabled rules sorted by priority
    const rulesResult = await pool.query(`
      SELECT * FROM marketplace_auto_rules
      WHERE enabled = true
      ORDER BY priority ASC
    `);

    const rules = rulesResult.rows;
    const results = [];

    for (const rule of rules) {
      const conditions = rule.conditions || [];
      let allConditionsMet = true;

      // Evaluate each condition
      for (const condition of conditions) {
        const met = evaluateCondition(condition, order, orderItems);
        if (!met) {
          allConditionsMet = false;
          break;
        }
      }

      if (allConditionsMet) {
        // Log the rule trigger
        await pool.query(`
          INSERT INTO marketplace_rule_logs (rule_id, order_id, mirakl_order_id, action_taken, conditions_matched, result)
          VALUES ($1, $2, $3, $4, $5, 'triggered')
        `, [rule.id, order.id, order.mirakl_order_id, rule.action, JSON.stringify(conditions)]);

        // Update rule trigger count
        await pool.query(`
          UPDATE marketplace_auto_rules
          SET trigger_count = trigger_count + 1, last_triggered_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [rule.id]);

        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          action: rule.action,
          action_params: rule.action_params
        });

        // If this is an auto_accept or auto_reject rule, stop evaluating further rules
        if (rule.rule_type === 'auto_accept' || rule.rule_type === 'auto_reject') {
          break;
        }
      }
    }

    return results;
  } catch (error) {
    console.error('❌ Error evaluating rules:', error);
    return [];
  }
}

// Evaluate a single condition
function evaluateCondition(condition, order, orderItems) {
  const { field, operator, value } = condition;

  let fieldValue;

  // Get field value based on field name
  switch (field) {
    case 'order_total':
      fieldValue = order.total_price_cents / 100;
      break;
    case 'max_quantity':
      fieldValue = orderItems.reduce((max, item) => Math.max(max, item.quantity), 0);
      break;
    case 'total_quantity':
      fieldValue = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      break;
    case 'all_items_in_stock':
      // Check if all items have sufficient stock
      fieldValue = orderItems.every(item => {
        const qtyOnHand = item.qty_on_hand ?? item.stock ?? item.inventory ?? null;
        if (qtyOnHand === null) return true; // Default to true if inventory data unavailable
        return qtyOnHand >= (item.quantity || 1);
      });
      break;
    case 'any_item_out_of_stock':
      // Check if any item is out of stock
      fieldValue = orderItems.some(item => {
        const qtyOnHand = item.qty_on_hand ?? item.stock ?? item.inventory ?? null;
        if (qtyOnHand === null) return false; // Default to false if inventory data unavailable
        return qtyOnHand < (item.quantity || 1);
      });
      break;
    case 'category_is':
      fieldValue = orderItems.some(item => item.bestbuy_category_code === value);
      return fieldValue;
    case 'customer_location':
      fieldValue = order.shipping_address?.country || order.shipping_address?.state;
      break;
    default:
      return false;
  }

  // Evaluate operator
  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'not_equals':
      return fieldValue !== value;
    case 'greater_than':
      return fieldValue > value;
    case 'less_than':
      return fieldValue < value;
    case 'greater_than_or_equal':
      return fieldValue >= value;
    case 'less_than_or_equal':
      return fieldValue <= value;
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    default:
      return false;
  }
}

// Check for new orders and create notifications (called by scheduler)
async function checkForNewOrders() {
  try {
    // Get orders from last check
    const settingResult = await pool.query(`
      SELECT setting_value FROM marketplace_order_settings WHERE setting_key = 'last_order_check'
    `);

    let lastCheck = new Date(Date.now() - 5 * 60 * 1000); // Default to 5 minutes ago
    if (settingResult.rows.length > 0) {
      lastCheck = new Date(settingResult.rows[0].setting_value.timestamp);
    }

    // Get new orders since last check
    const newOrders = await pool.query(`
      SELECT * FROM marketplace_orders
      WHERE created_at > $1 AND order_state = 'WAITING_ACCEPTANCE'
      ORDER BY created_at ASC
    `, [lastCheck]);

    // Create notifications for new orders
    for (const order of newOrders.rows) {
      await createNotification(
        'new_order',
        'New Order Received',
        `Order #${order.mirakl_order_id.substring(0, 8)} - $${(order.total_price_cents / 100).toFixed(2)} from ${order.customer_name || 'Customer'}`,
        order.id,
        order.mirakl_order_id,
        'high',
        { total: order.total_price_cents / 100 }
      );

      // Get order items and evaluate rules
      const itemsResult = await pool.query(`
        SELECT oi.*, p.bestbuy_category_code
        FROM marketplace_order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [order.id]);

      const triggeredRules = await evaluateRulesForOrder(order, itemsResult.rows);

      // Execute rule actions
      for (const triggered of triggeredRules) {
        if (triggered.action === 'accept') {
          // Auto-accept the order
          try {
            await miraklService.acceptOrder(order.mirakl_order_id);
            await pool.query(`
              UPDATE marketplace_orders
              SET order_state = 'SHIPPING', acceptance_decision_date = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [order.id]);

            await createNotification(
              'auto_accepted',
              'Order Auto-Accepted',
              `Order #${order.mirakl_order_id.substring(0, 8)} was automatically accepted by rule: ${triggered.rule_name}`,
              order.id,
              order.mirakl_order_id,
              'normal'
            );
          } catch (err) {
            console.error('❌ Auto-accept failed:', err);
          }
        } else if (triggered.action === 'reject') {
          // Auto-reject the order
          const reason = triggered.action_params?.reason || 'Automatically rejected';
          try {
            await miraklService.rejectOrder(order.mirakl_order_id, reason);
            await pool.query(`
              UPDATE marketplace_orders
              SET order_state = 'REFUSED', canceled_date = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [order.id]);

            await createNotification(
              'auto_rejected',
              'Order Auto-Rejected',
              `Order #${order.mirakl_order_id.substring(0, 8)} was automatically rejected by rule: ${triggered.rule_name}`,
              order.id,
              order.mirakl_order_id,
              'normal'
            );
          } catch (err) {
            console.error('❌ Auto-reject failed:', err);
          }
        } else if (triggered.action === 'notify') {
          // Create alert notification
          await createNotification(
            'rule_alert',
            triggered.action_params?.title || 'Order Alert',
            triggered.action_params?.message || `Order #${order.mirakl_order_id.substring(0, 8)} triggered alert rule: ${triggered.rule_name}`,
            order.id,
            order.mirakl_order_id,
            triggered.action_params?.priority || 'high'
          );
        }
      }
    }

    // Update last check timestamp
    await pool.query(`
      INSERT INTO marketplace_order_settings (setting_key, setting_value)
      VALUES ('last_order_check', $1)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1
    `, [JSON.stringify({ timestamp: new Date().toISOString() })]);

    return { checked: newOrders.rows.length };
  } catch (error) {
    console.error('❌ Error checking for new orders:', error);
    return { error: error.message };
  }
}

// Manual trigger to check for new orders
router.post('/check-new-orders', authenticate, async (req, res) => {
  try {
    const result = await checkForNewOrders();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error checking new orders:', error);
    res.status(500).json({ error: 'Failed to check new orders' });
  }
});

// Get order detail with items
router.get('/orders/:id/detail', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const orderResult = await pool.query(`
      SELECT
        mo.*,
        mo.total_price_cents / 100.0 as total_price,
        mo.shipping_price_cents / 100.0 as shipping_price,
        mo.tax_cents / 100.0 as tax,
        mo.commission_fee_cents / 100.0 as commission_fee
      FROM marketplace_orders mo
      WHERE mo.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsResult = await pool.query(`
      SELECT
        oi.*,
        oi.unit_price_cents / 100.0 as unit_price,
        oi.total_price_cents / 100.0 as total_price,
        oi.commission_fee_cents / 100.0 as commission_fee,
        oi.tax_cents / 100.0 as tax,
        p.name as product_name,
        p.model,
        p.manufacturer,
        p.bestbuy_category_code
      FROM marketplace_order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [id]);

    // Get shipments
    const shipmentsResult = await pool.query(`
      SELECT * FROM marketplace_shipments WHERE order_id = $1
    `, [id]);

    // Get related notifications
    const notificationsResult = await pool.query(`
      SELECT * FROM marketplace_notifications
      WHERE order_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [id]);

    res.json({
      order,
      items: itemsResult.rows,
      shipments: shipmentsResult.rows,
      notifications: notificationsResult.rows
    });
  } catch (error) {
    console.error('❌ Error fetching order detail:', error);
    res.status(500).json({ error: 'Failed to fetch order detail' });
  }
});

// ============================================
// INVENTORY SYNC & PRICING ENDPOINTS
// ============================================

const inventorySyncScheduler = require('../services/inventorySyncScheduler');

// Get sync settings
router.get('/sync-settings', authenticate, async (req, res) => {
  try {
    const settings = await inventorySyncScheduler.getSyncSettings();
    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching sync settings:', error);
    res.status(500).json({ error: 'Failed to fetch sync settings' });
  }
});

// Update sync setting
router.put('/sync-settings/:key', authenticate, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    await inventorySyncScheduler.updateSetting(key, value);

    // Restart scheduler if auto-sync or frequency changed
    if (key === 'auto_sync_enabled' || key === 'sync_frequency_hours') {
      await inventorySyncScheduler.restart();
    }

    res.json({ success: true, key, value });
  } catch (error) {
    console.error('❌ Error updating sync setting:', error);
    res.status(500).json({ error: 'Failed to update sync setting' });
  }
});

// Manual trigger inventory sync (OUTBOUND - push to Best Buy)
router.post('/run-inventory-sync', authenticate, async (req, res) => {
  try {
    const forceFullSync = req.body?.forceFullSync || false;
    const result = await inventorySyncScheduler.runSync({ forceFullSync });
    res.json(result);
  } catch (error) {
    console.error('❌ Error running inventory sync:', error);
    res.status(500).json({ error: 'Failed to run inventory sync' });
  }
});

// Pull offers FROM Best Buy INTO local system (INBOUND)
router.post('/pull-offers-from-bestbuy', authenticate, async (req, res) => {
  try {
    // Fetch all offers from Best Buy
    const offers = await miraklService.getOffers({ max: 1000 });

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (const offer of offers) {
      try {
        // Check if product already exists by shop_sku or product_sku
        const existingProduct = await pool.query(
          `SELECT id FROM products WHERE mirakl_sku = $1 OR model = $2`,
          [offer.shop_sku, offer.shop_sku]
        );

        // Extract UPC from product_references
        let upc = null;
        if (offer.product_references && offer.product_references.length > 0) {
          const upcRef = offer.product_references.find(r => r.reference_type === 'UPC-A' || r.reference_type === 'EAN');
          if (upcRef) upc = upcRef.reference;
        }

        // Convert price to cents
        const priceCents = Math.round((offer.price || 0) * 100);
        const msrpCents = offer.msrp ? Math.round(offer.msrp * 100) : priceCents;

        // Check if category code exists in bestbuy_categories, set to null if not
        let validCategoryCode = null;
        if (offer.category_code) {
          const categoryCheck = await pool.query(
            `SELECT code FROM bestbuy_categories WHERE code = $1`,
            [offer.category_code]
          );
          if (categoryCheck.rows.length > 0) {
            validCategoryCode = offer.category_code;
          }
        }

        if (existingProduct.rows.length > 0) {
          // Update existing product
          await pool.query(`
            UPDATE products SET
              mirakl_sku = $1,
              mirakl_offer_id = $2,
              marketplace_price = $3,
              stock_quantity = $4,
              bestbuy_category_code = $5,
              last_synced_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
          `, [
            offer.shop_sku,
            offer.offer_id,
            offer.price,
            offer.quantity || 0,
            validCategoryCode,
            existingProduct.rows[0].id
          ]);
          updated++;
        } else {
          // Insert new product
          await pool.query(`
            INSERT INTO products (
              model, name, manufacturer, mirakl_sku, mirakl_offer_id,
              price, msrp_cents, marketplace_price, stock_quantity,
              bestbuy_category_code, category, active, last_synced_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [
            offer.shop_sku,
            offer.product_title || offer.shop_sku,
            offer.product_brand || 'Unknown',
            offer.shop_sku,
            offer.offer_id,
            offer.price,
            msrpCents,
            offer.price,
            offer.quantity || 0,
            validCategoryCode,
            offer.category_label || 'Marketplace Import',
            offer.active !== false
          ]);
          imported++;
        }
      } catch (err) {
        console.error(`❌ Failed to import offer ${offer.shop_sku}:`, err.message);
        failed++;
        errors.push({ sku: offer.shop_sku, error: err.message });
      }
    }

    // Log the sync
    await miraklService.logSync('offer_import', 'product', failed > 0 ? 'PARTIAL' : 'SUCCESS', {
      direction: 'inbound',
      recordsProcessed: offers.length,
      recordsSucceeded: imported + updated,
      recordsFailed: failed,
      startTime: new Date(),
      endTime: new Date()
    });

    res.json({
      success: true,
      total_offers: offers.length,
      imported,
      updated,
      failed,
      errors: errors.slice(0, 10) // Return first 10 errors
    });

  } catch (error) {
    console.error('❌ Error pulling offers from Best Buy:', error);
    res.status(500).json({ error: 'Failed to pull offers: ' + error.message });
  }
});

// Get sync history
router.get('/sync-history', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const history = await inventorySyncScheduler.getSyncHistory(parseInt(limit));
    res.json(history);
  } catch (error) {
    console.error('❌ Error fetching sync history:', error);
    res.status(500).json({ error: 'Failed to fetch sync history' });
  }
});

// Preview prices before applying
router.get('/preview-prices', authenticate, async (req, res) => {
  try {
    const { product_ids, limit = 50 } = req.query;
    const productIds = product_ids ? product_ids.split(',').map(id => parseInt(id)) : null;
    const previews = await inventorySyncScheduler.previewPrices(productIds, parseInt(limit));
    res.json({ previews, count: previews.length });
  } catch (error) {
    console.error('❌ Error previewing prices:', error);
    res.status(500).json({ error: 'Failed to preview prices' });
  }
});

// ============================================
// PRICE RULES ENDPOINTS
// ============================================

// Get all price rules
router.get('/price-rules', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pr.*,
        (SELECT COUNT(*) FROM products WHERE marketplace_price_rule_id = pr.id) as products_count
      FROM marketplace_price_rules pr
      ORDER BY pr.priority DESC, pr.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching price rules:', error);
    res.status(500).json({ error: 'Failed to fetch price rules' });
  }
});

// Get single price rule
router.get('/price-rules/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM marketplace_price_rules WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price rule not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching price rule:', error);
    res.status(500).json({ error: 'Failed to fetch price rule' });
  }
});

// Create price rule
router.post('/price-rules', authenticate, async (req, res) => {
  try {
    const {
      name,
      description,
      rule_type,
      value,
      category_code,
      manufacturer,
      min_price,
      max_price,
      priority = 100,
      enabled = true,
      apply_globally = false
    } = req.body;

    const result = await pool.query(`
      INSERT INTO marketplace_price_rules
        (name, description, rule_type, value, category_code, manufacturer, min_price, max_price, priority, enabled, apply_globally)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [name, description, rule_type, value, category_code, manufacturer, min_price, max_price, priority, enabled, apply_globally]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating price rule:', error);
    res.status(500).json({ error: 'Failed to create price rule' });
  }
});

// Update price rule
router.put('/price-rules/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      rule_type,
      value,
      category_code,
      manufacturer,
      min_price,
      max_price,
      priority,
      enabled,
      apply_globally
    } = req.body;

    const result = await pool.query(`
      UPDATE marketplace_price_rules
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        rule_type = COALESCE($3, rule_type),
        value = COALESCE($4, value),
        category_code = $5,
        manufacturer = $6,
        min_price = $7,
        max_price = $8,
        priority = COALESCE($9, priority),
        enabled = COALESCE($10, enabled),
        apply_globally = COALESCE($11, apply_globally),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [name, description, rule_type, value, category_code, manufacturer, min_price, max_price, priority, enabled, apply_globally, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price rule not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating price rule:', error);
    res.status(500).json({ error: 'Failed to update price rule' });
  }
});

// Toggle price rule enabled/disabled
router.put('/price-rules/:id/toggle', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE marketplace_price_rules
      SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price rule not found' });
    }

    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    console.error('❌ Error toggling price rule:', error);
    res.status(500).json({ error: 'Failed to toggle price rule' });
  }
});

// Delete price rule
router.delete('/price-rules/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // First remove any product references
    await pool.query('UPDATE products SET marketplace_price_rule_id = NULL WHERE marketplace_price_rule_id = $1', [id]);

    const result = await pool.query('DELETE FROM marketplace_price_rules WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price rule not found' });
    }

    res.json({ success: true, deleted_id: id });
  } catch (error) {
    console.error('❌ Error deleting price rule:', error);
    res.status(500).json({ error: 'Failed to delete price rule' });
  }
});

// ============================================
// STOCK BUFFER ENDPOINTS
// ============================================

// Get global stock buffer
router.get('/stock-buffer', authenticate, async (req, res) => {
  try {
    const buffer = await inventorySyncScheduler.getGlobalStockBuffer();
    res.json({ global_buffer: buffer });
  } catch (error) {
    console.error('❌ Error fetching stock buffer:', error);
    res.status(500).json({ error: 'Failed to fetch stock buffer' });
  }
});

// Update global stock buffer
router.put('/stock-buffer', authenticate, async (req, res) => {
  try {
    const { value } = req.body;

    if (value < 0) {
      return res.status(400).json({ error: 'Stock buffer cannot be negative' });
    }

    await inventorySyncScheduler.updateSetting('global_stock_buffer', { value: parseInt(value) });
    res.json({ success: true, global_buffer: parseInt(value) });
  } catch (error) {
    console.error('❌ Error updating stock buffer:', error);
    res.status(500).json({ error: 'Failed to update stock buffer' });
  }
});

// Update product-specific stock buffer
router.put('/products/:id/stock-buffer', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { buffer } = req.body;

    // null means use global buffer
    const bufferValue = buffer === null || buffer === '' ? null : parseInt(buffer);

    if (bufferValue !== null && bufferValue < 0) {
      return res.status(400).json({ error: 'Stock buffer cannot be negative' });
    }

    const result = await pool.query(`
      UPDATE products
      SET marketplace_stock_buffer = $1
      WHERE id = $2
      RETURNING id, model, marketplace_stock_buffer
    `, [bufferValue, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating product stock buffer:', error);
    res.status(500).json({ error: 'Failed to update product stock buffer' });
  }
});

// Bulk update stock buffers
router.put('/products/bulk-stock-buffer', authenticate, async (req, res) => {
  try {
    const { product_ids, buffer } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'Product IDs required' });
    }

    const bufferValue = buffer === null || buffer === '' ? null : parseInt(buffer);

    if (bufferValue !== null && bufferValue < 0) {
      return res.status(400).json({ error: 'Stock buffer cannot be negative' });
    }

    const result = await pool.query(`
      UPDATE products
      SET marketplace_stock_buffer = $1
      WHERE id = ANY($2)
      RETURNING id
    `, [bufferValue, product_ids]);

    res.json({ success: true, updated_count: result.rowCount });
  } catch (error) {
    console.error('❌ Error bulk updating stock buffers:', error);
    res.status(500).json({ error: 'Failed to bulk update stock buffers' });
  }
});

// Get products with marketplace info for inventory management
router.get('/inventory-products', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', category = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        p.id,
        p.model,
        p.name,
        p.manufacturer,
        p.mirakl_sku as sku,
        p.price,
        p.cost,
        COALESCE(p.stock_quantity, 0) as stock_quantity,
        p.marketplace_stock_buffer,
        p.marketplace_price,
        p.marketplace_last_synced,
        p.bestbuy_category_code,
        p.active,
        c.name as category_name
      FROM products p
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      WHERE p.bestbuy_category_code IS NOT NULL
    `;

    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.manufacturer ILIKE $${paramIndex} OR p.mirakl_sku ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      query += ` AND p.bestbuy_category_code = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Count query
    const countQuery = query.replace('SELECT\n        p.id,', 'SELECT COUNT(*) as total FROM (SELECT p.id,') + ') sub';

    query += ` ORDER BY p.updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2))
    ]);

    const globalBuffer = await inventorySyncScheduler.getGlobalStockBuffer();

    // Add effective stock to each product
    const products = dataResult.rows.map(p => ({
      ...p,
      effective_stock: inventorySyncScheduler.calculateEffectiveStock(
        p.stock_quantity,
        p.marketplace_stock_buffer,
        globalBuffer
      ),
      uses_global_buffer: p.marketplace_stock_buffer === null
    }));

    res.json({
      products,
      total: parseInt(countResult.rows[0]?.total || 0),
      page: parseInt(page),
      limit: parseInt(limit),
      global_buffer: globalBuffer
    });
  } catch (error) {
    console.error('❌ Error fetching inventory products:', error);
    res.status(500).json({ error: 'Failed to fetch inventory products' });
  }
});

// ============================================
// CUSTOMER INTEGRATION
// ============================================

// Match order to customer
router.post('/orders/:id/match-customer', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_id, create_new } = req.body;

    // Get the order
    const orderResult = await pool.query(
      'SELECT * FROM marketplace_orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (customer_id) {
      // Link to existing customer
      await pool.query(`
        UPDATE marketplace_orders
        SET customer_id = $1, customer_match_type = 'manual', customer_matched_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [customer_id, id]);

      // Update customer stats
      await updateCustomerMarketplaceStats(customer_id);

      res.json({ success: true, customer_id, match_type: 'manual' });
    } else if (create_new) {
      // Create new customer from order
      const shippingAddr = order.shipping_address || {};

      const newCustomer = await pool.query(`
        INSERT INTO customers (name, email, phone, address, city, province, postal_code, customer_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'marketplace', CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        order.customer_name,
        order.customer_email,
        shippingAddr.phone || null,
        [shippingAddr.street_1, shippingAddr.street_2].filter(Boolean).join(', ') || null,
        shippingAddr.city || null,
        shippingAddr.state || null,
        shippingAddr.zip_code || null
      ]);

      const newCustomerId = newCustomer.rows[0].id;

      // Link order to new customer
      await pool.query(`
        UPDATE marketplace_orders
        SET customer_id = $1, customer_match_type = 'new_created', customer_matched_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newCustomerId, id]);

      // Update stats
      await updateCustomerMarketplaceStats(newCustomerId);

      res.json({ success: true, customer_id: newCustomerId, match_type: 'new_created' });
    } else {
      res.status(400).json({ error: 'Must provide customer_id or set create_new=true' });
    }
  } catch (error) {
    console.error('❌ Error matching customer:', error);
    res.status(500).json({ error: 'Failed to match customer' });
  }
});

// Auto-match order to customer by email
router.post('/orders/:id/auto-match', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the order
    const orderResult = await pool.query(
      'SELECT * FROM marketplace_orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (!order.customer_email) {
      return res.json({ success: false, message: 'No email on order' });
    }

    // Try to find matching customer
    const customerResult = await pool.query(
      'SELECT id, name, email FROM customers WHERE LOWER(email) = LOWER($1)',
      [order.customer_email]
    );

    if (customerResult.rows.length > 0) {
      const customer = customerResult.rows[0];

      await pool.query(`
        UPDATE marketplace_orders
        SET customer_id = $1, customer_match_type = 'email_match', customer_matched_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [customer.id, id]);

      await updateCustomerMarketplaceStats(customer.id);

      res.json({
        success: true,
        matched: true,
        customer_id: customer.id,
        customer_name: customer.name,
        match_type: 'email_match'
      });
    } else {
      res.json({ success: true, matched: false, message: 'No matching customer found' });
    }
  } catch (error) {
    console.error('❌ Error auto-matching customer:', error);
    res.status(500).json({ error: 'Failed to auto-match customer' });
  }
});

// Find potential customer matches for an order
router.get('/orders/:id/customer-matches', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const orderResult = await pool.query(
      'SELECT customer_name, customer_email FROM marketplace_orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const matches = [];

    // Exact email match
    if (order.customer_email) {
      const emailMatch = await pool.query(
        'SELECT id, name, email, phone, company FROM customers WHERE LOWER(email) = LOWER($1)',
        [order.customer_email]
      );
      emailMatch.rows.forEach(c => matches.push({ ...c, match_type: 'exact_email', confidence: 100 }));
    }

    // Name similarity match (if no exact email match)
    if (matches.length === 0 && order.customer_name) {
      const nameMatch = await pool.query(`
        SELECT id, name, email, phone, company
        FROM customers
        WHERE LOWER(name) ILIKE $1
        LIMIT 5
      `, [`%${order.customer_name.split(' ')[0]}%`]);
      nameMatch.rows.forEach(c => matches.push({ ...c, match_type: 'name_partial', confidence: 50 }));
    }

    res.json({ matches });
  } catch (error) {
    console.error('❌ Error finding customer matches:', error);
    res.status(500).json({ error: 'Failed to find matches' });
  }
});

// Create quote from marketplace order
router.post('/orders/:id/create-quote', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Get the order with customer info
    const orderResult = await client.query(`
      SELECT mo.*, c.id as linked_customer_id, c.name as linked_customer_name
      FROM marketplace_orders mo
      LEFT JOIN customers c ON mo.customer_id = c.id
      WHERE mo.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // If no linked customer, create one first
    let customerId = order.linked_customer_id;
    if (!customerId) {
      const shippingAddr = order.shipping_address || {};
      const newCustomer = await client.query(`
        INSERT INTO customers (name, email, phone, address, city, province, postal_code, customer_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'marketplace', CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        order.customer_name,
        order.customer_email,
        shippingAddr.phone || null,
        [shippingAddr.street_1, shippingAddr.street_2].filter(Boolean).join(', ') || null,
        shippingAddr.city || null,
        shippingAddr.state || null,
        shippingAddr.zip_code || null
      ]);
      customerId = newCustomer.rows[0].id;

      // Link order to customer
      await client.query(`
        UPDATE marketplace_orders
        SET customer_id = $1, customer_match_type = 'new_created', customer_matched_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [customerId, id]);
    }

    // Generate quote number
    const quoteNumResult = await client.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'Q([0-9]+)') AS INTEGER)), 0) + 1 as next_num
      FROM quotations
    `);
    const nextNum = quoteNumResult.rows[0].next_num;
    const quotationNumber = 'Q' + String(nextNum).padStart(5, '0');

    // Get shipping address for quote
    const shippingAddr = order.shipping_address || {};
    const customerAddress = [
      shippingAddr.street_1,
      shippingAddr.street_2,
      shippingAddr.city,
      shippingAddr.state,
      shippingAddr.zip_code
    ].filter(Boolean).join(', ');

    // Calculate totals
    const subtotalCents = order.total_price_cents - (order.tax_cents || 0) - (order.shipping_price_cents || 0);

    // Create the quotation
    const quoteResult = await client.query(`
      INSERT INTO quotations (
        quotation_number,
        customer_id,
        customer_name,
        customer_email,
        customer_address,
        status,
        subtotal_cents,
        tax_cents,
        total_cents,
        source,
        marketplace_order_id,
        notes,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      quotationNumber,
      customerId,
      order.customer_name,
      order.customer_email,
      customerAddress,
      'won', // Marketplace orders are already completed
      subtotalCents,
      order.tax_cents || 0,
      order.total_price_cents,
      'marketplace',
      id,
      `Created from Best Buy Marketplace Order ${order.mirakl_order_id}`
    ]);

    const quotationId = quoteResult.rows[0].id;

    // Add order items to quotation
    const orderLines = order.order_lines || [];
    for (const line of orderLines) {
      // Try to find matching product
      const productResult = await client.query(
        'SELECT id, cost FROM products WHERE LOWER(name) = LOWER($1) OR mirakl_sku = $2 LIMIT 1',
        [line.product_title || line.offer_sku, line.offer_sku]
      );

      const productId = productResult.rows[0]?.id || null;
      const costCents = productResult.rows[0]?.cost ? Math.round(parseFloat(productResult.rows[0].cost) * 100) : 0;
      const sellCents = line.price_cents || Math.round((line.price || 0) * 100);

      await client.query(`
        INSERT INTO quotation_items (
          quotation_id,
          product_id,
          quantity,
          manufacturer,
          model,
          description,
          cost_cents,
          sell_cents,
          line_total_cents,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      `, [
        quotationId,
        productId,
        line.quantity || 1,
        line.manufacturer || 'Unknown',
        line.offer_sku || line.product_sku,
        line.product_title || line.offer_sku,
        costCents,
        sellCents,
        sellCents * (line.quantity || 1)
      ]);
    }

    // Link quote back to order
    await client.query(`
      UPDATE marketplace_orders
      SET created_quote_id = $1, quote_created_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [quotationId, id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      quotation_id: quotationId,
      quotation_number: quotationNumber,
      customer_id: customerId
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating quote from order:', error);
    res.status(500).json({ error: 'Failed to create quote' });
  } finally {
    client.release();
  }
});

// Get customer's marketplace orders
router.get('/customers/:customerId/orders', authenticate, async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await pool.query(`
      SELECT
        mo.*,
        q.quotation_number as linked_quote_number
      FROM marketplace_orders mo
      LEFT JOIN quotations q ON mo.created_quote_id = q.id
      WHERE mo.customer_id = $1
      ORDER BY mo.order_date DESC
    `, [customerId]);

    res.json({ orders: result.rows });
  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get customer's unified order history (quotes + marketplace orders)
router.get('/customers/:customerId/unified-history', authenticate, async (req, res) => {
  try {
    const { customerId } = req.params;

    // Get quotes
    const quotes = await pool.query(`
      SELECT
        'quote' as type,
        id,
        quotation_number as reference,
        status,
        total_cents as amount_cents,
        source,
        created_at as date,
        NULL as mirakl_order_id
      FROM quotations
      WHERE customer_id = $1
      ORDER BY created_at DESC
    `, [customerId]);

    // Get marketplace orders
    const orders = await pool.query(`
      SELECT
        'marketplace_order' as type,
        id,
        mirakl_order_id as reference,
        order_state as status,
        total_price_cents as amount_cents,
        'bestbuy' as source,
        order_date as date,
        mirakl_order_id
      FROM marketplace_orders
      WHERE customer_id = $1
      ORDER BY order_date DESC
    `, [customerId]);

    // Combine and sort by date
    const combined = [...quotes.rows, ...orders.rows]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get customer summary
    const summary = await pool.query(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM quotations WHERE customer_id = c.id) as quotes_count,
        (SELECT COALESCE(SUM(total_cents), 0) FROM quotations WHERE customer_id = c.id AND status = 'won') as quotes_revenue_cents
      FROM customers c
      WHERE c.id = $1
    `, [customerId]);

    res.json({
      customer: summary.rows[0],
      history: combined,
      totals: {
        quotes_count: parseInt(summary.rows[0]?.quotes_count || 0),
        quotes_revenue_cents: parseInt(summary.rows[0]?.quotes_revenue_cents || 0),
        marketplace_orders_count: parseInt(summary.rows[0]?.marketplace_orders_count || 0),
        marketplace_revenue_cents: parseInt(summary.rows[0]?.marketplace_revenue_cents || 0),
        total_revenue_cents: parseInt(summary.rows[0]?.quotes_revenue_cents || 0) + parseInt(summary.rows[0]?.marketplace_revenue_cents || 0)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching unified history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Helper function to update customer marketplace stats
async function updateCustomerMarketplaceStats(customerId) {
  await pool.query(`
    UPDATE customers c
    SET
      marketplace_orders_count = COALESCE(stats.order_count, 0),
      marketplace_revenue_cents = COALESCE(stats.total_revenue, 0),
      first_marketplace_order_at = stats.first_order,
      last_marketplace_order_at = stats.last_order,
      updated_at = CURRENT_TIMESTAMP
    FROM (
      SELECT
        customer_id,
        COUNT(*) as order_count,
        SUM(total_price_cents) as total_revenue,
        MIN(order_date) as first_order,
        MAX(order_date) as last_order
      FROM marketplace_orders
      WHERE customer_id = $1
      GROUP BY customer_id
    ) stats
    WHERE c.id = $1 AND c.id = stats.customer_id
  `, [customerId]);
}

// Update order list to include customer match info
router.get('/orders-with-customers', authenticate, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        mo.*,
        c.id as linked_customer_id,
        c.name as linked_customer_name,
        c.email as linked_customer_email,
        q.quotation_number as linked_quote_number
      FROM marketplace_orders mo
      LEFT JOIN customers c ON mo.customer_id = c.id
      LEFT JOIN quotations q ON mo.created_quote_id = q.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND mo.order_state = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY mo.order_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({ orders: result.rows });
  } catch (error) {
    console.error('❌ Error fetching orders with customers:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ============================================
// MARKETPLACE REPORTS API
// ============================================

// Sales Report - Summary and Daily Breakdown
router.get('/reports/sales', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, category, product_id } = req.query;

    // Default to last 30 days
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Build filters
    let filters = `mo.order_date >= $1 AND mo.order_date <= $2`;
    const params = [startDate, endDate + ' 23:59:59'];
    let paramIndex = 3;

    if (category) {
      filters += ` AND p.bestbuy_category_code = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (product_id) {
      filters += ` AND oi.product_id = $${paramIndex}`;
      params.push(product_id);
      paramIndex++;
    }

    // Summary stats
    const summaryQuery = await pool.query(`
      SELECT
        COUNT(DISTINCT mo.id) as total_orders,
        COALESCE(SUM(mo.total_price_cents), 0) as total_revenue_cents,
        COALESCE(SUM(oi.quantity), 0) as total_units_sold,
        COALESCE(AVG(mo.total_price_cents), 0) as avg_order_value_cents,
        COUNT(DISTINCT mo.customer_email) as unique_customers
      FROM marketplace_orders mo
      LEFT JOIN marketplace_order_items oi ON mo.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE ${filters}
    `, params);

    // Daily breakdown
    const dailyQuery = await pool.query(`
      SELECT
        DATE(mo.order_date) as date,
        COUNT(DISTINCT mo.id) as orders,
        COALESCE(SUM(mo.total_price_cents), 0) as revenue_cents,
        COALESCE(SUM(oi.quantity), 0) as units_sold
      FROM marketplace_orders mo
      LEFT JOIN marketplace_order_items oi ON mo.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE ${filters}
      GROUP BY DATE(mo.order_date)
      ORDER BY date ASC
    `, params);

    // Top products by revenue
    const topProductsQuery = await pool.query(`
      SELECT
        oi.product_id,
        p.name as product_name,
        p.manufacturer,
        COUNT(DISTINCT mo.id) as order_count,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price_cents) as revenue_cents
      FROM marketplace_order_items oi
      JOIN marketplace_orders mo ON oi.order_id = mo.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE ${filters}
      GROUP BY oi.product_id, p.name, p.manufacturer
      ORDER BY revenue_cents DESC
      LIMIT 10
    `, params);

    // Sales by category
    const categoryQuery = await pool.query(`
      SELECT
        COALESCE(c.name, 'Uncategorized') as category_name,
        p.bestbuy_category_code as category_code,
        COUNT(DISTINCT mo.id) as order_count,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price_cents) as revenue_cents
      FROM marketplace_order_items oi
      JOIN marketplace_orders mo ON oi.order_id = mo.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      WHERE ${filters}
      GROUP BY c.name, p.bestbuy_category_code
      ORDER BY revenue_cents DESC
    `, params);

    res.json({
      summary: summaryQuery.rows[0],
      daily: dailyQuery.rows,
      top_products: topProductsQuery.rows,
      by_category: categoryQuery.rows,
      date_range: { start: startDate, end: endDate }
    });
  } catch (error) {
    console.error('❌ Error generating sales report:', error);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

// Inventory Report - Current Stock and Sync History
router.get('/reports/inventory', authenticate, async (req, res) => {
  try {
    // Current inventory by category
    const inventoryByCategoryQuery = await pool.query(`
      SELECT
        COALESCE(c.name, 'Uncategorized') as category_name,
        p.bestbuy_category_code as category_code,
        COUNT(*) as product_count,
        SUM(COALESCE(p.stock_quantity, 0)) as total_stock,
        SUM(CASE WHEN COALESCE(p.stock_quantity, 0) = 0 THEN 1 ELSE 0 END) as out_of_stock_count,
        SUM(CASE WHEN COALESCE(p.stock_quantity, 0) > 0 AND COALESCE(p.stock_quantity, 0) <= 5 THEN 1 ELSE 0 END) as low_stock_count
      FROM products p
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      WHERE p.bestbuy_category_code IS NOT NULL AND p.active = true
      GROUP BY c.name, p.bestbuy_category_code
      ORDER BY total_stock DESC
    `);

    // Overall inventory stats
    const overallStatsQuery = await pool.query(`
      SELECT
        COUNT(*) as total_products,
        SUM(COALESCE(stock_quantity, 0)) as total_stock,
        SUM(CASE WHEN COALESCE(stock_quantity, 0) = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN COALESCE(stock_quantity, 0) > 0 AND COALESCE(stock_quantity, 0) <= 5 THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN marketplace_last_synced IS NULL THEN 1 ELSE 0 END) as never_synced,
        SUM(CASE WHEN marketplace_last_synced IS NOT NULL THEN 1 ELSE 0 END) as synced
      FROM products
      WHERE bestbuy_category_code IS NOT NULL AND active = true
    `);

    // Sync history (last 30 syncs)
    const syncHistoryQuery = await pool.query(`
      SELECT
        id,
        job_type,
        status,
        started_at,
        completed_at,
        products_checked,
        products_synced,
        products_failed,
        EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds,
        details
      FROM marketplace_sync_jobs
      ORDER BY started_at DESC
      LIMIT 30
    `);

    // Products never synced
    const neverSyncedQuery = await pool.query(`
      SELECT
        id, name, manufacturer, bestbuy_category_code,
        COALESCE(stock_quantity, 0) as stock_quantity,
        price
      FROM products
      WHERE bestbuy_category_code IS NOT NULL
        AND active = true
        AND marketplace_last_synced IS NULL
      ORDER BY name
      LIMIT 50
    `);

    // Products with recent sync (to show sync coverage)
    const recentlySyncedQuery = await pool.query(`
      SELECT
        COUNT(*) as count,
        MAX(marketplace_last_synced) as last_sync
      FROM products
      WHERE marketplace_last_synced > NOW() - INTERVAL '24 hours'
    `);

    res.json({
      overall: overallStatsQuery.rows[0],
      by_category: inventoryByCategoryQuery.rows,
      sync_history: syncHistoryQuery.rows,
      never_synced: neverSyncedQuery.rows,
      recent_sync: recentlySyncedQuery.rows[0]
    });
  } catch (error) {
    console.error('❌ Error generating inventory report:', error);
    res.status(500).json({ error: 'Failed to generate inventory report' });
  }
});

// Order Report - All Orders with Filters
router.get('/reports/orders', authenticate, async (req, res) => {
  try {
    const {
      start_date, end_date, status,
      customer_matched, limit = 100, offset = 0
    } = req.query;

    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let filters = `mo.order_date >= $1 AND mo.order_date <= $2`;
    const params = [startDate, endDate + ' 23:59:59'];
    let paramIndex = 3;

    if (status) {
      filters += ` AND mo.order_state = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (customer_matched === 'true') {
      filters += ` AND mo.customer_id IS NOT NULL`;
    } else if (customer_matched === 'false') {
      filters += ` AND mo.customer_id IS NULL`;
    }

    // Summary by status
    const statusSummaryQuery = await pool.query(`
      SELECT
        order_state,
        COUNT(*) as count,
        SUM(total_price_cents) as total_revenue_cents
      FROM marketplace_orders mo
      WHERE ${filters}
      GROUP BY order_state
      ORDER BY count DESC
    `, params);

    // Orders list
    const ordersQuery = await pool.query(`
      SELECT
        mo.*,
        c.name as customer_name,
        c.email as linked_customer_email,
        (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = mo.id) as item_count
      FROM marketplace_orders mo
      LEFT JOIN customers c ON mo.customer_id = c.id
      WHERE ${filters}
      ORDER BY mo.order_date DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Total count
    const countQuery = await pool.query(`
      SELECT COUNT(*) as total FROM marketplace_orders mo WHERE ${filters}
    `, params);

    res.json({
      orders: ordersQuery.rows,
      by_status: statusSummaryQuery.rows,
      total: parseInt(countQuery.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset),
      date_range: { start: startDate, end: endDate }
    });
  } catch (error) {
    console.error('❌ Error generating order report:', error);
    res.status(500).json({ error: 'Failed to generate order report' });
  }
});

// Customer Report - Top Customers and New vs Returning
router.get('/reports/customers', authenticate, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Top customers by marketplace revenue
    const topCustomersQuery = await pool.query(`
      SELECT
        COALESCE(c.name, mo.customer_name) as customer_name,
        COALESCE(c.email, mo.customer_email) as customer_email,
        c.id as customer_id,
        COUNT(DISTINCT mo.id) as order_count,
        SUM(mo.total_price_cents) as total_revenue_cents,
        AVG(mo.total_price_cents) as avg_order_value_cents,
        MIN(mo.order_date) as first_order,
        MAX(mo.order_date) as last_order
      FROM marketplace_orders mo
      LEFT JOIN customers c ON mo.customer_id = c.id
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
      GROUP BY c.name, mo.customer_name, c.email, mo.customer_email, c.id
      ORDER BY total_revenue_cents DESC
      LIMIT 20
    `, [startDate, endDate + ' 23:59:59']);

    // New vs Returning customers (in date range)
    const customerTypeQuery = await pool.query(`
      WITH first_orders AS (
        SELECT
          COALESCE(customer_id::text, customer_email) as customer_key,
          MIN(order_date) as first_order_date
        FROM marketplace_orders
        GROUP BY COALESCE(customer_id::text, customer_email)
      )
      SELECT
        CASE
          WHEN fo.first_order_date >= $1 THEN 'new'
          ELSE 'returning'
        END as customer_type,
        COUNT(DISTINCT COALESCE(mo.customer_id::text, mo.customer_email)) as customer_count,
        COUNT(DISTINCT mo.id) as order_count,
        SUM(mo.total_price_cents) as revenue_cents
      FROM marketplace_orders mo
      JOIN first_orders fo ON COALESCE(mo.customer_id::text, mo.customer_email) = fo.customer_key
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
      GROUP BY CASE WHEN fo.first_order_date >= $1 THEN 'new' ELSE 'returning' END
    `, [startDate, endDate + ' 23:59:59']);

    // Customer match stats
    const matchStatsQuery = await pool.query(`
      SELECT
        customer_match_type,
        COUNT(*) as count
      FROM marketplace_orders
      WHERE order_date >= $1 AND order_date <= $2
      GROUP BY customer_match_type
    `, [startDate, endDate + ' 23:59:59']);

    // Geographic distribution (by shipping province/state)
    const geoQuery = await pool.query(`
      SELECT
        COALESCE(shipping_address->>'state', shipping_address->>'province', 'Unknown') as region,
        COUNT(DISTINCT id) as order_count,
        SUM(total_price_cents) as revenue_cents
      FROM marketplace_orders
      WHERE order_date >= $1 AND order_date <= $2
      GROUP BY COALESCE(shipping_address->>'state', shipping_address->>'province', 'Unknown')
      ORDER BY order_count DESC
      LIMIT 15
    `, [startDate, endDate + ' 23:59:59']);

    res.json({
      top_customers: topCustomersQuery.rows,
      customer_types: customerTypeQuery.rows,
      match_stats: matchStatsQuery.rows,
      geographic: geoQuery.rows,
      date_range: { start: startDate, end: endDate }
    });
  } catch (error) {
    console.error('❌ Error generating customer report:', error);
    res.status(500).json({ error: 'Failed to generate customer report' });
  }
});

// Profit & Margin Report
router.get('/reports/profit', authenticate, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Overall profit metrics
    const overallQuery = await pool.query(`
      SELECT
        COUNT(DISTINCT mo.id) as total_orders,
        SUM(oi.total_price_cents) as total_revenue_cents,
        SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as total_cost_cents,
        SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as total_profit_cents,
        CASE
          WHEN SUM(oi.total_price_cents) > 0
          THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
                SUM(oi.total_price_cents) * 100)
          ELSE 0
        END as overall_margin_percent
      FROM marketplace_orders mo
      JOIN marketplace_order_items oi ON mo.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
    `, [startDate, endDate + ' 23:59:59']);

    // Margin by category
    const marginByCategoryQuery = await pool.query(`
      SELECT
        COALESCE(c.name, 'Uncategorized') as category_name,
        p.bestbuy_category_code as category_code,
        COUNT(DISTINCT mo.id) as order_count,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price_cents) as revenue_cents,
        SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
        SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
        CASE
          WHEN SUM(oi.total_price_cents) > 0
          THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
                SUM(oi.total_price_cents) * 100)
          ELSE 0
        END as margin_percent
      FROM marketplace_order_items oi
      JOIN marketplace_orders mo ON oi.order_id = mo.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
      GROUP BY c.name, p.bestbuy_category_code
      ORDER BY profit_cents DESC
    `, [startDate, endDate + ' 23:59:59']);

    // Margin by product (top 20 by profit, bottom 10 by margin)
    const marginByProductQuery = await pool.query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.manufacturer,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price_cents) as revenue_cents,
        SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
        SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
        CASE
          WHEN SUM(oi.total_price_cents) > 0
          THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
                SUM(oi.total_price_cents) * 100)
          ELSE 0
        END as margin_percent
      FROM marketplace_order_items oi
      JOIN marketplace_orders mo ON oi.order_id = mo.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
      GROUP BY p.id, p.name, p.manufacturer
      ORDER BY profit_cents DESC
      LIMIT 20
    `, [startDate, endDate + ' 23:59:59']);

    // Low margin products (sold items with margin < 15%)
    const lowMarginQuery = await pool.query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.manufacturer,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price_cents) as revenue_cents,
        SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
        SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
        CASE
          WHEN SUM(oi.total_price_cents) > 0
          THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
                SUM(oi.total_price_cents) * 100)
          ELSE 0
        END as margin_percent
      FROM marketplace_order_items oi
      JOIN marketplace_orders mo ON oi.order_id = mo.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
      GROUP BY p.id, p.name, p.manufacturer
      HAVING SUM(oi.total_price_cents) > 0
        AND (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
             SUM(oi.total_price_cents) * 100) < 15
      ORDER BY margin_percent ASC
      LIMIT 20
    `, [startDate, endDate + ' 23:59:59']);

    // Unprofitable products (negative margin)
    const unprofitableQuery = await pool.query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.manufacturer,
        SUM(oi.quantity) as units_sold,
        SUM(oi.total_price_cents) as revenue_cents,
        SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
        SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents,
        CASE
          WHEN SUM(oi.total_price_cents) > 0
          THEN (SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity)::float /
                SUM(oi.total_price_cents) * 100)
          ELSE 0
        END as margin_percent
      FROM marketplace_order_items oi
      JOIN marketplace_orders mo ON oi.order_id = mo.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
      GROUP BY p.id, p.name, p.manufacturer
      HAVING SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) < 0
      ORDER BY profit_cents ASC
    `, [startDate, endDate + ' 23:59:59']);

    // Daily profit trend
    const dailyProfitQuery = await pool.query(`
      SELECT
        DATE(mo.order_date) as date,
        SUM(oi.total_price_cents) as revenue_cents,
        SUM(COALESCE(p.cost, 0) * 100 * oi.quantity) as cost_cents,
        SUM(oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) as profit_cents
      FROM marketplace_orders mo
      JOIN marketplace_order_items oi ON mo.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE mo.order_date >= $1 AND mo.order_date <= $2
      GROUP BY DATE(mo.order_date)
      ORDER BY date ASC
    `, [startDate, endDate + ' 23:59:59']);

    res.json({
      overall: overallQuery.rows[0],
      by_category: marginByCategoryQuery.rows,
      top_products: marginByProductQuery.rows,
      low_margin_alerts: lowMarginQuery.rows,
      unprofitable: unprofitableQuery.rows,
      daily_trend: dailyProfitQuery.rows,
      date_range: { start: startDate, end: endDate }
    });
  } catch (error) {
    console.error('❌ Error generating profit report:', error);
    res.status(500).json({ error: 'Failed to generate profit report' });
  }
});

// Reports Dashboard Summary - Quick overview of all reports
router.get('/reports/dashboard', authenticate, async (req, res) => {
  try {
    // Today's stats
    const today = new Date().toISOString().split('T')[0];
    const todayStats = await pool.query(`
      SELECT
        COUNT(*) as orders_today,
        COALESCE(SUM(total_price_cents), 0) as revenue_today_cents
      FROM marketplace_orders
      WHERE DATE(order_date) = $1
    `, [today]);

    // This week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const thisWeekStats = await pool.query(`
      SELECT
        COUNT(*) as orders_week,
        COALESCE(SUM(total_price_cents), 0) as revenue_week_cents
      FROM marketplace_orders
      WHERE order_date >= $1
    `, [weekStart.toISOString().split('T')[0]]);

    // This month
    const monthStart = new Date();
    monthStart.setDate(1);
    const thisMonthStats = await pool.query(`
      SELECT
        COUNT(*) as orders_month,
        COALESCE(SUM(total_price_cents), 0) as revenue_month_cents
      FROM marketplace_orders
      WHERE order_date >= $1
    `, [monthStart.toISOString().split('T')[0]]);

    // Pending orders
    const pendingStats = await pool.query(`
      SELECT
        COUNT(*) as pending_orders,
        COUNT(CASE WHEN order_state = 'WAITING_ACCEPTANCE' THEN 1 END) as waiting_acceptance,
        COUNT(CASE WHEN order_state = 'SHIPPING' THEN 1 END) as needs_shipping
      FROM marketplace_orders
      WHERE order_state IN ('WAITING_ACCEPTANCE', 'SHIPPING')
    `);

    // Inventory alerts
    const inventoryAlerts = await pool.query(`
      SELECT
        SUM(CASE WHEN COALESCE(stock_quantity, 0) = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN COALESCE(stock_quantity, 0) > 0 AND COALESCE(stock_quantity, 0) <= 5 THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN marketplace_last_synced IS NULL THEN 1 ELSE 0 END) as never_synced
      FROM products
      WHERE bestbuy_category_code IS NOT NULL AND active = true
    `);

    // Last sync info
    const lastSync = await pool.query(`
      SELECT
        started_at,
        status,
        products_synced,
        products_failed
      FROM marketplace_sync_jobs
      ORDER BY started_at DESC
      LIMIT 1
    `);

    res.json({
      today: todayStats.rows[0],
      this_week: thisWeekStats.rows[0],
      this_month: thisMonthStats.rows[0],
      pending: pendingStats.rows[0],
      inventory_alerts: inventoryAlerts.rows[0],
      last_sync: lastSync.rows[0] || null
    });
  } catch (error) {
    console.error('❌ Error generating dashboard summary:', error);
    res.status(500).json({ error: 'Failed to generate dashboard summary' });
  }
});

// Export Report Data (CSV format)
router.get('/reports/export/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    const { start_date, end_date } = req.query;

    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let data = [];
    let filename = '';

    switch (type) {
      case 'sales':
        const salesResult = await pool.query(`
          SELECT
            DATE(mo.order_date) as date,
            mo.mirakl_order_id as order_id,
            mo.customer_name,
            mo.customer_email,
            mo.total_price_cents / 100.0 as total_amount,
            mo.order_state as status
          FROM marketplace_orders mo
          WHERE mo.order_date >= $1 AND mo.order_date <= $2
          ORDER BY mo.order_date DESC
        `, [startDate, endDate + ' 23:59:59']);
        data = salesResult.rows;
        filename = `sales_report_${startDate}_to_${endDate}.csv`;
        break;

      case 'inventory':
        const inventoryResult = await pool.query(`
          SELECT
            p.id,
            p.name,
            p.manufacturer,
            p.mirakl_sku as sku,
            c.name as category,
            COALESCE(p.stock_quantity, 0) as stock,
            p.price,
            p.cost,
            p.marketplace_price,
            p.marketplace_last_synced as last_synced
          FROM products p
          LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
          WHERE p.bestbuy_category_code IS NOT NULL AND p.active = true
          ORDER BY p.name
        `);
        data = inventoryResult.rows;
        filename = `inventory_report_${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'profit':
        const profitResult = await pool.query(`
          SELECT
            DATE(mo.order_date) as date,
            mo.mirakl_order_id as order_id,
            p.name as product_name,
            oi.quantity,
            oi.unit_price_cents / 100.0 as sale_price,
            COALESCE(p.cost, 0) as unit_cost,
            (oi.total_price_cents - COALESCE(p.cost, 0) * 100 * oi.quantity) / 100.0 as profit,
            CASE
              WHEN oi.unit_price_cents > 0
              THEN ((oi.unit_price_cents - COALESCE(p.cost, 0) * 100)::float / oi.unit_price_cents * 100)
              ELSE 0
            END as margin_percent
          FROM marketplace_order_items oi
          JOIN marketplace_orders mo ON oi.order_id = mo.id
          LEFT JOIN products p ON oi.product_id = p.id
          WHERE mo.order_date >= $1 AND mo.order_date <= $2
          ORDER BY mo.order_date DESC
        `, [startDate, endDate + ' 23:59:59']);
        data = profitResult.rows;
        filename = `profit_report_${startDate}_to_${endDate}.csv`;
        break;

      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    // Convert to CSV
    if (data.length === 0) {
      return res.status(404).json({ error: 'No data found for the specified criteria' });
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(','))
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('❌ Error exporting report:', error);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

// ============================================
// ADVANCED FEATURES - BULK OPERATIONS
// ============================================

// Get products for bulk operations (with pagination and filters)
router.get('/bulk/products', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, category, enabled, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE p.bestbuy_category_code IS NOT NULL';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      whereClause += ` AND p.bestbuy_category_code = $${paramCount}`;
      params.push(category);
    }

    if (enabled !== undefined) {
      paramCount++;
      whereClause += ` AND COALESCE(p.marketplace_enabled, true) = $${paramCount}`;
      params.push(enabled === 'true');
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (p.name ILIKE $${paramCount} OR p.model ILIKE $${paramCount} OR p.manufacturer ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM products p ${whereClause}
    `, params);

    params.push(limit, offset);
    const productsResult = await pool.query(`
      SELECT
        p.id,
        p.model as sku,
        p.name,
        p.manufacturer,
        COALESCE(p.msrp_cents, 0) / 100.0 as price,
        COALESCE(p.cost_cents, 0) / 100.0 as cost,
        p.stock_quantity,
        p.bestbuy_category_code,
        COALESCE(c.name, 'Unknown') as category_name,
        COALESCE(p.marketplace_enabled, true) as marketplace_enabled,
        p.marketplace_last_synced
      FROM products p
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      ${whereClause}
      ORDER BY p.name
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, params);

    res.json({
      products: productsResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(countResult.rows[0].total / limit)
    });
  } catch (error) {
    console.error('❌ Error fetching products for bulk ops:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Bulk enable/disable products on marketplace
router.post('/bulk/toggle-enabled', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_ids, enabled, user_name = 'System' } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'product_ids array is required' });
    }

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ($1, $2, 'in_progress', $3, $4)
      RETURNING id
    `, ['toggle_enabled', product_ids.length, user_name, { enabled, product_ids }]);

    const opId = opLog.rows[0].id;
    let successCount = 0;
    let failCount = 0;

    // Update products
    const result = await client.query(`
      UPDATE products
      SET marketplace_enabled = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2::int[])
      RETURNING id
    `, [enabled, product_ids]);

    successCount = result.rowCount;
    failCount = product_ids.length - successCount;

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    // Add audit log entries
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, entity_id, user_name, new_values, description)
      SELECT 'bulk_toggle_enabled', 'product', id, $1, $2, $3
      FROM unnest($4::int[]) as id
    `, [user_name, JSON.stringify({ enabled }), `Bulk ${enabled ? 'enabled' : 'disabled'} on marketplace`, product_ids]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `${successCount} products ${enabled ? 'enabled' : 'disabled'} successfully`,
      successful: successCount,
      failed: failCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in bulk toggle:', error);
    res.status(500).json({ error: 'Bulk operation failed' });
  } finally {
    client.release();
  }
});

// Bulk category assignment
router.post('/bulk/assign-category', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_ids, category_code, user_name = 'System' } = req.body;

    if (!product_ids || !category_code) {
      return res.status(400).json({ error: 'product_ids and category_code are required' });
    }

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ($1, $2, 'in_progress', $3, $4)
      RETURNING id
    `, ['assign_category', product_ids.length, user_name, { category_code, product_ids }]);

    const opId = opLog.rows[0].id;

    // Update products
    const result = await client.query(`
      UPDATE products
      SET bestbuy_category_code = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2::int[])
      RETURNING id
    `, [category_code, product_ids]);

    const successCount = result.rowCount;
    const failCount = product_ids.length - successCount;

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    // Add audit log entry
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, user_name, new_values, description)
      VALUES ($1, $2, $3, $4, $5)
    `, ['bulk_assign_category', 'product', user_name, JSON.stringify({ category_code, product_count: successCount }), `Assigned category ${category_code} to ${successCount} products`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Category assigned to ${successCount} products`,
      successful: successCount,
      failed: failCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in bulk category assignment:', error);
    res.status(500).json({ error: 'Bulk category assignment failed' });
  } finally {
    client.release();
  }
});

// Bulk price adjustment
router.post('/bulk/adjust-prices', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_ids, adjustment_type, adjustment_value, user_name = 'System' } = req.body;

    if (!product_ids || !adjustment_type || adjustment_value === undefined) {
      return res.status(400).json({ error: 'product_ids, adjustment_type, and adjustment_value are required' });
    }

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ($1, $2, 'in_progress', $3, $4)
      RETURNING id
    `, ['adjust_prices', product_ids.length, user_name, { adjustment_type, adjustment_value }]);

    const opId = opLog.rows[0].id;

    let updateQuery;
    if (adjustment_type === 'percentage') {
      updateQuery = `
        UPDATE products
        SET price = ROUND(price * (1 + $1 / 100), 2), updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
        RETURNING id
      `;
    } else if (adjustment_type === 'fixed') {
      updateQuery = `
        UPDATE products
        SET price = price + $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[]) AND price + $1 >= 0
        RETURNING id
      `;
    } else if (adjustment_type === 'set') {
      updateQuery = `
        UPDATE products
        SET price = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
        RETURNING id
      `;
    } else {
      throw new Error('Invalid adjustment_type');
    }

    const result = await client.query(updateQuery, [adjustment_value, product_ids]);

    const successCount = result.rowCount;
    const failCount = product_ids.length - successCount;

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    // Add audit log entry
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, user_name, new_values, description)
      VALUES ($1, $2, $3, $4, $5)
    `, ['bulk_price_adjustment', 'product', user_name, JSON.stringify({ adjustment_type, adjustment_value }), `Adjusted prices for ${successCount} products (${adjustment_type}: ${adjustment_value})`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Prices adjusted for ${successCount} products`,
      successful: successCount,
      failed: failCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in bulk price adjustment:', error);
    res.status(500).json({ error: 'Bulk price adjustment failed' });
  } finally {
    client.release();
  }
});

// Export product mappings to CSV
router.get('/bulk/export-mappings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.model,
        p.name,
        p.manufacturer,
        p.msrp_cents,
        p.bestbuy_category_code,
        c.name as category_name,
        COALESCE(p.marketplace_enabled, true) as marketplace_enabled
      FROM products p
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      WHERE p.bestbuy_category_code IS NOT NULL
      ORDER BY p.name
    `);

    const headers = ['id', 'model', 'name', 'manufacturer', 'msrp_cents', 'bestbuy_category_code', 'category_name', 'marketplace_enabled'];
    const csvRows = [
      headers.join(','),
      ...result.rows.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(','))
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="product_mappings_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('❌ Error exporting mappings:', error);
    res.status(500).json({ error: 'Failed to export mappings' });
  }
});

// Import product mappings from CSV
router.post('/bulk/import-mappings', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { mappings, user_name = 'System' } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ error: 'mappings array is required' });
    }

    await client.query('BEGIN');

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const mapping of mappings) {
      try {
        await client.query(`
          UPDATE products
          SET bestbuy_category_code = $1,
              marketplace_enabled = COALESCE($2, true),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3 OR model = $4
        `, [mapping.bestbuy_category_code, mapping.marketplace_enabled, mapping.id, mapping.model || mapping.sku]);
        successCount++;
      } catch (err) {
        failCount++;
        errors.push({ mapping, error: err.message });
      }
    }

    // Log the operation
    await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, successful_items, failed_items, status, user_name, details)
      VALUES ($1, $2, $3, $4, 'completed', $5, $6)
    `, ['import_mappings', mappings.length, successCount, failCount, user_name, JSON.stringify({ errors })]);

    // Add audit log entry
    await client.query(`
      INSERT INTO marketplace_audit_log (action_type, entity_type, user_name, description)
      VALUES ($1, $2, $3, $4)
    `, ['bulk_import_mappings', 'product', user_name, `Imported ${successCount} mappings, ${failCount} failed`]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Imported ${successCount} mappings, ${failCount} failed`,
      successful: successCount,
      failed: failCount,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error importing mappings:', error);
    res.status(500).json({ error: 'Failed to import mappings' });
  } finally {
    client.release();
  }
});

// Get bulk operations history
router.get('/bulk/history', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await pool.query(`
      SELECT * FROM bulk_operations_log
      ORDER BY started_at DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching bulk history:', error);
    res.status(500).json({ error: 'Failed to fetch bulk operations history' });
  }
});

// ============================================
// SYNC ERROR MANAGEMENT
// ============================================

// Get sync errors (with filters)
router.get('/errors', authenticate, async (req, res) => {
  try {
    const { status = 'all', error_type, product_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (status !== 'all') {
      paramCount++;
      whereClause += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    if (error_type) {
      paramCount++;
      whereClause += ` AND e.error_type = $${paramCount}`;
      params.push(error_type);
    }

    if (product_id) {
      paramCount++;
      whereClause += ` AND e.product_id = $${paramCount}`;
      params.push(product_id);
    }

    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM marketplace_sync_errors e ${whereClause}
    `, params);

    params.push(limit, offset);
    const errorsResult = await pool.query(`
      SELECT
        e.*,
        p.description as product_name,
        p.name as product_sku_ref
      FROM marketplace_sync_errors e
      LEFT JOIN products p ON e.product_id = p.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, params);

    // Get error type summary
    const typeSummary = await pool.query(`
      SELECT error_type, COUNT(*) as count
      FROM marketplace_sync_errors
      WHERE ignored = false
      GROUP BY error_type
      ORDER BY count DESC
    `);

    res.json({
      errors: errorsResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      by_type: typeSummary.rows
    });
  } catch (error) {
    console.error('❌ Error fetching sync errors:', error);
    res.status(500).json({ error: 'Failed to fetch sync errors' });
  }
});

// Retry failed sync
router.post('/errors/:id/retry', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Get the error details
    const errorResult = await client.query(`
      SELECT * FROM marketplace_sync_errors WHERE id = $1
    `, [id]);

    if (errorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Error not found' });
    }

    const syncError = errorResult.rows[0];

    if (syncError.retry_count >= syncError.max_retries) {
      return res.status(400).json({ error: 'Maximum retries exceeded' });
    }

    // Update retry count
    await client.query(`
      UPDATE marketplace_sync_errors
      SET retry_count = retry_count + 1, status = 'retrying'
      WHERE id = $1
    `, [id]);

    // Here you would trigger the actual sync retry
    // For now, we'll simulate success after a delay
    // In production, this would call the actual sync service

    // Mark as resolved (in production, this would be done by the sync service)
    await client.query(`
      UPDATE marketplace_sync_errors
      SET status = 'pending', resolved_at = NULL
      WHERE id = $1
    `, [id]);

    res.json({ success: true, message: 'Retry initiated' });
  } catch (error) {
    console.error('❌ Error retrying sync:', error);
    res.status(500).json({ error: 'Failed to retry sync' });
  } finally {
    client.release();
  }
});

// Ignore/dismiss error
router.post('/errors/:id/ignore', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_name = 'System' } = req.body;

    await pool.query(`
      UPDATE marketplace_sync_errors
      SET ignored = true, ignored_at = CURRENT_TIMESTAMP, ignored_by = $1, status = 'ignored'
      WHERE id = $2
    `, [user_name, id]);

    res.json({ success: true, message: 'Error ignored' });
  } catch (error) {
    console.error('❌ Error ignoring sync error:', error);
    res.status(500).json({ error: 'Failed to ignore error' });
  }
});

// Bulk ignore errors
router.post('/errors/bulk-ignore', authenticate, async (req, res) => {
  try {
    const { error_ids, user_name = 'System' } = req.body;

    const result = await pool.query(`
      UPDATE marketplace_sync_errors
      SET ignored = true, ignored_at = CURRENT_TIMESTAMP, ignored_by = $1, status = 'ignored'
      WHERE id = ANY($2::int[])
    `, [user_name, error_ids]);

    res.json({ success: true, message: `${result.rowCount} errors ignored` });
  } catch (error) {
    console.error('❌ Error bulk ignoring:', error);
    res.status(500).json({ error: 'Failed to ignore errors' });
  }
});

// ============================================
// COMPETITOR PRICE TRACKING
// ============================================

// Get competitor prices for a product
router.get('/competitors/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await pool.query(`
      SELECT cp.*, p.name as product_name, p.price as our_price
      FROM competitor_prices cp
      JOIN products p ON cp.product_id = p.id
      WHERE cp.product_id = $1
      ORDER BY cp.last_checked DESC
    `, [productId]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching competitor prices:', error);
    res.status(500).json({ error: 'Failed to fetch competitor prices' });
  }
});

// Add/Update competitor price
router.post('/competitors', authenticate, async (req, res) => {
  try {
    const { product_id, competitor_name, competitor_price, competitor_url, notes } = req.body;

    // Get our price for comparison
    const productResult = await pool.query(`SELECT price FROM products WHERE id = $1`, [product_id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const ourPrice = parseFloat(productResult.rows[0].price);
    const theirPrice = parseFloat(competitor_price);
    const priceDifference = ourPrice - theirPrice;
    const isLower = theirPrice < ourPrice;

    const result = await pool.query(`
      INSERT INTO competitor_prices (product_id, competitor_name, competitor_price, competitor_url, notes, price_difference, is_lower)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        competitor_price = EXCLUDED.competitor_price,
        competitor_url = EXCLUDED.competitor_url,
        notes = EXCLUDED.notes,
        price_difference = EXCLUDED.price_difference,
        is_lower = EXCLUDED.is_lower,
        last_checked = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [product_id, competitor_name, theirPrice, competitor_url, notes, priceDifference, isLower]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error saving competitor price:', error);
    res.status(500).json({ error: 'Failed to save competitor price' });
  }
});

// Get all products with lower competitor prices
router.get('/competitors/alerts/lower-prices', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        cp.*,
        p.description as product_name,
        p.name as product_sku,
        p.price as our_price
      FROM competitor_prices cp
      JOIN products p ON cp.product_id = p.id
      WHERE cp.is_lower = true
      ORDER BY cp.price_difference ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching price alerts:', error);
    res.status(500).json({ error: 'Failed to fetch price alerts' });
  }
});

// ============================================
// MARKETPLACE HEALTH SCORE
// ============================================

// Calculate and get current health score
router.get('/health-score', authenticate, async (req, res) => {
  try {
    // Calculate metrics
    const syncStats = await pool.query(`
      SELECT
        COUNT(*) as total_syncs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_syncs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_syncs
      FROM marketplace_sync_jobs
      WHERE started_at >= NOW() - INTERVAL '7 days'
    `);

    const orderStats = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN order_state IN ('SHIPPED', 'DELIVERED') THEN 1 ELSE 0 END) as fulfilled_orders,
        SUM(CASE WHEN order_state IN ('CANCELLED', 'REFUNDED') THEN 1 ELSE 0 END) as cancelled_orders
      FROM marketplace_orders
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    const inventoryStats = await pool.query(`
      SELECT
        COUNT(*) as total_products,
        SUM(CASE WHEN marketplace_last_synced IS NOT NULL AND marketplace_last_synced >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as in_sync,
        SUM(CASE WHEN marketplace_last_synced IS NULL OR marketplace_last_synced < NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as out_of_sync
      FROM products
      WHERE bestbuy_category_code IS NOT NULL AND COALESCE(marketplace_enabled, true) = true
    `);

    const sync = syncStats.rows[0];
    const orders = orderStats.rows[0];
    const inventory = inventoryStats.rows[0];

    // Calculate individual scores (0-100) with proper NaN handling
    const totalSyncs = parseInt(sync.total_syncs) || 0;
    const successfulSyncs = parseInt(sync.successful_syncs) || 0;
    const failedSyncs = parseInt(sync.failed_syncs) || 0;
    const syncSuccessRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 100;

    const totalOrders = parseInt(orders.total_orders) || 0;
    const fulfilledOrders = parseInt(orders.fulfilled_orders) || 0;
    const cancelledOrders = parseInt(orders.cancelled_orders) || 0;
    const fulfillmentRate = totalOrders > 0 ? (fulfilledOrders / totalOrders) * 100 : 100;

    const totalProducts = parseInt(inventory.total_products) || 0;
    const inSync = parseInt(inventory.in_sync) || 0;
    const outOfSync = parseInt(inventory.out_of_sync) || 0;
    const inventoryAccuracy = totalProducts > 0 ? (inSync / totalProducts) * 100 : 100;

    // Calculate overall health score (weighted average) - ensure it's a valid number
    const overallScore = Math.round(
      (syncSuccessRate * 0.3) +
      (fulfillmentRate * 0.4) +
      (inventoryAccuracy * 0.3)
    ) || 100;

    // Generate recommendations
    const recommendations = [];
    if (syncSuccessRate < 90) {
      recommendations.push({ type: 'sync', message: 'Sync success rate is below 90%. Check sync error logs for recurring issues.', priority: 'high' });
    }
    if (fulfillmentRate < 95) {
      recommendations.push({ type: 'orders', message: 'Order fulfillment rate is below 95%. Review cancelled orders for patterns.', priority: 'medium' });
    }
    if (inventoryAccuracy < 80) {
      recommendations.push({ type: 'inventory', message: 'Over 20% of products are out of sync. Consider running a full inventory sync.', priority: 'high' });
    }
    if (outOfSync > 100) {
      recommendations.push({ type: 'inventory', message: `${outOfSync} products haven't synced in 24 hours.`, priority: 'medium' });
    }

    // Store the metrics
    await pool.query(`
      INSERT INTO marketplace_health_metrics (
        metric_date, sync_success_rate, order_fulfillment_rate, inventory_accuracy,
        total_sync_attempts, successful_syncs, failed_syncs,
        total_orders, fulfilled_orders, cancelled_orders,
        products_in_sync, products_out_of_sync, overall_health_score, recommendations
      ) VALUES (
        CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (metric_date) DO UPDATE SET
        sync_success_rate = EXCLUDED.sync_success_rate,
        order_fulfillment_rate = EXCLUDED.order_fulfillment_rate,
        inventory_accuracy = EXCLUDED.inventory_accuracy,
        total_sync_attempts = EXCLUDED.total_sync_attempts,
        successful_syncs = EXCLUDED.successful_syncs,
        failed_syncs = EXCLUDED.failed_syncs,
        total_orders = EXCLUDED.total_orders,
        fulfilled_orders = EXCLUDED.fulfilled_orders,
        cancelled_orders = EXCLUDED.cancelled_orders,
        products_in_sync = EXCLUDED.products_in_sync,
        products_out_of_sync = EXCLUDED.products_out_of_sync,
        overall_health_score = EXCLUDED.overall_health_score,
        recommendations = EXCLUDED.recommendations,
        updated_at = CURRENT_TIMESTAMP
    `, [
      syncSuccessRate, fulfillmentRate, inventoryAccuracy,
      totalSyncs, successfulSyncs, failedSyncs,
      totalOrders, fulfilledOrders, cancelledOrders,
      inSync, outOfSync, overallScore, JSON.stringify(recommendations)
    ]);

    res.json({
      overall_score: overallScore,
      status: overallScore >= 80 ? 'healthy' : overallScore >= 60 ? 'warning' : 'critical',
      metrics: {
        sync_success_rate: Math.round(syncSuccessRate),
        order_fulfillment_rate: Math.round(fulfillmentRate),
        inventory_accuracy: Math.round(inventoryAccuracy)
      },
      details: {
        sync: {
          total: totalSyncs,
          successful: successfulSyncs,
          failed: failedSyncs
        },
        orders: {
          total: totalOrders,
          fulfilled: fulfilledOrders,
          cancelled: cancelledOrders
        },
        inventory: {
          total: totalProducts,
          in_sync: inSync,
          out_of_sync: outOfSync
        }
      },
      recommendations,
      calculated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error calculating health score:', error);
    res.status(500).json({ error: 'Failed to calculate health score' });
  }
});

// Get health score history
router.get('/health-score/history', authenticate, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await pool.query(`
      SELECT * FROM marketplace_health_metrics
      WHERE metric_date >= CURRENT_DATE - $1::int
      ORDER BY metric_date DESC
    `, [days]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching health history:', error);
    res.status(500).json({ error: 'Failed to fetch health score history' });
  }
});

// ============================================
// AUDIT LOG
// ============================================

// Get audit log entries
router.get('/audit-log', authenticate, async (req, res) => {
  try {
    const { action_type, entity_type, user_name, page = 1, limit = 50, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (action_type) {
      paramCount++;
      whereClause += ` AND action_type = $${paramCount}`;
      params.push(action_type);
    }

    if (entity_type) {
      paramCount++;
      whereClause += ` AND entity_type = $${paramCount}`;
      params.push(entity_type);
    }

    if (user_name) {
      paramCount++;
      whereClause += ` AND user_name ILIKE $${paramCount}`;
      params.push(`%${user_name}%`);
    }

    if (start_date) {
      paramCount++;
      whereClause += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereClause += ` AND created_at <= $${paramCount}`;
      params.push(end_date + ' 23:59:59');
    }

    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM marketplace_audit_log ${whereClause}
    `, params);

    params.push(limit, offset);
    const logsResult = await pool.query(`
      SELECT * FROM marketplace_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, params);

    // Get action type summary
    const actionSummary = await pool.query(`
      SELECT action_type, COUNT(*) as count
      FROM marketplace_audit_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY action_type
      ORDER BY count DESC
    `);

    res.json({
      entries: logsResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      action_types: actionSummary.rows
    });
  } catch (error) {
    console.error('❌ Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Add audit log entry (utility endpoint)
router.post('/audit-log', authenticate, async (req, res) => {
  try {
    const { action_type, entity_type, entity_id, entity_name, user_name, old_values, new_values, description } = req.body;

    const result = await pool.query(`
      INSERT INTO marketplace_audit_log
      (action_type, entity_type, entity_id, entity_name, user_name, old_values, new_values, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [action_type, entity_type, entity_id, entity_name, user_name || 'System', old_values, new_values, description]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error adding audit log:', error);
    res.status(500).json({ error: 'Failed to add audit log entry' });
  }
});

// ============================================
// RETURNS MANAGEMENT
// ============================================

// Get all returns with filtering and pagination
router.get('/returns', authenticate, async (req, res) => {
  try {
    const { status, return_type, start_date, end_date, customer_email, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT r.*, mo.mirakl_order_id as order_mirakl_id, mo.customer_name, mo.total_price_cents as order_total
      FROM marketplace_returns r
      LEFT JOIN marketplace_orders mo ON r.order_id = mo.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (return_type) {
      query += ` AND r.return_type = $${paramIndex}`;
      params.push(return_type);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND r.created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND r.created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (customer_email) {
      query += ` AND r.customer_email ILIKE $${paramIndex}`;
      params.push(`%${customer_email}%`);
      paramIndex++;
    }

    // Get count before pagination
    const countQuery = query.replace(/SELECT r\.\*, mo\.mirakl_order_id.*FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, params);

    query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get status summary
    const statusSummary = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM marketplace_returns
      GROUP BY status
    `);

    res.json({
      returns: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset),
      status_summary: statusSummary.rows
    });
  } catch (error) {
    console.error('❌ Error fetching returns:', error);
    res.status(500).json({ error: 'Failed to fetch returns' });
  }
});

// Get single return with items
router.get('/returns/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const returnQuery = await pool.query(`
      SELECT r.*, mo.mirakl_order_id, mo.customer_name, mo.order_lines, mo.total_price_cents as order_total
      FROM marketplace_returns r
      LEFT JOIN marketplace_orders mo ON r.order_id = mo.id
      WHERE r.id = $1
    `, [id]);

    if (returnQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Get return items
    const itemsQuery = await pool.query(`
      SELECT ri.*, p.name as product_name, p.model as product_model
      FROM marketplace_return_items ri
      LEFT JOIN products p ON ri.product_id = p.id
      WHERE ri.return_id = $1
    `, [id]);

    // Get return history
    const historyQuery = await pool.query(`
      SELECT * FROM marketplace_return_history
      WHERE return_id = $1
      ORDER BY created_at DESC
    `, [id]);

    // Get associated refunds
    const refundsQuery = await pool.query(`
      SELECT * FROM marketplace_refunds
      WHERE return_id = $1
      ORDER BY created_at DESC
    `, [id]);

    const returnData = returnQuery.rows[0];
    returnData.items = itemsQuery.rows;
    returnData.history = historyQuery.rows;
    returnData.refunds = refundsQuery.rows;

    res.json(returnData);
  } catch (error) {
    console.error('❌ Error fetching return:', error);
    res.status(500).json({ error: 'Failed to fetch return' });
  }
});

// Create a new return request
router.post('/returns', authenticate, validateJoi(marketplaceSchemas.createReturn), async (req, res) => {
  const client = await pool.connect();

  try {
    const { order_id, return_type, return_reason, return_reason_detail, items, notes } = req.body;

    await client.query('BEGIN');

    // Get order details
    const orderQuery = await client.query(
      'SELECT * FROM marketplace_orders WHERE id = $1',
      [order_id]
    );

    if (orderQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderQuery.rows[0];

    // Generate return number
    const returnNumber = generateReturnNumber();

    // Calculate total refund
    let totalRefundCents = 0;
    for (const item of items) {
      totalRefundCents += item.quantity_returned * (item.unit_price_cents || 0);
    }

    // Create return record
    const returnResult = await client.query(`
      INSERT INTO marketplace_returns
      (return_number, order_id, mirakl_order_id, customer_name, customer_email,
       return_type, return_reason, return_reason_detail, status, total_refund_cents, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
      RETURNING *
    `, [
      returnNumber,
      order_id,
      order.mirakl_order_id,
      order.customer_name,
      order.customer_email,
      return_type,
      return_reason,
      return_reason_detail,
      totalRefundCents,
      notes
    ]);

    const returnRecord = returnResult.rows[0];

    // Create return items
    for (const item of items) {
      await client.query(`
        INSERT INTO marketplace_return_items
        (return_id, order_item_id, product_id, product_sku, quantity_ordered, quantity_returned,
         unit_price_cents, refund_amount_cents, condition, reason, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        returnRecord.id,
        item.order_item_id,
        item.product_id,
        item.product_sku,
        item.quantity_ordered || item.quantity_returned,
        item.quantity_returned,
        item.unit_price_cents || 0,
        item.quantity_returned * (item.unit_price_cents || 0),
        item.condition || 'unknown',
        item.reason,
        item.notes
      ]);
    }

    // Add to return history
    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'System', 'Return request created')
    `, [returnRecord.id]);

    // Create notification
    await client.query(`
      INSERT INTO marketplace_notifications
      (type, title, message, order_id, mirakl_order_id, priority)
      VALUES ('return_request', 'New Return Request', $1, $2, $3, 'high')
    `, [
      `Return request ${returnNumber} created for order ${order.mirakl_order_id}`,
      order_id,
      order.mirakl_order_id
    ]);

    // Add audit log
    await client.query(`
      INSERT INTO marketplace_audit_log
      (action_type, entity_type, entity_id, entity_name, user_name, new_values, description)
      VALUES ('create', 'return', $1, $2, 'System', $3, $4)
    `, [
      returnRecord.id,
      returnNumber,
      JSON.stringify({ return_type, return_reason, items_count: items.length }),
      `Created return request for order ${order.mirakl_order_id}`
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      return: returnRecord,
      message: `Return request ${returnNumber} created successfully`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating return:', error);
    res.status(500).json({ error: 'Failed to create return', details: error.message });
  } finally {
    client.release();
  }
});

// Update return status
router.put('/returns/:id', authenticate, validateJoi(marketplaceSchemas.updateReturn), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, received_date, tracking_number, carrier_code, notes, internal_notes, restocking_fee_cents } = req.body;

    await client.query('BEGIN');

    // Get current return
    const currentReturn = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (currentReturn.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return not found' });
    }

    const oldReturn = currentReturn.rows[0];

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (received_date !== undefined) {
      updates.push(`received_date = $${paramIndex}`);
      params.push(received_date);
      paramIndex++;
    }
    if (tracking_number !== undefined) {
      updates.push(`tracking_number = $${paramIndex}`);
      params.push(tracking_number);
      paramIndex++;
    }
    if (carrier_code !== undefined) {
      updates.push(`carrier_code = $${paramIndex}`);
      params.push(carrier_code);
      paramIndex++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }
    if (internal_notes !== undefined) {
      updates.push(`internal_notes = $${paramIndex}`);
      params.push(internal_notes);
      paramIndex++;
    }
    if (restocking_fee_cents !== undefined) {
      updates.push(`restocking_fee_cents = $${paramIndex}`);
      params.push(restocking_fee_cents);
      paramIndex++;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (status === 'processed') {
      updates.push('processed_date = CURRENT_TIMESTAMP');
    }

    params.push(id);

    const result = await client.query(`
      UPDATE marketplace_returns
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

    // Log status change in history
    if (status && status !== oldReturn.status) {
      await client.query(`
        INSERT INTO marketplace_return_history
        (return_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, $2, $3, 'System', $4)
      `, [id, oldReturn.status, status, `Status changed from ${oldReturn.status} to ${status}`]);
    }

    // Add audit log
    await client.query(`
      INSERT INTO marketplace_audit_log
      (action_type, entity_type, entity_id, entity_name, user_name, old_values, new_values, description)
      VALUES ('update', 'return', $1, $2, 'System', $3, $4, $5)
    `, [
      id,
      oldReturn.return_number,
      JSON.stringify({ status: oldReturn.status }),
      JSON.stringify({ status }),
      `Updated return ${oldReturn.return_number}`
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      return: result.rows[0],
      message: 'Return updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating return:', error);
    res.status(500).json({ error: 'Failed to update return', details: error.message });
  } finally {
    client.release();
  }
});

// Approve a return
router.post('/returns/:id/approve', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { notes } = req.body;

    await client.query('BEGIN');

    const returnQuery = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (returnQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return not found' });
    }

    const returnRecord = returnQuery.rows[0];

    if (returnRecord.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot approve return in ${returnRecord.status} status` });
    }

    await client.query(`
      UPDATE marketplace_returns
      SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'approved', 'System', $2)
    `, [id, notes || 'Return approved']);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Return approved successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error approving return:', error);
    res.status(500).json({ error: 'Failed to approve return' });
  } finally {
    client.release();
  }
});

// Reject a return
router.post('/returns/:id/reject', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    await client.query('BEGIN');

    const returnQuery = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (returnQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return not found' });
    }

    const returnRecord = returnQuery.rows[0];

    if (returnRecord.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot reject return in ${returnRecord.status} status` });
    }

    await client.query(`
      UPDATE marketplace_returns
      SET status = 'rejected', internal_notes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id, reason || notes]);

    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, 'pending', 'rejected', 'System', $2)
    `, [id, reason || 'Return rejected']);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Return rejected'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error rejecting return:', error);
    res.status(500).json({ error: 'Failed to reject return' });
  } finally {
    client.release();
  }
});

// Mark return as received
router.post('/returns/:id/receive', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { condition_notes, items_condition } = req.body;

    await client.query('BEGIN');

    const returnQuery = await client.query(
      'SELECT * FROM marketplace_returns WHERE id = $1',
      [id]
    );

    if (returnQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return not found' });
    }

    const returnRecord = returnQuery.rows[0];

    if (!['approved', 'pending'].includes(returnRecord.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot receive return in ${returnRecord.status} status` });
    }

    await client.query(`
      UPDATE marketplace_returns
      SET status = 'received', received_date = CURRENT_TIMESTAMP,
          internal_notes = COALESCE(internal_notes, '') || $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id, condition_notes ? `\nReceived: ${condition_notes}` : '']);

    // Update item conditions if provided
    if (items_condition && Array.isArray(items_condition)) {
      for (const item of items_condition) {
        await client.query(`
          UPDATE marketplace_return_items
          SET condition = $2, notes = COALESCE(notes, '') || $3, restockable = $4
          WHERE id = $1
        `, [item.id, item.condition, item.notes || '', item.restockable !== false]);
      }
    }

    await client.query(`
      INSERT INTO marketplace_return_history
      (return_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, $2, 'received', 'System', 'Return items received')
    `, [id, returnRecord.status]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Return marked as received'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error receiving return:', error);
    res.status(500).json({ error: 'Failed to mark return as received' });
  } finally {
    client.release();
  }
});

// ============================================
// REFUNDS MANAGEMENT
// ============================================

// Get all refunds
router.get('/refunds', authenticate, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT rf.*, r.return_number, mo.mirakl_order_id, mo.customer_name
      FROM marketplace_refunds rf
      LEFT JOIN marketplace_returns r ON rf.return_id = r.id
      LEFT JOIN marketplace_orders mo ON rf.order_id = mo.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND rf.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY rf.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get count
    const countQuery = 'SELECT COUNT(*) as total FROM marketplace_refunds' +
      (status ? ' WHERE status = $1' : '');
    const countParams = status ? [status] : [];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      refunds: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('❌ Error fetching refunds:', error);
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
});

// Process a refund
router.post('/refunds', authenticate, validateJoi(marketplaceSchemas.processRefund), async (req, res) => {
  const client = await pool.connect();

  try {
    const { return_id, order_id, refund_type, amount_cents, reason, notes } = req.body;

    await client.query('BEGIN');

    // Generate refund number
    const refundNumber = generateRefundNumber();

    // Create refund record
    const result = await client.query(`
      INSERT INTO marketplace_refunds
      (refund_number, return_id, order_id, refund_type, status, amount_cents, reason, notes)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
      RETURNING *
    `, [refundNumber, return_id, order_id, refund_type, amount_cents, reason, notes]);

    const refund = result.rows[0];

    // If linked to a return, update return status
    if (return_id) {
      await client.query(`
        UPDATE marketplace_returns
        SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [return_id]);

      await client.query(`
        INSERT INTO marketplace_return_history
        (return_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, 'processed', 'refunded', 'System', $2)
      `, [return_id, `Refund ${refundNumber} created for $${(amount_cents / 100).toFixed(2)}`]);
    }

    // Create notification
    await client.query(`
      INSERT INTO marketplace_notifications
      (type, title, message, order_id, priority)
      VALUES ('refund_created', 'Refund Processed', $1, $2, 'normal')
    `, [
      `Refund ${refundNumber} for $${(amount_cents / 100).toFixed(2)} created`,
      order_id
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      refund,
      message: `Refund ${refundNumber} created successfully`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating refund:', error);
    res.status(500).json({ error: 'Failed to create refund', details: error.message });
  } finally {
    client.release();
  }
});

// Update refund status (mark as processed)
router.put('/refunds/:id/process', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { transaction_id, processed_by } = req.body;

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE marketplace_refunds
      SET status = 'processed',
          transaction_id = $2,
          processed_by = $3,
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, transaction_id, processed_by || 'System']);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Refund not found' });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      refund: result.rows[0],
      message: 'Refund marked as processed'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  } finally {
    client.release();
  }
});

// Get return settings
router.get('/return-settings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT setting_key, setting_value, description
      FROM marketplace_order_settings
      WHERE setting_key LIKE 'return%' OR setting_key LIKE 'refund%' OR setting_key LIKE 'restocking%'
    `);

    // Convert to object for easier access
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = {
        ...row.setting_value,
        description: row.description
      };
    });

    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching return settings:', error);
    res.status(500).json({ error: 'Failed to fetch return settings' });
  }
});

// Update return settings
router.put('/return-settings/:key', authenticate, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const result = await pool.query(`
      UPDATE marketplace_order_settings
      SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
      WHERE setting_key = $1
      RETURNING *
    `, [key, JSON.stringify(value)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({
      success: true,
      setting: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating return setting:', error);
    res.status(500).json({ error: 'Failed to update return setting' });
  }
});

// Returns analytics/dashboard
router.get('/returns/analytics', authenticate, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params = [];

    if (start_date) {
      params.push(start_date);
      dateFilter += ` AND created_at >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      dateFilter += ` AND created_at <= $${params.length}`;
    }

    // Total returns by status
    const statusBreakdown = await pool.query(`
      SELECT status, COUNT(*) as count, SUM(total_refund_cents) as total_value
      FROM marketplace_returns
      WHERE 1=1 ${dateFilter}
      GROUP BY status
    `, params);

    // Returns by reason
    const reasonBreakdown = await pool.query(`
      SELECT return_reason, COUNT(*) as count
      FROM marketplace_returns
      WHERE 1=1 ${dateFilter}
      GROUP BY return_reason
      ORDER BY count DESC
      LIMIT 10
    `, params);

    // Total refunds processed
    const refundStats = await pool.query(`
      SELECT
        COUNT(*) as total_refunds,
        SUM(CASE WHEN status = 'processed' THEN amount_cents ELSE 0 END) as processed_amount,
        SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) as pending_amount
      FROM marketplace_refunds
      WHERE 1=1 ${dateFilter.replace(/created_at/g, 'created_at')}
    `, params);

    // Average processing time
    const processingTime = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (processed_date - created_at)) / 86400) as avg_days
      FROM marketplace_returns
      WHERE processed_date IS NOT NULL ${dateFilter}
    `, params);

    res.json({
      status_breakdown: statusBreakdown.rows,
      reason_breakdown: reasonBreakdown.rows,
      refund_stats: refundStats.rows[0],
      avg_processing_days: processingTime.rows[0]?.avg_days || 0
    });
  } catch (error) {
    console.error('❌ Error fetching returns analytics:', error);
    res.status(500).json({ error: 'Failed to fetch returns analytics' });
  }
});

// ============================================
// ADDITIONAL BULK OPERATIONS
// ============================================

// Bulk create shipments
router.post('/bulk/shipments', authenticate, validateJoi(marketplaceSchemas.bulkShipment), async (req, res) => {
  const client = await pool.connect();

  try {
    const { shipments } = req.body;

    await client.query('BEGIN');

    const results = {
      total: shipments.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const shipment of shipments) {
      try {
        // Get order
        const orderQuery = await client.query(
          'SELECT * FROM marketplace_orders WHERE id = $1',
          [shipment.order_id]
        );

        if (orderQuery.rows.length === 0) {
          results.failed++;
          results.errors.push({ order_id: shipment.order_id, error: 'Order not found' });
          continue;
        }

        const order = orderQuery.rows[0];

        // Create shipment on Mirakl (if service is available)
        try {
          await miraklService.createShipment({
            order_id: order.mirakl_order_id,
            tracking_number: shipment.tracking_number,
            carrier_code: shipment.carrier_code,
            carrier_name: shipment.carrier_name
          });
        } catch (miraklError) {
          console.warn(`⚠️ Mirakl shipment sync failed for order ${shipment.order_id}:`, miraklError.message);
        }

        // Save shipment to database
        await client.query(`
          INSERT INTO marketplace_shipments
          (order_id, tracking_number, carrier_code, carrier_name, shipment_date, shipment_status)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'SHIPPED')
        `, [shipment.order_id, shipment.tracking_number, shipment.carrier_code, shipment.carrier_name]);

        // Update order status
        await client.query(`
          UPDATE marketplace_orders
          SET order_state = 'SHIPPED', shipped_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [shipment.order_id]);

        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({ order_id: shipment.order_id, error: error.message });
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in bulk shipment creation:', error);
    res.status(500).json({ error: 'Bulk shipment creation failed' });
  } finally {
    client.release();
  }
});

// Bulk stock update
router.post('/bulk/stock-update', authenticate, validateJoi(marketplaceSchemas.bulkStockUpdate), async (req, res) => {
  const client = await pool.connect();

  try {
    const { updates, user_name = 'System' } = req.body;

    await client.query('BEGIN');

    // Log the bulk operation
    const opLog = await client.query(`
      INSERT INTO bulk_operations_log (operation_type, total_items, status, user_name, details)
      VALUES ('stock_update', $1, 'in_progress', $2, $3)
      RETURNING id
    `, [updates.length, user_name, JSON.stringify({ updates_count: updates.length })]);

    const opId = opLog.rows[0].id;
    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
      try {
        await client.query(`
          UPDATE products
          SET stock = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [update.quantity, update.product_id]);
        successCount++;
      } catch {
        failCount++;
      }
    }

    // Update operation log
    await client.query(`
      UPDATE bulk_operations_log
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
          successful_items = $1, failed_items = $2
      WHERE id = $3
    `, [successCount, failCount, opId]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Stock updated for ${successCount} products`,
      successful: successCount,
      failed: failCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in bulk stock update:', error);
    res.status(500).json({ error: 'Bulk stock update failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
