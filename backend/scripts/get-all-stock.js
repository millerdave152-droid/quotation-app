const XLSX = require('xlsx');

const stockPath = 'C:\\Users\\davem\\OneDrive\\Desktop\\stock for bb.xlsx';
const stockWb = XLSX.readFile(stockPath);
const stockSheet = stockWb.Sheets[stockWb.SheetNames[0]];
const stockData = XLSX.utils.sheet_to_json(stockSheet, { header: 1 });

// Get Samsung products
console.log('=== ALL SAMSUNG PRODUCTS ===\n');
const samsungProducts = [];
for (let i = 1; i < stockData.length; i++) {
  const row = stockData[i];
  const brand = (row[0] || '').toString().toUpperCase();
  if (brand === 'SAMSUNG' || brand === 'SANSUNG') {
    samsungProducts.push({
      brand: 'SAMSUNG',
      product: row[1],
      model: row[2],
      qty: row[3] || 0
    });
  }
}

// Group by product type
const byType = {};
samsungProducts.forEach(p => {
  const type = (p.product || 'UNKNOWN').toUpperCase();
  if (!byType[type]) byType[type] = [];
  byType[type].push(p);
});

console.log('Product Types:');
Object.entries(byType).sort((a,b) => b[1].length - a[1].length).forEach(([type, products]) => {
  console.log(`\n${type}: ${products.length} products`);
  products.slice(0, 5).forEach(p => {
    console.log(`  - ${p.model} (Qty: ${p.qty})`);
  });
  if (products.length > 5) console.log(`  ... and ${products.length - 5} more`);
});

console.log('\n\nTotal Samsung products:', samsungProducts.length);

// Output all models for research
console.log('\n=== ALL SAMSUNG MODELS FOR RESEARCH ===');
const uniqueModels = [...new Set(samsungProducts.map(p => p.model))].filter(m => m);
console.log(JSON.stringify(uniqueModels.slice(0, 50), null, 2));
