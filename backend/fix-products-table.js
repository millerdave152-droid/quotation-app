const { Pool } = require('pg');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixProductsTable() {
    try {
        console.log('Fixing products table...');
        
        // Make 'name' column nullable
        await pool.query('ALTER TABLE products ALTER COLUMN name DROP NOT NULL');
        console.log('✓ Made name column nullable');
        
        // Set default for existing null values
        await pool.query(`UPDATE products SET name = model WHERE name IS NULL`);
        console.log('✓ Set default names for existing products');
        
        console.log('\n✅ Products table fixed successfully!');
        console.log('You can now import CSV files.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

fixProductsTable();