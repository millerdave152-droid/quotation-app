-- ============================================================================
-- Migration 032: Database Integrity Fixes
--
-- Fixes identified by POS Database Health Check:
-- 1. Orphaned quotations referencing deleted customers
-- 2. Null/empty quote_number values
-- 3. Add foreign key constraints where missing
-- 4. Add check constraints for data validity
--
-- NOTE: Index creation is in a separate file (032b_create_indexes.sql)
--       because CREATE INDEX CONCURRENTLY cannot run in a transaction
--
-- Generated: 2026-01-28
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: FIX ORPHANED QUOTATIONS
-- ============================================================================

-- Log orphaned quotations before fixing (for audit trail)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM quotations q
  LEFT JOIN customers c ON q.customer_id = c.id
  WHERE q.customer_id IS NOT NULL AND c.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE NOTICE 'Found % orphaned quotations referencing deleted customers', orphan_count;
  END IF;
END $$;

-- Set customer_id to NULL for quotations referencing non-existent customers
-- This preserves the quotation data while fixing the integrity issue
UPDATE quotations
SET customer_id = NULL,
    updated_at = NOW()
WHERE customer_id IS NOT NULL
  AND customer_id NOT IN (SELECT id FROM customers WHERE id IS NOT NULL);

-- ============================================================================
-- SECTION 2: FIX NULL QUOTE NUMBERS
-- ============================================================================

-- Generate quote numbers for records that are missing them
UPDATE quotations
SET quote_number = 'QT-' || LPAD(id::text, 6, '0'),
    updated_at = NOW()
WHERE quote_number IS NULL OR quote_number = '';

-- ============================================================================
-- SECTION 3: ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Add FK constraint on quotations.customer_id (if not exists)
-- Using ON DELETE SET NULL to prevent future orphans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_quotations_customer_id'
      AND table_name = 'quotations'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT fk_quotations_customer_id
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE SET NULL;
    RAISE NOTICE 'Added FK constraint fk_quotations_customer_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add FK constraint on quotations.customer_id: %', SQLERRM;
END $$;

-- Add FK constraint on quotation_items.quotation_id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_quotation_items_quotation_id'
      AND table_name = 'quotation_items'
  ) THEN
    ALTER TABLE quotation_items
    ADD CONSTRAINT fk_quotation_items_quotation_id
    FOREIGN KEY (quotation_id) REFERENCES quotations(id)
    ON DELETE CASCADE;
    RAISE NOTICE 'Added FK constraint fk_quotation_items_quotation_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add FK constraint on quotation_items.quotation_id: %', SQLERRM;
END $$;

-- Add FK constraint on transaction_items.transaction_id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_transaction_items_transaction_id'
      AND table_name = 'transaction_items'
  ) THEN
    ALTER TABLE transaction_items
    ADD CONSTRAINT fk_transaction_items_transaction_id
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
    ON DELETE CASCADE;
    RAISE NOTICE 'Added FK constraint fk_transaction_items_transaction_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add FK constraint on transaction_items.transaction_id: %', SQLERRM;
END $$;

-- Add FK constraint on payments.transaction_id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payments_transaction_id'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE payments
    ADD CONSTRAINT fk_payments_transaction_id
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
    ON DELETE CASCADE;
    RAISE NOTICE 'Added FK constraint fk_payments_transaction_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add FK constraint on payments.transaction_id: %', SQLERRM;
END $$;

-- ============================================================================
-- SECTION 4: ADD CHECK CONSTRAINTS FOR DATA VALIDITY
-- ============================================================================

-- Ensure transaction totals are non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_transactions_total_positive'
  ) THEN
    ALTER TABLE transactions
    ADD CONSTRAINT chk_transactions_total_positive
    CHECK (total_cents >= 0);
    RAISE NOTICE 'Added check constraint chk_transactions_total_positive';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add check constraint on transactions.total_cents: %', SQLERRM;
END $$;

-- Ensure payment amounts are positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_payments_amount_positive'
  ) THEN
    ALTER TABLE payments
    ADD CONSTRAINT chk_payments_amount_positive
    CHECK (amount_cents > 0);
    RAISE NOTICE 'Added check constraint chk_payments_amount_positive';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add check constraint on payments.amount_cents: %', SQLERRM;
END $$;

-- Ensure quotation totals are non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_quotations_total_positive'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT chk_quotations_total_positive
    CHECK (total_cents >= 0 OR total_cents IS NULL);
    RAISE NOTICE 'Added check constraint chk_quotations_total_positive';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add check constraint on quotations.total_cents: %', SQLERRM;
END $$;

-- ============================================================================
-- SECTION 5: UPDATE STATISTICS
-- ============================================================================

-- Analyze tables to update query planner statistics
ANALYZE transactions;
ANALYZE transaction_items;
ANALYZE payments;
ANALYZE quotations;
ANALYZE quotation_items;
ANALYZE products;
ANALYZE customers;
ANALYZE register_shifts;

COMMIT;
