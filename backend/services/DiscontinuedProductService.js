let pool;

function init(deps) {
  pool = deps.pool;
}

/**
 * Mark a single product as discontinued.
 */
async function discontinueProduct(productId, { reason, replacement_product_id, hide_when_zero_stock = true, effective_date } = {}) {
  const effectiveAt = effective_date ? new Date(effective_date) : new Date();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Store previous status for audit
    const { rows: [product] } = await client.query(
      'SELECT id, product_status, is_active FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );
    if (!product) throw new Error('Product not found');

    await client.query(
      `UPDATE products SET
         product_status = 'discontinued',
         previous_status = product_status,
         status_changed_at = NOW(),
         discontinued_at = $2,
         discontinue_reason = $3,
         replacement_product_id = $4,
         hide_when_out_of_stock = $5,
         discontinued = true
       WHERE id = $1`,
      [productId, effectiveAt, reason || null, replacement_product_id || null, hide_when_zero_stock]
    );

    // Auto-hide if zero stock and flag set
    if (hide_when_zero_stock) {
      const { rows: [inv] } = await client.query(
        `SELECT COALESCE(SUM(quantity_on_hand), 0) AS total
         FROM location_inventory WHERE product_id = $1`,
        [productId]
      );
      if (parseInt(inv.total) <= 0) {
        await client.query('UPDATE products SET is_active = false WHERE id = $1', [productId]);
      }
    }

    await client.query('COMMIT');

    const { rows: [updated] } = await pool.query(
      `SELECT p.id, p.name, p.sku, p.product_status, p.discontinued_at,
              p.discontinue_reason, p.replacement_product_id, p.is_active,
              rp.name AS replacement_name, rp.sku AS replacement_sku
       FROM products p
       LEFT JOIN products rp ON rp.id = p.replacement_product_id
       WHERE p.id = $1`,
      [productId]
    );
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reverse discontinuation.
 */
async function reactivateProduct(productId) {
  const { rows: [product] } = await pool.query(
    'SELECT id, previous_status FROM products WHERE id = $1',
    [productId]
  );
  if (!product) throw new Error('Product not found');

  const restoreStatus = product.previous_status && product.previous_status !== 'discontinued'
    ? product.previous_status
    : 'normal';

  await pool.query(
    `UPDATE products SET
       product_status = $2,
       previous_status = 'discontinued',
       status_changed_at = NOW(),
       discontinued_at = NULL,
       discontinue_reason = NULL,
       replacement_product_id = NULL,
       hide_when_out_of_stock = true,
       discontinued = false,
       is_active = true
     WHERE id = $1`,
    [productId, restoreStatus]
  );

  const { rows: [updated] } = await pool.query(
    'SELECT id, name, sku, product_status, is_active FROM products WHERE id = $1',
    [productId]
  );
  return updated;
}

/**
 * List discontinued products with optional filters.
 */
async function listDiscontinued({ with_stock, without_replacement, page = 1, limit = 50 } = {}) {
  const conditions = [`p.product_status = 'discontinued'`];
  const params = [];
  let idx = 1;

  if (with_stock === true) {
    conditions.push(`COALESCE(inv.total, 0) > 0`);
  } else if (with_stock === false) {
    conditions.push(`COALESCE(inv.total, 0) <= 0`);
  }

  if (without_replacement) {
    conditions.push(`p.replacement_product_id IS NULL`);
  }

  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const query = `
    SELECT p.id, p.name, p.sku, p.discontinued_at, p.discontinue_reason,
           p.replacement_product_id, p.hide_when_out_of_stock, p.is_active,
           rp.name AS replacement_name, rp.sku AS replacement_sku,
           COALESCE(inv.total, 0) AS stock_on_hand
    FROM products p
    LEFT JOIN products rp ON rp.id = p.replacement_product_id
    LEFT JOIN (
      SELECT product_id, SUM(quantity_on_hand) AS total
      FROM location_inventory GROUP BY product_id
    ) inv ON inv.product_id = p.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.discontinued_at DESC NULLS LAST
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(quantity_on_hand) AS total
      FROM location_inventory GROUP BY product_id
    ) inv ON inv.product_id = p.id
    WHERE ${conditions.join(' AND ')}
  `;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery),
  ]);

  return {
    products: rows,
    total: parseInt(countRows[0].total),
    page,
    limit,
  };
}

/**
 * Bulk discontinue products.
 */
async function bulkDiscontinue(productIds, { reason, effective_date } = {}) {
  const results = { succeeded: [], failed: [] };

  for (const id of productIds) {
    try {
      const product = await discontinueProduct(id, { reason, effective_date });
      results.succeeded.push(product);
    } catch (err) {
      results.failed.push({ id, error: err.message });
    }
  }

  return results;
}

/**
 * Daily job: auto-hide discontinued products that have reached zero stock.
 * Intended to run at 2 AM via cron.
 */
async function autoHideDiscontinuedProducts() {
  const { rows: toHide } = await pool.query(`
    SELECT p.id
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(quantity_on_hand) AS total
      FROM location_inventory GROUP BY product_id
    ) inv ON inv.product_id = p.id
    WHERE p.product_status = 'discontinued'
      AND p.hide_when_out_of_stock = true
      AND p.is_active = true
      AND COALESCE(inv.total, 0) <= 0
  `);

  if (toHide.length > 0) {
    const ids = toHide.map(r => r.id);
    await pool.query(
      `UPDATE products SET is_active = false WHERE id = ANY($1::int[])`,
      [ids]
    );
  }

  console.log(`[DiscontinuedProducts] Auto-hid ${toHide.length} zero-stock discontinued products`);
  return { hidden_count: toHide.length };
}

module.exports = {
  init,
  discontinueProduct,
  reactivateProduct,
  listDiscontinued,
  bulkDiscontinue,
  autoHideDiscontinuedProducts,
};
