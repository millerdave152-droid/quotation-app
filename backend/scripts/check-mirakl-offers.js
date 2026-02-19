/**
 * Check Mirakl offers and match to local products
 */
const pool = require('../db');
const ms = require('../services/miraklService');

async function check() {
  let all = [];
  let offset = 0;
  while (true) {
    const page = await ms.getOfferList({ offset, max: 100 });
    all = all.concat(page);
    if (page.length < 100) break;
    offset += 100;
  }
  console.log('Total Mirakl offers:', all.length);

  const skus = all.map(o => o.shop_sku);
  const matched = await pool.query(
    'SELECT sku, id, name, marketplace_enabled, mirakl_sku FROM products WHERE sku = ANY($1)',
    [skus]
  );
  console.log('Matched to products in DB:', matched.rows.length);
  if (matched.rows.length > 0) {
    matched.rows.slice(0, 3).forEach(r =>
      console.log('  ', r.sku, '->', (r.name || '').substring(0, 50), '| enabled:', r.marketplace_enabled)
    );
  }

  const matchedSkus = new Set(matched.rows.map(r => r.sku));
  const unmatched = skus.filter(s => !matchedSkus.has(s));
  console.log('Unmatched (Mirakl offers not in products table):', unmatched.length);
  if (unmatched.length > 0) {
    console.log('  First 5:', unmatched.slice(0, 5));
  }

  // Also check by model column
  const matchedByModel = await pool.query(
    'SELECT model, id, name, sku FROM products WHERE model = ANY($1)',
    [skus]
  );
  console.log('Matched by model column:', matchedByModel.rows.length);

  // Show detailed offer info for first few
  console.log('\nFirst 3 offers detail:');
  for (const o of all.slice(0, 3)) {
    console.log(JSON.stringify({
      shop_sku: o.shop_sku,
      offer_id: o.offer_id,
      product_title: (o.product_title || '').substring(0, 60),
      category_code: o.category_code,
      category_label: o.category_label,
      price: o.price,
      quantity: o.quantity,
      state_code: o.state_code,
      logistic_class: o.logistic_class,
    }, null, 2));
  }

  await pool.end();
}

check().catch(e => { console.error(e.message); process.exit(1); });
