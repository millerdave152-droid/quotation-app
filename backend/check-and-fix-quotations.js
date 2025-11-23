const { Pool } = require('pg');

const pool = new Pool({
    host: 'quotation-db.ccrqkqs0m6eu.us-east-1.rds.amazonaws.com',
    database: 'quotationapp',
    user: 'dbadmin',
    password: 'QuotationPass123!',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function checkAndFixQuotations() {
    try {
        console.log('\n=== CHECKING EXISTING TABLES ===\n');
        
        // Check if quotations table exists
        const tableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'quotations'
        `);
        
        if (tableCheck.rows.length > 0) {
            console.log('⚠️  Quotations table already exists');
            
            // Check its structure
            const columns = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'quotations'
                ORDER BY ordinal_position
            `);
            
            console.log('\nCurrent columns:');
            columns.rows.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type}`);
            });
            
            console.log('\n=== DROPPING AND RECREATING TABLES ===\n');
            
            // Drop existing tables
            await pool.query('DROP TABLE IF EXISTS quotation_items CASCADE');
            await pool.query('DROP TABLE IF EXISTS quotations CASCADE');
            console.log('✓ Dropped old tables');
        }
        
        console.log('\n=== CREATING NEW TABLES ===\n');
        
        // Create quotations table
        await pool.query(`
            CREATE TABLE quotations (
                id SERIAL PRIMARY KEY,
                quotation_number VARCHAR(50) UNIQUE NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                status VARCHAR(50) DEFAULT 'draft',
                total_amount NUMERIC(10, 2) DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created quotations table');
        
        // Create quotation_items table
        await pool.query(`
            CREATE TABLE quotation_items (
                id SERIAL PRIMARY KEY,
                quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id),
                quantity INTEGER NOT NULL DEFAULT 1,
                unit_price NUMERIC(10, 2) NOT NULL,
                total_price NUMERIC(10, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created quotation_items table');
        
        // Create indexes
        await pool.query('CREATE INDEX idx_quotations_status ON quotations(status)');
        await pool.query('CREATE INDEX idx_quotations_created_at ON quotations(created_at)');
        await pool.query('CREATE INDEX idx_quotation_items_quotation_id ON quotation_items(quotation_id)');
        await pool.query('CREATE INDEX idx_quotation_items_product_id ON quotation_items(product_id)');
        console.log('✅ Created indexes');
        
        console.log('\n=== SETUP COMPLETE ===\n');
        console.log('✅ Quotations system is ready!');
        console.log('\nYou can now:');
        console.log('1. Add quotations route to server.js');
        console.log('2. Restart your backend server');
        console.log('3. Test at http://localhost:3001/api/quotations\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await pool.end();
    }
}

checkAndFixQuotations();