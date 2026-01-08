/**
 * Extract Vesta PDF to Excel
 */
const fs = require('fs');
const XLSX = require('xlsx');

const textPath = 'C:/Users/WD-PC1/OneDrive/Desktop/price/VESTA_raw_text.txt';
const outputPath = 'C:/Users/WD-PC1/OneDrive/Desktop/price/VESTA_extracted.xlsx';

// Read the raw text file
const rawText = fs.readFileSync(textPath, 'utf8');
const lines = rawText.split('\n').filter(line => line.trim());

console.log('Total lines:', lines.length);

// Parse products
const products = [];
let currentCategory = '';
let currentProductName = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const parts = line.split('\t').map(p => p.trim());

  // Skip header lines
  if (line.includes('Category') && line.includes('Model Number')) continue;
  if (line.includes('Price List') || line.includes('Effictive') || line.includes('Updated')) continue;

  // Check for category line (single word like "Wall Mount", "Island", etc.)
  if (parts.length === 1 && parts[0].match(/^[A-Za-z\s]+$/) && !parts[0].match(/\d/)) {
    // Could be category or product name
    if (['Wall Mount', 'Island', 'Under Cabinet', 'Insert', 'Downdraft', 'Range Hood', 'Accessories'].includes(parts[0])) {
      currentCategory = parts[0];
    } else {
      currentProductName = parts[0];
    }
    continue;
  }

  // Look for product data rows (have model number pattern VRH-*, VIC-*, etc.)
  const hasModel = parts.some(p => p && p.match(/^V[A-Z]{2}-[A-Z]+-\d+[A-Z]{0,2}$/));
  const hasBarcode = parts.some(p => p && p.match(/^\d{12}$/));

  if (hasModel || hasBarcode) {
    // Extract fields
    let size = '';
    let color = '';
    let barcode = '';
    let model = '';
    let msrp = '';
    let wholesale = '';

    parts.forEach(p => {
      if (!p) return;

      // Size (number like 24, 30, 36, 48)
      if (p.match(/^(24|30|36|42|48)$/)) {
        size = p;
      }
      // Barcode (12 digits)
      else if (p.match(/^\d{12}$/)) {
        barcode = p;
      }
      // Model number
      else if (p.match(/^V[A-Z]{2}-[A-Z]+-\d+[A-Z]{0,2}$/)) {
        model = p;
      }
      // Price (number with decimals)
      else if (p.match(/^\d+\.\d{2}$/)) {
        const val = parseFloat(p);
        if (!msrp) msrp = val;
        else if (!wholesale) wholesale = val;
      }
      // Color
      else if (p.match(/(SS|Black SS|Gold SS|Black|White|Stainless)/i)) {
        color = p;
      }
    });

    // If msrp > wholesale, they might be swapped (msrp should be higher)
    if (msrp && wholesale && msrp < wholesale) {
      [msrp, wholesale] = [wholesale, msrp];
    }

    if (model) {
      // Extract product name from model (VRH-BERLIN-30SS -> Berlin)
      const modelParts = model.split('-');
      const derivedName = modelParts.length >= 2 ? modelParts[1].charAt(0) + modelParts[1].slice(1).toLowerCase() : currentProductName;

      products.push({
        category: currentCategory,
        productName: derivedName,
        size,
        color,
        barcode,
        model,
        msrp,
        wholesale
      });
    }
  }
}

console.log('Products extracted:', products.length);

// Show sample
console.log('\nSample products:');
products.slice(0, 15).forEach(p => {
  console.log(`  ${p.model}: ${p.productName} ${p.size}" ${p.color} - Cost=$${p.wholesale}, MSRP=$${p.msrp}`);
});

// Create Excel
const wsData = [['Category', 'Product Name', 'Size', 'Color', 'Barcode', 'Model', 'MSRP', 'Wholesale/Cost']];

products.forEach(p => {
  wsData.push([
    p.category,
    p.productName,
    p.size,
    p.color,
    p.barcode,
    p.model,
    p.msrp,
    p.wholesale
  ]);
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(wsData);

// Set column widths
ws['!cols'] = [
  { wch: 15 },  // Category
  { wch: 15 },  // Product Name
  { wch: 8 },   // Size
  { wch: 12 },  // Color
  { wch: 15 },  // Barcode
  { wch: 25 },  // Model
  { wch: 12 },  // MSRP
  { wch: 15 }   // Wholesale
];

XLSX.utils.book_append_sheet(wb, ws, 'Vesta Products');
XLSX.writeFile(wb, outputPath);

console.log(`\n✅ Excel file saved to: ${outputPath}`);
console.log(`   Total products: ${products.length}`);
