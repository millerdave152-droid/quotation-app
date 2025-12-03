const XLSX = require('xlsx');

const stockPath = 'C:\\Users\\davem\\OneDrive\\Desktop\\stock for bb.xlsx';
const stockWb = XLSX.readFile(stockPath);
const stockSheet = stockWb.Sheets[stockWb.SheetNames[0]];
const stockData = XLSX.utils.sheet_to_json(stockSheet, { header: 1 });

console.log('=== SAMSUNG PRODUCTS (First 20) ===\n');

let count = 0;
for (let i = 1; i < stockData.length && count < 20; i++) {
  const row = stockData[i];
  const brand = (row[0] || '').toString().toUpperCase();
  if (brand === 'SAMSUNG' || brand === 'SANSUNG') {
    count++;
    console.log(`${count}. Model: ${row[2]}`);
    console.log(`   Product: ${row[1]}`);
    console.log(`   Qty: ${row[3]}`);
    console.log('');
  }
}
