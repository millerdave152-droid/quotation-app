const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./quotation.db');

console.log('\n📊 Checking quotations...\n');

db.all('SELECT * FROM quotations ORDER BY created_at DESC', [], (err, quotes) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Total quotations: ${quotes.length}\n`);
    
    quotes.forEach((quote, index) => {
      console.log(`${index + 1}. Quote ${quote.quote_number}`);
      console.log(`   Customer: ${quote.customer_name}`);
      console.log(`   Status: ${quote.status}`);
      console.log(`   Total: $${parseFloat(quote.total).toFixed(2)}`);
      console.log(`   Created: ${quote.created_at}`);
      console.log('');
    });
  }
  
  db.all('SELECT * FROM quotation_items', [], (err, items) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log(`Total quotation items: ${items.length}`);
    }
    db.close();
  });
});