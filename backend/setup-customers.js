const { Pool } = require('pg');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function setupCustomers() {
    try {
        console.log('\n=== SETTING UP CUSTOMERS TABLE ===\n');
        
        // Create customers table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                address TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created customers table');
        
        // Create indexes
        await pool.query('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)');
        console.log('✅ Created indexes');
        
        console.log('\n=== SETUP COMPLETE ===\n');
        console.log('Customers API is now ready!');
        console.log('\nAvailable endpoints:');
        console.log('  GET    /api/customers     - List all customers');
        console.log('  GET    /api/customers/:id - Get single customer');
        console.log('  POST   /api/customers     - Create new customer');
        console.log('  PUT    /api/customers/:id - Update customer');
        console.log('  DELETE /api/customers/:id - Delete customer\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

setupCustomers();