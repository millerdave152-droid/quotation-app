const XLSX = require('xlsx');

// Read your file
const workbook = XLSX.readFile('20251029_131811_Samsung_June_26_to_Sept_25_2025_WPEDS_20251028_152011.csv');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log(`Converting ${data.length} rows...`);

// Convert to standard format
const converted = data.map(row => ({
  manufacturer: row.MANUFACTURER || '',
  model: row.MODEL || row.HANDLE || '',
  description: row.DESCRIPTION || '',
  category: row.CATEGORY || '',
  price: parseFloat(row.ACTUAL_COST || row.PRICE_ITEM || 0)
}));

// Remove rows with no price
const valid = converted.filter(row => row.price > 0);

console.log(`Valid rows: ${valid.length}`);

// Write new file
const newWorkbook = XLSX.utils.book_new();
const newSheet = XLSX.utils.json_to_sheet(valid);
XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Products');
XLSX.writeFile(newWorkbook, 'samsung_converted.csv');

console.log('✅ Converted file saved as samsung_converted.csv');