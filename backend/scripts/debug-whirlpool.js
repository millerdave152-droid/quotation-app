/**
 * Debug Whirlpool Excel file to check column names and sample data
 */
const XLSX = require('xlsx');

const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Independent December Boxing Week 2025 - All Brands.xlsx';
const workbook = XLSX.readFile(path);

// Check first sheet
const sheetName = workbook.SheetNames[0]; // WHR
console.log('Sheet:', sheetName);

const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

// Headers at row 5 (index 4)
const headers = data[4];
console.log('\nAll headers:');
headers.forEach((h, i) => console.log(`  [${i}] "${h}"`));

// Find specific columns
console.log('\n--- Column Search ---');
console.log('40+ UNITS index:', headers.indexOf('40+ UNITS'));
console.log('SELL THROUGH index:', headers.indexOf('SELL THROUGH'));

// Check for similar names
console.log('\n--- Similar column names ---');
headers.forEach((h, i) => {
  if (h && (h.includes('40') || h.includes('UNIT') || h.includes('SELL') || h.includes('THRU'))) {
    console.log(`  [${i}] "${h}"`);
  }
});

// Show sample data row
console.log('\n--- Sample data (first product row) ---');
const firstRow = data[5]; // Row 6 in Excel
headers.forEach((h, i) => {
  if (firstRow[i] !== '' && firstRow[i] !== undefined) {
    console.log(`  ${h}: ${firstRow[i]}`);
  }
});
