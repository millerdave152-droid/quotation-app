-- ============================================================================
-- CORRECTED DATABASE MIGRATION FOR YOUR SCHEMA
-- ============================================================================

-- Add new columns to existing products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS import_source VARCHAR(255),
ADD COLUMN IF NOT EXISTS import_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_price_change_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_price_change_amount BIGINT,
ADD COLUMN IF NOT EXISTS import_file_name VARCHAR(500);

-- Create price_history table (using cost_cents to match your schema)
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    old_price_cents BIGINT,
    new_price_cents BIGINT,
    price_change_cents BIGINT,
    price_change_percent DECIMAL(10, 2),
    change_type VARCHAR(50),
    old_msrp_cents BIGINT,
    new_msrp_cents BIGINT,
    change_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    import_source VARCHAR(255),
    import_file_name VARCHAR(500),
    notes TEXT
);

-- Create import_logs table
CREATE TABLE IF NOT EXISTS import_logs (
    id SERIAL PRIMARY KEY,
    import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    import_source VARCHAR(255),
    file_name VARCHAR(500),
    file_path TEXT,
    status VARCHAR(50),
    products_processed INTEGER DEFAULT 0,
    products_added INTEGER DEFAULT 0,
    products_updated INTEGER DEFAULT 0,
    products_failed INTEGER DEFAULT 0,
    price_changes_detected INTEGER DEFAULT 0,
    processing_time_seconds DECIMAL(10, 2),
    error_message TEXT,
    error_details JSONB,
    summary JSONB,
    created_by VARCHAR(255) DEFAULT 'system'
);

-- Create import_errors table
CREATE TABLE IF NOT EXISTS import_errors (
    id SERIAL PRIMARY KEY,
    import_log_id INTEGER REFERENCES import_logs(id) ON DELETE CASCADE,
    error_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    row_number INTEGER,
    product_model VARCHAR(255),
    error_type VARCHAR(100),
    error_message TEXT,
    raw_data JSONB
);

-- Create sync_status table
CREATE TABLE IF NOT EXISTS sync_status (
    id SERIAL PRIMARY KEY,
    last_sync_date TIMESTAMP,
    last_sync_status VARCHAR(50),
    last_sync_file VARCHAR(500),
    next_scheduled_sync TIMESTAMP,
    sync_enabled BOOLEAN DEFAULT true,
    sync_interval_minutes INTEGER DEFAULT 15,
    watched_folder TEXT,
    last_error TEXT,
    sync_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial sync status
INSERT INTO sync_status (
    last_sync_date,
    last_sync_status,
    sync_enabled,
    sync_interval_minutes,
    watched_folder
) 
SELECT 
    NULL,
    'not_started',
    true,
    15,
    'C:\Users\WD-PC1\OneDrive\Desktop\Appliance Cost\cleaned_data'
WHERE NOT EXISTS (SELECT 1 FROM sync_status LIMIT 1);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(manufacturer);
CREATE INDEX IF NOT EXISTS idx_products_model ON products(model);
CREATE INDEX IF NOT EXISTS idx_products_import_date ON products(import_date);
CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_change_date ON price_history(change_date);
CREATE INDEX IF NOT EXISTS idx_price_history_manufacturer_model ON price_history(manufacturer, model);
CREATE INDEX IF NOT EXISTS idx_import_logs_import_date ON import_logs(import_date);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);

-- Create view for recent price changes (using cost_cents)
CREATE OR REPLACE VIEW recent_price_changes AS
SELECT 
    ph.*,
    p.description,
    p.category,
    p.cost_cents as current_cost_cents,
    p.msrp_cents as current_msrp_cents
FROM price_history ph
LEFT JOIN products p ON ph.product_id = p.id
WHERE ph.change_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY ph.change_date DESC;

-- Create view for import statistics
CREATE OR REPLACE VIEW import_statistics AS
SELECT 
    DATE(import_date) as import_day,
    COUNT(*) as total_imports,
    SUM(products_processed) as total_products_processed,
    SUM(products_added) as total_products_added,
    SUM(products_updated) as total_products_updated,
    SUM(products_failed) as total_products_failed,
    SUM(price_changes_detected) as total_price_changes,
    AVG(processing_time_seconds) as avg_processing_time,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_imports,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_imports
FROM import_logs
GROUP BY DATE(import_date)
ORDER BY import_day DESC;

-- Verification queries
SELECT 'Migration completed!' as status;

SELECT COUNT(*) as new_tables_created
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('price_history', 'import_logs', 'import_errors', 'sync_status');

SELECT COUNT(*) as new_columns_added
FROM information_schema.columns 
WHERE table_name = 'products' 
    AND column_name IN ('import_source', 'import_date', 'last_price_change_date', 'last_price_change_amount', 'import_file_name');