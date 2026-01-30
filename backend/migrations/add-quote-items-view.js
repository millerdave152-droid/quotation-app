/**
 * Migration: Add quote_items view
 * Creates a view to alias quotation_items as quote_items for backward compatibility
 */

async function up(pool) {
  await pool.query(`
    CREATE OR REPLACE VIEW quote_items AS
    SELECT * FROM quotation_items
  `);
  console.log('quote_items view created successfully');
}

async function down(pool) {
  await pool.query('DROP VIEW IF EXISTS quote_items');
  console.log('quote_items view dropped');
}

module.exports = { up, down };
