const { ApiError } = require('../middleware/errorHandler');

class PreOrderService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async create(data, userId) {
    // Verify product is preorder-eligible
    const { rows: [product] } = await this.pool.query(
      `SELECT id, name, price, is_preorder, preorder_release_date, preorder_deposit_percent, preorder_max_qty
       FROM products WHERE id = $1`, [data.productId]
    );
    if (!product) throw new ApiError(404, 'Product not found');
    if (!product.is_preorder) throw new ApiError(400, 'Product is not available for pre-order');

    if (product.preorder_max_qty) {
      const { rows: [{ count }] } = await this.pool.query(
        `SELECT COUNT(*)::int FROM pre_orders WHERE product_id = $1 AND status NOT IN ('cancelled', 'refunded')`,
        [data.productId]
      );
      if (count >= product.preorder_max_qty) throw new ApiError(400, 'Pre-order limit reached');
    }

    const totalCents = data.totalPriceCents || Math.round(product.price * 100);
    const depositCents = data.depositCents || Math.round(totalCents * (product.preorder_deposit_percent || 100) / 100);

    const { rows: [preOrder] } = await this.pool.query(
      `INSERT INTO pre_orders (customer_id, product_id, transaction_id, quantity, deposit_cents, total_price_cents,
       release_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [data.customerId, data.productId, data.transactionId || null, data.quantity || 1,
       depositCents, totalCents, product.preorder_release_date || data.releaseDate || null,
       data.notes || null, userId]
    );
    return preOrder;
  }

  async get(preOrderId) {
    const { rows: [po] } = await this.pool.query(
      `SELECT po.*, c.name as customer_name, c.email as customer_email, p.name as product_name, p.sku
       FROM pre_orders po
       LEFT JOIN customers c ON c.id = po.customer_id
       LEFT JOIN products p ON p.id = po.product_id
       WHERE po.id = $1`, [preOrderId]
    );
    if (!po) throw new ApiError(404, 'Pre-order not found');
    return po;
  }

  async list({ status, productId, customerId, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let pi = 1;
    if (status) { conditions.push(`po.status = $${pi++}`); params.push(status); }
    if (productId) { conditions.push(`po.product_id = $${pi++}`); params.push(productId); }
    if (customerId) { conditions.push(`po.customer_id = $${pi++}`); params.push(customerId); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await this.pool.query(
      `SELECT po.*, c.name as customer_name, p.name as product_name, p.sku
       FROM pre_orders po
       LEFT JOIN customers c ON c.id = po.customer_id
       LEFT JOIN products p ON p.id = po.product_id
       ${where} ORDER BY po.created_at DESC LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );
    const { rows: [{ total }] } = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM pre_orders po ${where}`, params
    );
    return { preOrders: rows, total };
  }

  async updateStatus(preOrderId, newStatus, userId) {
    const { rows: [po] } = await this.pool.query(
      `UPDATE pre_orders SET status = $2, updated_at = NOW(),
       notified_at = CASE WHEN $2 = 'notified' THEN NOW() ELSE notified_at END,
       fulfilled_at = CASE WHEN $2 = 'fulfilled' THEN NOW() ELSE fulfilled_at END
       WHERE id = $1 RETURNING *`,
      [preOrderId, newStatus]
    );
    if (!po) throw new ApiError(404, 'Pre-order not found');
    return po;
  }

  async getAvailableProducts() {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.name, p.sku, p.price, p.is_preorder, p.preorder_release_date,
       p.preorder_deposit_percent, p.preorder_max_qty,
       COUNT(po.id)::int as current_preorders
       FROM products p
       LEFT JOIN pre_orders po ON po.product_id = p.id AND po.status NOT IN ('cancelled', 'refunded')
       WHERE p.is_preorder = TRUE
       GROUP BY p.id ORDER BY p.preorder_release_date ASC NULLS LAST`
    );
    return rows;
  }
}

module.exports = PreOrderService;
