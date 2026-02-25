/**
 * Serial Number Service
 * Full lifecycle management for product serial numbers
 */

const { ApiError } = require('../middleware/errorHandler');

class SerialNumberService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 300;

    this.VALID_STATUSES = ['available', 'sold', 'returned', 'warranty_repair', 'recalled', 'damaged', 'scrapped'];
    this.STATUS_TRANSITIONS = {
      available:       ['sold', 'damaged', 'scrapped', 'recalled'],
      sold:            ['returned', 'warranty_repair', 'damaged', 'recalled'],
      returned:        ['available', 'damaged', 'scrapped'],
      warranty_repair: ['sold', 'available', 'damaged', 'scrapped'],
      recalled:        ['available', 'damaged', 'scrapped'],
      damaged:         ['scrapped', 'available'],
      scrapped:        [],
    };
  }

  // ---------------------------------------------------------------------------
  // REGISTER
  // ---------------------------------------------------------------------------

  async registerSerial(productId, serialNumber, locationId, userId, opts = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check product exists
      const prod = await client.query('SELECT id, name FROM products WHERE id = $1', [productId]);
      if (!prod.rows.length) throw ApiError.notFound('Product');

      // Check serial uniqueness
      const dup = await client.query('SELECT id FROM product_serials WHERE serial_number = $1', [serialNumber]);
      if (dup.rows.length) throw ApiError.conflict('Serial number already registered');

      const { rows } = await client.query(
        `INSERT INTO product_serials (product_id, serial_number, status, location_id, received_at, purchase_order_id, notes)
         VALUES ($1, $2, 'available', $3, NOW(), $4, $5)
         RETURNING *`,
        [productId, serialNumber.trim(), locationId || null, opts.purchaseOrderId || null, opts.notes || null]
      );
      const serial = rows[0];

      await client.query(
        `INSERT INTO serial_events (serial_id, event_type, from_status, to_status, reference_type, reference_id, location_id, performed_by, notes)
         VALUES ($1, 'received', NULL, 'available', $2, $3, $4, $5, $6)`,
        [serial.id, opts.referenceType || null, opts.referenceId || null, locationId || null, userId, opts.notes || null]
      );

      await client.query('COMMIT');
      return serial;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async registerBatch(serials, userId) {
    const client = await this.pool.connect();
    const results = [];
    try {
      await client.query('BEGIN');

      for (const s of serials) {
        const dup = await client.query('SELECT id FROM product_serials WHERE serial_number = $1', [s.serialNumber]);
        if (dup.rows.length) {
          results.push({ serialNumber: s.serialNumber, error: 'Already registered', skipped: true });
          continue;
        }

        const { rows } = await client.query(
          `INSERT INTO product_serials (product_id, serial_number, status, location_id, received_at, purchase_order_id, notes)
           VALUES ($1, $2, 'available', $3, NOW(), $4, $5)
           RETURNING *`,
          [s.productId, s.serialNumber.trim(), s.locationId || null, s.purchaseOrderId || null, s.notes || null]
        );

        await client.query(
          `INSERT INTO serial_events (serial_id, event_type, from_status, to_status, reference_type, reference_id, location_id, performed_by, notes)
           VALUES ($1, 'received', NULL, 'available', $2, $3, $4, $5, $6)`,
          [rows[0].id, s.referenceType || null, s.referenceId || null, s.locationId || null, userId, s.notes || null]
        );

        results.push({ serialNumber: s.serialNumber, id: rows[0].id, success: true });
      }

      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // LOOKUP
  // ---------------------------------------------------------------------------

  async lookupBySerial(serialNumber) {
    const { rows } = await this.pool.query(
      `SELECT ps.*,
              p.name AS product_name, p.sku AS product_sku, p.upc AS product_upc,
              c.name AS customer_name,
              l.name AS location_name
       FROM product_serials ps
       LEFT JOIN products p ON p.id = ps.product_id
       LEFT JOIN customers c ON c.id = ps.customer_id
       LEFT JOIN locations l ON l.id = ps.location_id
       WHERE ps.serial_number = $1`,
      [serialNumber]
    );
    if (!rows.length) return null;

    const serial = rows[0];
    const events = await this.pool.query(
      `SELECT se.*, u.first_name || ' ' || u.last_name AS performed_by_name
       FROM serial_events se
       LEFT JOIN users u ON u.id = se.performed_by
       WHERE se.serial_id = $1
       ORDER BY se.created_at DESC`,
      [serial.id]
    );
    serial.history = events.rows;
    return serial;
  }

  async lookupByProduct(productId, filters = {}) {
    let sql = `SELECT ps.*, l.name AS location_name
               FROM product_serials ps
               LEFT JOIN locations l ON l.id = ps.location_id
               WHERE ps.product_id = $1`;
    const params = [productId];
    let idx = 2;

    if (filters.status) {
      sql += ` AND ps.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.locationId) {
      sql += ` AND ps.location_id = $${idx++}`;
      params.push(filters.locationId);
    }
    sql += ' ORDER BY ps.created_at DESC';

    const { rows } = await this.pool.query(sql, params);
    return rows;
  }

  async lookupByCustomer(customerId) {
    const { rows } = await this.pool.query(
      `SELECT ps.*, p.name AS product_name, p.sku AS product_sku, l.name AS location_name
       FROM product_serials ps
       LEFT JOIN products p ON p.id = ps.product_id
       LEFT JOIN locations l ON l.id = ps.location_id
       WHERE ps.customer_id = $1
       ORDER BY ps.sold_at DESC NULLS LAST`,
      [customerId]
    );
    return rows;
  }

  // ---------------------------------------------------------------------------
  // STATUS TRANSITIONS
  // ---------------------------------------------------------------------------

  async _changeStatus(serialId, toStatus, userId, opts = {}, client) {
    const db = client || this.pool;
    const { rows } = await db.query('SELECT * FROM product_serials WHERE id = $1', [serialId]);
    if (!rows.length) throw ApiError.notFound('Serial');

    const serial = rows[0];
    const allowed = this.STATUS_TRANSITIONS[serial.status] || [];
    if (!allowed.includes(toStatus)) {
      throw ApiError.badRequest(`Cannot transition from "${serial.status}" to "${toStatus}"`);
    }

    const updates = [`status = '${toStatus}'`, 'updated_at = NOW()'];
    const eventParams = {
      eventType: opts.eventType || toStatus,
      referenceType: opts.referenceType || null,
      referenceId: opts.referenceId || null,
    };

    if (toStatus === 'sold') {
      updates.push('sold_at = NOW()');
      if (opts.customerId) updates.push(`customer_id = ${parseInt(opts.customerId)}`);
      if (opts.transactionId) updates.push(`transaction_id = ${parseInt(opts.transactionId)}`);
    }
    if (toStatus === 'returned' || toStatus === 'available') {
      // clear sale link on return
    }

    await db.query(`UPDATE product_serials SET ${updates.join(', ')} WHERE id = $1`, [serialId]);

    await db.query(
      `INSERT INTO serial_events (serial_id, event_type, from_status, to_status, reference_type, reference_id, location_id, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [serialId, eventParams.eventType, serial.status, toStatus, eventParams.referenceType, eventParams.referenceId, opts.locationId || serial.location_id, userId, opts.notes || null]
    );

    return { ...serial, status: toStatus };
  }

  async markAsSold(serialNumber, transactionId, customerId, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id FROM product_serials WHERE serial_number = $1', [serialNumber]);
      if (!rows.length) throw ApiError.notFound('Serial');
      const result = await this._changeStatus(rows[0].id, 'sold', userId, {
        eventType: 'sold', referenceType: 'transaction', referenceId: transactionId, customerId, transactionId,
      }, client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async markAsReturned(serialNumber, returnId, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id FROM product_serials WHERE serial_number = $1', [serialNumber]);
      if (!rows.length) throw ApiError.notFound('Serial');
      await this._changeStatus(rows[0].id, 'returned', userId, {
        eventType: 'returned', referenceType: 'return', referenceId: returnId,
      }, client);
      // Make available again
      const result = await this._changeStatus(rows[0].id, 'available', userId, {
        eventType: 'returned', referenceType: 'return', referenceId: returnId, notes: 'Auto-available after return',
      }, client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async markAsWarrantyRepair(serialNumber, warrantyClaimId, userId) {
    const { rows } = await this.pool.query('SELECT id FROM product_serials WHERE serial_number = $1', [serialNumber]);
    if (!rows.length) throw ApiError.notFound('Serial');
    return this._changeStatus(rows[0].id, 'warranty_repair', userId, {
      eventType: 'warranty_claim', referenceType: 'warranty', referenceId: warrantyClaimId,
    });
  }

  async markAsDamaged(serialNumber, userId, notes) {
    const { rows } = await this.pool.query('SELECT id FROM product_serials WHERE serial_number = $1', [serialNumber]);
    if (!rows.length) throw ApiError.notFound('Serial');
    return this._changeStatus(rows[0].id, 'damaged', userId, { eventType: 'damaged', notes });
  }

  async updateStatus(serialId, toStatus, userId, opts = {}) {
    return this._changeStatus(serialId, toStatus, userId, opts);
  }

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------

  async validateSerialForSale(serialNumber, productId) {
    const { rows } = await this.pool.query(
      'SELECT id, product_id, status FROM product_serials WHERE serial_number = $1',
      [serialNumber]
    );
    if (!rows.length) return { valid: false, reason: 'Serial number not found in registry' };
    if (rows[0].product_id !== productId) return { valid: false, reason: 'Serial does not match this product' };
    if (rows[0].status !== 'available') return { valid: false, reason: `Serial is currently "${rows[0].status}", must be "available"` };
    return { valid: true, serialId: rows[0].id };
  }

  // ---------------------------------------------------------------------------
  // HISTORY & STATS
  // ---------------------------------------------------------------------------

  async getSerialHistory(serialId) {
    const { rows } = await this.pool.query(
      `SELECT se.*, u.first_name || ' ' || u.last_name AS performed_by_name, l.name AS location_name
       FROM serial_events se
       LEFT JOIN users u ON u.id = se.performed_by
       LEFT JOIN locations l ON l.id = se.location_id
       WHERE se.serial_id = $1
       ORDER BY se.created_at DESC`,
      [serialId]
    );
    return rows;
  }

  async getStats() {
    const counts = await this.pool.query(
      'SELECT status, COUNT(*)::int AS count FROM product_serials GROUP BY status'
    );
    const total = await this.pool.query('SELECT COUNT(*)::int AS count FROM product_serials');
    const recent = await this.pool.query(
      `SELECT se.*, ps.serial_number, p.name AS product_name,
              u.first_name || ' ' || u.last_name AS performed_by_name
       FROM serial_events se
       JOIN product_serials ps ON ps.id = se.serial_id
       LEFT JOIN products p ON p.id = ps.product_id
       LEFT JOIN users u ON u.id = se.performed_by
       ORDER BY se.created_at DESC LIMIT 20`
    );

    const statusMap = {};
    for (const r of counts.rows) statusMap[r.status] = r.count;

    return {
      total: total.rows[0].count,
      byStatus: statusMap,
      recentActivity: recent.rows,
    };
  }

  // ---------------------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------------------

  async search(query, filters = {}) {
    const params = [];
    let idx = 1;
    const conditions = [];

    if (query) {
      conditions.push(`(ps.serial_number ILIKE $${idx} OR p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`);
      params.push(`%${query}%`);
      idx++;
    }
    if (filters.status) {
      conditions.push(`ps.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.productId) {
      conditions.push(`ps.product_id = $${idx++}`);
      params.push(filters.productId);
    }
    if (filters.locationId) {
      conditions.push(`ps.location_id = $${idx++}`);
      params.push(filters.locationId);
    }
    if (filters.customerId) {
      conditions.push(`ps.customer_id = $${idx++}`);
      params.push(filters.customerId);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = parseInt(filters.limit) || 50;
    const offset = parseInt(filters.offset) || 0;

    const countSql = `SELECT COUNT(*)::int AS total FROM product_serials ps LEFT JOIN products p ON p.id = ps.product_id ${where}`;
    const dataSql = `
      SELECT ps.*, p.name AS product_name, p.sku AS product_sku,
             c.name AS customer_name,
             l.name AS location_name
      FROM product_serials ps
      LEFT JOIN products p ON p.id = ps.product_id
      LEFT JOIN customers c ON c.id = ps.customer_id
      LEFT JOIN locations l ON l.id = ps.location_id
      ${where}
      ORDER BY ps.updated_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`;

    const [countRes, dataRes] = await Promise.all([
      this.pool.query(countSql, params),
      this.pool.query(dataSql, [...params, limit, offset]),
    ]);

    return {
      serials: dataRes.rows,
      total: countRes.rows[0].total,
      limit,
      offset,
    };
  }
}

module.exports = SerialNumberService;
