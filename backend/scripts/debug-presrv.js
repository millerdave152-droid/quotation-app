/**
 * Debug Presrv Excel file to check column names and sample data
 */
const XLSX = require('xlsx');

const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/20250415_Presrv_National Price List_May 20, 2025.xlsx';
const workbook = XLSX.readFile(path);

console.log('Sheets:', workbook.SheetNames);

// Check first sheet
const sheetName = workbook.SheetNames[0];
console.log('\nUsing sheet:', sheetName);

const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

console.log('\nFirst 15 rows:');
for (let i = 0; i < Math.min(15, data.length); i++) {
  const row = data[i].slice(0, 12);
  const nonEmpty = row.filter(c => c !== '').length;
  if (nonEmpty > 0) {
    console.log(`Row ${i + 1}:`, row);
  }
}

// Find header row
let headerRowIdx = -1;
for (let i = 0; i < Math.min(20, data.length); i++) {
  const row = data[i];
  const rowStr = row.join(' ').toUpperCase();
  if (rowStr.includes('MODEL') || rowStr.includes('SKU') || rowStr.includes('ITEM') || rowStr.includes('DEALER') || rowStr.includes('COST')) {
    headerRowIdx = i;
    console.log('\n--- Potential header row at row', i + 1, '---');
    const headers = row.filter(h => h !== '');
    headers.forEach((h, idx) => console.log(`  [${idx}] "${h}"`));
  }
}

console.log('\nTotal rows:', data.length);
