require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false }
});
const WarrantyService = require('../services/WarrantyService');
const svc = new WarrantyService(pool);

(async () => {
  // Test the Danby fridge the user added to cart ($999.99)
  const danby = await pool.query("SELECT id, name, price, category_id FROM products WHERE id = 12484");
  const p = danby.rows[0];
  console.log('Product:', p.name);
  console.log('  id=' + p.id, 'price=$' + p.price, 'cat=' + p.category_id);

  // Test with the price the POS would send
  console.log('\n--- Testing with price=$999.99 ---');
  const result = await svc.getEligibleWarranties(p.id, 999.99, 'at_sale');
  console.log('eligible:', result.eligible);
  console.log('warranties:', result.warranties?.length);
  if (result.warranties) {
    result.warranties.forEach(w => console.log('  ', w.name, '$' + w.price, w.providerCode));
  }
  if (!result.eligible) console.log('reason:', result.reason);

  // Test what happens with price=0 (null fallback in hook)
  console.log('\n--- Testing with price=0 (what hook sends if unitPrice is null) ---');
  const result2 = await svc.getEligibleWarranties(p.id, 0, 'at_sale');
  console.log('eligible:', result2.eligible);
  console.log('warranties:', result2.warranties?.length);

  // Test Samsung Q60CF (null price, null category)
  console.log('\n--- Samsung Q60CF (id=20772, price=null, cat=null) ---');
  const result3 = await svc.getEligibleWarranties(20772, null, 'at_sale');
  console.log('eligible:', result3.eligible, 'reason:', result3.reason || 'n/a');
  console.log('warranties:', result3.warranties?.length);

  // Simulate what POS would send for Samsung at $499.99
  console.log('\n--- Samsung Q60CF with POS price $499.99 ---');
  const result4 = await svc.getEligibleWarranties(20772, 499.99, 'at_sale');
  console.log('eligible:', result4.eligible, 'reason:', result4.reason || 'n/a');
  console.log('warranties:', result4.warranties?.length);
  if (result4.warranties) {
    result4.warranties.forEach(w => console.log('  ', w.name, '$' + w.price, w.providerCode));
  }

  await pool.end();
})();
