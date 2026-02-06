/**
 * TeleTime - Inventory Sync Service
 *
 * Manages inventory synchronization between Quotes and POS:
 * - Quote reservations (soft holds)
 * - POS sales (hard deductions)
 * - Quote-to-order conversion
 * - Void/cancel restoration
 * - Audit logging
 */

class InventorySyncService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  // ============================================================================
  // INVENTORY QUERIES
  // ============================================================================

  /**
   * Get current inventory for a product
   */
  async getProductInventory(productId, client = null) {
    const db = client || this.pool;
    const forUpdate = client ? ' FOR UPDATE' : '';
    const result = await db.query(`
      SELECT
        id,
        model,
        manufacturer,
        name,
        qty_on_hand,
        qty_reserved,
        qty_available,
        reorder_point,
        track_inventory,
        allow_backorder
      FROM products
      WHERE id = $1${forUpdate}
    `, [productId]);

    return result.rows[0] || null;
  }

  /**
   * Get inventory for multiple products
   */
  async getProductsInventory(productIds) {
    if (!productIds || productIds.length === 0) return [];

    const result = await this.pool.query(`
      SELECT
        id,
        model,
        manufacturer,
        name,
        qty_on_hand,
        qty_reserved,
        qty_available,
        reorder_point,
        track_inventory,
        allow_backorder
      FROM products
      WHERE id = ANY($1)
    `, [productIds]);

    return result.rows;
  }

  /**
   * Check if quantity is available for a product
   */
  async checkAvailability(productId, quantity, excludeReservationId = null, client = null) {
    const product = await this.getProductInventory(productId, client);

    if (!product) {
      return { available: false, reason: 'Product not found' };
    }

    if (!product.track_inventory) {
      return { available: true, reason: 'Inventory tracking disabled' };
    }

    let availableQty = product.qty_available;

    // If checking for a specific reservation update, add back its quantity
    if (excludeReservationId) {
      const reservation = await this.getReservation(excludeReservationId);
      if (reservation && reservation.status === 'active') {
        availableQty += (reservation.quantity - reservation.quantity_fulfilled);
      }
    }

    if (quantity <= availableQty) {
      return {
        available: true,
        qtyAvailable: availableQty,
        qtyOnHand: product.qty_on_hand,
        qtyReserved: product.qty_reserved,
      };
    }

    if (product.allow_backorder) {
      return {
        available: true,
        backorder: true,
        backorderQty: quantity - availableQty,
        qtyAvailable: availableQty,
      };
    }

    return {
      available: false,
      reason: `Insufficient inventory. Available: ${availableQty}, Requested: ${quantity}`,
      qtyAvailable: availableQty,
    };
  }

  /**
   * Check availability for multiple items at once
   */
  async checkBulkAvailability(items, client = null) {
    const useClient = client || await this.pool.connect();
    const shouldRelease = !client;

    try {
      if (!client) await useClient.query('BEGIN');

      const results = [];

      for (const item of items) {
        const check = await this.checkAvailability(
          item.productId,
          item.quantity,
          item.excludeReservationId,
          useClient
        );
        results.push({
          productId: item.productId,
          requestedQty: item.quantity,
          ...check,
        });
      }

      if (!client) await useClient.query('COMMIT');

      return {
        allAvailable: results.every(r => r.available),
        hasBackorders: results.some(r => r.backorder),
        items: results,
      };
    } catch (error) {
      if (!client) await useClient.query('ROLLBACK');
      throw error;
    } finally {
      if (shouldRelease) useClient.release();
    }
  }

  // ============================================================================
  // RESERVATIONS (Quotes)
  // ============================================================================

  /**
   * Create reservation for a quote item
   */
  async createReservation({
    productId,
    quantity,
    quoteId = null,
    quoteItemId = null,
    customerId = null,
    expiresHours = 72,
    userId = null,
    locationId = null,
    notes = null,
  }) {
    const result = await this.pool.query(`
      SELECT * FROM reserve_inventory($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      productId,
      quantity,
      quoteId,
      quoteItemId,
      customerId,
      expiresHours,
      userId,
      locationId,
      notes,
    ]);

    const row = result.rows[0];

    if (row.success) {
      await this._invalidateCache(productId);
    }

    return {
      success: row.success,
      reservationId: row.reservation_id,
      reservationNumber: row.reservation_number,
      message: row.message,
    };
  }

  /**
   * Create reservations for all items in a quote
   */
  async reserveQuoteItems(quoteId, items, options = {}) {
    const {
      customerId,
      expiresHours = 72,
      userId,
      locationId,
    } = options;

    const results = [];
    const errors = [];

    // Use transaction to ensure all-or-nothing
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const item of items) {
        const result = await client.query(`
          SELECT * FROM reserve_inventory($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          item.productId,
          item.quantity,
          quoteId,
          item.id || null,  // quote item id
          customerId,
          expiresHours,
          userId,
          locationId,
          item.notes || null,
        ]);

        const row = result.rows[0];

        if (!row.success) {
          errors.push({
            productId: item.productId,
            error: row.message,
          });
        } else {
          results.push({
            productId: item.productId,
            reservationId: row.reservation_id,
            reservationNumber: row.reservation_number,
          });
        }
      }

      if (errors.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          errors,
          message: `Failed to reserve ${errors.length} item(s)`,
        };
      }

      await client.query('COMMIT');

      // Invalidate caches
      for (const item of items) {
        await this._invalidateCache(item.productId);
      }

      return {
        success: true,
        reservations: results,
        message: `Reserved ${results.length} item(s)`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get reservation by ID
   */
  async getReservation(reservationId) {
    const result = await this.pool.query(`
      SELECT
        r.*,
        p.model,
        p.manufacturer,
        p.name as product_name
      FROM inventory_reservations r
      JOIN products p ON r.product_id = p.id
      WHERE r.id = $1
    `, [reservationId]);

    return result.rows[0] || null;
  }

  /**
   * Get reservations for a quote
   */
  async getQuoteReservations(quoteId) {
    const result = await this.pool.query(`
      SELECT
        r.*,
        p.model,
        p.manufacturer,
        p.name as product_name,
        r.quantity - r.quantity_fulfilled as remaining_quantity
      FROM inventory_reservations r
      JOIN products p ON r.product_id = p.id
      WHERE r.quote_id = $1
      ORDER BY r.created_at
    `, [quoteId]);

    return result.rows;
  }

  /**
   * Release a reservation
   */
  async releaseReservation(reservationId, reason = 'Manual release', userId = null) {
    const result = await this.pool.query(`
      SELECT * FROM release_reservation($1, $2, $3)
    `, [reservationId, reason, userId]);

    const row = result.rows[0];

    if (row.success) {
      const reservation = await this.getReservation(reservationId);
      if (reservation) {
        await this._invalidateCache(reservation.product_id);
      }
    }

    return {
      success: row.success,
      message: row.message,
    };
  }

  /**
   * Release all reservations for a quote
   */
  async releaseQuoteReservations(quoteId, reason = 'Quote cancelled', userId = null) {
    const reservations = await this.getQuoteReservations(quoteId);
    const activeReservations = reservations.filter(r => r.status === 'active');

    if (activeReservations.length === 0) {
      return { success: true, message: 'No active reservations to release' };
    }

    const results = [];
    for (const reservation of activeReservations) {
      const result = await this.releaseReservation(reservation.id, reason, userId);
      results.push({
        reservationId: reservation.id,
        productId: reservation.product_id,
        ...result,
      });
    }

    return {
      success: results.every(r => r.success),
      released: results.filter(r => r.success).length,
      results,
    };
  }

  /**
   * Update reservation quantity
   */
  async updateReservationQuantity(reservationId, newQuantity, userId = null) {
    const reservation = await this.getReservation(reservationId);

    if (!reservation) {
      return { success: false, message: 'Reservation not found' };
    }

    if (reservation.status !== 'active') {
      return { success: false, message: `Cannot update ${reservation.status} reservation` };
    }

    const difference = newQuantity - reservation.quantity;

    if (difference === 0) {
      return { success: true, message: 'No change needed' };
    }

    if (difference > 0) {
      // Increasing - check availability
      const check = await this.checkAvailability(reservation.product_id, difference);
      if (!check.available && !check.backorder) {
        return { success: false, message: check.reason };
      }
    }

    // Update reservation and product
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE inventory_reservations
        SET quantity = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [reservationId, newQuantity]);

      await client.query(`
        UPDATE products
        SET qty_reserved = qty_reserved + $2
        WHERE id = $1
      `, [reservation.product_id, difference]);

      // Log the adjustment
      await client.query(`
        INSERT INTO inventory_transactions (
          product_id, transaction_type, quantity,
          qty_before, qty_after, reserved_before, reserved_after,
          reference_type, reference_id, reservation_id,
          reason, created_by
        )
        SELECT
          $1, 'reservation', $2,
          qty_on_hand, qty_on_hand,
          qty_reserved - $2, qty_reserved,
          'quote', $3, $4,
          'Reservation quantity adjusted', $5
        FROM products WHERE id = $1
      `, [reservation.product_id, difference, reservation.quote_id, reservationId, userId]);

      await client.query('COMMIT');
      await this._invalidateCache(reservation.product_id);

      return { success: true, message: `Reservation updated to ${newQuantity}` };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Extend reservation expiry
   */
  async extendReservation(reservationId, additionalHours, userId = null) {
    const result = await this.pool.query(`
      UPDATE inventory_reservations
      SET
        expires_at = expires_at + ($2 || ' hours')::INTERVAL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'active'
      RETURNING *
    `, [reservationId, additionalHours]);

    if (result.rows.length === 0) {
      return { success: false, message: 'Reservation not found or not active' };
    }

    return {
      success: true,
      newExpiresAt: result.rows[0].expires_at,
      message: `Extended by ${additionalHours} hours`,
    };
  }

  // ============================================================================
  // SALES (POS)
  // ============================================================================

  /**
   * Deduct inventory for a POS sale
   */
  async deductForSale({
    productId,
    quantity,
    orderId = null,
    transactionId = null,
    referenceNumber = null,
    userId = null,
    locationId = null,
    allowNegative = false,
  }) {
    const result = await this.pool.query(`
      SELECT * FROM deduct_inventory_for_sale($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      productId,
      quantity,
      orderId,
      transactionId,
      referenceNumber,
      userId,
      locationId,
      allowNegative,
    ]);

    const row = result.rows[0];

    if (row.success) {
      await this._invalidateCache(productId);
    }

    return {
      success: row.success,
      message: row.message,
      transactionLogId: row.transaction_log_id,
    };
  }

  /**
   * Deduct inventory for multiple items (POS transaction)
   */
  async deductForTransaction(items, options = {}) {
    const {
      orderId,
      transactionId,
      referenceNumber,
      userId,
      locationId,
      allowNegative = false,
    } = options;

    const client = await this.pool.connect();
    const results = [];
    const errors = [];

    try {
      await client.query('BEGIN');

      for (const item of items) {
        const result = await client.query(`
          SELECT * FROM deduct_inventory_for_sale($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          item.productId,
          item.quantity,
          orderId,
          transactionId,
          referenceNumber,
          userId,
          locationId,
          allowNegative,
        ]);

        const row = result.rows[0];

        if (!row.success) {
          errors.push({
            productId: item.productId,
            error: row.message,
          });
        } else {
          results.push({
            productId: item.productId,
            quantity: item.quantity,
            transactionLogId: row.transaction_log_id,
          });
        }
      }

      if (errors.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          errors,
          message: `Failed to deduct ${errors.length} item(s)`,
        };
      }

      await client.query('COMMIT');

      // Invalidate caches
      for (const item of items) {
        await this._invalidateCache(item.productId);
      }

      return {
        success: true,
        items: results,
        message: `Deducted inventory for ${results.length} item(s)`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // CONVERSION (Quote to Order)
  // ============================================================================

  /**
   * Convert a reservation to a sale (quote accepted)
   */
  async convertReservationToSale(reservationId, orderId = null, quantity = null, userId = null) {
    const result = await this.pool.query(`
      SELECT * FROM convert_reservation_to_sale($1, $2, $3, $4)
    `, [reservationId, orderId, quantity, userId]);

    const row = result.rows[0];

    if (row.success) {
      const reservation = await this.getReservation(reservationId);
      if (reservation) {
        await this._invalidateCache(reservation.product_id);
      }
    }

    return {
      success: row.success,
      message: row.message,
      quantityConverted: row.quantity_converted,
    };
  }

  /**
   * Convert all reservations for a quote to sales
   */
  async convertQuoteToOrder(quoteId, orderId, userId = null) {
    const reservations = await this.getQuoteReservations(quoteId);
    const activeReservations = reservations.filter(r =>
      r.status === 'active' || r.status === 'partial'
    );

    if (activeReservations.length === 0) {
      return { success: true, message: 'No reservations to convert', converted: 0 };
    }

    const client = await this.pool.connect();
    const results = [];

    try {
      await client.query('BEGIN');

      for (const reservation of activeReservations) {
        const result = await client.query(`
          SELECT * FROM convert_reservation_to_sale($1, $2, NULL, $3)
        `, [reservation.id, orderId, userId]);

        const row = result.rows[0];
        results.push({
          reservationId: reservation.id,
          productId: reservation.product_id,
          success: row.success,
          quantityConverted: row.quantity_converted,
        });
      }

      await client.query('COMMIT');

      // Invalidate caches
      for (const reservation of activeReservations) {
        await this._invalidateCache(reservation.product_id);
      }

      return {
        success: true,
        converted: results.filter(r => r.success).length,
        results,
        message: `Converted ${results.length} reservation(s)`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // RESTORATION (Void/Cancel/Return)
  // ============================================================================

  /**
   * Restore inventory for voided transaction
   */
  async restoreForVoid({
    productId,
    quantity,
    referenceType = null,
    referenceId = null,
    referenceNumber = null,
    userId = null,
    locationId = null,
    originalTransactionId = null,
  }) {
    const result = await this.pool.query(`
      SELECT * FROM restore_inventory($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      productId,
      quantity,
      'Transaction voided',
      referenceType,
      referenceId,
      referenceNumber,
      userId,
      locationId,
      originalTransactionId,
    ]);

    const row = result.rows[0];

    if (row.success) {
      await this._invalidateCache(productId);
    }

    return {
      success: row.success,
      message: row.message,
      transactionLogId: row.transaction_log_id,
    };
  }

  /**
   * Restore inventory for all items in a voided transaction
   */
  async restoreForVoidedTransaction(items, options = {}) {
    const {
      referenceType,
      referenceId,
      referenceNumber,
      userId,
      locationId,
    } = options;

    const client = await this.pool.connect();
    const results = [];

    try {
      await client.query('BEGIN');

      for (const item of items) {
        const result = await client.query(`
          SELECT * FROM restore_inventory($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          item.productId,
          item.quantity,
          'Transaction voided',
          referenceType,
          referenceId,
          referenceNumber,
          userId,
          locationId,
          item.originalTransactionId || null,
        ]);

        const row = result.rows[0];
        results.push({
          productId: item.productId,
          quantity: item.quantity,
          success: row.success,
          transactionLogId: row.transaction_log_id,
        });
      }

      await client.query('COMMIT');

      // Invalidate caches
      for (const item of items) {
        await this._invalidateCache(item.productId);
      }

      return {
        success: true,
        items: results,
        message: `Restored inventory for ${results.length} item(s)`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process customer return
   */
  async processReturn({
    productId,
    quantity,
    orderId = null,
    returnReason = 'Customer return',
    userId = null,
    locationId = null,
  }) {
    const result = await this.pool.query(`
      SELECT * FROM restore_inventory($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      productId,
      quantity,
      `Return: ${returnReason}`,
      'order',
      orderId,
      null,
      userId,
      locationId,
      null,
    ]);

    const row = result.rows[0];

    if (row.success) {
      await this._invalidateCache(productId);
    }

    return {
      success: row.success,
      message: row.message,
      transactionLogId: row.transaction_log_id,
    };
  }

  // ============================================================================
  // ADJUSTMENTS
  // ============================================================================

  /**
   * Adjust inventory count
   */
  async adjustInventory(productId, newQuantity, reason, userId = null, locationId = null) {
    const result = await this.pool.query(`
      SELECT * FROM adjust_inventory($1, $2, $3, $4, $5)
    `, [productId, newQuantity, reason, userId, locationId]);

    const row = result.rows[0];

    if (row.success) {
      await this._invalidateCache(productId);
    }

    return {
      success: row.success,
      message: row.message,
      adjustment: row.adjustment,
    };
  }

  /**
   * Receive inventory from supplier
   */
  async receiveInventory({
    productId,
    quantity,
    purchaseOrderNumber = null,
    unitCostCents = null,
    userId = null,
    locationId = null,
    notes = null,
  }) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current quantities
      const current = await client.query(`
        SELECT qty_on_hand, qty_reserved
        FROM products WHERE id = $1 FOR UPDATE
      `, [productId]);

      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Product not found' };
      }

      const qtyBefore = current.rows[0].qty_on_hand;
      const reservedBefore = current.rows[0].qty_reserved;

      // Update product
      await client.query(`
        UPDATE products
        SET
          qty_on_hand = qty_on_hand + $2,
          last_received_date = CURRENT_DATE
        WHERE id = $1
      `, [productId, quantity]);

      // Get location
      const locationResult = await client.query(`
        SELECT id FROM inventory_locations
        WHERE ${locationId ? 'id = $1' : 'is_default = TRUE'}
        LIMIT 1
      `, locationId ? [locationId] : []);

      const locId = locationResult.rows[0]?.id || null;

      // Log transaction
      await client.query(`
        INSERT INTO inventory_transactions (
          product_id, location_id, transaction_type, quantity,
          qty_before, qty_after, reserved_before, reserved_after,
          unit_cost_cents, total_cost_cents,
          reference_type, reference_number,
          reason, notes, created_by
        ) VALUES (
          $1, $2, 'receipt', $3,
          $4, $5, $6, $6,
          $7, $8,
          'purchase_order', $9,
          'Inventory received', $10, $11
        )
      `, [
        productId, locId, quantity,
        qtyBefore, qtyBefore + quantity, reservedBefore,
        unitCostCents, unitCostCents ? unitCostCents * quantity : null,
        purchaseOrderNumber,
        notes, userId,
      ]);

      await client.query('COMMIT');
      await this._invalidateCache(productId);

      return {
        success: true,
        message: `Received ${quantity} units`,
        newQuantity: qtyBefore + quantity,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // EXPIRATION MANAGEMENT
  // ============================================================================

  /**
   * Expire old reservations
   */
  async expireOldReservations() {
    const result = await this.pool.query(`
      SELECT expire_old_reservations() as count
    `);

    const count = result.rows[0].count;

    if (count > 0) {
      // Invalidate all product caches (could be optimized)
      await this._invalidateAllProductCache();
    }

    return { expired: count };
  }

  // ============================================================================
  // AUDIT LOG
  // ============================================================================

  /**
   * Get inventory transaction history for a product
   */
  async getProductHistory(productId, options = {}) {
    const { limit = 50, offset = 0, startDate, endDate, transactionTypes } = options;

    let query = `
      SELECT
        t.*,
        u.name as created_by_name
      FROM inventory_transactions t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.product_id = $1
    `;

    const params = [productId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND t.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND t.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (transactionTypes && transactionTypes.length > 0) {
      query += ` AND t.transaction_type = ANY($${paramIndex++})`;
      params.push(transactionTypes);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get recent inventory movements across all products
   */
  async getRecentMovements(options = {}) {
    const { limit = 100, transactionTypes, locationId } = options;

    let query = `
      SELECT
        t.*,
        p.model,
        p.manufacturer,
        p.name as product_name,
        u.name as created_by_name
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (transactionTypes && transactionTypes.length > 0) {
      query += ` AND t.transaction_type = ANY($${paramIndex++})`;
      params.push(transactionTypes);
    }

    if (locationId) {
      query += ` AND t.location_id = $${paramIndex++}`;
      params.push(locationId);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================================================
  // REPORTS
  // ============================================================================

  /**
   * Get low stock products
   */
  async getLowStockProducts(threshold = null) {
    const result = await this.pool.query(`
      SELECT * FROM products_needing_reorder
      ${threshold ? 'WHERE qty_below_reorder >= $1' : ''}
      ORDER BY qty_below_reorder DESC
    `, threshold ? [threshold] : []);

    return result.rows;
  }

  /**
   * Get inventory valuation
   */
  async getInventoryValuation(locationId = null) {
    const result = await this.pool.query(`
      SELECT
        SUM(qty_on_hand) as total_units,
        SUM(qty_on_hand * cost_cents) as total_cost_cents,
        SUM(qty_on_hand * msrp_cents) as total_retail_cents,
        COUNT(*) as product_count
      FROM products
      WHERE track_inventory = TRUE
        AND qty_on_hand > 0
    `);

    return result.rows[0];
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  async _invalidateCache(productId) {
    if (!this.cache) return;

    try {
      await this.cache.invalidatePattern(`inventory:${productId}:*`);
      await this.cache.invalidatePattern(`product:${productId}:*`);
    } catch (error) {
      console.warn('Cache invalidation failed:', error.message);
    }
  }

  async _invalidateAllProductCache() {
    if (!this.cache) return;

    try {
      await this.cache.invalidatePattern('inventory:*');
    } catch (error) {
      console.warn('Cache invalidation failed:', error.message);
    }
  }
}

module.exports = InventorySyncService;
