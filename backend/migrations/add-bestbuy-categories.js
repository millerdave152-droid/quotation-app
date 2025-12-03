/**
 * Migration: Add Best Buy Categories Table
 * Creates a table to store Best Buy marketplace category mappings
 * and adds bestbuy_category_code column to products table
 */

const pool = require('../db');

// Best Buy Categories organized by product type
const BESTBUY_CATEGORIES = {
  // TVs and Displays
  TVS: [
    { code: 'TV30601', name: 'LED & LCD TVs', description: 'Standard LED and LCD televisions' },
    { code: 'TV30602', name: 'OLED TVs', description: 'OLED display televisions' },
    { code: 'TV30603', name: 'QLED TVs', description: 'QLED display televisions' },
    { code: 'TV30604', name: '4K Ultra HD TVs', description: '4K resolution televisions' },
    { code: 'TV30605', name: '8K TVs', description: '8K resolution televisions' },
    { code: 'TV30606', name: 'Smart TVs', description: 'Internet-connected smart TVs' },
    { code: 'TV30620', name: 'TV Mounts & Stands', description: 'TV mounting and stand accessories' },
    { code: 'TV30621', name: 'TV Accessories', description: 'General TV accessories' }
  ],

  // Audio Equipment
  AUDIO: [
    { code: 'AU30701', name: 'Soundbars', description: 'TV soundbars and sound systems' },
    { code: 'AU30702', name: 'Home Theatre Systems', description: 'Complete home theatre audio' },
    { code: 'AU30703', name: 'Speakers', description: 'Standalone speakers' },
    { code: 'AU30704', name: 'Subwoofers', description: 'Bass subwoofer speakers' },
    { code: 'AU30705', name: 'Receivers & Amplifiers', description: 'Audio receivers and amps' },
    { code: 'AU30706', name: 'Wireless & Bluetooth Speakers', description: 'Portable bluetooth speakers' },
    { code: 'AU30707', name: 'Smart Speakers', description: 'Voice-enabled smart speakers' },
    { code: 'AU30720', name: 'Headphones', description: 'Over-ear and on-ear headphones' },
    { code: 'AU30721', name: 'Earbuds', description: 'In-ear earbuds and earphones' },
    { code: 'AU30722', name: 'Gaming Headsets', description: 'Gaming audio headsets' }
  ],

  // Major Appliances
  APPLIANCES: [
    { code: 'AP30801', name: 'Refrigerators', description: 'Full-size refrigerators' },
    { code: 'AP30802', name: 'Freezers', description: 'Standalone freezers' },
    { code: 'AP30803', name: 'Ranges & Stoves', description: 'Cooking ranges and stoves' },
    { code: 'AP30804', name: 'Wall Ovens', description: 'Built-in wall ovens' },
    { code: 'AP30805', name: 'Cooktops', description: 'Cooktop surfaces' },
    { code: 'AP30806', name: 'Range Hoods', description: 'Kitchen ventilation hoods' },
    { code: 'AP30807', name: 'Microwaves', description: 'Microwave ovens' },
    { code: 'AP30808', name: 'Dishwashers', description: 'Dishwashing machines' },
    { code: 'AP30809', name: 'Washers', description: 'Clothes washing machines' },
    { code: 'AP30810', name: 'Dryers', description: 'Clothes dryers' },
    { code: 'AP30811', name: 'Washer & Dryer Sets', description: 'Matched washer/dryer pairs' },
    { code: 'AP30812', name: 'Laundry Centres', description: 'Stacked laundry units' },
    { code: 'AP30820', name: 'Wine Coolers', description: 'Wine refrigeration units' },
    { code: 'AP30821', name: 'Beverage Centres', description: 'Beverage refrigerators' },
    { code: 'AP30822', name: 'Ice Makers', description: 'Ice making machines' },
    { code: 'AP30830', name: 'Vacuum Cleaners', description: 'Floor vacuum cleaners' },
    { code: 'AP30831', name: 'Robot Vacuums', description: 'Robotic vacuum cleaners' },
    { code: 'AP30832', name: 'Air Purifiers', description: 'Air purification systems' },
    { code: 'AP30833', name: 'Humidifiers', description: 'Room humidifiers' },
    { code: 'AP30834', name: 'Dehumidifiers', description: 'Room dehumidifiers' },
    { code: 'AP30835', name: 'Air Conditioners', description: 'Portable and window AC units' },
    { code: 'AP30836', name: 'Heaters', description: 'Space heaters' },
    { code: 'AP30837', name: 'Fans', description: 'Cooling fans' }
  ],

  // Furniture
  FURNITURE: [
    { code: 'FU30901', name: 'Living Room Furniture', description: 'Sofas, chairs, tables' },
    { code: 'FU30902', name: 'Bedroom Furniture', description: 'Beds, dressers, nightstands' },
    { code: 'FU30903', name: 'Dining Room Furniture', description: 'Dining tables and chairs' },
    { code: 'FU30904', name: 'Office Furniture', description: 'Desks and office chairs' },
    { code: 'FU30905', name: 'TV Stands & Entertainment Centres', description: 'TV furniture' },
    { code: 'FU30906', name: 'Shelving & Storage', description: 'Shelves and storage units' },
    { code: 'FU30907', name: 'Outdoor Furniture', description: 'Patio and outdoor furniture' },
    { code: 'FU30910', name: 'Gaming Chairs', description: 'Gaming and ergonomic chairs' },
    { code: 'FU30911', name: 'Standing Desks', description: 'Adjustable standing desks' }
  ],

  // Mattresses & Bedding
  MATTRESSES: [
    { code: 'MA31001', name: 'Mattresses', description: 'Bed mattresses all sizes' },
    { code: 'MA31002', name: 'Box Springs', description: 'Mattress box springs' },
    { code: 'MA31003', name: 'Mattress Toppers', description: 'Mattress toppers and pads' },
    { code: 'MA31004', name: 'Pillows', description: 'Bed pillows' },
    { code: 'MA31005', name: 'Bed Frames', description: 'Bed frames and platforms' },
    { code: 'MA31006', name: 'Adjustable Bases', description: 'Adjustable bed bases' },
    { code: 'MA31007', name: 'Bedding Sets', description: 'Complete bedding sets' }
  ],

  // BBQ & Outdoor Cooking
  BBQ: [
    { code: 'BB31101', name: 'Gas BBQs', description: 'Propane and natural gas grills' },
    { code: 'BB31102', name: 'Charcoal BBQs', description: 'Charcoal grills' },
    { code: 'BB31103', name: 'Electric BBQs', description: 'Electric grills' },
    { code: 'BB31104', name: 'Smokers', description: 'Meat smokers' },
    { code: 'BB31105', name: 'Portable BBQs', description: 'Portable grills' },
    { code: 'BB31106', name: 'Built-in BBQs', description: 'Built-in outdoor grills' },
    { code: 'BB31120', name: 'BBQ Accessories', description: 'Grilling tools and accessories' },
    { code: 'BB31121', name: 'BBQ Covers', description: 'Grill covers' },
    { code: 'BB31130', name: 'Outdoor Heaters', description: 'Patio heaters' },
    { code: 'BB31131', name: 'Fire Pits', description: 'Outdoor fire pits' }
  ],

  // Gaming
  GAMING: [
    { code: 'GA31201', name: 'Gaming Consoles', description: 'Video game consoles' },
    { code: 'GA31202', name: 'Video Games', description: 'Video game titles' },
    { code: 'GA31203', name: 'Gaming Controllers', description: 'Game controllers and gamepads' },
    { code: 'GA31204', name: 'Gaming Accessories', description: 'Gaming peripherals' },
    { code: 'GA31205', name: 'VR Headsets', description: 'Virtual reality headsets' },
    { code: 'GA31210', name: 'Gaming PCs', description: 'Gaming desktop computers' },
    { code: 'GA31211', name: 'Gaming Laptops', description: 'Gaming laptop computers' },
    { code: 'GA31212', name: 'Gaming Monitors', description: 'Gaming displays' },
    { code: 'GA31213', name: 'Gaming Keyboards', description: 'Gaming keyboards' },
    { code: 'GA31214', name: 'Gaming Mice', description: 'Gaming mice' }
  ],

  // Projectors & Screens
  PROJECTORS: [
    { code: 'PR31301', name: 'Home Theatre Projectors', description: 'Home projectors' },
    { code: 'PR31302', name: 'Portable Projectors', description: 'Portable mini projectors' },
    { code: 'PR31303', name: 'Business Projectors', description: 'Office projectors' },
    { code: 'PR31304', name: 'Laser Projectors', description: 'Laser light projectors' },
    { code: 'PR31310', name: 'Projector Screens', description: 'Projection screens' },
    { code: 'PR31311', name: 'Projector Mounts', description: 'Ceiling and wall mounts' },
    { code: 'PR31312', name: 'Projector Accessories', description: 'Projector accessories' }
  ],

  // Blu-ray & Media Players
  MEDIA: [
    { code: 'MD31401', name: 'Blu-ray Players', description: 'Blu-ray disc players' },
    { code: 'MD31402', name: '4K Blu-ray Players', description: '4K UHD Blu-ray players' },
    { code: 'MD31403', name: 'DVD Players', description: 'DVD disc players' },
    { code: 'MD31404', name: 'Streaming Devices', description: 'Streaming media players' },
    { code: 'MD31405', name: 'Blu-ray & DVD Movies', description: 'Movie discs' }
  ]
};

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating bestbuy_categories table...');

    // Create the categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bestbuy_categories (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category_group VARCHAR(50) NOT NULL,
        parent_code VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Adding bestbuy_category_code column to products table...');

    // Add category code column to products table if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products'
          AND column_name = 'bestbuy_category_code'
        ) THEN
          ALTER TABLE products ADD COLUMN bestbuy_category_code VARCHAR(20);
        END IF;
      END $$;
    `);

    // Add index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_bestbuy_category
      ON products(bestbuy_category_code)
    `);

    // Add foreign key constraint (if categories exist)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_products_bestbuy_category'
        ) THEN
          ALTER TABLE products
          ADD CONSTRAINT fk_products_bestbuy_category
          FOREIGN KEY (bestbuy_category_code)
          REFERENCES bestbuy_categories(code)
          ON DELETE SET NULL;
        END IF;
      EXCEPTION
        WHEN undefined_table THEN
          NULL;
      END $$;
    `);

    console.log('Inserting Best Buy categories...');

    // Clear existing categories and insert fresh
    await client.query('DELETE FROM bestbuy_categories');

    // Insert all categories
    const insertQuery = `
      INSERT INTO bestbuy_categories (code, name, description, category_group)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        category_group = EXCLUDED.category_group,
        updated_at = CURRENT_TIMESTAMP
    `;

    let totalInserted = 0;

    for (const [group, categories] of Object.entries(BESTBUY_CATEGORIES)) {
      for (const cat of categories) {
        await client.query(insertQuery, [cat.code, cat.name, cat.description, group]);
        totalInserted++;
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Migration complete! Inserted ${totalInserted} categories.`);

    // Show summary
    const summary = await client.query(`
      SELECT category_group, COUNT(*) as count
      FROM bestbuy_categories
      GROUP BY category_group
      ORDER BY category_group
    `);

    console.log('\nCategories by group:');
    summary.rows.forEach(row => {
      console.log(`  ${row.category_group}: ${row.count} categories`);
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n✅ Best Buy categories migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
