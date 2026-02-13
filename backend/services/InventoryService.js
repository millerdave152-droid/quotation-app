/**
 * Inventory Service
 * Handles inventory reservations, stock tracking, and availability
 */

const miraklService = require('./miraklService');

class InventoryService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Reserve stock for a quotation
   * @param {number} quotationId - Quotation ID
   * @param {Array} items - Array of {product_id, quantity}
   * @param {string} createdBy - User who created the reservation
   * @param {number} expiryHours - Hours until reservation expires (default 72)
   * @returns {Promise<Array>} Created reservations
   */
  async reserveStock(quotationId, items, createdBy = 'system', expiryHours = 72) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const reservations = [];
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      for (const item of items) {
        // Check current availability
        const availability = await this.getAvailability(item.product_id, client);

        if (availability.available < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${item.product_id}. ` +
            `Requested: ${item.quantity}, Available: ${availability.available}`
          );
        }

        // Create reservation
        const result = await client.query(`
          INSERT INTO inventory_reservations
            (product_id, quotation_id, quantity, status, expires_at, created_by)
          VALUES ($1, $2, $3, 'reserved', $4, $5)
          RETURNING *
        `, [item.product_id, quotationId, item.quantity, expiresAt, createdBy]);

        // CRITICAL FIX: Update the product's reserved quantity to maintain accurate availability
        await client.query(`
          UPDATE products
          SET qty_reserved = COALESCE(qty_reserved, 0) + $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [item.product_id, item.quantity]);

        reservations.push(result.rows[0]);
      }

      await client.query('COMMIT');

      // Invalidate cache
      this.cache?.invalidatePattern('inventory:*');
      this.cache?.invalidatePattern('products:*');

      return reservations;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Release reservations for a quotation
   * @param {number} quotationId - Quotation ID
   * @param {string} reason - Release reason (quote_expired, quote_lost, quote_cancelled, manual)
   * @param {string} releasedBy - User who released
   * @returns {Promise<number>} Number of reservations released
   */
  async releaseReservation(quotationId, reason = 'manual', releasedBy = 'system') {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE inventory_reservations
        SET
          status = 'released',
          released_at = CURRENT_TIMESTAMP,
          release_reason = $2
        WHERE quotation_id = $1
          AND status = 'reserved'
        RETURNING *
      `, [quotationId, reason]);

      // Log the release and update product reserved quantities
      for (const reservation of result.rows) {
        // CRITICAL FIX: Decrement the product's reserved quantity
        await client.query(`
          UPDATE products
          SET qty_reserved = GREATEST(COALESCE(qty_reserved, 0) - $2, 0),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [reservation.product_id, reservation.quantity]);

        await this.logStockMovement(
          reservation.product_id,
          'reservation_released',
          reservation.quantity,
          `Released from quote ${quotationId}: ${reason}`,
          releasedBy,
          client
        );
      }

      await client.query('COMMIT');

      // Invalidate cache
      this.cache?.invalidatePattern('inventory:*');
      this.cache?.invalidatePattern('products:*');

      return result.rowCount;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Convert quotation reservations to order reservations
   * @param {number} quotationId - Source quotation ID
   * @param {number} orderId - Target order ID
   * @returns {Promise<Array>} Updated reservations
   */
  async convertReservation(quotationId, orderId) {
    const result = await this.pool.query(`
      UPDATE inventory_reservations
      SET
        order_id = $2,
        status = 'converted',
        released_at = CURRENT_TIMESTAMP
      WHERE quotation_id = $1
        AND status = 'reserved'
      RETURNING *
    `, [quotationId, orderId]);

    // Invalidate cache
    this.cache?.invalidatePattern('inventory:*');

    return result.rows;
  }

  /**
   * Get product availability
   * @param {number} productId - Product ID
   * @param {object} client - Optional database client for transaction
   * @returns {Promise<object>} Availability details
   */
  async getAvailability(productId, client = null) {
    const db = client || this.pool;

    const cacheKey = `inventory:availability:${productId}`;

    const fetchAvailability = async () => {
      const result = await db.query(`
        SELECT
          p.id,
          p.model,
          p.manufacturer,
          COALESCE(p.qty_on_hand, 0) as on_hand,
          COALESCE(p.qty_reserved, 0) as reserved,
          COALESCE(p.qty_on_hand, 0) - COALESCE(p.qty_reserved, 0) as available,
          COALESCE(p.qty_on_order, 0) as on_order,
          p.next_po_date,
          p.next_po_qty,
          p.last_stock_sync
        FROM products p
        WHERE p.id = $1
      `, [productId]);

      if (result.rows.length === 0) {
        throw new Error(`Product ${productId} not found`);
      }

      return result.rows[0];
    };

    // Don't use cache if inside transaction
    if (client || !this.cache) {
      return await fetchAvailability();
    }

    return await this.cache.cacheQuery(cacheKey, 'short', fetchAvailability);
  }

  /**
   * Check if all items in a quote have sufficient stock
   * @param {Array} items - Array of {product_id, quantity}
   * @returns {Promise<object>} Validation result with details
   */
  async checkStockForQuote(items) {
    const results = {
      valid: true,
      items: [],
      insufficientItems: []
    };

    for (const item of items) {
      const availability = await this.getAvailability(item.product_id);

      const itemResult = {
        product_id: item.product_id,
        model: availability.model,
        manufacturer: availability.manufacturer,
        requested: item.quantity,
        available: availability.available,
        on_order: availability.on_order,
        sufficient: availability.available >= item.quantity
      };

      results.items.push(itemResult);

      if (!itemResult.sufficient) {
        results.valid = false;
        results.insufficientItems.push(itemResult);
      }
    }

    return results;
  }

  /**
   * Sync stock from external ERP/POS system
   * @param {Array} products - Array of {model, qty_on_hand, qty_on_order, next_po_date, next_po_qty}
   * @param {string} source - Sync source identifier
   * @returns {Promise<object>} Sync results
   */
  async syncFromERP(products, source = 'erp_sync') {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const results = {
        updated: 0,
        notFound: [],
        errors: []
      };
      const _erpQueue = [];

      for (const product of products) {
        try {
          // Find product by model
          const findResult = await client.query(`
            SELECT id, sku, qty_on_hand FROM products WHERE model = $1
          `, [product.model]);

          if (findResult.rows.length === 0) {
            results.notFound.push(product.model);
            continue;
          }

          const productId = findResult.rows[0].id;
          const oldQty = findResult.rows[0].qty_on_hand;
          const productSku = findResult.rows[0].sku;

          // Update stock
          await client.query(`
            UPDATE products
            SET
              qty_on_hand = $2,
              qty_on_order = COALESCE($3, qty_on_order),
              next_po_date = COALESCE($4, next_po_date),
              next_po_qty = COALESCE($5, next_po_qty),
              last_stock_sync = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [
            productId,
            product.qty_on_hand,
            product.qty_on_order,
            product.next_po_date,
            product.next_po_qty
          ]);

          // Log movement if quantity changed
          if (oldQty !== product.qty_on_hand) {
            await this.logStockMovement(
              productId,
              'sync_adjustment',
              product.qty_on_hand - (oldQty || 0),
              `ERP sync from ${source}`,
              'system',
              client
            );
            _erpQueue.push({ productId, sku: productSku, oldQty: oldQty || 0, newQty: product.qty_on_hand, source: 'RECEIVING' });
          }

          results.updated++;

        } catch (error) {
          results.errors.push({ model: product.model, error: error.message });
        }
      }

      // Log the sync
      await client.query(`
        INSERT INTO inventory_sync_log (source, records_processed, records_updated, records_failed, notes)
        VALUES ($1, $2, $3, $4, $5)
      `, [source, products.length, results.updated, results.errors.length, JSON.stringify({ notFound: results.notFound })]);

      await client.query('COMMIT');

      // Queue marketplace inventory changes (non-blocking, after commit)
      for (const qi of _erpQueue) {
        try {
          await miraklService.queueInventoryChange(qi.productId, qi.sku, qi.oldQty, qi.newQty, qi.source);
        } catch (queueErr) {
          console.error('[MarketplaceQueue] RECEIVING (ERP sync) queue error:', queueErr.message);
        }
      }

      // Invalidate cache
      this.cache?.invalidatePattern('inventory:*');
      this.cache?.invalidatePattern('products:*');

      return results;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all reservations with optional filters
   * @param {object} options - Filter options
   * @returns {Promise<Array>} Reservations
   */
  async getReservations(options = {}) {
    const {
      quotationId,
      orderId,
      productId,
      status,
      page = 1,
      limit = 50
    } = options;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (quotationId) {
      conditions.push(`ir.quotation_id = $${paramIndex++}`);
      params.push(quotationId);
    }

    if (orderId) {
      conditions.push(`ir.order_id = $${paramIndex++}`);
      params.push(orderId);
    }

    if (productId) {
      conditions.push(`ir.product_id = $${paramIndex++}`);
      params.push(productId);
    }

    if (status) {
      conditions.push(`ir.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const result = await this.pool.query(`
      SELECT
        ir.*,
        p.model,
        p.manufacturer,
        p.name as product_name,
        q.quote_number,
        o.order_number
      FROM inventory_reservations ir
      JOIN products p ON ir.product_id = p.id
      LEFT JOIN quotations q ON ir.quotation_id = q.id
      LEFT JOIN orders o ON ir.order_id = o.id
      ${whereClause}
      ORDER BY ir.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return result.rows;
  }

  /**
   * Process expired reservations
   * @returns {Promise<number>} Number of expired reservations released
   */
  async processExpiredReservations() {
    const result = await this.pool.query(`
      UPDATE inventory_reservations
      SET
        status = 'expired',
        released_at = CURRENT_TIMESTAMP,
        release_reason = 'auto_expired'
      WHERE status = 'reserved'
        AND expires_at < CURRENT_TIMESTAMP
      RETURNING *
    `);

    // Log each expiry
    for (const reservation of result.rows) {
      await this.logStockMovement(
        reservation.product_id,
        'reservation_expired',
        reservation.quantity,
        `Auto-expired reservation for quote ${reservation.quotation_id}`,
        'system'
      );
    }

    if (result.rowCount > 0) {
      this.cache?.invalidatePattern('inventory:*');
      this.cache?.invalidatePattern('products:*');
    }

    return result.rowCount;
  }

  /**
   * Log a stock movement
   * @param {number} productId - Product ID
   * @param {string} movementType - Type of movement
   * @param {number} quantity - Quantity (positive or negative)
   * @param {string} notes - Movement notes
   * @param {string} createdBy - User who created
   * @param {object} client - Optional database client
   */
  async logStockMovement(productId, movementType, quantity, notes, createdBy = 'system', client = null) {
    const db = client || this.pool;

    await db.query(`
      INSERT INTO stock_movements
        (product_id, movement_type, quantity, notes, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [productId, movementType, quantity, notes, createdBy]);
  }

  /**
   * Get low stock products
   * @param {number} threshold - Minimum available quantity threshold
   * @returns {Promise<Array>} Low stock products
   */
  async getLowStockProducts(threshold = 5) {
    const result = await this.pool.query(`
      SELECT
        p.id,
        p.model,
        p.manufacturer,
        p.category,
        p.name,
        COALESCE(p.qty_on_hand, 0) as qty_on_hand,
        COALESCE(p.qty_reserved, 0) as qty_reserved,
        COALESCE(p.qty_on_hand, 0) - COALESCE(p.qty_reserved, 0) as available,
        COALESCE(p.qty_on_order, 0) as qty_on_order,
        p.next_po_date,
        p.next_po_qty
      FROM products p
      WHERE p.active = true
        AND (COALESCE(p.qty_on_hand, 0) - COALESCE(p.qty_reserved, 0)) < $1
      ORDER BY (COALESCE(p.qty_on_hand, 0) - COALESCE(p.qty_reserved, 0)) ASC
    `, [threshold]);

    return result.rows;
  }

  /**
   * Manually adjust stock quantity
   * @param {number} productId - Product ID
   * @param {number} newQuantity - New on-hand quantity
   * @param {string} reason - Adjustment reason
   * @param {string} adjustedBy - User making adjustment
   * @returns {Promise<object>} Updated product
   */
  async adjustStock(productId, newQuantity, reason, adjustedBy) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current quantity
      const current = await client.query(`
        SELECT qty_on_hand, sku FROM products WHERE id = $1
      `, [productId]);

      if (current.rows.length === 0) {
        throw new Error(`Product ${productId} not found`);
      }

      const oldQty = current.rows[0].qty_on_hand || 0;
      const productSku = current.rows[0].sku;
      const difference = newQuantity - oldQty;

      // Update quantity
      await client.query(`
        UPDATE products
        SET qty_on_hand = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [productId, newQuantity]);

      // Log movement
      await this.logStockMovement(
        productId,
        'manual_adjustment',
        difference,
        reason,
        adjustedBy,
        client
      );

      await client.query('COMMIT');

      // Queue marketplace inventory change (non-blocking, after commit)
      try {
        await miraklService.queueInventoryChange(productId, productSku, oldQty, newQuantity, 'MANUAL_ADJUST');
      } catch (queueErr) {
        console.error('[MarketplaceQueue] MANUAL_ADJUST queue error:', queueErr.message);
      }

      // Invalidate cache
      this.cache?.invalidatePattern(`inventory:availability:${productId}`);
      this.cache?.invalidatePattern('products:*');

      return { productId, oldQty, newQty: newQuantity, difference };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = InventoryService;
