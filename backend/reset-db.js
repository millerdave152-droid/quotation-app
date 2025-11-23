const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Delete old database
if (fs.existsSync('./quotation.db')) {
  fs.unlinkSync('./quotation.db');
  console.log('🗑️  Deleted old database');
}

// Create new database
const db = new sqlite3.Database('./quotation.db', (err) => {
  if (err) {
    console.error('❌ Database creation error:', err);
  } else {
    console.log('✅ Database created successfully!');
  }
});

// Create tables
db.serialize(() => {
  console.log('📋 Creating products table...');
  
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacturer TEXT,
      model TEXT,
      description TEXT,
      category TEXT,
      price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ Table creation error:', err);
    } else {
      console.log('✅ Products table created!');
      
      // Insert test data
      console.log('📝 Inserting test products...');
      
      const testProducts = [
        ['Samsung', 'RF28T5001SR', 'French Door Refrigerator', 'Refrigeration', 1899.99],
        ['LG', 'LRFVS3006S', 'Side by Side Refrigerator', 'Refrigeration', 2299.99],
        ['Whirlpool', 'WRS325SDHZ', 'Side by Side Refrigerator', 'Refrigeration', 1599.99]
      ];
      
      const stmt = db.prepare(`
        INSERT INTO products (manufacturer, model, description, category, price, created_at) 
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);
      
      testProducts.forEach(product => {
        stmt.run(product, (err) => {
          if (err) console.error('❌ Insert error:', err);
        });
      });
      
      stmt.finalize(() => {
        // Check count
        db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
          if (err) {
            console.error('❌ Count error:', err);
          } else {
            console.log(`✅ Total products: ${row.count}`);
          }
          db.close(() => {
            console.log('\n🎉 Database reset complete!');
            console.log('Now restart your server: node server.js');
          });
        });
      });
    }
  });
  
  // Create other tables
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      customer_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      status TEXT DEFAULT 'DRAFT',
      total REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      type TEXT,
      subject TEXT,
      body TEXT,
      due_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS price_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      scope TEXT,
      scope_value TEXT,
      target_margin_bp INTEGER,
      priority INTEGER,
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});