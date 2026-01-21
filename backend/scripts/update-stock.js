/**
 * Stock Update Script
 *
 * Usage:
 *   node scripts/update-stock.js show              - Show current stock levels
 *   node scripts/update-stock.js set <id> <qty>    - Set stock for a product
 *   node scripts/update-stock.js bulk <qty>        - Set all products to qty
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function showStock() {
  const result = await pool.query(`
    SELECT id, model, manufacturer, stock_quantity
    FROM products
    WHERE active = true
    ORDER BY manufacturer, model
    LIMIT 50
  `);

  console.log('\nCurrent Stock Levels (first 50 active products):');
  console.log('='.repeat(80));
  console.log('ID'.padEnd(6) + 'Model'.padEnd(25) + 'Manufacturer'.padEnd(20) + 'Stock');
  console.log('-'.repeat(80));

  result.rows.forEach(p => {
    const stock = p.stock_quantity === null ? 'N/A' : p.stock_quantity;
    console.log(
      String(p.id).padEnd(6) +
      (p.model || '').substring(0, 24).padEnd(25) +
      (p.manufacturer || '').substring(0, 19).padEnd(20) +
      stock
    );
  });

  console.log('='.repeat(80));
}

async function setStock(productId, quantity) {
  const result = await pool.query(
    'UPDATE products SET stock_quantity = $1 WHERE id = $2 RETURNING id, model, stock_quantity',
    [quantity, productId]
  );

  if (result.rows.length === 0) {
    console.log('Product not found with ID:', productId);
  } else {
    console.log('Updated:', result.rows[0]);
  }
}

async function bulkSetStock(quantity) {
  const result = await pool.query(
    'UPDATE products SET stock_quantity = $1 WHERE active = true RETURNING id',
    [quantity]
  );

  console.log('Updated', result.rowCount, 'products to stock_quantity =', quantity);
}

async function main() {
  const [,, command, arg1, arg2] = process.argv;

  try {
    switch (command) {
      case 'show':
        await showStock();
        break;

      case 'set':
        if (!arg1 || !arg2) {
          console.log('Usage: node scripts/update-stock.js set <product_id> <quantity>');
          break;
        }
        await setStock(parseInt(arg1), parseInt(arg2));
        break;

      case 'bulk':
        if (!arg1) {
          console.log('Usage: node scripts/update-stock.js bulk <quantity>');
          break;
        }
        await bulkSetStock(parseInt(arg1));
        break;

      default:
        console.log('Stock Update Script');
        console.log('-------------------');
        console.log('Usage:');
        console.log('  node scripts/update-stock.js show              - Show current stock');
        console.log('  node scripts/update-stock.js set <id> <qty>    - Set stock for one product');
        console.log('  node scripts/update-stock.js bulk <qty>        - Set ALL products to qty');
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
