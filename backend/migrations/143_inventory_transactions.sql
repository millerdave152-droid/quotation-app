-- ============================================================================
-- Create inventory_transactions table
-- The original migration 006 defined this table but it was never applied.
-- Multiple services (InventorySyncService, HubReturnService, PhysicalCountService,
-- PurchaseOrderService, hub-exchanges) INSERT into and SELECT from this table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    transaction_id UUID DEFAULT gen_random_uuid() UNIQUE,

    -- What product
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER REFERENCES locations(id),

    -- Transaction details (VARCHAR instead of enum for flexibility)
    transaction_type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,

    -- Before/after for audit
    qty_before INTEGER NOT NULL DEFAULT 0,
    qty_after INTEGER NOT NULL DEFAULT 0,
    reserved_before INTEGER DEFAULT 0,
    reserved_after INTEGER DEFAULT 0,

    -- Cost tracking
    unit_cost_cents INTEGER,
    total_cost_cents INTEGER,

    -- Reference to source document
    reference_type VARCHAR(50),
    reference_id INTEGER,
    reference_number VARCHAR(50),

    -- For reservations
    reservation_id INTEGER,

    -- Reason/notes
    reason VARCHAR(255),
    notes TEXT,

    -- Metadata
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- For reversals
    reversed_by_id INTEGER,
    reversal_of_id INTEGER,

    -- Multi-tenancy
    tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000000'
);

CREATE INDEX IF NOT EXISTS idx_inv_trans_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_trans_reference ON inventory_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_date ON inventory_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_trans_reservation ON inventory_transactions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_tenant ON inventory_transactions(tenant_id);
