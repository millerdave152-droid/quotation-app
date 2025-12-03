const XLSX = require('xlsx');

const filePath = 'C:\\Users\\davem\\OneDrive\\Desktop\\Independent November Black Friday 2025 - All Brands whirlpool group.xlsx';

console.log('='.repeat(70));
console.log('READING WHIRLPOOL GROUP PRICELIST');
console.log('='.repeat(70));

try {
  const wb = XLSX.readFile(filePath);
  console.log('Sheets found:', wb.SheetNames);

  // Process each sheet
  wb.SheetNames.forEach(sheetName => {
    console.log('\n' + '='.repeat(70));
    console.log(`SHEET: ${sheetName}`);
    console.log('='.repeat(70));

    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`Total rows: ${data.length}`);

    // Find header row (look for row with 'Model' or 'UPC' or 'SKU')
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (row && row.length > 0) {
        const rowStr = JSON.stringify(row).toUpperCase();
        if (rowStr.includes('MODEL') || rowStr.includes('UPC') || rowStr.includes('SKU') || rowStr.includes('BRAND')) {
          headerRowIndex = i;
          break;
        }
      }
    }

    if (headerRowIndex >= 0) {
      console.log(`\nHeader row (index ${headerRowIndex}):`);
      const headers = data[headerRowIndex];
      headers.forEach((h, i) => {
        if (h) console.log(`  [${i}] ${h}`);
      });

      // Show sample data rows
      console.log('\nSample data rows:');
      for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 10, data.length); i++) {
        const row = data[i];
        if (row && row.length > 0 && row.some(cell => cell)) {
          console.log(`Row ${i}: ${JSON.stringify(row.slice(0, 12))}`);
        }
      }
    } else {
      // Just show first 10 rows
      console.log('\nFirst 10 rows:');
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (row && row.length > 0) {
          console.log(`Row ${i}: ${JSON.stringify(row.slice(0, 12))}`);
        }
      }
    }
  });

} catch (err) {
  console.error('Error:', err.message);
}
