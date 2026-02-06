-- Migration 062: Enhance store credits for gift cards, recipients, and unified orders
-- Adds missing columns to existing store_credits and store_credit_transactions tables

-- ============================================================================
-- STORE CREDITS TABLE ENHANCEMENTS
-- ============================================================================

-- Credit type (store credit vs gift card)
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS credit_type VARCHAR(20) DEFAULT 'store_credit';
ALTER TABLE store_credits ADD CONSTRAINT chk_store_credits_type
  CHECK (credit_type IN ('store_credit', 'gift_card')) NOT VALID;

-- Expand source_type to include gift_purchase and refund
ALTER TABLE store_credits DROP CONSTRAINT IF EXISTS store_credits_source_type_check;
ALTER TABLE store_credits ADD CONSTRAINT store_credits_source_type_check
  CHECK (source_type IN ('return', 'promotion', 'gift_purchase', 'manual', 'refund'));

-- Gift card recipient fields
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);

-- ============================================================================
-- STORE CREDIT TRANSACTIONS ENHANCEMENTS
-- ============================================================================

-- Add order_id reference for unified orders (existing column references transactions)
ALTER TABLE store_credit_transactions ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES unified_orders(id);

-- Expand transaction_type to include 'expire'
ALTER TABLE store_credit_transactions DROP CONSTRAINT IF EXISTS store_credit_transactions_transaction_type_check;
ALTER TABLE store_credit_transactions ADD CONSTRAINT store_credit_transactions_transaction_type_check
  CHECK (transaction_type IN ('issue', 'redeem', 'refund', 'adjustment', 'cancel', 'expire'));

-- Index for customer lookups by credit type
CREATE INDEX IF NOT EXISTS idx_store_credits_type ON store_credits(credit_type);
CREATE INDEX IF NOT EXISTS idx_store_credit_txns_order ON store_credit_transactions(order_id);
