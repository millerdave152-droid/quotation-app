require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function analyze() {
  const categories = [
    { name: 'Refrigerators', id: 6 },
    { name: 'Washers', id: 7 },
    { name: 'Ranges', id: 10 },
    { name: 'Microwaves', id: 13 },
    { name: 'Range Hoods', id: 14 }
  ];

  for (const cat of categories) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${cat.name.toUpperCase()} - STILL MISSING SUBCATEGORY`);
    console.log('='.repeat(70));

    // Group by raw category to see patterns
    const grouped = await pool.query(`
      SELECT p.category, p.manufacturer, COUNT(*) as cnt,
             array_agg(DISTINCT p.model) as sample_models
      FROM products p
      WHERE p.category_id = $1
        AND p.subcategory_id IS NULL
      GROUP BY p.category, p.manufacturer
      ORDER BY cnt DESC
      LIMIT 25
    `, [cat.id]);

    for (const row of grouped.rows) {
      const models = row.sample_models.slice(0, 3).join(', ');
      console.log(`\n[${row.cnt}] ${row.manufacturer || 'N/A'} | "${row.category}"`);
      console.log(`    Models: ${models}`);
    }
  }

  await pool.end();
}

analyze().catch(e => { console.error(e); process.exit(1); });
