/**
 * Convert Jenn-Air/Whirlpool PDF raw text to Excel
 * The raw text is already tab-separated with proper columns
 */
const fs = require('fs');
const XLSX = require('xlsx');

const textPath = 'C:/Users/WD-PC1/OneDrive/Desktop/price/JENN-AIR_raw_text.txt';
const outputPath = 'C:/Users/WD-PC1/OneDrive/Desktop/price/JENN-AIR_extracted.xlsx';

// Read the raw text file
const rawText = fs.readFileSync(textPath, 'utf8');
const lines = rawText.split('\n').filter(line => line.trim());

console.log('Total lines:', lines.length);

// Parse lines into rows
const rows = [];
let skipped = 0;

for (const line of lines) {
  const parts = line.split('\t');

  // Skip header-like lines without enough columns
  if (parts.length < 6) {
    skipped++;
    continue;
  }

  // Look for lines with model numbers (2nd to last or model-like patterns)
  const hasModel = parts.some(p => p && p.match(/^[A-Z]{2,5}\d{3,5}[A-Z]{0,3}$/));
  const hasPrice = parts.some(p => p && p.match(/^\$\s?[\d,]+\.\d{2}$/));

  if (hasModel && hasPrice) {
    rows.push(parts);
  }
}

console.log('Product rows found:', rows.length);
console.log('Skipped lines:', skipped);

// Create Excel with proper headers
// Based on the PDF structure: Heading | Main Category | Subcategory | Brand | Model | Cost | MSRP | Colour
const wsData = [['Main Category', 'Subcategory', 'Type', 'Brand', 'Model', 'Cost', 'MSRP', 'Colour']];

rows.forEach(parts => {
  // Find the key fields
  let category = '';
  let subcategory = '';
  let type = '';
  let brand = '';
  let model = '';
  let cost = '';
  let msrp = '';
  let colour = '';

  parts.forEach((p, idx) => {
    if (!p) return;
    p = p.trim();

    // Model pattern
    if (p.match(/^[A-Z]{2,5}\d{3,5}[A-Z]{0,3}$/) && !model) {
      model = p;
    }
    // Price pattern - first is cost, second is MSRP
    else if (p.match(/^\$\s?[\d,]+\.\d{2}$/)) {
      const priceVal = parseFloat(p.replace(/[$,\s]/g, ''));
      if (!cost) cost = priceVal;
      else if (!msrp) msrp = priceVal;
    }
    // Brand codes
    else if (['JEN', 'MAY', 'WHR', 'AMA', 'KIT'].includes(p)) {
      brand = p === 'JEN' ? 'JENN-AIR' : p === 'MAY' ? 'MAYTAG' : p === 'WHR' ? 'WHIRLPOOL' : p === 'AMA' ? 'AMANA' : p === 'KIT' ? 'KITCHENAID' : p;
    }
    // Main categories
    else if (['Laundry', 'Cooking', 'Dishwashers', 'Food Preservation', 'Freezers'].includes(p)) {
      category = p;
    }
    // Subcategories
    else if (['Washer', 'Dryer', 'Range', 'Cooktop', 'Wall Oven', 'Microwave', 'Refrigerator', 'Dishwasher', 'Freezer', 'Hood'].includes(p)) {
      subcategory = p;
    }
    // Type (more specific)
    else if (p.match(/Top Load|Front Load|Built-In|Freestanding|Side-by-Side|French Door|Electric|Gas|Induction/i)) {
      if (type) type += ' ' + p;
      else type = p;
    }
    // Colour
    else if (p.match(/(White|Black|Stainless|Slate|Chrome|Silver|Steel|Metallic|Volcano)/i)) {
      colour = p;
    }
  });

  if (model) {
    wsData.push([
      category,
      subcategory,
      type,
      brand,
      model,
      cost || '',
      msrp || '',
      colour
    ]);
  }
});

console.log('\nProducts extracted:', wsData.length - 1);

// Show sample
console.log('\nSample products:');
wsData.slice(1, 16).forEach(row => {
  console.log(`  ${row[4]} (${row[3]}): Cost=$${row[5]}, MSRP=$${row[6]} - ${row[7]}`);
});

// Create Excel workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(wsData);

// Set column widths
ws['!cols'] = [
  { wch: 18 },  // Main Category
  { wch: 15 },  // Subcategory
  { wch: 25 },  // Type
  { wch: 12 },  // Brand
  { wch: 15 },  // Model
  { wch: 12 },  // Cost
  { wch: 12 },  // MSRP
  { wch: 25 }   // Colour
];

XLSX.utils.book_append_sheet(wb, ws, 'Products');
XLSX.writeFile(wb, outputPath);

console.log(`\n✅ Excel file saved to: ${outputPath}`);
console.log(`   Total products: ${wsData.length - 1}`);
