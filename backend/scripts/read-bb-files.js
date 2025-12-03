const XLSX = require('xlsx');
const path = require('path');

// File paths
const stockPath = 'C:\\Users\\davem\\OneDrive\\Desktop\\stock for bb.xlsx';
const bbTemplatePath = 'C:\\Users\\davem\\OneDrive\\Desktop\\products-and-offers-en_US-20251127140200.xlsx';

console.log('='.repeat(60));
console.log('READING STOCK FILE');
console.log('='.repeat(60));

try {
  const stockWb = XLSX.readFile(stockPath);
  console.log('Sheets:', stockWb.SheetNames);
  const stockSheet = stockWb.Sheets[stockWb.SheetNames[0]];
  const stockData = XLSX.utils.sheet_to_json(stockSheet, { header: 1 });
  console.log('Total rows:', stockData.length);
  console.log('\nHeaders:', JSON.stringify(stockData[0]));
  console.log('\nFirst 20 products:');
  for (let i = 1; i < Math.min(21, stockData.length); i++) {
    console.log(`${i}: ${JSON.stringify(stockData[i])}`);
  }

  // Count by brand
  console.log('\n--- BRAND SUMMARY ---');
  const brands = {};
  for (let i = 1; i < stockData.length; i++) {
    const brand = stockData[i][0] || 'UNKNOWN';
    brands[brand] = (brands[brand] || 0) + 1;
  }
  Object.entries(brands).sort((a,b) => b[1] - a[1]).forEach(([brand, count]) => {
    console.log(`${brand}: ${count}`);
  });

} catch (err) {
  console.error('Error reading stock file:', err.message);
}

console.log('\n' + '='.repeat(60));
console.log('READING BEST BUY TEMPLATE');
console.log('='.repeat(60));

try {
  const bbWb = XLSX.readFile(bbTemplatePath);
  console.log('Sheets:', bbWb.SheetNames);
  const bbSheet = bbWb.Sheets[bbWb.SheetNames[0]];
  const bbData = XLSX.utils.sheet_to_json(bbSheet, { header: 1 });
  console.log('Total rows:', bbData.length);

  if (bbData[0]) {
    console.log('\nAll columns in template:');
    bbData[0].forEach((col, i) => {
      console.log(`${i}: ${col}`);
    });
  }

  // Show sample data if exists
  if (bbData.length > 1) {
    console.log('\nSample data row:');
    console.log(JSON.stringify(bbData[1], null, 2));
  }

} catch (err) {
  console.error('Error reading BB template:', err.message);
}
