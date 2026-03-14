const { ApiError } = require('../middleware/errorHandler');

class SpecialOrderService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async _generateSONumber(client) {
    const db = client || this.pool;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { rows } = await db.query(
      'SELECT so_number FROM special_orders WHERE so_number LIKE $1 ORDER BY so_number DESC LIMIT 1',
      [`SO-${today}-%`]
    );
    let seq = 1;
    if (rows.length) {
      const last = rows[0].so_number.split('-')[2];
      seq = parseInt(last) + 1;
    }
    return `SO-${today}-${String(seq).padStart(4, '0')}`;
  }

  async create(data, userId) {
    const soNumber = await this._generateSONumber();
    const { rows: [so] } = await this.pool.query(
      `INSERT INTO special_orders (so_number, customer_id, product_id, purchase_order_item_id, transaction_id,
       quotation_id, quantity, deposit_cents, total_price_cents, product_description, vendor_name,
       vendor_order_ref, eta_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [soNumber, data.customerId, data.productId || null, data.purchaseOrderItemId || null,
       data.transactionId || null, data.quotationId || null, data.quantity || 1,
       data.depositCents || 0, data.totalPriceCents || 0, data.productDescription || null,
       data.vendorName || null, data.vendorOrderRef || null, data.etaDate || null,
       data.notes || null, userId]
    );
    return so;
  }

  async get(soId) {
    const { rows: [so] } = await this.pool.query(
      `SELECT so.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
       p.name as product_name, p.sku
       FROM special_orders so
       LEFT JOIN customers c ON c.id = so.customer_id
       LEFT JOIN products p ON p.id = so.product_id
       WHERE so.id = $1`, [soId]
    );
    if (!so) throw new ApiError(404, 'Special order not found');
    return so;
  }

  async list({ status, customerId, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let pi = 1;
    if (status) { conditions.push(`so.status = $${pi++}`); params.push(status); }
    if (customerId) { conditions.push(`so.customer_id = $${pi++}`); params.push(customerId); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await this.pool.query(
      `SELECT so.*, c.name as customer_name, p.name as product_name, p.sku
       FROM special_orders so
       LEFT JOIN customers c ON c.id = so.customer_id
       LEFT JOIN products p ON p.id = so.product_id
       ${where} ORDER BY so.created_at DESC LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );
    const { rows: [{ total }] } = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM special_orders so ${where}`, params
    );
    return { specialOrders: rows, total };
  }

  async updateStatus(soId, newStatus, userId) {
    const { rows: [so] } = await this.pool.query(
      `UPDATE special_orders SET status = $2, updated_at = NOW(),
       customer_notified_at = CASE WHEN $2 = 'customer_notified' THEN NOW() ELSE customer_notified_at END,
       notification_count = CASE WHEN $2 = 'customer_notified' THEN notification_count + 1 ELSE notification_count END,
       actual_arrival_date = CASE WHEN $2 = 'arrived' THEN CURRENT_DATE ELSE actual_arrival_date END
       WHERE id = $1 RETURNING *`,
      [soId, newStatus]
    );
    if (!so) throw new ApiError(404, 'Special order not found');
    return so;
  }

  async update(soId, data) {
    const fields = [];
    const params = [];
    let pi = 1;
    const allowed = { etaDate: 'eta_date', vendorOrderRef: 'vendor_order_ref', vendorName: 'vendor_name',
      notes: 'notes', depositCents: 'deposit_cents', totalPriceCents: 'total_price_cents',
      pickupDeadline: 'pickup_deadline', productDescription: 'product_description' };

    for (const [key, col] of Object.entries(allowed)) {
      if (data[key] !== undefined) { fields.push(`${col} = $${pi++}`); params.push(data[key]); }
    }
    if (!fields.length) throw new ApiError(400, 'No valid fields');
    fields.push('updated_at = NOW()');
    params.push(soId);

    const { rows: [so] } = await this.pool.query(
      `UPDATE special_orders SET ${fields.join(', ')} WHERE id = $${pi} RETURNING *`, params
    );
    if (!so) throw new ApiError(404, 'Special order not found');
    return so;
  }

  async getDashboardStats() {
    const { rows: [stats] } = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('picked_up', 'delivered', 'cancelled'))::int as active_count,
        COUNT(*) FILTER (WHERE status = 'arrived')::int as arrived_pending,
        COUNT(*) FILTER (WHERE status = 'in_transit')::int as in_transit,
        COUNT(*) FILTER (WHERE status = 'customer_notified' AND pickup_deadline IS NOT NULL AND pickup_deadline < CURRENT_DATE)::int as overdue_pickup
      FROM special_orders
    `);
    return stats;
  }
}

module.exports = SpecialOrderService;
