const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./quotation.db');

console.log('Testing direct insert...');

db.run(
  `INSERT INTO products (manufacturer, model, description, category, price, created_at) 
   VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ['Samsung', 'RF28T5001SR', 'Test Refrigerator', 'Refrigeration', 1899.99],
  function(err) {
    if (err) {
      console.error('❌ Insert failed:', err.message);
    } else {
      console.log('✅ Insert successful! ID:', this.lastID);
      
      // Now check count
      db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
        if (err) {
          console.error('Error:', err);
        } else {
          console.log(`Total products in database: ${row.count}`);
        }
        db.close();
      });
    }
  }
);