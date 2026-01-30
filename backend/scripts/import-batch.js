/**
 * Bulk import products to vendor_products table
 */
const pool = require('../db');

const products = [
  {
    "vendor": "Maytag",
    "sku": "MGD5605RU",
    "title": "Maytag® 7.0 Cu Ft. Load Gas Dryer with Extra Power and Pet Pro Option",
    "upc": "883049920238",
    "gtin": "00883049920238",
    "status": "30 - Active",
    "category": "Laundry",
    "type": "Gas Dryer",
    "capacity": "7.0 cu ft",
    "rating": "No reviews",
    "specs": {
      "available_finishes": [
        {"color": "Volcano Black", "sku": "MGD5605RU"},
        {"color": "White", "sku": "MGD5605RW"}
      ],
      "top_features": [
        "Pet Pro Option (traps pet hair)",
        "Extra Power",
        "Advanced Moisture Sensing",
        "Steam-enhanced",
        "30-day money back guarantee"
      ],
      "fuel_type": "Gas",
      "configuration": {"type": "Gas Dryer", "capacity": "7.0 cu ft"}
    }
  }
];

async function bulkImport() {
  try {
    const vendorResult = await pool.query("SELECT id FROM vendor_sources WHERE name ILIKE '%whirlpool%' LIMIT 1");
    const vendorSourceId = vendorResult.rows.length > 0 ? vendorResult.rows[0].id : null;

    let inserted = 0, updated = 0;

    for (const p of products) {
      const modelNumber = p.m || p.sku;
      const name = p.n || p.title;
      const brand = p.b || p.vendor;
      const category = p.c || p.category;
      const subcategory = p.sc || p.type || 'Refrigerator';
      const upc = p.u || p.upc;
      const gtin = p.g || p.gtin;
      const status = p.s || p.status?.replace(' - ', '-') || '';
      const description = p.d || p.description;

      let rating = null, reviewCount = null;
      const ratingStr = p.r || p.rating || '';
      if (ratingStr && ratingStr !== 'No reviews' && ratingStr !== '0') {
        const match = ratingStr.match(/^([\d.]+)\s*[-–]\s*(\d+)/);
        if (match) {
          rating = parseFloat(match[1]) || null;
          reviewCount = parseInt(match[2]) || null;
        }
      }

      const specs = {
        UPC: upc, GTIN: gtin, Status: status, Rating: rating, ReviewCount: reviewCount,
        capacity: p.capacity, ...(p.specs || {})
      };

      const existing = await pool.query('SELECT id FROM vendor_products WHERE model_number = $1', [modelNumber]);

      if (existing.rows.length > 0) {
        await pool.query(`
          UPDATE vendor_products SET name = $1, brand = $2, category = $3, subcategory = $4,
          description = COALESCE($5, description), specifications = $6, updated_at = NOW()
          WHERE model_number = $7
        `, [name, brand, category, subcategory, description || null, JSON.stringify(specs), modelNumber]);
        updated++;
        console.log('Updated:', modelNumber);
      } else {
        await pool.query(`
          INSERT INTO vendor_products (vendor_source_id, model_number, name, brand, category, subcategory, description, specifications, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        `, [vendorSourceId, modelNumber, name, brand, category, subcategory, description || null, JSON.stringify(specs)]);
        inserted++;
        console.log('Inserted:', modelNumber);
      }
    }

    console.log('\n========================================');
    console.log('Inserted:', inserted, '| Updated:', updated);
    const countResult = await pool.query('SELECT COUNT(*) as total FROM vendor_products');
    console.log('Total vendor products:', countResult.rows[0].total);
    console.log('========================================');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

bulkImport();
