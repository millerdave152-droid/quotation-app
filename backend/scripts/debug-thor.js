/**
 * Debug Thor Excel file to check column names and sample data
 */
const XLSX = require('xlsx');

const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/Thor Thanksgiving Promo Oct 5-15 2025.xlsx';
const workbook = XLSX.readFile(path);

console.log('Sheets:', workbook.SheetNames);

// Check first sheet
const sheetName = workbook.SheetNames[0];
console.log('\nUsing sheet:', sheetName);

const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

console.log('\nFirst 10 rows:');
for (let i = 0; i < Math.min(10, data.length); i++) {
  const row = data[i].slice(0, 10); // First 10 columns
  console.log(`Row ${i + 1}:`, row);
}

// Find header row (look for MODEL or SKU)
let headerRowIdx = -1;
for (let i = 0; i < Math.min(15, data.length); i++) {
  const row = data[i];
  const rowStr = row.join(' ').toUpperCase();
  if (rowStr.includes('MODEL') || rowStr.includes('SKU') || rowStr.includes('ITEM')) {
    headerRowIdx = i;
    break;
  }
}

if (headerRowIdx >= 0) {
  console.log('\n--- Header row found at row', headerRowIdx + 1, '---');
  const headers = data[headerRowIdx];
  headers.forEach((h, i) => {
    if (h) console.log(`  [${i}] "${h}"`);
  });

  // Show sample data
  if (data.length > headerRowIdx + 1) {
    console.log('\n--- Sample data (first product) ---');
    const firstRow = data[headerRowIdx + 1];
    headers.forEach((h, i) => {
      if (h && firstRow[i] !== '' && firstRow[i] !== undefined) {
        console.log(`  ${h}: ${firstRow[i]}`);
      }
    });
  }
} else {
  console.log('\nNo header row found. Showing all rows:');
  data.slice(0, 15).forEach((row, i) => {
    console.log(`Row ${i + 1}:`, row.filter(c => c !== ''));
  });
}

console.log('\nTotal rows:', data.length);
