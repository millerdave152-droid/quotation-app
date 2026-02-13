/**
 * Order Conversion Service
 * Converts fulfilled Best Buy Marketplace orders into internal transactions
 * for accounting and reporting.
 */
const pool = require('../db');

// Cached marketplace shift ID to avoid repeated DB lookups
let _marketplaceShiftId = null;

/**
 * Find or create the virtual marketplace register and a permanent open shift.
 * The shift is reused for all marketplace conversions since there's no physical register.
 */
async function getOrCreateMarketplaceShift(client) {
  // Verify cached shift still exists and is open
  if (_marketplaceShiftId) {
    const check = await client.query(
      'SELECT shift_id FROM register_shifts WHERE shift_id = $1 AND status = $2',
      [_marketplaceShiftId, 'open']
    );
    if (check.rows.length) return _marketplaceShiftId;
    _marketplaceShiftId = null;
  }

  // Find or create the marketplace register
  let regResult = await client.query(
    "SELECT register_id FROM registers WHERE register_name = 'Marketplace' LIMIT 1"
  );
  let registerId;
  if (regResult.rows.length) {
    registerId = regResult.rows[0].register_id;
  } else {
    regResult = await client.query(
      "INSERT INTO registers (register_name, location, is_active) VALUES ('Marketplace', 'Best Buy Marketplace', true) RETURNING register_id"
    );
    registerId = regResult.rows[0].register_id;
  }

  // Find or create a permanent open shift on that register
  let shiftResult = await client.query(
    "SELECT shift_id FROM register_shifts WHERE register_id = $1 AND status = 'open' LIMIT 1",
    [registerId]
  );
  if (shiftResult.rows.length) {
    _marketplaceShiftId = shiftResult.rows[0].shift_id;
  } else {
    // user_id = 1 (admin), opening_cash = 0 (virtual register)
    shiftResult = await client.query(
      `INSERT INTO register_shifts (register_id, user_id, opening_cash, status, notes)
       VALUES ($1, 1, 0, 'open', 'Permanent marketplace virtual register')
       RETURNING shift_id`,
      [registerId]
    );
    _marketplaceShiftId = shiftResult.rows[0].shift_id;
  }

  return _marketplaceShiftId;
}

/**
 * Find an existing customer by email or name, or create a new one from marketplace order data.
 * @param {Object} orderData - marketplace_orders row with customer_name, customer_email, customer_phone
 * @param {Object} client - DB transaction client
 * @returns {number} customer ID
 */
async function findOrCreateMarketplaceCustomer(orderData, client) {
  const db = client || pool;
  const { customer_name, customer_email, customer_phone } = orderData;

  // 1. Search by email first (most reliable identifier)
  if (customer_email) {
    const existing = await db.query(
      'SELECT id FROM customers WHERE email = $1 LIMIT 1',
      [customer_email]
    );
    if (existing.rows.length) return existing.rows[0].id;
  }

  // 2. Search by exact name match
  if (customer_name) {
    const existing = await db.query(
      'SELECT id FROM customers WHERE name = $1 LIMIT 1',
      [customer_name]
    );
    if (existing.rows.length) return existing.rows[0].id;
  }

  // 3. Create new customer
  const result = await db.query(
    `INSERT INTO customers (name, email, phone, notes, marketing_source, customer_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      customer_name || 'Best Buy Marketplace Customer',
      customer_email || null,
      customer_phone || '', // phone is NOT NULL
      'Best Buy Marketplace',
      'Best Buy Marketplace',
      'Retail',
    ]
  );

  return result.rows[0].id;
}

/**
 * Try to match a marketplace line item to an internal product using multiple strategies.
 * @param {Object} line - order_lines JSONB entry
 * @param {Object} dbItem - marketplace_order_items row (may have product_id already)
 * @param {Object} client - DB client
 * @returns {{ productId, productName, productSku, unitCost }} or null if no match
 */
async function matchProduct(line, dbItem, client) {
  const offerSku = dbItem?.offer_sku || line.offer_sku || '';
  const productSku = dbItem?.product_sku || line.product_sku || '';
  const productTitle = line.product_title || '';

  // If marketplace_order_items already has a linked product_id
  if (dbItem?.product_id) {
    const r = await client.query(
      'SELECT id, name, sku, cost FROM products WHERE id = $1',
      [dbItem.product_id]
    );
    if (r.rows.length) {
      return {
        productId: r.rows[0].id,
        productName: r.rows[0].name || productTitle,
        productSku: r.rows[0].sku || offerSku,
        unitCost: r.rows[0].cost,
      };
    }
  }

  // Strategy 1: Match by offer_sku → products.sku
  if (offerSku) {
    const r = await client.query(
      'SELECT id, name, sku, cost FROM products WHERE sku = $1 LIMIT 1',
      [offerSku]
    );
    if (r.rows.length) {
      return {
        productId: r.rows[0].id,
        productName: r.rows[0].name || productTitle,
        productSku: r.rows[0].sku,
        unitCost: r.rows[0].cost,
      };
    }
  }

  // Strategy 2: Match by offer_sku → products.mirakl_sku
  if (offerSku) {
    const r = await client.query(
      'SELECT id, name, sku, cost FROM products WHERE mirakl_sku = $1 LIMIT 1',
      [offerSku]
    );
    if (r.rows.length) {
      return {
        productId: r.rows[0].id,
        productName: r.rows[0].name || productTitle,
        productSku: r.rows[0].sku,
        unitCost: r.rows[0].cost,
      };
    }
  }

  // Strategy 3: Match by Mirakl product_sku (Best Buy catalog ID)
  if (productSku) {
    const r = await client.query(
      'SELECT id, name, sku, cost FROM products WHERE sku = $1 OR model = $1 LIMIT 1',
      [productSku]
    );
    if (r.rows.length) {
      return {
        productId: r.rows[0].id,
        productName: r.rows[0].name || productTitle,
        productSku: r.rows[0].sku,
        unitCost: r.rows[0].cost,
      };
    }
  }

  // Strategy 4: Match by product title → products.name (fuzzy last resort)
  if (productTitle && productTitle.length > 10) {
    const r = await client.query(
      'SELECT id, name, sku, cost FROM products WHERE name ILIKE $1 LIMIT 1',
      [`%${productTitle.substring(0, 50)}%`]
    );
    if (r.rows.length) {
      return {
        productId: r.rows[0].id,
        productName: r.rows[0].name,
        productSku: r.rows[0].sku,
        unitCost: r.rows[0].cost,
      };
    }
  }

  return null;
}

/**
 * Derive tax province from shipping address JSONB.
 * Falls back to 'ON' (Ontario) if not determinable.
 */
function deriveTaxProvince(shippingAddress) {
  if (!shippingAddress) return 'ON';
  const state = shippingAddress.state || shippingAddress.province || shippingAddress.region || '';
  const provinceMap = {
    'ontario': 'ON', 'on': 'ON',
    'quebec': 'QC', 'qc': 'QC', 'québec': 'QC',
    'british columbia': 'BC', 'bc': 'BC',
    'alberta': 'AB', 'ab': 'AB',
    'manitoba': 'MB', 'mb': 'MB',
    'saskatchewan': 'SK', 'sk': 'SK',
    'nova scotia': 'NS', 'ns': 'NS',
    'new brunswick': 'NB', 'nb': 'NB',
    'newfoundland': 'NL', 'nl': 'NL',
    'prince edward island': 'PE', 'pe': 'PE', 'pei': 'PE',
    'northwest territories': 'NT', 'nt': 'NT',
    'nunavut': 'NU', 'nu': 'NU',
    'yukon': 'YT', 'yt': 'YT',
  };
  return provinceMap[state.toLowerCase().trim()] || state.toUpperCase().substring(0, 2) || 'ON';
}

/**
 * Convert a shipped marketplace order into an internal transaction.
 *
 * @param {number} marketplaceOrderId - marketplace_orders.id
 * @returns {{ success: boolean, transactionId?, transactionNumber?, error?, unmatchedItems? }}
 */
async function convertMarketplaceOrder(marketplaceOrderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get marketplace order with items
    const orderResult = await client.query(
      `SELECT mo.*,
              COALESCE(
                json_agg(json_build_object(
                  'id', moi.id,
                  'product_id', moi.product_id,
                  'product_sku', moi.product_sku,
                  'offer_sku', moi.offer_sku,
                  'quantity', moi.quantity,
                  'unit_price', moi.unit_price,
                  'line_total', moi.line_total,
                  'commission_amount', moi.commission_amount,
                  'mirakl_order_line_id', moi.mirakl_order_line_id,
                  'status', moi.status
                )) FILTER (WHERE moi.id IS NOT NULL), '[]'
              ) as db_items
       FROM marketplace_orders mo
       LEFT JOIN marketplace_order_items moi ON moi.order_id = mo.id
       WHERE mo.id = $1
       GROUP BY mo.id`,
      [marketplaceOrderId]
    );

    if (!orderResult.rows.length) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Marketplace order not found' };
    }

    const order = orderResult.rows[0];

    // 2. Validate order state and conversion status
    const state = (order.mirakl_order_state || order.order_state || '').toUpperCase();
    if (state !== 'SHIPPED') {
      await client.query('ROLLBACK');
      return { success: false, error: `Order must be in SHIPPED state (current: ${state})` };
    }
    if (order.internal_order_id) {
      await client.query('ROLLBACK');
      return { success: false, error: `Order already converted to transaction ${order.internal_order_id}` };
    }

    // 3. Find or create customer
    const customerId = await findOrCreateMarketplaceCustomer(order, client);

    // Update marketplace_orders customer link if not already set
    if (!order.customer_id) {
      await client.query(
        'UPDATE marketplace_orders SET customer_id = $1, customer_match_type = $2, customer_matched_at = NOW() WHERE id = $3',
        [customerId, 'auto_conversion', marketplaceOrderId]
      );
    }

    // 4. Get marketplace shift
    const shiftId = await getOrCreateMarketplaceShift(client);

    // 5. Generate transaction number (same function used by POS)
    const txnNumResult = await client.query('SELECT generate_transaction_number() as txn_number');
    const transactionNumber = txnNumResult.rows[0].txn_number;

    // 6. Build line items from order_lines JSONB (primary source — marketplace_order_items may have NULLs)
    const jsonLines = Array.isArray(order.order_lines) ? order.order_lines : [];
    const dbItems = Array.isArray(order.db_items) ? order.db_items : [];

    if (jsonLines.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Order has no line items in order_lines' };
    }

    let subtotal = 0;
    let totalCommission = 0;
    let gstAmount = 0;
    let pstAmount = 0;
    let hstAmount = 0;
    const itemsForInsert = [];
    const unmatchedItems = [];

    for (let i = 0; i < jsonLines.length; i++) {
      const line = jsonLines[i];
      const dbItem = dbItems.find(d =>
        d.mirakl_order_line_id === line.order_line_id ||
        d.offer_sku === line.offer_sku
      ) || null;

      // Match product
      const matched = await matchProduct(line, dbItem, client);

      const quantity = line.quantity || dbItem?.quantity || 1;
      const unitPrice = parseFloat(line.price_unit) || parseFloat(line.price) || parseFloat(dbItem?.unit_price) || 0;
      const lineTotal = unitPrice * quantity;

      if (!matched) {
        unmatchedItems.push({
          index: i,
          offerSku: line.offer_sku || '',
          productSku: line.product_sku || '',
          productTitle: line.product_title || '',
          unitPrice,
          quantity,
        });
        continue;
      }

      subtotal += lineTotal;

      // Commission per line
      const lineCommission = parseFloat(line.total_commission) || parseFloat(line.commission_fee) || parseFloat(dbItem?.commission_amount) || 0;
      totalCommission += lineCommission;

      // Taxes from this line
      if (Array.isArray(line.taxes)) {
        for (const tax of line.taxes) {
          const code = (tax.code || '').toUpperCase();
          const amount = parseFloat(tax.amount) || 0;
          if (code === 'GST') gstAmount += amount;
          else if (code === 'PST' || code === 'QST') pstAmount += amount;
          else if (code === 'HST') hstAmount += amount;
        }
      }
      if (Array.isArray(line.shipping_taxes)) {
        for (const tax of line.shipping_taxes) {
          const code = (tax.code || '').toUpperCase();
          const amount = parseFloat(tax.amount) || 0;
          if (code === 'GST') gstAmount += amount;
          else if (code === 'PST' || code === 'QST') pstAmount += amount;
          else if (code === 'HST') hstAmount += amount;
        }
      }

      itemsForInsert.push({
        productId: matched.productId,
        productName: matched.productName,
        productSku: matched.productSku,
        quantity,
        unitPrice,
        unitCost: matched.unitCost,
        lineTotal,
      });
    }

    // If ANY items couldn't be matched, fail with details so mapping can be fixed
    if (unmatchedItems.length > 0) {
      await client.query('ROLLBACK');
      const skuList = unmatchedItems.map(u => u.offerSku || u.productTitle).join(', ');
      console.error(`[OrderConversion] Order ${order.mirakl_order_id}: ${unmatchedItems.length} unmatched product(s): ${skuList}`);
      return {
        success: false,
        error: `${unmatchedItems.length} product(s) could not be matched to internal catalog`,
        unmatchedItems,
      };
    }

    if (itemsForInsert.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'No matchable line items found' };
    }

    // Fallback: if no tax breakdown but taxes_total exists
    const totalTax = gstAmount + pstAmount + hstAmount;
    if (totalTax === 0 && parseFloat(order.taxes_total) > 0) {
      // Can't break down — put entire amount in HST as a safe default
      hstAmount = parseFloat(order.taxes_total);
    }

    // Total amount: use total_price_cents (most authoritative) or compute
    const totalAmount = order.total_price_cents
      ? parseFloat(order.total_price_cents) / 100
      : subtotal + gstAmount + pstAmount + hstAmount;

    // Tax province from shipping address
    const taxProvince = deriveTaxProvince(order.shipping_address);

    // Commission note for marketing_source_detail
    const sourceDetail = `Mirakl #${order.mirakl_order_id}` +
      (totalCommission > 0 ? ` | Commission: $${totalCommission.toFixed(2)}` : '');

    // 7. Insert transaction (matching exact pattern from POST /api/transactions)
    const txResult = await client.query(
      `INSERT INTO transactions (
        transaction_number, shift_id, customer_id, user_id, salesperson_id,
        subtotal, discount_amount,
        hst_amount, gst_amount, pst_amount, tax_province,
        total_amount, status, completed_at,
        marketing_source, marketing_source_detail
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, $15)
      RETURNING transaction_id, transaction_number`,
      [
        transactionNumber,            // $1
        shiftId,                      // $2
        customerId,                   // $3
        1,                            // $4  user_id (admin — system action)
        null,                         // $5  salesperson_id (no salesperson for marketplace)
        subtotal,                     // $6
        0,                            // $7  discount_amount
        hstAmount,                    // $8
        gstAmount,                    // $9
        pstAmount,                    // $10
        taxProvince,                  // $11
        totalAmount,                  // $12
        'completed',                  // $13
        'Best Buy Marketplace',       // $14
        sourceDetail,                 // $15
      ]
    );

    const transaction = txResult.rows[0];

    // 8. Insert transaction items (matching exact pattern from POST /api/transactions)
    for (const item of itemsForInsert) {
      await client.query(
        `INSERT INTO transaction_items (
          transaction_id, product_id, product_name, product_sku,
          quantity, unit_price, unit_cost,
          discount_percent, discount_amount, tax_amount, line_total,
          serial_number, taxable
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          transaction.transaction_id,   // $1
          item.productId,               // $2
          item.productName,             // $3
          item.productSku,              // $4
          item.quantity,                // $5
          item.unitPrice,               // $6
          item.unitCost,                // $7
          0,                            // $8  discount_percent
          0,                            // $9  discount_amount
          0,                            // $10 tax_amount (taxes tracked at transaction level)
          item.lineTotal,               // $11
          null,                         // $12 serial_number
          true,                         // $13 taxable
        ]
      );
    }

    // 9. Link back to marketplace order
    await client.query(
      'UPDATE marketplace_orders SET internal_order_id = $1 WHERE id = $2',
      [transaction.transaction_id, marketplaceOrderId]
    );

    // 10. Update customer marketplace stats
    await client.query(
      `UPDATE customers SET
        marketplace_orders_count = COALESCE(marketplace_orders_count, 0) + 1,
        marketplace_revenue_cents = COALESCE(marketplace_revenue_cents, 0) + $1,
        last_marketplace_order_at = NOW(),
        first_marketplace_order_at = COALESCE(first_marketplace_order_at, NOW())
       WHERE id = $2`,
      [Math.round(totalAmount * 100), customerId]
    );

    await client.query('COMMIT');

    console.log(
      `[OrderConversion] Converted marketplace order ${order.mirakl_order_id} → ${transaction.transaction_number}` +
      ` ($${totalAmount.toFixed(2)}, ${itemsForInsert.length} items, commission $${totalCommission.toFixed(2)})`
    );

    return {
      success: true,
      transactionId: transaction.transaction_id,
      transactionNumber: transaction.transaction_number,
      customerId,
      totalAmount,
      itemCount: itemsForInsert.length,
      commission: totalCommission,
    };

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[OrderConversion] Failed to convert marketplace order ${marketplaceOrderId}:`, err.message);
    return { success: false, error: err.message };
  } finally {
    client.release();
  }
}

module.exports = { convertMarketplaceOrder, findOrCreateMarketplaceCustomer };
