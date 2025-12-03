const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\davem\\OneDrive\\Desktop\\Independent November Black Friday 2025 - All Brands whirlpool group.xlsx';

console.log('='.repeat(70));
console.log('IMPORTING WHIRLPOOL GROUP PRICELIST');
console.log('='.repeat(70));

// Brand mapping
const BRAND_MAP = {
  'AMA': 'AMANA',
  'EDR': 'EVERYDROP',
  'GDR': 'GLADIATOR',
  'KAD': 'KITCHENAID',
  'KAD BI': 'KITCHENAID',
  'MAY': 'MAYTAG',
  'WHR': 'WHIRLPOOL',
  'UNB': 'WHIRLPOOL'
};

// Category mapping for Best Buy
const CATEGORY_MAP = {
  'Laundry': {
    'Washer': 'Appliances/Washers',
    'Dryer': 'Appliances/Dryers',
    'Combination Washer Dryer': 'Appliances/Washers'
  },
  'Cooking': {
    'Range': 'Appliances/Electric Ranges',
    'Cooktop': 'Appliances/Electric & Gas Cooktops',
    'Wall Oven': 'Appliances/Wall Ovens',
    'Microwave': 'Appliances/Other Appliances',
    'Hood and Vent': 'Appliances/Range Hoods',
    'Built-In Cooking': 'Appliances/Wall Ovens'
  },
  'Refrigeration': {
    'Refrigerator': 'Appliances/Refrigerators',
    'Freezer': 'Appliances/Freezers',
    'Built-In Refrigeration': 'Appliances/Refrigerators',
    'Refrigerator or Freezer': 'Appliances/Refrigerators',
    'Accessories': 'Appliances/Other Appliances'
  },
  'Cleaning': {
    'Dishwasher': 'Appliances/Dishwashers',
    'Waste Management': 'Appliances/Other Appliances'
  },
  'Storage Solutions': {
    'Storage': 'Home & Garden/Storage'
  }
};

const allProducts = [];

try {
  const wb = XLSX.readFile(filePath);

  wb.SheetNames.forEach(sheetName => {
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Header is at row 4 (index 4), data starts at row 5
    const headers = data[4];
    if (!headers) return;

    // Find column indices
    const brandIdx = headers.findIndex(h => h === 'BRAND');
    const categoryIdx = headers.findIndex(h => h === 'CATEGORY STAGING');
    const subcategoryIdx = headers.findIndex(h => h === 'SUBCATEGORY STAGING');
    const detailIdx = headers.findIndex(h => h === 'DETAIL STAGING');
    const modelIdx = headers.findIndex(h => h === 'MODEL');
    const msrpIdx = headers.findIndex(h => h === 'MSRP');
    const costIdx = headers.findIndex(h => h === '1-14 UNITS');
    const promoIdx = headers.findIndex(h => h === 'PROMO GUIDANCE');

    // Process data rows
    for (let i = 5; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[modelIdx]) continue;

      const brandCode = (row[brandIdx] || '').toString().trim();
      const brand = BRAND_MAP[brandCode] || brandCode;
      const category = (row[categoryIdx] || '').toString();
      const subcategory = (row[subcategoryIdx] || '').toString();
      const detail = (row[detailIdx] || '').toString();
      const model = (row[modelIdx] || '').toString().trim();
      const msrp = parseFloat(row[msrpIdx]) || 0;
      const cost = parseFloat(row[costIdx]) || 0;
      const promo = parseFloat(row[promoIdx]) || 0;

      // Map to Best Buy category
      let bbCategory = 'Appliances/Other Appliances';
      if (CATEGORY_MAP[category]) {
        for (const [subcat, bbCat] of Object.entries(CATEGORY_MAP[category])) {
          if (subcategory.includes(subcat) || detail.includes(subcat)) {
            bbCategory = bbCat;
            break;
          }
        }
        // Check if detail has Gas/Electric for ranges
        if (detail.toLowerCase().includes('gas') && bbCategory.includes('Range')) {
          bbCategory = 'Appliances/Gas Ranges';
        }
      }

      allProducts.push({
        sheet: sheetName,
        brand,
        brandCode,
        category,
        subcategory,
        detail,
        model,
        msrp,
        cost,
        promo,
        bbCategory
      });
    }
  });

  console.log(`\nTotal products imported: ${allProducts.length}`);

  // Count by brand
  const byBrand = {};
  allProducts.forEach(p => {
    byBrand[p.brand] = (byBrand[p.brand] || 0) + 1;
  });

  console.log('\nProducts by brand:');
  Object.entries(byBrand).sort((a, b) => b[1] - a[1]).forEach(([brand, count]) => {
    console.log(`  ${brand}: ${count}`);
  });

  // Output models for UPC research - focus on main appliances
  console.log('\n' + '='.repeat(70));
  console.log('KEY MODELS FOR UPC RESEARCH');
  console.log('='.repeat(70));

  const priorityCategories = [
    'Appliances/Refrigerators',
    'Appliances/Washers',
    'Appliances/Dryers',
    'Appliances/Dishwashers',
    'Appliances/Electric Ranges',
    'Appliances/Gas Ranges',
    'Appliances/Wall Ovens'
  ];

  priorityCategories.forEach(cat => {
    const products = allProducts.filter(p => p.bbCategory === cat);
    if (products.length > 0) {
      console.log(`\n${cat} (${products.length} products):`);
      products.slice(0, 10).forEach(p => {
        console.log(`  ${p.brand} ${p.model} - $${p.msrp} (Promo: $${p.promo})`);
      });
      if (products.length > 10) {
        console.log(`  ... and ${products.length - 10} more`);
      }
    }
  });

  // Generate model list for bb-product-enrichment.js
  console.log('\n' + '='.repeat(70));
  console.log('MODELS TO ADD TO UPC DATABASE');
  console.log('='.repeat(70));

  // Group by brand and show unique models
  const modelsByBrand = {};
  allProducts.forEach(p => {
    if (!modelsByBrand[p.brand]) modelsByBrand[p.brand] = [];
    if (!modelsByBrand[p.brand].includes(p.model)) {
      modelsByBrand[p.brand].push(p.model);
    }
  });

  Object.entries(modelsByBrand).forEach(([brand, models]) => {
    console.log(`\n// ${brand} MODELS (${models.length}):`);
    models.slice(0, 20).forEach(m => {
      console.log(`  // '${m}': { upc: 'UPC_NEEDED', category: 'Appliances/', price: '0.00' },`);
    });
  });

  // Save full product list to JSON for reference
  const outputPath = path.join(__dirname, 'whirlpool-group-products.json');
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2));
  console.log(`\nFull product list saved to: ${outputPath}`);

} catch (err) {
  console.error('Error:', err.message);
  console.error(err.stack);
}
