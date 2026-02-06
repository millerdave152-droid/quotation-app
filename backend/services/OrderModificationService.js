/**
 * TeleTime - Order Modification Service
 *
 * Handles modifications to orders that originated from quotes:
 * - Add/remove/modify items
 * - Price locking (honor quote prices vs current prices)
 * - Order versioning and amendment tracking
 * - Partial fulfillment
 */

class OrderModificationService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;

    // Amendment approval thresholds
    this.APPROVAL_THRESHOLD_CENTS = 10000; // $100
    this.APPROVAL_THRESHOLD_PERCENT = 10; // 10% of order
  }

  // ============================================================================
  // ORDER RETRIEVAL
  // ============================================================================

  /**
   * Get order with full details including quote info
   */
  async getOrderWithQuoteInfo(orderId) {
    const result = await this.pool.query(
      `SELECT
        o.*,
        q.quote_id,
        q.quote_number,
        q.total_amount as quote_total_amount,
        q.created_at as quote_created_at,
        c.name as customer_name,
        c.pricing_tier
      FROM orders o
      LEFT JOIN quotes q ON o.original_quote_id = q.quote_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE o.order_id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) return null;

    const order = result.rows[0];

    // Get items with quote prices
    const itemsResult = await this.pool.query(
      `SELECT
        oi.*,
        p.name as product_name,
        p.sku as product_sku,
        p.price as current_price,
        qi.unit_price as quote_price,
        qi.discount_percent as quote_discount
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.product_id
      LEFT JOIN quote_items qi ON oi.product_id = qi.product_id
        AND qi.quote_id = $2
      WHERE oi.order_id = $1
      ORDER BY oi.id`,
      [orderId, order.quote_id]
    );

    return {
      orderId: order.order_id,
      orderNumber: order.order_number,
      status: order.status,
      versionNumber: order.version_number,
      priceLocked: order.price_locked,
      priceLockUntil: order.price_lock_until,
      quotePricesHonored: order.quote_prices_honored,
      customerId: order.customer_id,
      customerName: order.customer_name,
      pricingTier: order.pricing_tier,
      subtotal: parseFloat(order.subtotal || 0),
      discountAmount: parseFloat(order.discount_amount || 0),
      taxAmount: parseFloat(order.tax_amount || 0),
      totalAmount: parseFloat(order.total_amount || 0),
      quote: order.quote_id
        ? {
            quoteId: order.quote_id,
            quoteNumber: order.quote_number,
            totalAmount: parseFloat(order.quote_total_amount || 0),
            createdAt: order.quote_created_at,
          }
        : null,
      items: itemsResult.rows.map((item) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        productSku: item.product_sku,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price || item.price_at_order_cents / 100 || 0),
        discountPercent: parseFloat(item.discount_percent || 0),
        lineTotal: parseFloat(item.line_total || 0),
        fulfillmentStatus: item.fulfillment_status || 'pending',
        quantityFulfilled: item.quantity_fulfilled || 0,
        quantityBackordered: item.quantity_backordered || 0,
        quantityCancelled: item.quantity_cancelled || 0,
        quotePrice: item.quote_price ? parseFloat(item.quote_price) : null,
        currentPrice: item.current_price ? parseFloat(item.current_price) : null,
        priceAtOrder: item.price_at_order_cents
          ? item.price_at_order_cents / 100
          : null,
        hasPriceChange:
          item.current_price &&
          item.quote_price &&
          Math.abs(item.current_price - item.quote_price) > 0.01,
      })),
      lastModifiedAt: order.last_modified_at,
      createdAt: order.created_at,
    };
  }

  // ============================================================================
  // PRICE LOCKING
  // ============================================================================

  /**
   * Set price lock on order
   */
  async setPriceLock(orderId, locked, lockUntil = null, userId) {
    const result = await this.pool.query(
      `UPDATE orders
       SET price_locked = $2,
           price_lock_until = $3,
           last_modified_by = $4,
           last_modified_at = NOW()
       WHERE order_id = $1
       RETURNING *`,
      [orderId, locked, lockUntil, userId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Order not found' };
    }

    return { success: true, priceLocked: locked, priceLockUntil: lockUntil };
  }

  /**
   * Check if order prices are locked
   */
  async isPriceLocked(orderId) {
    const result = await this.pool.query(
      `SELECT price_locked, price_lock_until FROM orders WHERE order_id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) return false;

    const order = result.rows[0];

    // Check if lock has expired
    if (order.price_lock_until && new Date(order.price_lock_until) < new Date()) {
      return false;
    }

    return order.price_locked;
  }

  /**
   * Get price options for an item (quote price vs current price)
   */
  async getItemPriceOptions(orderId, productId) {
    const result = await this.pool.query(
      `SELECT
        p.price as current_price,
        p.cost as current_cost,
        qi.unit_price as quote_price,
        qi.discount_percent as quote_discount,
        oi.unit_price as order_price,
        oi.price_at_order_cents,
        o.price_locked,
        o.quote_prices_honored
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id AND oi.product_id = $2
      LEFT JOIN quotes q ON o.original_quote_id = q.quote_id
      LEFT JOIN quote_items qi ON q.quote_id = qi.quote_id AND qi.product_id = $2
      LEFT JOIN products p ON p.product_id = $2
      WHERE o.order_id = $1`,
      [orderId, productId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      currentPrice: parseFloat(row.current_price || 0),
      quotePrice: row.quote_price ? parseFloat(row.quote_price) : null,
      orderPrice: row.order_price
        ? parseFloat(row.order_price)
        : row.price_at_order_cents
        ? row.price_at_order_cents / 100
        : null,
      quoteDiscount: row.quote_discount ? parseFloat(row.quote_discount) : 0,
      priceLocked: row.price_locked,
      quotePricesHonored: row.quote_prices_honored,
      priceDifference:
        row.quote_price && row.current_price
          ? parseFloat(row.current_price) - parseFloat(row.quote_price)
          : 0,
      recommendedPrice: row.price_locked
        ? parseFloat(row.quote_price || row.order_price || row.current_price || 0)
        : parseFloat(row.current_price || 0),
    };
  }

  // ============================================================================
  // AMENDMENTS
  // ============================================================================

  /**
   * Create an amendment (draft) for order modification
   */
  async createAmendment(orderId, amendmentType, changes, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current order state
      const orderResult = await client.query(
        `SELECT * FROM orders WHERE order_id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];
      const currentTotalCents = Math.round(
        parseFloat(order.total_amount || 0) * 100
      );

      // Calculate new total based on changes
      const { newTotalCents, itemChanges } = await this._calculateAmendmentImpact(
        client,
        orderId,
        changes,
        order.price_locked,
        order.original_quote_id
      );

      const differenceCents = newTotalCents - currentTotalCents;

      // Check if approval is required
      const requiresApproval = this._checkRequiresApproval(
        differenceCents,
        currentTotalCents
      );

      // Generate amendment number
      const numResult = await client.query(
        `SELECT generate_amendment_number() as num`
      );
      const amendmentNumber = numResult.rows[0].num;

      // Create amendment record
      const amendmentResult = await client.query(
        `INSERT INTO order_amendments (
          amendment_number, order_id, amendment_type, status,
          reason, previous_total_cents, new_total_cents, difference_cents,
          use_quote_prices, requires_approval, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          amendmentNumber,
          orderId,
          amendmentType,
          requiresApproval ? 'pending_approval' : 'draft',
          changes.reason || null,
          currentTotalCents,
          newTotalCents,
          differenceCents,
          changes.useQuotePrices || false,
          requiresApproval,
          userId,
        ]
      );

      const amendmentId = amendmentResult.rows[0].id;

      // Insert item changes
      for (const item of itemChanges) {
        await client.query(
          `INSERT INTO order_amendment_items (
            amendment_id, order_item_id, product_id, product_name, product_sku,
            change_type, previous_quantity, new_quantity, quantity_change,
            quote_price_cents, current_price_cents, applied_price_cents,
            line_difference_cents, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            amendmentId,
            item.orderItemId || null,
            item.productId,
            item.productName,
            item.productSku || null,
            item.changeType,
            item.previousQuantity,
            item.newQuantity,
            item.quantityChange,
            item.quotePriceCents || null,
            item.currentPriceCents || null,
            item.appliedPriceCents,
            item.lineDifferenceCents,
            item.notes || null,
          ]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        amendmentId,
        amendmentNumber,
        status: requiresApproval ? 'pending_approval' : 'draft',
        requiresApproval,
        previousTotal: currentTotalCents / 100,
        newTotal: newTotalCents / 100,
        difference: differenceCents / 100,
        itemChanges: itemChanges.length,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate the impact of amendment changes
   */
  async _calculateAmendmentImpact(
    client,
    orderId,
    changes,
    priceLocked,
    quoteId
  ) {
    const itemChanges = [];
    let newTotalCents = 0;

    // Get current items
    const currentItemsResult = await client.query(
      `SELECT oi.*, p.price as current_price, p.name, p.sku
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.product_id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    const currentItems = new Map();
    currentItemsResult.rows.forEach((item) => {
      currentItems.set(item.product_id, item);
    });

    // Get quote prices if available
    let quotePrices = new Map();
    if (quoteId) {
      const quoteResult = await client.query(
        `SELECT product_id, unit_price FROM quote_items WHERE quote_id = $1`,
        [quoteId]
      );
      quoteResult.rows.forEach((qi) => {
        quotePrices.set(qi.product_id, parseFloat(qi.unit_price));
      });
    }

    // Process items to add
    if (changes.addItems) {
      for (const item of changes.addItems) {
        const productResult = await client.query(
          `SELECT product_id, name, sku, price FROM products WHERE product_id = $1`,
          [item.productId]
        );

        if (productResult.rows.length === 0) continue;

        const product = productResult.rows[0];
        const currentPriceCents = Math.round(parseFloat(product.price) * 100);
        const quotePriceCents = quotePrices.has(item.productId)
          ? Math.round(quotePrices.get(item.productId) * 100)
          : null;

        // Determine which price to use
        let appliedPriceCents;
        if (priceLocked && quotePriceCents) {
          appliedPriceCents = quotePriceCents;
        } else if (changes.useQuotePrices && quotePriceCents) {
          appliedPriceCents = quotePriceCents;
        } else if (item.overridePrice) {
          appliedPriceCents = Math.round(item.overridePrice * 100);
        } else {
          appliedPriceCents = currentPriceCents;
        }

        const lineTotalCents = appliedPriceCents * item.quantity;
        newTotalCents += lineTotalCents;

        itemChanges.push({
          productId: item.productId,
          productName: product.name,
          productSku: product.sku,
          changeType: 'add',
          previousQuantity: 0,
          newQuantity: item.quantity,
          quantityChange: item.quantity,
          quotePriceCents,
          currentPriceCents,
          appliedPriceCents,
          lineDifferenceCents: lineTotalCents,
          notes: item.notes,
        });
      }
    }

    // Process items to remove
    if (changes.removeItems) {
      for (const item of changes.removeItems) {
        const currentItem = currentItems.get(item.productId);
        if (!currentItem) continue;

        const priceCents = Math.round(
          parseFloat(currentItem.unit_price || currentItem.price_at_order_cents / 100) * 100
        );
        const lineTotalCents = -priceCents * currentItem.quantity;

        itemChanges.push({
          orderItemId: currentItem.id,
          productId: item.productId,
          productName: currentItem.name,
          productSku: currentItem.sku,
          changeType: 'remove',
          previousQuantity: currentItem.quantity,
          newQuantity: 0,
          quantityChange: -currentItem.quantity,
          appliedPriceCents: priceCents,
          lineDifferenceCents: lineTotalCents,
          notes: item.reason,
        });

        // Don't add to newTotal (item removed)
        currentItems.delete(item.productId);
      }
    }

    // Process item modifications
    if (changes.modifyItems) {
      for (const item of changes.modifyItems) {
        const currentItem = currentItems.get(item.productId);
        if (!currentItem) continue;

        const previousQuantity = currentItem.quantity;
        const newQuantity = item.quantity !== undefined ? item.quantity : previousQuantity;
        const quantityChange = newQuantity - previousQuantity;

        // Determine price
        let appliedPriceCents;
        const currentPriceCents = Math.round(parseFloat(currentItem.current_price) * 100);
        const quotePriceCents = quotePrices.has(item.productId)
          ? Math.round(quotePrices.get(item.productId) * 100)
          : null;

        if (item.overridePrice !== undefined) {
          appliedPriceCents = Math.round(item.overridePrice * 100);
        } else if (priceLocked && quotePriceCents) {
          appliedPriceCents = quotePriceCents;
        } else if (changes.useQuotePrices && quotePriceCents) {
          appliedPriceCents = quotePriceCents;
        } else {
          appliedPriceCents = Math.round(
            parseFloat(currentItem.unit_price || currentItem.price_at_order_cents / 100) * 100
          );
        }

        const previousLineCents =
          previousQuantity *
          Math.round(parseFloat(currentItem.unit_price || currentItem.price_at_order_cents / 100) * 100);
        const newLineCents = newQuantity * appliedPriceCents;
        const lineDifferenceCents = newLineCents - previousLineCents;

        newTotalCents += newLineCents;

        if (quantityChange !== 0 || lineDifferenceCents !== 0) {
          itemChanges.push({
            orderItemId: currentItem.id,
            productId: item.productId,
            productName: currentItem.name,
            productSku: currentItem.sku,
            changeType: 'modify',
            previousQuantity,
            newQuantity,
            quantityChange,
            quotePriceCents,
            currentPriceCents,
            appliedPriceCents,
            lineDifferenceCents,
            notes: item.notes,
          });
        }

        // Mark as processed
        currentItems.delete(item.productId);
      }
    }

    // Add unchanged items to total
    for (const [, item] of currentItems) {
      const priceCents = Math.round(
        parseFloat(item.unit_price || item.price_at_order_cents / 100) * 100
      );
      newTotalCents += priceCents * item.quantity;
    }

    return { newTotalCents, itemChanges };
  }

  /**
   * Check if amendment requires approval
   */
  _checkRequiresApproval(differenceCents, currentTotalCents) {
    if (Math.abs(differenceCents) > this.APPROVAL_THRESHOLD_CENTS) {
      return true;
    }

    if (currentTotalCents > 0) {
      const percentChange =
        (Math.abs(differenceCents) / currentTotalCents) * 100;
      if (percentChange > this.APPROVAL_THRESHOLD_PERCENT) {
        return true;
      }
    }

    return false;
  }

  /**
   * Approve an amendment
   */
  async approveAmendment(amendmentId, approverId, notes = null) {
    const result = await this.pool.query(
      `UPDATE order_amendments
       SET status = 'approved',
           approved_by = $2,
           approved_at = NOW(),
           rejection_reason = $3
       WHERE id = $1 AND status = 'pending_approval'
       RETURNING *`,
      [amendmentId, approverId, notes]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Amendment not found or not pending approval' };
    }

    return { success: true, amendment: this._formatAmendment(result.rows[0]) };
  }

  /**
   * Reject an amendment
   */
  async rejectAmendment(amendmentId, approverId, reason) {
    const result = await this.pool.query(
      `UPDATE order_amendments
       SET status = 'rejected',
           approved_by = $2,
           approved_at = NOW(),
           rejection_reason = $3
       WHERE id = $1 AND status = 'pending_approval'
       RETURNING *`,
      [amendmentId, approverId, reason]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Amendment not found or not pending approval' };
    }

    return { success: true, amendment: this._formatAmendment(result.rows[0]) };
  }

  /**
   * Apply an approved amendment to the order
   */
  async applyAmendment(amendmentId, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get amendment
      const amendmentResult = await client.query(
        `SELECT * FROM order_amendments WHERE id = $1 FOR UPDATE`,
        [amendmentId]
      );

      if (amendmentResult.rows.length === 0) {
        throw new Error('Amendment not found');
      }

      const amendment = amendmentResult.rows[0];

      if (amendment.status !== 'approved' && amendment.status !== 'draft') {
        throw new Error(`Cannot apply amendment with status: ${amendment.status}`);
      }

      if (amendment.requires_approval && amendment.status !== 'approved') {
        throw new Error('Amendment requires approval before applying');
      }

      // Create version snapshot before changes
      const versionResult = await client.query(
        `SELECT create_order_version($1, $2, $3) as version_id`,
        [amendment.order_id, userId, `Pre-amendment: ${amendment.amendment_number}`]
      );
      const preVersionId = versionResult.rows[0].version_id;

      // Get amendment items
      const itemsResult = await client.query(
        `SELECT * FROM order_amendment_items WHERE amendment_id = $1`,
        [amendmentId]
      );

      // Apply each change
      for (const item of itemsResult.rows) {
        if (item.change_type === 'add') {
          // Insert new order item
          await client.query(
            `INSERT INTO order_items (
              order_id, product_id, product_name, product_sku,
              quantity, unit_price, price_at_order_cents, line_total
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              amendment.order_id,
              item.product_id,
              item.product_name,
              item.product_sku,
              item.new_quantity,
              item.applied_price_cents / 100,
              item.applied_price_cents,
              (item.applied_price_cents * item.new_quantity) / 100,
            ]
          );
        } else if (item.change_type === 'remove') {
          // Mark item as cancelled
          await client.query(
            `UPDATE order_items
             SET quantity_cancelled = quantity,
                 fulfillment_status = 'cancelled'
             WHERE id = $1`,
            [item.order_item_id]
          );
        } else if (item.change_type === 'modify') {
          // Update item
          await client.query(
            `UPDATE order_items
             SET quantity = $2,
                 unit_price = $3,
                 price_at_order_cents = $4,
                 line_total = $5
             WHERE id = $1`,
            [
              item.order_item_id,
              item.new_quantity,
              item.applied_price_cents / 100,
              item.applied_price_cents,
              (item.applied_price_cents * item.new_quantity) / 100,
            ]
          );
        }
      }

      // Recalculate order totals
      await this._recalculateOrderTotals(client, amendment.order_id);

      // Create post-amendment version
      await client.query(
        `SELECT create_order_version($1, $2, $3) as version_id`,
        [amendment.order_id, userId, `Post-amendment: ${amendment.amendment_number}`]
      );

      // Update amendment status
      await client.query(
        `UPDATE order_amendments
         SET status = 'applied',
             applied_at = NOW(),
             applied_by = $2
         WHERE id = $1`,
        [amendmentId, userId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        amendmentNumber: amendment.amendment_number,
        newTotal: amendment.new_total_cents / 100,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Recalculate order totals after modification
   */
  async _recalculateOrderTotals(client, orderId) {
    // Get sum of active line items
    const itemsResult = await client.query(
      `SELECT
        COALESCE(SUM(line_total), 0) as subtotal,
        COUNT(*) as item_count
       FROM order_items
       WHERE order_id = $1
         AND (quantity_cancelled IS NULL OR quantity_cancelled < quantity)`,
      [orderId]
    );

    const subtotal = parseFloat(itemsResult.rows[0].subtotal);

    // Get order for discount and tax province
    const orderResult = await client.query(
      `SELECT discount_amount, tax_province FROM orders WHERE order_id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0];
    const discount = parseFloat(order.discount_amount || 0);

    // Calculate tax based on the order's province
    const taxableAmount = subtotal - discount;
    const TAX_RATES = {
      ON: { hst: 0.13, gst: 0, pst: 0 },
      NB: { hst: 0.15, gst: 0, pst: 0 },
      NS: { hst: 0.15, gst: 0, pst: 0 },
      NL: { hst: 0.15, gst: 0, pst: 0 },
      PE: { hst: 0.15, gst: 0, pst: 0 },
      BC: { hst: 0, gst: 0.05, pst: 0.07 },
      SK: { hst: 0, gst: 0.05, pst: 0.06 },
      MB: { hst: 0, gst: 0.05, pst: 0.07 },
      QC: { hst: 0, gst: 0.05, pst: 0.09975 },
      AB: { hst: 0, gst: 0.05, pst: 0 },
      NT: { hst: 0, gst: 0.05, pst: 0 },
      NU: { hst: 0, gst: 0.05, pst: 0 },
      YT: { hst: 0, gst: 0.05, pst: 0 },
    };
    const province = order.tax_province || 'ON';
    const rates = TAX_RATES[province] || TAX_RATES.ON;
    const hstAmount = taxableAmount * rates.hst;
    const gstAmount = taxableAmount * rates.gst;
    // QST (Quebec) is compound: calculated on amount + GST
    const pstBase = province === 'QC' ? taxableAmount + gstAmount : taxableAmount;
    const pstAmount = pstBase * rates.pst;
    const taxAmount = hstAmount + gstAmount + pstAmount;
    const totalAmount = taxableAmount + taxAmount;

    // Update order
    await client.query(
      `UPDATE orders
       SET subtotal = $2,
           tax_amount = $3,
           total_amount = $4,
           last_modified_at = NOW()
       WHERE order_id = $1`,
      [orderId, subtotal, taxAmount, totalAmount]
    );
  }

  /**
   * Get amendment details
   */
  async getAmendment(amendmentId) {
    const amendmentResult = await this.pool.query(
      `SELECT
        oa.*,
        o.order_number,
        u_created.first_name || ' ' || u_created.last_name as created_by_name,
        u_approved.first_name || ' ' || u_approved.last_name as approved_by_name,
        u_applied.first_name || ' ' || u_applied.last_name as applied_by_name
      FROM order_amendments oa
      JOIN orders o ON oa.order_id = o.order_id
      LEFT JOIN users u_created ON oa.created_by = u_created.user_id
      LEFT JOIN users u_approved ON oa.approved_by = u_approved.user_id
      LEFT JOIN users u_applied ON oa.applied_by = u_applied.user_id
      WHERE oa.id = $1`,
      [amendmentId]
    );

    if (amendmentResult.rows.length === 0) return null;

    const amendment = amendmentResult.rows[0];

    // Get amendment items
    const itemsResult = await this.pool.query(
      `SELECT * FROM order_amendment_items WHERE amendment_id = $1 ORDER BY id`,
      [amendmentId]
    );

    return {
      ...this._formatAmendment(amendment),
      items: itemsResult.rows.map((item) => ({
        id: item.id,
        orderItemId: item.order_item_id,
        productId: item.product_id,
        productName: item.product_name,
        productSku: item.product_sku,
        changeType: item.change_type,
        previousQuantity: item.previous_quantity,
        newQuantity: item.new_quantity,
        quantityChange: item.quantity_change,
        quotePrice: item.quote_price_cents ? item.quote_price_cents / 100 : null,
        currentPrice: item.current_price_cents ? item.current_price_cents / 100 : null,
        appliedPrice: item.applied_price_cents / 100,
        lineDifference: item.line_difference_cents / 100,
        notes: item.notes,
      })),
    };
  }

  /**
   * Get amendments for an order
   */
  async getOrderAmendments(orderId) {
    const result = await this.pool.query(
      `SELECT
        oa.*,
        u_created.first_name || ' ' || u_created.last_name as created_by_name,
        u_approved.first_name || ' ' || u_approved.last_name as approved_by_name,
        (SELECT COUNT(*) FROM order_amendment_items oai WHERE oai.amendment_id = oa.id) as item_count
      FROM order_amendments oa
      LEFT JOIN users u_created ON oa.created_by = u_created.user_id
      LEFT JOIN users u_approved ON oa.approved_by = u_approved.user_id
      WHERE oa.order_id = $1
      ORDER BY oa.created_at DESC`,
      [orderId]
    );

    return result.rows.map((row) => this._formatAmendment(row));
  }

  /**
   * Get pending amendments for approval
   */
  async getPendingAmendments(limit = 50) {
    const result = await this.pool.query(
      `SELECT
        oa.*,
        o.order_number,
        c.name as customer_name,
        u_created.first_name || ' ' || u_created.last_name as created_by_name,
        (SELECT COUNT(*) FROM order_amendment_items oai WHERE oai.amendment_id = oa.id) as item_count
      FROM order_amendments oa
      JOIN orders o ON oa.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN users u_created ON oa.created_by = u_created.user_id
      WHERE oa.status = 'pending_approval'
      ORDER BY oa.created_at ASC
      LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      ...this._formatAmendment(row),
      orderNumber: row.order_number,
      customerName: row.customer_name,
    }));
  }

  // ============================================================================
  // ORDER VERSIONS
  // ============================================================================

  /**
   * Get order version history
   */
  async getOrderVersions(orderId) {
    const result = await this.pool.query(
      `SELECT
        ov.*,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM order_versions ov
      LEFT JOIN users u ON ov.created_by = u.user_id
      WHERE ov.order_id = $1
      ORDER BY ov.version_number DESC`,
      [orderId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      versionNumber: row.version_number,
      subtotal: row.subtotal_cents / 100,
      discount: row.discount_cents / 100,
      tax: row.tax_cents / 100,
      total: row.total_cents / 100,
      itemCount: row.item_count,
      changeSummary: row.change_summary,
      createdBy: row.created_by_name,
      createdAt: row.created_at,
      items: row.items_snapshot,
    }));
  }

  /**
   * Compare two order versions
   */
  async compareVersions(orderId, version1, version2) {
    const v1Result = await this.pool.query(
      `SELECT * FROM order_versions WHERE order_id = $1 AND version_number = $2`,
      [orderId, version1]
    );
    const v2Result = await this.pool.query(
      `SELECT * FROM order_versions WHERE order_id = $1 AND version_number = $2`,
      [orderId, version2]
    );

    if (v1Result.rows.length === 0 || v2Result.rows.length === 0) {
      return null;
    }

    const v1 = v1Result.rows[0];
    const v2 = v2Result.rows[0];

    const v1Items = new Map();
    (v1.items_snapshot || []).forEach((item) => {
      v1Items.set(item.product_id, item);
    });

    const v2Items = new Map();
    (v2.items_snapshot || []).forEach((item) => {
      v2Items.set(item.product_id, item);
    });

    const changes = [];

    // Find added and modified items
    for (const [productId, v2Item] of v2Items) {
      const v1Item = v1Items.get(productId);
      if (!v1Item) {
        changes.push({
          type: 'added',
          productId,
          productName: v2Item.product_name,
          newQuantity: v2Item.quantity,
          newPrice: v2Item.unit_price_cents / 100,
        });
      } else if (
        v1Item.quantity !== v2Item.quantity ||
        v1Item.unit_price_cents !== v2Item.unit_price_cents
      ) {
        changes.push({
          type: 'modified',
          productId,
          productName: v2Item.product_name,
          previousQuantity: v1Item.quantity,
          newQuantity: v2Item.quantity,
          previousPrice: v1Item.unit_price_cents / 100,
          newPrice: v2Item.unit_price_cents / 100,
        });
      }
    }

    // Find removed items
    for (const [productId, v1Item] of v1Items) {
      if (!v2Items.has(productId)) {
        changes.push({
          type: 'removed',
          productId,
          productName: v1Item.product_name,
          previousQuantity: v1Item.quantity,
          previousPrice: v1Item.unit_price_cents / 100,
        });
      }
    }

    return {
      version1: {
        number: v1.version_number,
        total: v1.total_cents / 100,
        itemCount: v1.item_count,
        createdAt: v1.created_at,
      },
      version2: {
        number: v2.version_number,
        total: v2.total_cents / 100,
        itemCount: v2.item_count,
        createdAt: v2.created_at,
      },
      totalDifference: (v2.total_cents - v1.total_cents) / 100,
      changes,
    };
  }

  // ============================================================================
  // PARTIAL FULFILLMENT
  // ============================================================================

  /**
   * Create a partial shipment
   */
  async createShipment(orderId, items, shippingInfo, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate shipment number
      const numResult = await client.query(
        `SELECT generate_shipment_number() as num`
      );
      const shipmentNumber = numResult.rows[0].num;

      // Create shipment
      const shipmentResult = await client.query(
        `INSERT INTO order_shipments (
          shipment_number, order_id, carrier, tracking_number, tracking_url,
          status, shipping_cost_cents, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          shipmentNumber,
          orderId,
          shippingInfo.carrier || null,
          shippingInfo.trackingNumber || null,
          shippingInfo.trackingUrl || null,
          'shipped',
          shippingInfo.shippingCostCents || 0,
          shippingInfo.notes || null,
          userId,
        ]
      );

      const shipmentId = shipmentResult.rows[0].id;

      // Add items to shipment and update fulfillment
      for (const item of items) {
        // Add to shipment items
        await client.query(
          `INSERT INTO order_shipment_items (shipment_id, order_item_id, quantity_shipped, serial_numbers)
           VALUES ($1, $2, $3, $4)`,
          [shipmentId, item.orderItemId, item.quantityShipped, item.serialNumbers || null]
        );

        // Update order item fulfillment
        await client.query(
          `UPDATE order_items
           SET quantity_fulfilled = quantity_fulfilled + $2,
               fulfillment_status = CASE
                 WHEN quantity_fulfilled + $2 >= quantity THEN 'shipped'
                 ELSE 'allocated'
               END,
               shipped_at = COALESCE(shipped_at, NOW())
           WHERE id = $1`,
          [item.orderItemId, item.quantityShipped]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        shipmentId,
        shipmentNumber,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark items as backordered
   */
  async markBackordered(orderId, items, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const item of items) {
        await client.query(
          `UPDATE order_items
           SET quantity_backordered = $2,
               fulfillment_status = 'backordered'
           WHERE id = $1`,
          [item.orderItemId, item.quantity]
        );
      }

      // Create version for audit
      await client.query(
        `SELECT create_order_version($1, $2, $3)`,
        [orderId, userId, 'Items marked as backordered']
      );

      await client.query('COMMIT');

      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order shipments
   */
  async getOrderShipments(orderId) {
    const shipmentsResult = await this.pool.query(
      `SELECT
        os.*,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM order_shipments os
      LEFT JOIN users u ON os.created_by = u.user_id
      WHERE os.order_id = $1
      ORDER BY os.created_at DESC`,
      [orderId]
    );

    const shipments = [];

    for (const shipment of shipmentsResult.rows) {
      const itemsResult = await this.pool.query(
        `SELECT
          osi.*,
          oi.product_id,
          p.name as product_name,
          p.sku as product_sku
        FROM order_shipment_items osi
        JOIN order_items oi ON osi.order_item_id = oi.id
        LEFT JOIN products p ON oi.product_id = p.product_id
        WHERE osi.shipment_id = $1`,
        [shipment.id]
      );

      shipments.push({
        id: shipment.id,
        shipmentNumber: shipment.shipment_number,
        carrier: shipment.carrier,
        trackingNumber: shipment.tracking_number,
        trackingUrl: shipment.tracking_url,
        status: shipment.status,
        shippedAt: shipment.shipped_at,
        estimatedDelivery: shipment.estimated_delivery,
        deliveredAt: shipment.delivered_at,
        shippingCost: shipment.shipping_cost_cents / 100,
        notes: shipment.notes,
        createdBy: shipment.created_by_name,
        createdAt: shipment.created_at,
        items: itemsResult.rows.map((item) => ({
          orderItemId: item.order_item_id,
          productId: item.product_id,
          productName: item.product_name,
          productSku: item.product_sku,
          quantityShipped: item.quantity_shipped,
          serialNumbers: item.serial_numbers,
        })),
      });
    }

    return shipments;
  }

  /**
   * Get fulfillment summary for an order
   */
  async getFulfillmentSummary(orderId) {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        SUM(quantity_fulfilled) as fulfilled,
        SUM(quantity_backordered) as backordered,
        SUM(quantity_cancelled) as cancelled,
        SUM(quantity - quantity_fulfilled - COALESCE(quantity_cancelled, 0)) as pending
      FROM order_items
      WHERE order_id = $1`,
      [orderId]
    );

    const summary = result.rows[0];

    return {
      totalItems: parseInt(summary.total_items),
      totalQuantity: parseInt(summary.total_quantity),
      fulfilled: parseInt(summary.fulfilled || 0),
      backordered: parseInt(summary.backordered || 0),
      cancelled: parseInt(summary.cancelled || 0),
      pending: parseInt(summary.pending || 0),
      fulfillmentPercent:
        summary.total_quantity > 0
          ? Math.round((summary.fulfilled / summary.total_quantity) * 100)
          : 0,
      status:
        summary.fulfilled >= summary.total_quantity
          ? 'complete'
          : summary.fulfilled > 0
          ? 'partial'
          : 'pending',
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  _formatAmendment(row) {
    return {
      id: row.id,
      amendmentNumber: row.amendment_number,
      orderId: row.order_id,
      amendmentType: row.amendment_type,
      status: row.status,
      reason: row.reason,
      previousTotal: row.previous_total_cents / 100,
      newTotal: row.new_total_cents / 100,
      difference: row.difference_cents / 100,
      useQuotePrices: row.use_quote_prices,
      requiresApproval: row.requires_approval,
      createdBy: row.created_by_name || null,
      createdAt: row.created_at,
      approvedBy: row.approved_by_name || null,
      approvedAt: row.approved_at,
      rejectionReason: row.rejection_reason,
      appliedAt: row.applied_at,
      itemCount: row.item_count || 0,
    };
  }
}

module.exports = OrderModificationService;
