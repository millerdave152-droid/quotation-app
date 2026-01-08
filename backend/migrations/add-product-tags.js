/**
 * Migration: Add Product Tags System
 * Creates a flexible tag-based categorization system for products
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating product_tags table...');

    // Create product_tags table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        tag_type VARCHAR(50) NOT NULL,
        display_order INTEGER DEFAULT 0,
        color VARCHAR(7),
        icon VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(name, tag_type)
      )
    `);

    console.log('Creating product_tag_mappings table...');

    // Create product_tag_mappings junction table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_tag_mappings (
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES product_tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (product_id, tag_id)
      )
    `);

    console.log('Creating indexes...');

    // Create indexes for fast lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_tags_type ON product_tags(tag_type);
      CREATE INDEX IF NOT EXISTS idx_product_tags_name ON product_tags(name);
      CREATE INDEX IF NOT EXISTS idx_product_tag_mappings_product ON product_tag_mappings(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_tag_mappings_tag ON product_tag_mappings(tag_id);
    `);

    console.log('Inserting standard category tags...');

    // Insert standard category tags
    const categoryTags = [
      // Major Appliances
      { name: 'Refrigerators', type: 'category', order: 1, color: '#3b82f6' },
      { name: 'Ranges', type: 'category', order: 2, color: '#ef4444' },
      { name: 'Cooktops', type: 'category', order: 3, color: '#f97316' },
      { name: 'Wall Ovens', type: 'category', order: 4, color: '#f59e0b' },
      { name: 'Dishwashers', type: 'category', order: 5, color: '#06b6d4' },
      { name: 'Microwaves', type: 'category', order: 6, color: '#8b5cf6' },
      { name: 'Laundry', type: 'category', order: 7, color: '#ec4899' },
      { name: 'Ventilation', type: 'category', order: 8, color: '#6b7280' },
      { name: 'Freezers', type: 'category', order: 9, color: '#0ea5e9' },

      // Entertainment
      { name: 'TVs', type: 'category', order: 10, color: '#10b981' },
      { name: 'Audio', type: 'category', order: 11, color: '#14b8a6' },

      // Outdoor
      { name: 'Grills', type: 'category', order: 12, color: '#dc2626' },
      { name: 'Smokers', type: 'category', order: 13, color: '#b91c1c' },
      { name: 'Fireplaces', type: 'category', order: 14, color: '#ea580c' },

      // Small Appliances & Accessories
      { name: 'Small Appliances', type: 'category', order: 15, color: '#a855f7' },
      { name: 'Accessories', type: 'category', order: 16, color: '#64748b' },

      // Furniture
      { name: 'Furniture', type: 'category', order: 17, color: '#78716c' },
    ];

    for (const tag of categoryTags) {
      await client.query(`
        INSERT INTO product_tags (name, tag_type, display_order, color)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name, tag_type) DO UPDATE SET
          display_order = EXCLUDED.display_order,
          color = EXCLUDED.color
      `, [tag.name, tag.type, tag.order, tag.color]);
    }

    console.log('Inserting type tags...');

    // Insert type tags
    const typeTags = [
      { name: 'Built-In', type: 'type', color: '#0369a1' },
      { name: 'Freestanding', type: 'type', color: '#0d9488' },
      { name: 'Portable', type: 'type', color: '#7c3aed' },
      { name: 'Countertop', type: 'type', color: '#c026d3' },
      { name: 'Wall Mount', type: 'type', color: '#4f46e5' },
      { name: 'Under Counter', type: 'type', color: '#2563eb' },
      { name: 'Slide-In', type: 'type', color: '#059669' },
    ];

    for (const tag of typeTags) {
      await client.query(`
        INSERT INTO product_tags (name, tag_type, display_order, color)
        VALUES ($1, $2, 100, $3)
        ON CONFLICT (name, tag_type) DO NOTHING
      `, [tag.name, tag.type, tag.color]);
    }

    console.log('Inserting sub-category tags...');

    // Insert sub-category tags (more specific)
    const subTags = [
      // Refrigerator types
      { name: 'French Door', type: 'subcategory', color: '#3b82f6' },
      { name: 'Side-by-Side', type: 'subcategory', color: '#3b82f6' },
      { name: 'Top Freezer', type: 'subcategory', color: '#3b82f6' },
      { name: 'Bottom Freezer', type: 'subcategory', color: '#3b82f6' },
      { name: 'Wine Cooler', type: 'subcategory', color: '#7c3aed' },
      { name: 'Beverage Center', type: 'subcategory', color: '#06b6d4' },

      // Range/Cooking types
      { name: 'Gas', type: 'subcategory', color: '#f97316' },
      { name: 'Electric', type: 'subcategory', color: '#eab308' },
      { name: 'Induction', type: 'subcategory', color: '#8b5cf6' },
      { name: 'Dual Fuel', type: 'subcategory', color: '#ec4899' },

      // TV types
      { name: 'OLED', type: 'subcategory', color: '#10b981' },
      { name: 'QLED', type: 'subcategory', color: '#14b8a6' },
      { name: 'LED', type: 'subcategory', color: '#22c55e' },
      { name: 'QNED', type: 'subcategory', color: '#06b6d4' },

      // Grill types
      { name: 'Charcoal', type: 'subcategory', color: '#78716c' },
      { name: 'Pellet', type: 'subcategory', color: '#a16207' },
      { name: 'Propane', type: 'subcategory', color: '#0891b2' },
      { name: 'Natural Gas', type: 'subcategory', color: '#0d9488' },

      // Laundry types
      { name: 'Washer', type: 'subcategory', color: '#3b82f6' },
      { name: 'Dryer', type: 'subcategory', color: '#f59e0b' },
      { name: 'Washer/Dryer Combo', type: 'subcategory', color: '#8b5cf6' },

      // Small Appliance types
      { name: 'Stand Mixer', type: 'subcategory', color: '#dc2626' },
      { name: 'Coffee Maker', type: 'subcategory', color: '#78716c' },
      { name: 'Blender', type: 'subcategory', color: '#22c55e' },
      { name: 'Toaster', type: 'subcategory', color: '#f59e0b' },
      { name: 'Food Processor', type: 'subcategory', color: '#06b6d4' },
    ];

    for (const tag of subTags) {
      await client.query(`
        INSERT INTO product_tags (name, tag_type, display_order, color)
        VALUES ($1, $2, 200, $3)
        ON CONFLICT (name, tag_type) DO NOTHING
      `, [tag.name, tag.type, tag.color]);
    }

    console.log('Inserting feature tags...');

    // Insert feature tags
    const featureTags = [
      { name: 'Smart/WiFi', type: 'feature', color: '#6366f1' },
      { name: 'Energy Star', type: 'feature', color: '#22c55e' },
      { name: 'Pro Style', type: 'feature', color: '#dc2626' },
      { name: 'Stainless Steel', type: 'feature', color: '#94a3b8' },
      { name: 'Black Stainless', type: 'feature', color: '#334155' },
      { name: 'Commercial Grade', type: 'feature', color: '#b91c1c' },
    ];

    for (const tag of featureTags) {
      await client.query(`
        INSERT INTO product_tags (name, tag_type, display_order, color)
        VALUES ($1, $2, 300, $3)
        ON CONFLICT (name, tag_type) DO NOTHING
      `, [tag.name, tag.type, tag.color]);
    }

    await client.query('COMMIT');

    // Show summary
    const tagCounts = await pool.query(`
      SELECT tag_type, COUNT(*) as count
      FROM product_tags
      GROUP BY tag_type
      ORDER BY tag_type
    `);

    console.log('\n========================================');
    console.log('Product Tags Migration Complete!');
    console.log('========================================');
    console.log('Tags created by type:');
    tagCounts.rows.forEach(row => {
      console.log(`  ${row.tag_type}: ${row.count}`);
    });

    const totalTags = await pool.query('SELECT COUNT(*) as count FROM product_tags');
    console.log(`\nTotal tags: ${totalTags.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
