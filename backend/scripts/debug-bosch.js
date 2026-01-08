/**
 * Debug Bosch Excel file to check column names and sample data
 */
const XLSX = require('xlsx');

const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/BOSCH BCMK MASTERPRICELIST October 31, 2025 INDEPENDENTS (3).xlsx';
const workbook = XLSX.readFile(path);

console.log('Sheets:', workbook.SheetNames);

const sheetName = workbook.SheetNames[0];
console.log('\nUsing sheet:', sheetName);

const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

console.log('\nFirst 20 rows:');
for (let i = 0; i < Math.min(20, data.length); i++) {
  const row = data[i].slice(0, 15);
  const nonEmpty = row.filter(c => c !== '').length;
  if (nonEmpty > 0) {
    console.log(`Row ${i + 1}:`, row);
  }
}

// Find header row
for (let i = 0; i < Math.min(25, data.length); i++) {
  const row = data[i];
  const rowStr = row.join(' ').toUpperCase();
  if (rowStr.includes('MODEL') || rowStr.includes('SKU') || rowStr.includes('DEALER') || rowStr.includes('COST') || rowStr.includes('MSRP')) {
    console.log('\n--- Potential header row at row', i + 1, '---');
    row.forEach((h, idx) => {
      if (h) console.log(`  [${idx}] "${h}"`);
    });
  }
}

console.log('\nTotal rows:', data.length);
