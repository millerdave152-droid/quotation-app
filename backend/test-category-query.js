const pool = require('./db');

async function testCategories() {
  try {
    // Match exact query from QuickSearchService
    const result = await pool.query(`
      SELECT c.id as value, c.name as label, COUNT(DISTINCT p.id) as count
      FROM categories c
      LEFT JOIN products p ON (
        (p.category_id = c.id
         OR EXISTS (SELECT 1 FROM categories sub WHERE sub.parent_id = c.id AND p.subcategory_id = sub.id)
         OR (p.category_id IS NULL AND LOWER(p.category) LIKE '%' || LOWER(c.name) || '%')
        )
        AND p.product_status != 'discontinued'
      )
      WHERE c.level = 2 AND c.is_active = true
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT p.id) > 0
      ORDER BY count DESC
    `);
    console.log('Categories result:', JSON.stringify(result.rows, null, 2));
    console.log('\nTotal categories with products:', result.rows.length);
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
  } finally {
    await pool.end();
  }
}

testCategories();
