const { Pool } = require('pg');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function updateCustomersTable() {
    try {
        console.log('\n=== UPDATING CUSTOMERS TABLE ===\n');

        // Add missing columns if they don't exist
        console.log('Adding company column...');
        await pool.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS company VARCHAR(255)
        `);
        console.log('✅ Added company column');

        console.log('Adding city column...');
        await pool.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS city VARCHAR(100)
        `);
        console.log('✅ Added city column');

        console.log('Adding province column...');
        await pool.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS province VARCHAR(100)
        `);
        console.log('✅ Added province column');

        console.log('Adding postal_code column...');
        await pool.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)
        `);
        console.log('✅ Added postal_code column');

        // Create additional indexes for better search performance
        console.log('\nCreating additional indexes...');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_customers_province ON customers(province)');
        console.log('✅ Created additional indexes');

        // Verify table structure
        console.log('\nVerifying table structure...');
        const result = await pool.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'customers'
            ORDER BY ordinal_position
        `);

        console.log('\n📋 Current customers table structure:');
        result.rows.forEach(col => {
            const maxLength = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
            console.log(`  - ${col.column_name}: ${col.data_type}${maxLength}`);
        });

        console.log('\n=== UPDATE COMPLETE ===\n');
        console.log('✅ Customers table is now ready with all required fields!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

updateCustomersTable();
