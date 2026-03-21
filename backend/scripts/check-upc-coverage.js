#!/usr/bin/env node
/**
 * Check UPC coverage by manufacturer to determine Icecat enrichment potential
 */
require('dotenv').config();
const pool = require('../db');

async function run() {
  const appliances = await pool.query(`
    SELECT manufacturer, COUNT(*) as total,
           array_agg(DISTINCT model ORDER BY model) as models
    FROM products
    WHERE (upc IS NULL OR upc = '')
      AND model IS NOT NULL AND model != ''
      AND UPPER(manufacturer) IN (
        'SAMSUNG', 'LG', 'WHIRLPOOL', 'KITCHENAID', 'BOSCH',
        'JENNAIR', 'NAPOLEON', 'MAYTAG', 'FRIGIDAIRE', 'GE',
        'SONY', 'DANBY', 'AMANA', 'BREVILLE'
      )
    GROUP BY manufacturer
    ORDER BY total DESC
  `);

  console.log('=== APPLIANCE/ELECTRONICS BRANDS WITHOUT UPC ===');
  let totalAppliance = 0;
  appliances.rows.forEach(r => {
    console.log(`${r.manufacturer}: ${r.total} products, ${r.models.length} unique models`);
    console.log(`  Sample: ${r.models.slice(0, 5).join(', ')}`);
    totalAppliance += parseInt(r.total);
  });
  console.log(`\nTotal enrichable products: ${totalAppliance}`);

  const furniture = await pool.query(`
    SELECT manufacturer, COUNT(*) as total
    FROM products
    WHERE (upc IS NULL OR upc = '')
      AND UPPER(manufacturer) NOT IN (
        'SAMSUNG', 'LG', 'WHIRLPOOL', 'KITCHENAID', 'BOSCH',
        'JENNAIR', 'NAPOLEON', 'MAYTAG', 'FRIGIDAIRE', 'GE',
        'SONY', 'DANBY', 'AMANA', 'BREVILLE'
      )
    GROUP BY manufacturer
    ORDER BY total DESC
  `);

  console.log('\n=== OTHER BRANDS (furniture, etc.) ===');
  let totalOther = 0;
  furniture.rows.forEach(r => {
    console.log(`${r.manufacturer}: ${r.total}`);
    totalOther += parseInt(r.total);
  });
  console.log(`\nTotal other: ${totalOther}`);
  console.log(`\nSUMMARY: ${totalAppliance} enrichable via Icecat, ${totalOther} need manual UPC or scan-first approach`);

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
