const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./quotation.db');

console.log('Adding test customers...');

const customers = [
  ['John Doe', 'john@example.com', '416-555-0101', 'ABC Construction', 'Builder'],
  ['Jane Smith', 'jane@example.com', '416-555-0102', 'Smith Enterprises', 'Wholesale'],
  ['Bob Johnson', 'bob@example.com', '416-555-0103', null, 'Retail'],
  ['Sarah Williams', 'sarah@example.com', '416-555-0104', 'Williams LLC', 'Commercial']
];

const stmt = db.prepare(`
  INSERT INTO customers (name, email, phone, company, customer_type)
  VALUES (?, ?, ?, ?, ?)
`);

customers.forEach(customer => {
  stmt.run(customer, (err) => {
    if (err) console.error('Error:', err);
  });
});

stmt.finalize(() => {
  db.get('SELECT COUNT(*) as count FROM customers', [], (err, row) => {
    console.log(`✅ Total customers: ${row.count}`);
    db.close();
  });
});