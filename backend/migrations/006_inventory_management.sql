-- ============================================================================
-- TeleTime - Inventory Management System
-- Syncs inventory between Quotes (soft holds) and POS (hard deductions)
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Types of inventory transactions
CREATE TYPE inventory_transaction_type AS ENUM (
    'receipt',           -- Goods received from supplier
    'adjustment',        -- Manual adjustment (count correction)
    'sale',              -- POS sale (hard deduction)
    'return',            -- Customer return
    'reservation',       -- Quote reservation (soft hold)
    'reservation_release', -- Quote expired/cancelled
    'reservation_convert', -- Quote converted to order
    'transfer_out',      -- Transfer to another location
    'transfer_in',       -- Received from another location
    'damage',            -- Damaged/written off
    'void'               -- Voided transaction restoration
);

-- Reservation status
CREATE TYPE reservation_status AS ENUM (
    'active',            -- Currently held
    'expired',           -- Quote expired, inventory released
    'converted',         -- Converted to sale
    'cancelled',         -- Manually cancelled
    'partial'            -- Partially fulfilled
);

-- ============================================================================
-- INVENTORY LOCATIONS (for multi-location support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_locations (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Default location
INSERT INTO inventory_locations (code, name, is_default)
VALUES ('MAIN', 'Main Warehouse', TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- PRODUCT INVENTORY (Current Stock Levels)
-- ============================================================================

-- Add inventory fields to products if not exists
ALTER TABLE products
ADD COLUMN IF NOT EXISTS qty_on_hand INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qty_reserved INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qty_available INTEGER GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reorder_qty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_stock_count_date DATE,
ADD COLUMN IF NOT EXISTS last_received_date DATE,
ADD COLUMN IF NOT EXISTS allow_backorder BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN DEFAULT TRUE;

-- Index for low stock queries
CREATE INDEX IF NOT EXISTS idx_products_low_stock
ON products(qty_available) WHERE track_inventory = TRUE;

-- ============================================================================
-- INVENTORY BY LOCATION (for multi-location)
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_inventory_locations (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
    qty_on_hand INTEGER DEFAULT 0,
    qty_reserved INTEGER DEFAULT 0,
    bin_location VARCHAR(50),
    last_count_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_product_location UNIQUE (product_id, location_id),
    CONSTRAINT non_negative_qty CHECK (qty_on_hand >= 0),
    CONSTRAINT valid_reserved CHECK (qty_reserved >= 0 AND qty_reserved <= qty_on_hand)
);

CREATE INDEX idx_inventory_location_product ON product_inventory_locations(product_id);
CREATE INDEX idx_inventory_location_location ON product_inventory_locations(location_id);

-- ============================================================================
-- INVENTORY TRANSACTIONS (Audit Log)
-- ============================================================================

CREATE TABLE inventory_transactions (
    id SERIAL PRIMARY KEY,
    transaction_id UUID DEFAULT gen_random_uuid() UNIQUE,

    -- What product
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER REFERENCES inventory_locations(id),

    -- Transaction details
    transaction_type inventory_transaction_type NOT NULL,
    quantity INTEGER NOT NULL,  -- Positive for additions, negative for deductions

    -- Before/after for audit
    qty_before INTEGER NOT NULL,
    qty_after INTEGER NOT NULL,
    reserved_before INTEGER DEFAULT 0,
    reserved_after INTEGER DEFAULT 0,

    -- Cost tracking
    unit_cost_cents INTEGER,
    total_cost_cents INTEGER,

    -- Reference to source document
    reference_type VARCHAR(50),  -- 'quote', 'order', 'pos_transaction', 'adjustment', 'receipt'
    reference_id INTEGER,
    reference_number VARCHAR(50),  -- Human-readable reference

    -- For reservations
    reservation_id INTEGER,  -- Links to inventory_reservations

    -- Reason/notes
    reason VARCHAR(255),
    notes TEXT,

    -- Metadata
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- For reversals
    reversed_by_id INTEGER REFERENCES inventory_transactions(id),
    reversal_of_id INTEGER REFERENCES inventory_transactions(id)
);

CREATE INDEX idx_inv_trans_product ON inventory_transactions(product_id);
CREATE INDEX idx_inv_trans_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_inv_trans_reference ON inventory_transactions(reference_type, reference_id);
CREATE INDEX idx_inv_trans_date ON inventory_transactions(created_at);
CREATE INDEX idx_inv_trans_reservation ON inventory_transactions(reservation_id);

-- ============================================================================
-- INVENTORY RESERVATIONS (Soft Holds for Quotes)
-- ============================================================================

CREATE TABLE inventory_reservations (
    id SERIAL PRIMARY KEY,
    reservation_number VARCHAR(50) UNIQUE,

    -- What's being reserved
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER REFERENCES inventory_locations(id),
    quantity INTEGER NOT NULL,
    quantity_fulfilled INTEGER DEFAULT 0,

    -- Source
    quote_id INTEGER,  -- Can reference quotations table
    quote_item_id INTEGER,
    order_id INTEGER,
    customer_id INTEGER REFERENCES customers(id),

    -- Status and timing
    status reservation_status DEFAULT 'active',
    reserved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,  -- When reservation auto-releases
    released_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,

    -- Who/why
    reserved_by INTEGER REFERENCES users(id),
    released_by INTEGER REFERENCES users(id),
    release_reason VARCHAR(255),
    notes TEXT,

    -- Priority (higher = more important)
    priority INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT positive_quantity CHECK (quantity > 0),
    CONSTRAINT valid_fulfilled CHECK (quantity_fulfilled >= 0 AND quantity_fulfilled <= quantity)
);

CREATE INDEX idx_reservations_product ON inventory_reservations(product_id);
CREATE INDEX idx_reservations_quote ON inventory_reservations(quote_id);
CREATE INDEX idx_reservations_order ON inventory_reservations(order_id);
CREATE INDEX idx_reservations_status ON inventory_reservations(status);
CREATE INDEX idx_reservations_expires ON inventory_reservations(expires_at) WHERE status = 'active';

-- ============================================================================
-- FUNCTIONS: Reservation Number Generator
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_reservation_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_date_part VARCHAR(8);
    v_seq INTEGER;
    v_number VARCHAR(50);
BEGIN
    v_date_part := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(reservation_number FROM 'RES-\d{8}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO v_seq
    FROM inventory_reservations
    WHERE reservation_number LIKE 'RES-' || v_date_part || '-%';

    v_number := 'RES-' || v_date_part || '-' || LPAD(v_seq::TEXT, 4, '0');

    RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: Reserve Inventory
-- ============================================================================

CREATE OR REPLACE FUNCTION reserve_inventory(
    p_product_id INTEGER,
    p_quantity INTEGER,
    p_quote_id INTEGER DEFAULT NULL,
    p_quote_item_id INTEGER DEFAULT NULL,
    p_customer_id INTEGER DEFAULT NULL,
    p_expires_hours INTEGER DEFAULT 72,  -- Default 3 days
    p_user_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    reservation_id INTEGER,
    reservation_number VARCHAR(50),
    message TEXT
) AS $$
DECLARE
    v_available INTEGER;
    v_location_id INTEGER;
    v_reservation_id INTEGER;
    v_reservation_number VARCHAR(50);
    v_qty_before INTEGER;
    v_reserved_before INTEGER;
BEGIN
    -- Get location (default if not specified)
    v_location_id := COALESCE(p_location_id, (
        SELECT id FROM inventory_locations WHERE is_default = TRUE LIMIT 1
    ));

    -- Lock the product row to prevent race conditions
    SELECT qty_on_hand, qty_reserved
    INTO v_qty_before, v_reserved_before
    FROM products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::VARCHAR(50), 'Product not found'::TEXT;
        RETURN;
    END IF;

    -- Calculate available
    v_available := v_qty_before - v_reserved_before;

    -- Check availability
    IF p_quantity > v_available THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::VARCHAR(50),
            format('Insufficient inventory. Available: %s, Requested: %s', v_available, p_quantity)::TEXT;
        RETURN;
    END IF;

    -- Generate reservation number
    v_reservation_number := generate_reservation_number();

    -- Create reservation
    INSERT INTO inventory_reservations (
        reservation_number, product_id, location_id, quantity,
        quote_id, quote_item_id, customer_id,
        expires_at, reserved_by, notes
    ) VALUES (
        v_reservation_number, p_product_id, v_location_id, p_quantity,
        p_quote_id, p_quote_item_id, p_customer_id,
        CURRENT_TIMESTAMP + (p_expires_hours || ' hours')::INTERVAL,
        p_user_id, p_notes
    )
    RETURNING id INTO v_reservation_id;

    -- Update product reserved quantity
    UPDATE products
    SET qty_reserved = qty_reserved + p_quantity
    WHERE id = p_product_id;

    -- Log the transaction
    INSERT INTO inventory_transactions (
        product_id, location_id, transaction_type, quantity,
        qty_before, qty_after, reserved_before, reserved_after,
        reference_type, reference_id, reference_number,
        reservation_id, reason, created_by
    ) VALUES (
        p_product_id, v_location_id, 'reservation', p_quantity,
        v_qty_before, v_qty_before, v_reserved_before, v_reserved_before + p_quantity,
        'quote', p_quote_id, v_reservation_number,
        v_reservation_id, 'Quote inventory reservation', p_user_id
    );

    RETURN QUERY SELECT TRUE, v_reservation_id, v_reservation_number, 'Reservation created successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: Release Reservation
-- ============================================================================

CREATE OR REPLACE FUNCTION release_reservation(
    p_reservation_id INTEGER,
    p_reason VARCHAR(255) DEFAULT 'Manual release',
    p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_reservation RECORD;
    v_qty_before INTEGER;
    v_reserved_before INTEGER;
    v_release_qty INTEGER;
BEGIN
    -- Get and lock reservation
    SELECT * INTO v_reservation
    FROM inventory_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Reservation not found'::TEXT;
        RETURN;
    END IF;

    IF v_reservation.status != 'active' THEN
        RETURN QUERY SELECT FALSE, format('Reservation is already %s', v_reservation.status)::TEXT;
        RETURN;
    END IF;

    -- Calculate quantity to release (may be partially fulfilled)
    v_release_qty := v_reservation.quantity - v_reservation.quantity_fulfilled;

    -- Get current product quantities
    SELECT qty_on_hand, qty_reserved
    INTO v_qty_before, v_reserved_before
    FROM products
    WHERE id = v_reservation.product_id
    FOR UPDATE;

    -- Update reservation status
    UPDATE inventory_reservations
    SET
        status = 'cancelled',
        released_at = CURRENT_TIMESTAMP,
        released_by = p_user_id,
        release_reason = p_reason,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_reservation_id;

    -- Release the reserved quantity
    UPDATE products
    SET qty_reserved = GREATEST(0, qty_reserved - v_release_qty)
    WHERE id = v_reservation.product_id;

    -- Log the transaction
    INSERT INTO inventory_transactions (
        product_id, location_id, transaction_type, quantity,
        qty_before, qty_after, reserved_before, reserved_after,
        reference_type, reference_id, reference_number,
        reservation_id, reason, created_by
    ) VALUES (
        v_reservation.product_id, v_reservation.location_id, 'reservation_release', -v_release_qty,
        v_qty_before, v_qty_before, v_reserved_before, GREATEST(0, v_reserved_before - v_release_qty),
        'quote', v_reservation.quote_id, v_reservation.reservation_number,
        p_reservation_id, p_reason, p_user_id
    );

    RETURN QUERY SELECT TRUE, format('Released %s units', v_release_qty)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: Convert Reservation to Sale
-- ============================================================================

CREATE OR REPLACE FUNCTION convert_reservation_to_sale(
    p_reservation_id INTEGER,
    p_order_id INTEGER DEFAULT NULL,
    p_quantity INTEGER DEFAULT NULL,  -- NULL = full quantity
    p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    quantity_converted INTEGER
) AS $$
DECLARE
    v_reservation RECORD;
    v_convert_qty INTEGER;
    v_qty_before INTEGER;
    v_reserved_before INTEGER;
BEGIN
    -- Get and lock reservation
    SELECT * INTO v_reservation
    FROM inventory_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Reservation not found'::TEXT, 0;
        RETURN;
    END IF;

    IF v_reservation.status NOT IN ('active', 'partial') THEN
        RETURN QUERY SELECT FALSE, format('Reservation cannot be converted (status: %s)', v_reservation.status)::TEXT, 0;
        RETURN;
    END IF;

    -- Determine quantity to convert
    v_convert_qty := COALESCE(p_quantity, v_reservation.quantity - v_reservation.quantity_fulfilled);

    IF v_convert_qty > (v_reservation.quantity - v_reservation.quantity_fulfilled) THEN
        RETURN QUERY SELECT FALSE, 'Requested quantity exceeds available reservation'::TEXT, 0;
        RETURN;
    END IF;

    -- Get current product quantities
    SELECT qty_on_hand, qty_reserved
    INTO v_qty_before, v_reserved_before
    FROM products
    WHERE id = v_reservation.product_id
    FOR UPDATE;

    -- Update reservation
    UPDATE inventory_reservations
    SET
        quantity_fulfilled = quantity_fulfilled + v_convert_qty,
        status = CASE
            WHEN quantity_fulfilled + v_convert_qty >= quantity THEN 'converted'
            ELSE 'partial'
        END,
        converted_at = CASE
            WHEN quantity_fulfilled + v_convert_qty >= quantity THEN CURRENT_TIMESTAMP
            ELSE converted_at
        END,
        order_id = COALESCE(p_order_id, order_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_reservation_id;

    -- Deduct from both on-hand and reserved
    UPDATE products
    SET
        qty_on_hand = qty_on_hand - v_convert_qty,
        qty_reserved = GREATEST(0, qty_reserved - v_convert_qty)
    WHERE id = v_reservation.product_id;

    -- Log the conversion
    INSERT INTO inventory_transactions (
        product_id, location_id, transaction_type, quantity,
        qty_before, qty_after, reserved_before, reserved_after,
        reference_type, reference_id, reference_number,
        reservation_id, reason, created_by
    ) VALUES (
        v_reservation.product_id, v_reservation.location_id, 'reservation_convert', -v_convert_qty,
        v_qty_before, v_qty_before - v_convert_qty,
        v_reserved_before, GREATEST(0, v_reserved_before - v_convert_qty),
        'order', p_order_id, v_reservation.reservation_number,
        p_reservation_id, 'Quote converted to order', p_user_id
    );

    RETURN QUERY SELECT TRUE, format('Converted %s units to sale', v_convert_qty)::TEXT, v_convert_qty;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: Direct Sale (POS - no prior reservation)
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_inventory_for_sale(
    p_product_id INTEGER,
    p_quantity INTEGER,
    p_order_id INTEGER DEFAULT NULL,
    p_transaction_id INTEGER DEFAULT NULL,
    p_reference_number VARCHAR(50) DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL,
    p_allow_negative BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    transaction_log_id INTEGER
) AS $$
DECLARE
    v_available INTEGER;
    v_location_id INTEGER;
    v_qty_before INTEGER;
    v_reserved_before INTEGER;
    v_trans_id INTEGER;
    v_track_inventory BOOLEAN;
    v_allow_backorder BOOLEAN;
BEGIN
    -- Get location
    v_location_id := COALESCE(p_location_id, (
        SELECT id FROM inventory_locations WHERE is_default = TRUE LIMIT 1
    ));

    -- Lock and get product info
    SELECT qty_on_hand, qty_reserved, track_inventory, allow_backorder
    INTO v_qty_before, v_reserved_before, v_track_inventory, v_allow_backorder
    FROM products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Product not found'::TEXT, NULL::INTEGER;
        RETURN;
    END IF;

    -- Skip inventory tracking if disabled
    IF NOT v_track_inventory THEN
        RETURN QUERY SELECT TRUE, 'Inventory tracking disabled for this product'::TEXT, NULL::INTEGER;
        RETURN;
    END IF;

    v_available := v_qty_before - v_reserved_before;

    -- Check availability (unless backorder allowed or negative allowed)
    IF p_quantity > v_available AND NOT v_allow_backorder AND NOT p_allow_negative THEN
        RETURN QUERY SELECT FALSE,
            format('Insufficient inventory. Available: %s, Requested: %s', v_available, p_quantity)::TEXT,
            NULL::INTEGER;
        RETURN;
    END IF;

    -- Deduct inventory
    UPDATE products
    SET qty_on_hand = qty_on_hand - p_quantity
    WHERE id = p_product_id;

    -- Log the transaction
    INSERT INTO inventory_transactions (
        product_id, location_id, transaction_type, quantity,
        qty_before, qty_after, reserved_before, reserved_after,
        reference_type, reference_id, reference_number,
        reason, created_by
    ) VALUES (
        p_product_id, v_location_id, 'sale', -p_quantity,
        v_qty_before, v_qty_before - p_quantity, v_reserved_before, v_reserved_before,
        CASE WHEN p_order_id IS NOT NULL THEN 'order' ELSE 'pos_transaction' END,
        COALESCE(p_order_id, p_transaction_id),
        p_reference_number,
        'POS sale', p_user_id
    )
    RETURNING id INTO v_trans_id;

    RETURN QUERY SELECT TRUE, 'Inventory deducted successfully'::TEXT, v_trans_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: Restore Inventory (Void/Cancel/Return)
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_inventory(
    p_product_id INTEGER,
    p_quantity INTEGER,
    p_reason VARCHAR(255),
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id INTEGER DEFAULT NULL,
    p_reference_number VARCHAR(50) DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL,
    p_original_transaction_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    transaction_log_id INTEGER
) AS $$
DECLARE
    v_location_id INTEGER;
    v_qty_before INTEGER;
    v_reserved_before INTEGER;
    v_trans_id INTEGER;
    v_trans_type inventory_transaction_type;
BEGIN
    v_location_id := COALESCE(p_location_id, (
        SELECT id FROM inventory_locations WHERE is_default = TRUE LIMIT 1
    ));

    -- Determine transaction type based on reason
    v_trans_type := CASE
        WHEN p_reason ILIKE '%void%' THEN 'void'
        WHEN p_reason ILIKE '%return%' THEN 'return'
        ELSE 'adjustment'
    END;

    -- Get current quantities
    SELECT qty_on_hand, qty_reserved
    INTO v_qty_before, v_reserved_before
    FROM products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Product not found'::TEXT, NULL::INTEGER;
        RETURN;
    END IF;

    -- Restore inventory
    UPDATE products
    SET qty_on_hand = qty_on_hand + p_quantity
    WHERE id = p_product_id;

    -- Log the transaction
    INSERT INTO inventory_transactions (
        product_id, location_id, transaction_type, quantity,
        qty_before, qty_after, reserved_before, reserved_after,
        reference_type, reference_id, reference_number,
        reason, created_by, reversal_of_id
    ) VALUES (
        p_product_id, v_location_id, v_trans_type, p_quantity,
        v_qty_before, v_qty_before + p_quantity, v_reserved_before, v_reserved_before,
        p_reference_type, p_reference_id, p_reference_number,
        p_reason, p_user_id, p_original_transaction_id
    )
    RETURNING id INTO v_trans_id;

    -- If reversing a previous transaction, mark it
    IF p_original_transaction_id IS NOT NULL THEN
        UPDATE inventory_transactions
        SET reversed_by_id = v_trans_id
        WHERE id = p_original_transaction_id;
    END IF;

    RETURN QUERY SELECT TRUE, format('Restored %s units to inventory', p_quantity)::TEXT, v_trans_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: Adjust Inventory (Manual Count Correction)
-- ============================================================================

CREATE OR REPLACE FUNCTION adjust_inventory(
    p_product_id INTEGER,
    p_new_quantity INTEGER,
    p_reason VARCHAR(255),
    p_user_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    adjustment INTEGER
) AS $$
DECLARE
    v_location_id INTEGER;
    v_qty_before INTEGER;
    v_reserved_before INTEGER;
    v_adjustment INTEGER;
    v_trans_id INTEGER;
BEGIN
    v_location_id := COALESCE(p_location_id, (
        SELECT id FROM inventory_locations WHERE is_default = TRUE LIMIT 1
    ));

    -- Get current quantity
    SELECT qty_on_hand, qty_reserved
    INTO v_qty_before, v_reserved_before
    FROM products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Product not found'::TEXT, 0;
        RETURN;
    END IF;

    v_adjustment := p_new_quantity - v_qty_before;

    IF v_adjustment = 0 THEN
        RETURN QUERY SELECT TRUE, 'No adjustment needed'::TEXT, 0;
        RETURN;
    END IF;

    -- Update inventory
    UPDATE products
    SET
        qty_on_hand = p_new_quantity,
        last_stock_count_date = CURRENT_DATE
    WHERE id = p_product_id;

    -- Log the adjustment
    INSERT INTO inventory_transactions (
        product_id, location_id, transaction_type, quantity,
        qty_before, qty_after, reserved_before, reserved_after,
        reason, notes, created_by
    ) VALUES (
        p_product_id, v_location_id, 'adjustment', v_adjustment,
        v_qty_before, p_new_quantity, v_reserved_before, v_reserved_before,
        p_reason, format('Adjusted from %s to %s', v_qty_before, p_new_quantity),
        p_user_id
    );

    RETURN QUERY SELECT TRUE,
        format('Inventory adjusted by %s (was %s, now %s)', v_adjustment, v_qty_before, p_new_quantity)::TEXT,
        v_adjustment;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-expire Reservations
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_old_reservations()
RETURNS INTEGER AS $$
DECLARE
    v_expired_count INTEGER := 0;
    v_reservation RECORD;
BEGIN
    FOR v_reservation IN
        SELECT id
        FROM inventory_reservations
        WHERE status = 'active'
          AND expires_at < CURRENT_TIMESTAMP
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM release_reservation(
            v_reservation.id,
            'Reservation expired',
            NULL
        );
        v_expired_count := v_expired_count + 1;
    END LOOP;

    RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Current inventory status
CREATE OR REPLACE VIEW inventory_status AS
SELECT
    p.id as product_id,
    p.model,
    p.manufacturer,
    p.name as product_name,
    p.qty_on_hand,
    p.qty_reserved,
    p.qty_available,
    p.reorder_point,
    p.reorder_qty,
    p.track_inventory,
    p.allow_backorder,
    CASE
        WHEN NOT p.track_inventory THEN 'Not Tracked'
        WHEN p.qty_available <= 0 THEN 'Out of Stock'
        WHEN p.qty_available <= p.reorder_point THEN 'Low Stock'
        ELSE 'In Stock'
    END as stock_status,
    p.last_stock_count_date,
    p.last_received_date
FROM products p
WHERE p.track_inventory = TRUE;

-- Active reservations
CREATE OR REPLACE VIEW active_reservations AS
SELECT
    r.*,
    p.model,
    p.manufacturer,
    p.name as product_name,
    c.company_name as customer_name,
    u.name as reserved_by_name,
    r.quantity - r.quantity_fulfilled as remaining_quantity,
    r.expires_at - CURRENT_TIMESTAMP as time_until_expiry
FROM inventory_reservations r
JOIN products p ON r.product_id = p.id
LEFT JOIN customers c ON r.customer_id = c.id
LEFT JOIN users u ON r.reserved_by = u.id
WHERE r.status IN ('active', 'partial');

-- Recent inventory movements
CREATE OR REPLACE VIEW recent_inventory_movements AS
SELECT
    t.id,
    t.transaction_id,
    t.product_id,
    p.model,
    p.manufacturer,
    t.transaction_type,
    t.quantity,
    t.qty_before,
    t.qty_after,
    t.reference_type,
    t.reference_number,
    t.reason,
    t.created_at,
    u.name as created_by_name
FROM inventory_transactions t
JOIN products p ON t.product_id = p.id
LEFT JOIN users u ON t.created_by = u.id
ORDER BY t.created_at DESC;

-- Products needing reorder
CREATE OR REPLACE VIEW products_needing_reorder AS
SELECT
    p.id,
    p.model,
    p.manufacturer,
    p.name,
    p.qty_available,
    p.reorder_point,
    p.reorder_qty,
    p.reorder_point - p.qty_available as qty_below_reorder
FROM products p
WHERE p.track_inventory = TRUE
  AND p.qty_available <= p.reorder_point
  AND p.reorder_qty > 0
ORDER BY qty_below_reorder DESC;
