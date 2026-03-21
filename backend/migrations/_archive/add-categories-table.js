/**
 * Migration: Create categories table with hierarchical structure
 *
 * This creates a normalized category system to replace the raw text categories.
 * Includes parent-child relationships for 3-level hierarchy:
 *   Level 1: Top groups (Major Appliances, Electronics, Outdoor)
 *   Level 2: Categories (Refrigerators, Washers, TVs, Grills)
 *   Level 3: Subcategories (French Door, Front Load, OLED)
 *
 * Usage: node migrations/add-categories-table.js
 */

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

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating categories table...');

    // Create categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        display_name VARCHAR(150),
        level INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER DEFAULT 0,
        icon VARCHAR(50),
        color VARCHAR(7),
        legacy_patterns JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
      CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);
      CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE is_active = true;
    `);

    console.log('Categories table created.');

    // Check if columns already exist on products table
    const columnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name IN ('category_id', 'subcategory_id', 'legacy_category')
    `);

    const existingColumns = columnCheck.rows.map(r => r.column_name);

    if (!existingColumns.includes('category_id')) {
      console.log('Adding category_id column to products...');
      await client.query(`
        ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)
      `);
    }

    if (!existingColumns.includes('subcategory_id')) {
      console.log('Adding subcategory_id column to products...');
      await client.query(`
        ALTER TABLE products ADD COLUMN subcategory_id INTEGER REFERENCES categories(id)
      `);
    }

    if (!existingColumns.includes('legacy_category')) {
      console.log('Adding legacy_category column and copying existing categories...');
      await client.query(`
        ALTER TABLE products ADD COLUMN legacy_category VARCHAR(255)
      `);
      await client.query(`
        UPDATE products SET legacy_category = category WHERE legacy_category IS NULL
      `);
    }

    // Create indexes on products
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products(subcategory_id);
    `);

    console.log('Product columns added.');

    // ============================================
    // POPULATE CATEGORY HIERARCHY
    // ============================================

    console.log('Populating category hierarchy...');

    // Level 1: Top-level groups
    const topLevel = [
      { name: 'Major Appliances', slug: 'major-appliances', color: '#3b82f6', icon: 'appliances', order: 1 },
      { name: 'Outdoor', slug: 'outdoor', color: '#dc2626', icon: 'grill', order: 2 },
      { name: 'Small Appliances', slug: 'small-appliances', color: '#a855f7', icon: 'coffee', order: 3 },
      { name: 'Electronics', slug: 'electronics', color: '#10b981', icon: 'tv', order: 4 },
      { name: 'Accessories', slug: 'accessories', color: '#64748b', icon: 'tools', order: 5 }
    ];

    const topLevelIds = {};

    for (const cat of topLevel) {
      const result = await client.query(`
        INSERT INTO categories (name, slug, display_name, level, display_order, color, icon)
        VALUES ($1, $2, $1, 1, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [cat.name, cat.slug, cat.order, cat.color, cat.icon]);
      topLevelIds[cat.slug] = result.rows[0].id;
    }

    // Level 2: Categories under Major Appliances
    const majorApplianceCategories = [
      {
        name: 'Refrigerators', slug: 'refrigerators', color: '#3b82f6', order: 1,
        patterns: ['refrigerator', 'fridge', 'refrig', 'ref', 'fdr', 'sxs', 'tmf', 'bmf', 'refrigeration', '4dflex', '4dr', 'food preservation', 'french door ref', 'side by side ref', 'top freezer', 'bottom freezer', 'bottom mount', 'multidoor']
      },
      {
        name: 'Washers', slug: 'washers', color: '#ec4899', order: 2,
        patterns: ['washer', 'washing machine', 'w/m', 'fl washer', 'tl washer', 'laundry - washer', 'fabric care - fl washer', 'fabric care - tl washer', 'front load washer', 'top load washer']
      },
      {
        name: 'Dryers', slug: 'dryers', color: '#f59e0b', order: 3,
        patterns: ['dryer', 'fl dryer', 'tl dryer', 'laundry - dryer', 'fabric care - fl dryer', 'fabric care - tl dryer', 'electric dryer', 'gas dryer', 'heat pump dryer']
      },
      {
        name: 'Dishwashers', slug: 'dishwashers', color: '#06b6d4', order: 4,
        patterns: ['dishwasher', 'dish washer', 'dw rotary', 'dw aquablast', 'cleaning - dishwasher', 'dish care', 'cleanup', 'bi fullsize dish washer', 'bi compact dish washer']
      },
      {
        name: 'Ranges', slug: 'ranges', color: '#ef4444', order: 5,
        patterns: ['range', 'stove', 'slide-in', 'slide in', 'freestanding', 'cooking - range', 'front control', 'dual fuel', 'commercial range', 'pro range', 'electric range', 'gas range', 'induction range']
      },
      {
        name: 'Cooktops', slug: 'cooktops', color: '#f97316', order: 6,
        patterns: ['cooktop', 'cook top', 'burner', 'induction', 'cooking - built-in cooking - cooktop', 'gas cooktop', 'electric cooktop', 'radiant cooktop', 'induction cooktop']
      },
      {
        name: 'Wall Ovens', slug: 'wall-ovens', color: '#f59e0b', order: 7,
        patterns: ['wall oven', 'built-in oven', 'built in oven', 'double oven', 'single oven', 'cooking - built-in cooking - wall oven', 'combo oven', 'steam oven', 'convection oven', 'speed oven']
      },
      {
        name: 'Microwaves', slug: 'microwaves', color: '#8b5cf6', order: 8,
        patterns: ['microwave', 'otr', 'over the range', 'over-the-range', 'cooking - microwave', 'countertop microwave', 'built-in microwave', 'drawer microwave']
      },
      {
        name: 'Range Hoods', slug: 'range-hoods', color: '#6b7280', order: 9,
        patterns: ['hood', 'range hood', 'vent hood', 'ventilation', 'cooking - hood', 'downdraft', 'chimney hood', 'island hood', 'under cabinet hood', 'wall mount hood']
      },
      {
        name: 'Specialty Appliances', slug: 'specialty', color: '#0ea5e9', order: 10,
        patterns: ['wine cooler', 'wine cellar', 'beverage', 'ice maker', 'trash compactor', 'warming drawer', 'freezer', 'wine cabinet', 'beverage center']
      }
    ];

    const majorApplianceIds = {};

    for (const cat of majorApplianceCategories) {
      const result = await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, color, legacy_patterns)
        VALUES ($1, $2, $1, 2, $3, $4, $5, $6)
        ON CONFLICT (slug) DO UPDATE SET
          legacy_patterns = EXCLUDED.legacy_patterns,
          parent_id = EXCLUDED.parent_id
        RETURNING id
      `, [cat.name, cat.slug, topLevelIds['major-appliances'], cat.order, cat.color, JSON.stringify(cat.patterns)]);
      majorApplianceIds[cat.slug] = result.rows[0].id;
    }

    // Level 2: Categories under Outdoor
    const outdoorCategories = [
      {
        name: 'Grills', slug: 'grills', color: '#dc2626', order: 1,
        patterns: ['grill', 'bbq', 'barbecue', 'griddle']
      },
      {
        name: 'Smokers', slug: 'smokers', color: '#78350f', order: 2,
        patterns: ['smoker', 'pellet', 'offset', 'yoder']
      },
      {
        name: 'Fire Pits', slug: 'fire-pits', color: '#ea580c', order: 3,
        patterns: ['fire pit', 'firepit', 'fire table']
      },
      {
        name: 'Fireplaces', slug: 'fireplaces', color: '#b91c1c', order: 4,
        patterns: ['fireplace', 'napoleon', 'gas fireplace', 'electric fireplace', 'wood fireplace', 'fireplace insert']
      }
    ];

    const outdoorIds = {};

    for (const cat of outdoorCategories) {
      const result = await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, color, legacy_patterns)
        VALUES ($1, $2, $1, 2, $3, $4, $5, $6)
        ON CONFLICT (slug) DO UPDATE SET
          legacy_patterns = EXCLUDED.legacy_patterns,
          parent_id = EXCLUDED.parent_id
        RETURNING id
      `, [cat.name, cat.slug, topLevelIds['outdoor'], cat.order, cat.color, JSON.stringify(cat.patterns)]);
      outdoorIds[cat.slug] = result.rows[0].id;
    }

    // Level 2: Categories under Small Appliances
    const smallApplianceCategories = [
      { name: 'Vacuums', slug: 'vacuums', patterns: ['vacuum', 'vac', 'robot vacuum', 'stick vacuum'] },
      { name: 'Coffee Makers', slug: 'coffee-makers', patterns: ['coffee', 'espresso', 'brew'] },
      { name: 'Blenders', slug: 'blenders', patterns: ['blender', 'immersion'] },
      { name: 'Food Processors', slug: 'food-processors', patterns: ['food processor', 'chopper'] },
      { name: 'Mixers', slug: 'mixers', patterns: ['mixer', 'stand mixer', 'hand mixer'] },
      { name: 'Toasters', slug: 'toasters', patterns: ['toaster', 'toaster oven'] },
      { name: 'Air Fryers', slug: 'air-fryers', patterns: ['air fryer', 'air fry'] }
    ];

    for (let i = 0; i < smallApplianceCategories.length; i++) {
      const cat = smallApplianceCategories[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, color, legacy_patterns)
        VALUES ($1, $2, $1, 2, $3, $4, '#a855f7', $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [cat.name, cat.slug, topLevelIds['small-appliances'], i + 1, JSON.stringify(cat.patterns)]);
    }

    // Level 2: Categories under Electronics
    const electronicsCategories = [
      {
        name: 'Televisions', slug: 'televisions', color: '#10b981', order: 1,
        patterns: ['tv', 'television', 'oled', 'qled', 'qned', 'led tv', 'lcd', 'uled', 'bravia', 'nanocell', 'standbyme', 'neo qled', 'mini led']
      },
      {
        name: 'Audio', slug: 'audio', color: '#14b8a6', order: 2,
        patterns: ['soundbar', 'speaker', 'audio', 'receiver', 'amplifier', 'home theatre', 'home theater', 'subwoofer']
      }
    ];

    const electronicsIds = {};

    for (const cat of electronicsCategories) {
      const result = await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, color, legacy_patterns)
        VALUES ($1, $2, $1, 2, $3, $4, $5, $6)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
        RETURNING id
      `, [cat.name, cat.slug, topLevelIds['electronics'], cat.order, cat.color, JSON.stringify(cat.patterns)]);
      electronicsIds[cat.slug] = result.rows[0].id;
    }

    // Level 2: Categories under Accessories
    const accessoriesCategories = [
      { name: 'Appliance Accessories', slug: 'appliance-accessories', patterns: ['accessory', 'accessories', 'kit'] },
      { name: 'Filters & Parts', slug: 'filters-parts', patterns: ['filter', 'part', 'replacement'] },
      { name: 'Installation Kits', slug: 'installation-kits', patterns: ['install', 'installation', 'hardware'] }
    ];

    for (let i = 0; i < accessoriesCategories.length; i++) {
      const cat = accessoriesCategories[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, color, legacy_patterns)
        VALUES ($1, $2, $1, 2, $3, $4, '#64748b', $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [cat.name, cat.slug, topLevelIds['accessories'], i + 1, JSON.stringify(cat.patterns)]);
    }

    // ============================================
    // LEVEL 3: SUBCATEGORIES
    // ============================================

    // Refrigerator subcategories
    const refrigeratorSubcats = [
      { name: 'French Door', slug: 'french-door', patterns: ['french door', 'fdr', 'multidoor', '4dr', '4 door', 'quad door'] },
      { name: 'Side-by-Side', slug: 'side-by-side', patterns: ['side by side', 'side-by-side', 'sxs'] },
      { name: 'Top Freezer', slug: 'top-freezer', patterns: ['top freezer', 'tmf', 'top mount'] },
      { name: 'Bottom Freezer', slug: 'bottom-freezer', patterns: ['bottom freezer', 'bmf', 'bottom mount'] },
      { name: 'Counter Depth', slug: 'counter-depth', patterns: ['counter depth', 'counter-depth'] }
    ];

    for (let i = 0; i < refrigeratorSubcats.length; i++) {
      const sub = refrigeratorSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['refrigerators'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Washer subcategories
    const washerSubcats = [
      { name: 'Front Load', slug: 'front-load-washer', patterns: ['front load', 'fl washer'] },
      { name: 'Top Load', slug: 'top-load-washer', patterns: ['top load', 'tl washer'] }
    ];

    for (let i = 0; i < washerSubcats.length; i++) {
      const sub = washerSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['washers'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Dryer subcategories
    const dryerSubcats = [
      { name: 'Electric', slug: 'electric-dryer', patterns: ['electric dryer', 'electric'] },
      { name: 'Gas', slug: 'gas-dryer', patterns: ['gas dryer', 'gas'] },
      { name: 'Heat Pump', slug: 'heat-pump-dryer', patterns: ['heat pump', 'ventless'] }
    ];

    for (let i = 0; i < dryerSubcats.length; i++) {
      const sub = dryerSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['dryers'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Range subcategories
    const rangeSubcats = [
      { name: 'Electric', slug: 'electric-range', patterns: ['electric range', 'radiant', 'electric cooking'] },
      { name: 'Gas', slug: 'gas-range', patterns: ['gas range', 'gas cooking'] },
      { name: 'Dual Fuel', slug: 'dual-fuel', patterns: ['dual fuel'] },
      { name: 'Induction', slug: 'induction-range', patterns: ['induction range', 'induction cooking'] },
      { name: 'Slide-In', slug: 'slide-in-range', patterns: ['slide-in', 'slide in'] },
      { name: 'Freestanding', slug: 'freestanding-range', patterns: ['freestanding', 'free standing'] }
    ];

    for (let i = 0; i < rangeSubcats.length; i++) {
      const sub = rangeSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['ranges'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Cooktop subcategories
    const cooktopSubcats = [
      { name: 'Gas', slug: 'gas-cooktop', patterns: ['gas cooktop', 'gas burner'] },
      { name: 'Electric', slug: 'electric-cooktop', patterns: ['electric cooktop', 'radiant cooktop'] },
      { name: 'Induction', slug: 'induction-cooktop', patterns: ['induction cooktop', 'induction'] }
    ];

    for (let i = 0; i < cooktopSubcats.length; i++) {
      const sub = cooktopSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['cooktops'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Wall Oven subcategories
    const wallOvenSubcats = [
      { name: 'Single', slug: 'single-wall-oven', patterns: ['single oven', 'single wall oven'] },
      { name: 'Double', slug: 'double-wall-oven', patterns: ['double oven', 'double wall oven'] },
      { name: 'Combination', slug: 'combination-oven', patterns: ['combo', 'combination', 'microwave combo'] }
    ];

    for (let i = 0; i < wallOvenSubcats.length; i++) {
      const sub = wallOvenSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['wall-ovens'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Microwave subcategories
    const microwaveSubcats = [
      { name: 'Countertop', slug: 'countertop-microwave', patterns: ['countertop', 'counter top'] },
      { name: 'Over-the-Range', slug: 'over-the-range-microwave', patterns: ['over the range', 'over-the-range', 'otr'] },
      { name: 'Built-In', slug: 'built-in-microwave', patterns: ['built-in', 'built in'] },
      { name: 'Drawer', slug: 'drawer-microwave', patterns: ['drawer'] }
    ];

    for (let i = 0; i < microwaveSubcats.length; i++) {
      const sub = microwaveSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['microwaves'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Range Hood subcategories
    const rangeHoodSubcats = [
      { name: 'Under Cabinet', slug: 'under-cabinet-hood', patterns: ['under cabinet', 'undercabinet'] },
      { name: 'Wall Mount', slug: 'wall-mount-hood', patterns: ['wall mount', 'chimney'] },
      { name: 'Island Mount', slug: 'island-hood', patterns: ['island'] },
      { name: 'Downdraft', slug: 'downdraft', patterns: ['downdraft', 'down draft'] }
    ];

    for (let i = 0; i < rangeHoodSubcats.length; i++) {
      const sub = rangeHoodSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, majorApplianceIds['range-hoods'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Grill subcategories
    const grillSubcats = [
      { name: 'Gas Grills', slug: 'gas-grills', patterns: ['gas grill', 'propane', 'natural gas'] },
      { name: 'Charcoal Grills', slug: 'charcoal-grills', patterns: ['charcoal'] },
      { name: 'Pellet Grills', slug: 'pellet-grills', patterns: ['pellet grill'] },
      { name: 'Griddles', slug: 'griddles', patterns: ['griddle', 'flat top'] }
    ];

    for (let i = 0; i < grillSubcats.length; i++) {
      const sub = grillSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, outdoorIds['grills'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // TV subcategories
    const tvSubcats = [
      { name: 'OLED', slug: 'oled-tv', patterns: ['oled'] },
      { name: 'QLED', slug: 'qled-tv', patterns: ['qled', 'neo qled'] },
      { name: 'Mini LED', slug: 'mini-led-tv', patterns: ['mini led', 'qned'] },
      { name: 'LED/LCD', slug: 'led-lcd-tv', patterns: ['led', 'lcd', 'uled'] },
      { name: 'Projectors', slug: 'projectors', patterns: ['projector'] }
    ];

    for (let i = 0; i < tvSubcats.length; i++) {
      const sub = tvSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, electronicsIds['televisions'], i + 1, JSON.stringify(sub.patterns)]);
    }

    // Fireplace subcategories
    const fireplaceSubcats = [
      { name: 'Gas Fireplaces', slug: 'gas-fireplaces', patterns: ['gas fireplace'] },
      { name: 'Electric Fireplaces', slug: 'electric-fireplaces', patterns: ['electric fireplace'] },
      { name: 'Wood Fireplaces', slug: 'wood-fireplaces', patterns: ['wood fireplace', 'wood burning'] }
    ];

    for (let i = 0; i < fireplaceSubcats.length; i++) {
      const sub = fireplaceSubcats[i];
      await client.query(`
        INSERT INTO categories (name, slug, display_name, level, parent_id, display_order, legacy_patterns)
        VALUES ($1, $2, $1, 3, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET legacy_patterns = EXCLUDED.legacy_patterns
      `, [sub.name, sub.slug, outdoorIds['fireplaces'], i + 1, JSON.stringify(sub.patterns)]);
    }

    await client.query('COMMIT');

    // Print summary
    const countResult = await pool.query(`
      SELECT level, COUNT(*) as count FROM categories GROUP BY level ORDER BY level
    `);

    console.log('\n========================================');
    console.log('CATEGORY MIGRATION COMPLETE');
    console.log('========================================');
    for (const row of countResult.rows) {
      console.log(`Level ${row.level}: ${row.count} categories`);
    }

    const totalResult = await pool.query('SELECT COUNT(*) FROM categories');
    console.log(`Total: ${totalResult.rows[0].count} categories`);
    console.log('========================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
