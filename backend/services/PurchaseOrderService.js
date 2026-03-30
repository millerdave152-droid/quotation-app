/**
 * Purchase Order Service
 * Full PO lifecycle: create, submit, confirm, receive, cancel
 */

const { ApiError } = require('../middleware/errorHandler');

class PurchaseOrderService {
  constructor(pool, cache = null, serialNumberService = null) {
    this.pool = pool;
    this.cache = cache;
    this.serialNumberService = serialNumberService;
    this.CACHE_TTL = 300;
  }

  // ---------------------------------------------------------------------------
  // PO NUMBER GENERATION
  // ---------------------------------------------------------------------------

  async _generatePONumber(client) {
    const db = client || this.pool;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { rows } = await db.query(
      'SELECT po_number FROM purchase_orders WHERE po_number LIKE $1 ORDER BY po_number DESC LIMIT 1',
      [`PO-${today}-%`]
    );
    let seq = 1;
    if (rows.length) {
      const last = rows[0].po_number.split('-')[2];
      seq = parseInt(last) + 1;
    }
    return `PO-${today}-${String(seq).padStart(4, '0')}`;
  }

  async _generateReceiptNumber(client) {
    const db = client || this.pool;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { rows } = await db.query(
      'SELECT receipt_number FROM goods_receipts WHERE receipt_number LIKE $1 ORDER BY receipt_number DESC LIMIT 1',
      [`GR-${today}-%`]
    );
    let seq = 1;
    if (rows.length) {
      const last = rows[0].receipt_number.split('-')[2];
      seq = parseInt(last) + 1;
    }
    return `GR-${today}-${String(seq).padStart(4, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // CREATE / UPDATE PO
  // ---------------------------------------------------------------------------

  async createPO(vendorId, locationId, items, userId, opts = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Validate vendor
      const vendor = await client.query('SELECT id FROM vendors WHERE id = $1', [vendorId]);
      if (!vendor.rows.length) throw ApiError.notFound('Vendor');

      const poNumber = await this._generatePONumber(client);

      let subtotalCents = 0;
      for (const item of items) {
        subtotalCents += item.quantityOrdered * item.unitCostCents;
      }
      const taxCents = opts.taxCents || 0;
      const shippingCents = opts.shippingCents || 0;
      const totalCents = subtotalCents + taxCents + shippingCents;

      const { rows } = await client.query(
        `INSERT INTO purchase_orders (po_number, vendor_id, location_id, status, order_date, expected_date,
          subtotal_cents, tax_cents, shipping_cents, total_cents, notes, internal_notes, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [poNumber, vendorId, locationId || null, opts.orderDate || new Date(), opts.expectedDate || null,
         subtotalCents, taxCents, shippingCents, totalCents, opts.notes || null, opts.internalNotes || null, userId]
      );
      const po = rows[0];

      for (const item of items) {
        await client.query(
          `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_cost_cents, notes, is_special_order, special_order_reference)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [po.id, item.productId, item.quantityOrdered, item.unitCostCents, item.notes || null, item.isSpecialOrder || false, item.specialOrderReference || null]
        );
      }

      await client.query('COMMIT');
      return this.getPO(po.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updatePO(poId, updates, userId) {
    const po = await this._getPORow(poId);
    if (po.status !== 'draft') throw ApiError.badRequest('Only draft POs can be edited');

    const fields = [];
    const params = [];
    let idx = 1;

    const allowedFields = ['vendor_id', 'location_id', 'order_date', 'expected_date', 'tax_cents', 'shipping_cents', 'notes', 'internal_notes'];
    for (const f of allowedFields) {
      const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (updates[camel] !== undefined) {
        fields.push(`${f} = $${idx++}`);
        params.push(updates[camel]);
      }
    }

    if (!fields.length) return this.getPO(poId);

    fields.push('updated_at = NOW()');
    params.push(poId);

    await this.pool.query(
      `UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = $${idx}`,
      params
    );

    // Recalculate totals
    await this._recalcTotals(poId);

    return this.getPO(poId);
  }

  async addItem(poId, productId, qty, unitCostCents, opts = {}) {
    const po = await this._getPORow(poId);
    if (po.status !== 'draft') throw ApiError.badRequest('Only draft POs can have items added');

    await this.pool.query(
      `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_cost_cents, notes, is_special_order, special_order_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [poId, productId, qty, unitCostCents, opts.notes || null, opts.isSpecialOrder || false, opts.specialOrderReference || null]
    );

    await this._recalcTotals(poId);
    return this.getPO(poId);
  }

  async removeItem(poId, itemId) {
    const po = await this._getPORow(poId);
    if (po.status !== 'draft') throw ApiError.badRequest('Only draft POs can have items removed');

    await this.pool.query('DELETE FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2', [itemId, poId]);
    await this._recalcTotals(poId);
    return this.getPO(poId);
  }

  // ---------------------------------------------------------------------------
  // STATUS TRANSITIONS
  // ---------------------------------------------------------------------------

  async submitPO(poId, userId) {
    const po = await this._getPORow(poId);
    if (po.status !== 'draft') throw ApiError.badRequest('Only draft POs can be submitted');

    // Validate has items
    const items = await this.pool.query('SELECT id FROM purchase_order_items WHERE purchase_order_id = $1', [poId]);
    if (!items.rows.length) throw ApiError.badRequest('PO must have at least one item');

    await this.pool.query(
      'UPDATE purchase_orders SET status = \'submitted\', updated_at = NOW() WHERE id = $1',
      [poId]
    );
    return this.getPO(poId);
  }

  async confirmPO(poId, userId) {
    const po = await this._getPORow(poId);
    if (po.status !== 'submitted') throw ApiError.badRequest('Only submitted POs can be confirmed');

    await this.pool.query(
      'UPDATE purchase_orders SET status = \'confirmed\', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1',
      [poId, userId]
    );
    return this.getPO(poId);
  }

  async cancelPO(poId, userId, reason) {
    const po = await this._getPORow(poId);
    if (['received', 'cancelled'].includes(po.status)) throw ApiError.badRequest('Cannot cancel a received or already cancelled PO');

    await this.pool.query(
      'UPDATE purchase_orders SET status = \'cancelled\', cancelled_by = $2, cancelled_at = NOW(), cancel_reason = $3, updated_at = NOW() WHERE id = $1',
      [poId, userId, reason || null]
    );
    return this.getPO(poId);
  }

  // ---------------------------------------------------------------------------
  // GOODS RECEIVING
  // ---------------------------------------------------------------------------

  async receiveGoods(poId, items, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const po = (await client.query('SELECT * FROM purchase_orders WHERE id = $1', [poId])).rows[0];
      if (!po) throw ApiError.notFound('Purchase Order');
      if (!['confirmed', 'partially_received'].includes(po.status)) {
        throw ApiError.badRequest('PO must be confirmed or partially received to receive goods');
      }

      const receiptNumber = await this._generateReceiptNumber(client);

      const { rows: receiptRows } = await client.query(
        `INSERT INTO goods_receipts (receipt_number, purchase_order_id, location_id, received_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [receiptNumber, poId, po.location_id, userId]
      );
      const receipt = receiptRows[0];

      let allFullyReceived = true;

      for (const item of items) {
        // Get PO item
        const poItem = (await client.query(
          'SELECT * FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2',
          [item.purchaseOrderItemId, poId]
        )).rows[0];
        if (!poItem) throw ApiError.badRequest(`PO item ${item.purchaseOrderItemId} not found`);

        const remaining = poItem.quantity_ordered - poItem.quantity_received;
        const qtyReceived = item.quantityReceived || 0;
        const qtyDamaged = item.quantityDamaged || 0;

        if (qtyReceived + qtyDamaged > remaining) {
          throw ApiError.badRequest(`Cannot receive more than remaining (${remaining}) for product ${poItem.product_id}`);
        }

        // Create receipt item
        await client.query(
          `INSERT INTO goods_receipt_items (goods_receipt_id, purchase_order_item_id, product_id, quantity_received, quantity_damaged, serial_numbers, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [receipt.id, item.purchaseOrderItemId, poItem.product_id, qtyReceived, qtyDamaged, item.serialNumbers || null, item.notes || null]
        );

        // Update PO item received qty
        const newReceived = poItem.quantity_received + qtyReceived;
        await client.query(
          'UPDATE purchase_order_items SET quantity_received = $1 WHERE id = $2',
          [newReceived, poItem.id]
        );

        if (newReceived < poItem.quantity_ordered) allFullyReceived = false;

        // Update product inventory (qty_on_hand)
        if (qtyReceived > 0) {
          await client.query(
            'UPDATE products SET qty_on_hand = COALESCE(qty_on_hand, 0) + $1 WHERE id = $2',
            [qtyReceived, poItem.product_id]
          );

          // Insert inventory transaction
          await client.query(
            `INSERT INTO inventory_transactions (product_id, location_id, transaction_type, quantity, reference_type, reference_id, notes, created_by)
             VALUES ($1, $2, 'receipt', $3, 'purchase_order', $4, $5, $6)`,
            [poItem.product_id, po.location_id, qtyReceived, poId, `GR: ${receiptNumber}`, userId]
          );
        }

        // Auto-register serial numbers
        if (item.serialNumbers && item.serialNumbers.length && this.serialNumberService) {
          const serialBatch = item.serialNumbers.map(sn => ({
            productId: poItem.product_id,
            serialNumber: sn,
            locationId: po.location_id,
            purchaseOrderId: poId,
            referenceType: 'purchase_order',
            referenceId: poId,
          }));
          await this.serialNumberService.registerBatch(serialBatch, userId);
        }
      }

      // Check if ALL items on PO are fully received
      if (allFullyReceived) {
        const remaining = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM purchase_order_items
           WHERE purchase_order_id = $1 AND quantity_received < quantity_ordered`,
          [poId]
        );
        if (remaining.rows[0].cnt === 0) {
          await client.query("UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = $1", [poId]);
        } else {
          await client.query("UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = $1", [poId]);
        }
      } else {
        await client.query("UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = $1", [poId]);
      }

      await client.query('COMMIT');
      return { receipt, po: await this.getPO(poId) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------

  async getPO(poId) {
    const { rows } = await this.pool.query(
      `SELECT po.*, v.name AS vendor_name, v.code AS vendor_code,
              l.name AS location_name,
              cb.first_name || ' ' || cb.last_name AS created_by_name,
              ab.first_name || ' ' || ab.last_name AS approved_by_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN locations l ON l.id = po.location_id
       LEFT JOIN users cb ON cb.id = po.created_by
       LEFT JOIN users ab ON ab.id = po.approved_by
       WHERE po.id = $1`, [poId]
    );
    if (!rows.length) throw ApiError.notFound('Purchase Order');
    const po = rows[0];

    const items = await this.pool.query(
      `SELECT poi.*, p.name AS product_name, p.sku AS product_sku,
              COALESCE(p.is_serialized, false) AS is_serialized
       FROM purchase_order_items poi
       LEFT JOIN products p ON p.id = poi.product_id
       WHERE poi.purchase_order_id = $1
       ORDER BY poi.id`, [poId]
    );
    po.items = items.rows;

    const receipts = await this.pool.query(
      `SELECT gr.*, u.first_name || ' ' || u.last_name AS received_by_name
       FROM goods_receipts gr
       LEFT JOIN users u ON u.id = gr.received_by
       WHERE gr.purchase_order_id = $1
       ORDER BY gr.received_at DESC`, [poId]
    );
    po.receipts = receipts.rows;

    return po;
  }

  async listPOs(filters = {}) {
    const params = [];
    const conditions = [];
    let idx = 1;

    if (filters.status) { conditions.push(`po.status = $${idx++}`); params.push(filters.status); }
    if (filters.vendorId) { conditions.push(`po.vendor_id = $${idx++}`); params.push(filters.vendorId); }
    if (filters.dateFrom) { conditions.push(`po.order_date >= $${idx++}`); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push(`po.order_date <= $${idx++}`); params.push(filters.dateTo); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = parseInt(filters.limit) || 50;
    const offset = parseInt(filters.offset) || 0;

    const [countRes, dataRes] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::int AS total FROM purchase_orders po ${where}`, params),
      this.pool.query(
        `SELECT po.*, v.name AS vendor_name, v.code AS vendor_code,
                l.name AS location_name,
                cb.first_name || ' ' || cb.last_name AS created_by_name
         FROM purchase_orders po
         LEFT JOIN vendors v ON v.id = po.vendor_id
         LEFT JOIN locations l ON l.id = po.location_id
         LEFT JOIN users cb ON cb.id = po.created_by
         ${where}
         ORDER BY po.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      ),
    ]);

    return { purchaseOrders: dataRes.rows, total: countRes.rows[0].total, limit, offset };
  }

  async getReceivingQueue() {
    const { rows } = await this.pool.query(
      `SELECT po.*, v.name AS vendor_name, l.name AS location_name,
              (SELECT COUNT(*)::int FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS item_count,
              (SELECT SUM(poi.quantity_ordered - poi.quantity_received)::int FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS units_pending
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN locations l ON l.id = po.location_id
       WHERE po.status IN ('confirmed', 'partially_received')
       ORDER BY po.expected_date ASC NULLS LAST`
    );
    return rows;
  }

  async suggestReorders() {
    const { rows } = await this.pool.query(
      `SELECT p.id AS product_id, p.name AS product_name, p.sku,
              p.qty_on_hand, p.reorder_point, p.reorder_qty,
              p.vendor_id, v.name AS vendor_name, v.code AS vendor_code,
              p.cost
       FROM products p
       LEFT JOIN vendors v ON v.id = p.vendor_id
       WHERE p.reorder_point IS NOT NULL
         AND p.qty_on_hand <= p.reorder_point
         AND p.is_active = true
       ORDER BY v.name, p.name`
    );

    // Group by vendor
    const grouped = {};
    for (const r of rows) {
      const vid = r.vendor_id || 0;
      if (!grouped[vid]) grouped[vid] = { vendorId: vid, vendorName: r.vendor_name || 'No Vendor', products: [] };
      grouped[vid].products.push(r);
    }
    return Object.values(grouped);
  }

  async getDashboardStats() {
    const [openPOs, pendingReceipts, overdue, spend] = await Promise.all([
      this.pool.query('SELECT COUNT(*)::int AS cnt FROM purchase_orders WHERE status NOT IN (\'received\',\'cancelled\')'),
      this.pool.query('SELECT COUNT(*)::int AS cnt FROM purchase_orders WHERE status IN (\'confirmed\',\'partially_received\')'),
      this.pool.query('SELECT COUNT(*)::int AS cnt FROM purchase_orders WHERE status IN (\'confirmed\',\'partially_received\') AND expected_date < CURRENT_DATE'),
      this.pool.query('SELECT COALESCE(SUM(total_cents),0)::int AS total FROM purchase_orders WHERE status != \'cancelled\' AND order_date >= date_trunc(\'month\', CURRENT_DATE)'),
    ]);

    return {
      openPOs: openPOs.rows[0].cnt,
      pendingReceipts: pendingReceipts.rows[0].cnt,
      overduePOs: overdue.rows[0].cnt,
      monthlySpendCents: spend.rows[0].total,
    };
  }

  // ---------------------------------------------------------------------------
  // VENDOR CRUD
  // ---------------------------------------------------------------------------

  async listVendors(filters = {}) {
    let sql = 'SELECT * FROM vendors';
    const params = [];
    const conds = [];
    let idx = 1;

    if (filters.search) {
      conds.push(`(name ILIKE $${idx} OR code ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }
    if (filters.isActive !== undefined) {
      conds.push(`is_active = $${idx++}`);
      params.push(filters.isActive);
    }

    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY name';

    const { rows } = await this.pool.query(sql, params);
    return rows;
  }

  async getVendor(vendorId) {
    const { rows } = await this.pool.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
    if (!rows.length) throw ApiError.notFound('Vendor');
    return rows[0];
  }

  async createVendor(data) {
    const { rows } = await this.pool.query(
      `INSERT INTO vendors (name, code, contact_name, contact_email, contact_phone, website, notes,
        payment_terms_days, currency, tax_number, address_line1, address_line2, city, province, postal_code, country,
        lead_time_days, minimum_order_cents, default_shipping_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [data.name, data.code || null, data.contactName || null, data.contactEmail || null, data.contactPhone || null,
       data.website || null, data.notes || null, data.paymentTermsDays || 30, data.currency || 'CAD',
       data.taxNumber || null, data.addressLine1 || null, data.addressLine2 || null, data.city || null,
       data.province || null, data.postalCode || null, data.country || 'Canada',
       data.leadTimeDays || null, data.minimumOrderCents || null, data.defaultShippingMethod || null]
    );
    return rows[0];
  }

  async updateVendor(vendorId, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    const map = {
      name: 'name', code: 'code', contactName: 'contact_name', contactEmail: 'contact_email',
      contactPhone: 'contact_phone', website: 'website', notes: 'notes', isActive: 'is_active',
      paymentTermsDays: 'payment_terms_days', currency: 'currency', taxNumber: 'tax_number',
      addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city', province: 'province',
      postalCode: 'postal_code', country: 'country', leadTimeDays: 'lead_time_days',
      minimumOrderCents: 'minimum_order_cents', defaultShippingMethod: 'default_shipping_method',
    };

    for (const [camel, col] of Object.entries(map)) {
      if (data[camel] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        params.push(data[camel]);
      }
    }

    if (!fields.length) return this.getVendor(vendorId);

    fields.push('updated_at = NOW()');
    params.push(vendorId);

    await this.pool.query(`UPDATE vendors SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return this.getVendor(vendorId);
  }

  // ---------------------------------------------------------------------------
  // GENERATE PO FROM SUGGESTIONS
  // ---------------------------------------------------------------------------

  async generatePOFromSuggestions(vendorId, products, userId) {
    const items = products.map(p => ({
      productId: p.product_id || p.productId,
      quantityOrdered: p.reorder_qty || p.quantityOrdered || 10,
      unitCostCents: Math.round((p.cost || 0) * 100),
    }));

    return this.createPO(vendorId, null, items, userId, {
      notes: 'Auto-generated from reorder suggestions',
    });
  }

  // ---------------------------------------------------------------------------
  // PO HISTORY (audit trail via status changes in serial_events pattern)
  // ---------------------------------------------------------------------------

  async getPOHistory(poId) {
    // Combine creation, status changes via receipts, and cancellation events
    const po = await this.getPO(poId);
    const timeline = [];

    timeline.push({
      event: 'created',
      status: 'draft',
      date: po.created_at,
      user: po.created_by_name,
    });

    if (po.approved_at) {
      timeline.push({
        event: 'confirmed',
        status: 'confirmed',
        date: po.approved_at,
        user: po.approved_by_name,
      });
    }

    for (const r of (po.receipts || [])) {
      timeline.push({
        event: 'goods_received',
        status: 'partially_received',
        date: r.received_at,
        user: r.received_by_name,
        reference: r.receipt_number,
      });
    }

    if (po.cancelled_at) {
      timeline.push({
        event: 'cancelled',
        status: 'cancelled',
        date: po.cancelled_at,
        reason: po.cancel_reason,
      });
    }

    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
    return timeline;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  async _getPORow(poId) {
    const { rows } = await this.pool.query('SELECT * FROM purchase_orders WHERE id = $1', [poId]);
    if (!rows.length) throw ApiError.notFound('Purchase Order');
    return rows[0];
  }

  async _recalcTotals(poId) {
    await this.pool.query(
      `UPDATE purchase_orders SET
         subtotal_cents = COALESCE((SELECT SUM(quantity_ordered * unit_cost_cents) FROM purchase_order_items WHERE purchase_order_id = $1), 0),
         total_cents = COALESCE((SELECT SUM(quantity_ordered * unit_cost_cents) FROM purchase_order_items WHERE purchase_order_id = $1), 0) + tax_cents + shipping_cents,
         updated_at = NOW()
       WHERE id = $1`,
      [poId]
    );
  }

  // ---------------------------------------------------------------------------
  // LANDED COST (Feature 1C)
  // ---------------------------------------------------------------------------

  async addLandedCosts(receiptId, costs, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify receipt exists
      const { rows: [receipt] } = await client.query(
        'SELECT id, purchase_order_id FROM goods_receipts WHERE id = $1', [receiptId]
      );
      if (!receipt) throw new ApiError(404, 'Goods receipt not found');

      const entries = [];
      let totalFreight = 0, totalDuty = 0, totalBrokerage = 0;

      for (const cost of costs) {
        const { rows: [entry] } = await client.query(
          `INSERT INTO landed_cost_entries (goods_receipt_id, cost_type, description, amount_cents)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [receiptId, cost.costType, cost.description || null, cost.amountCents]
        );
        entries.push(entry);

        if (cost.costType === 'freight') totalFreight += cost.amountCents;
        else if (cost.costType === 'duty') totalDuty += cost.amountCents;
        else if (cost.costType === 'brokerage') totalBrokerage += cost.amountCents;
      }

      // Update receipt totals
      await client.query(
        `UPDATE goods_receipts SET
         total_freight_cents = total_freight_cents + $2,
         total_duty_cents = total_duty_cents + $3,
         total_brokerage_cents = total_brokerage_cents + $4
         WHERE id = $1`,
        [receiptId, totalFreight, totalDuty, totalBrokerage]
      );

      await client.query('COMMIT');
      return entries;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async allocateLandedCosts(receiptId, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get unallocated cost entries
      const { rows: costEntries } = await client.query(
        'SELECT * FROM landed_cost_entries WHERE goods_receipt_id = $1 AND allocated = FALSE',
        [receiptId]
      );
      if (!costEntries.length) throw new ApiError(400, 'No unallocated costs to distribute');

      const totalCostToAllocate = costEntries.reduce((sum, e) => sum + e.amount_cents, 0);

      // Get receipt items with their values for proportional allocation
      const { rows: items } = await client.query(
        `SELECT gri.*, gri.quantity_received * gri.unit_cost_cents as line_value
         FROM goods_receipt_items gri WHERE gri.goods_receipt_id = $1 AND gri.quantity_received > 0`,
        [receiptId]
      );
      if (!items.length) throw new ApiError(400, 'No items to allocate costs to');

      const totalItemValue = items.reduce((sum, i) => sum + (i.line_value || 0), 0);
      if (totalItemValue === 0) throw new ApiError(400, 'Total item value is zero');

      // Allocate proportionally
      for (const item of items) {
        const proportion = (item.line_value || 0) / totalItemValue;
        const allocated = Math.round(totalCostToAllocate * proportion);

        // Split by cost type
        const freightAlloc = Math.round(costEntries.filter(e => e.cost_type === 'freight').reduce((s, e) => s + e.amount_cents, 0) * proportion);
        const dutyAlloc = Math.round(costEntries.filter(e => e.cost_type === 'duty').reduce((s, e) => s + e.amount_cents, 0) * proportion);
        const brokerageAlloc = Math.round(costEntries.filter(e => ['brokerage', 'insurance', 'handling', 'other'].includes(e.cost_type)).reduce((s, e) => s + e.amount_cents, 0) * proportion);

        const landedCost = (item.unit_cost_cents * item.quantity_received) + allocated;

        await client.query(
          `UPDATE goods_receipt_items SET
           freight_allocation_cents = $2, duty_cents = $3, brokerage_cents = $4,
           landed_cost_cents = $5
           WHERE id = $1`,
          [item.id, freightAlloc, dutyAlloc, brokerageAlloc, landedCost]
        );

        // Update product landed cost
        if (item.product_id) {
          const perUnitLanded = item.quantity_received > 0 ? Math.round(landedCost / item.quantity_received) : 0;
          await client.query(
            'UPDATE products SET landed_cost_cents = $2, last_landed_cost_at = NOW() WHERE id = $1',
            [item.product_id, perUnitLanded]
          );
        }
      }

      // Mark entries as allocated
      await client.query(
        'UPDATE landed_cost_entries SET allocated = TRUE, updated_at = NOW() WHERE goods_receipt_id = $1 AND allocated = FALSE',
        [receiptId]
      );

      await client.query(
        'UPDATE goods_receipts SET landed_cost_calculated = TRUE WHERE id = $1', [receiptId]
      );

      await client.query('COMMIT');
      return { allocated: costEntries.length, itemsUpdated: items.length, totalAllocated: totalCostToAllocate };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getLandedCostSummary(receiptId) {
    const { rows: [receipt] } = await this.pool.query(
      `SELECT gr.*, po.po_number
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
       WHERE gr.id = $1`, [receiptId]
    );
    if (!receipt) throw new ApiError(404, 'Receipt not found');

    const { rows: entries } = await this.pool.query(
      'SELECT * FROM landed_cost_entries WHERE goods_receipt_id = $1 ORDER BY cost_type', [receiptId]
    );

    const { rows: items } = await this.pool.query(
      `SELECT gri.*, p.name as product_name, p.sku
       FROM goods_receipt_items gri
       LEFT JOIN products p ON p.id = gri.product_id
       WHERE gri.goods_receipt_id = $1`, [receiptId]
    );

    return { receipt, entries, items };
  }
}

module.exports = PurchaseOrderService;
