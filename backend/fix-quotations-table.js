const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./quotation.db');

console.log('🔧 Fixing quotations table...');

db.serialize(() => {
  // Drop existing tables
  db.run('DROP TABLE IF EXISTS quotation_items', (err) => {
    if (err) console.error('Error dropping quotation_items:', err);
    else console.log('✓ Dropped quotation_items table');
  });

  db.run('DROP TABLE IF EXISTS quotations', (err) => {
    if (err) console.error('Error dropping quotations:', err);
    else console.log('✓ Dropped quotations table');
  });

  // Recreate quotations table with all columns
  db.run(`
    CREATE TABLE quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT UNIQUE,
      customer_id INTEGER,
      customer_name TEXT,
      customer_email TEXT,
      status TEXT DEFAULT 'DRAFT',
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      gross_profit REAL DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating quotations table:', err);
    } else {
      console.log('✅ Quotations table created!');
    }
  });

  // Recreate quotation_items table
  db.run(`
    CREATE TABLE quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER,
      product_id INTEGER,
      manufacturer TEXT,
      model TEXT,
      description TEXT,
      category TEXT,
      quantity INTEGER DEFAULT 1,
      cost REAL DEFAULT 0,
      msrp REAL DEFAULT 0,
      sell_price REAL DEFAULT 0,
      margin_percent REAL DEFAULT 0,
      line_total REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating quotation_items table:', err);
    } else {
      console.log('✅ Quotation items table created!');
      db.close(() => {
        console.log('\n🎉 Tables fixed!');
        console.log('Now restart your server: node server.js');
      });
    }
  });
});