-- QUOTATIONS TABLES SETUP

-- Create quotations table
CREATE TABLE IF NOT EXISTS quotations (
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
);

-- Create quotation_items table
CREATE TABLE IF NOT EXISTS quotation_items (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON quotations(created_at);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_product_id ON quotation_items(product_id);

-- Create view for quotation summary
CREATE OR REPLACE VIEW quotation_summary AS
SELECT 
    q.id,
    q.quotation_number,
    q.customer_name,
    q.customer_email,
    q.status,
    q.total_amount,
    q.created_at,
    COUNT(qi.id) as item_count,
    STRING_AGG(DISTINCT p.manufacturer, ', ') as manufacturers
FROM quotations q
LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
LEFT JOIN products p ON qi.product_id = p.id
GROUP BY q.id, q.quotation_number, q.customer_name, q.customer_email, q.status, q.total_amount, q.created_at;