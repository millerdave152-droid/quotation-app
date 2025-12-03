const XLSX = require('xlsx');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.log('Usage: node analyze-excel.js <file-path>');
  process.exit(1);
}

const workbook = XLSX.readFile(filePath);
console.log('Sheet names:', workbook.SheetNames);

const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

console.log('\nTotal rows:', data.length);
console.log('\nFirst 15 rows:');
for (let i = 0; i < Math.min(15, data.length); i++) {
  const row = data[i];
  if (row && row.some(cell => cell !== null)) {
    console.log(`Row ${i}:`, JSON.stringify(row.slice(0, 16)));
  } else {
    console.log(`Row ${i}: [empty]`);
  }
}
