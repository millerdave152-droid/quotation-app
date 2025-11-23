const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./quotation.db');

db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Total products in database: ${row.count}`);
  }
  db.close();
});