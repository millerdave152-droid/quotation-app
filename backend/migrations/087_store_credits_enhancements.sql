-- ============================================================================
-- Migration 087: Store Credits Enhancements
-- Adds gift card support, recipient tracking, additional source types
-- ============================================================================

-- Credit type (store_credit vs gift_card)
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS credit_type VARCHAR(20) DEFAULT 'store_credit';

-- Gift card recipient tracking
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);

-- Widen source_type constraint to include gift_purchase and refund
DO $$ BEGIN
  ALTER TABLE store_credits DROP CONSTRAINT IF EXISTS store_credits_source_type_check;
  ALTER TABLE store_credits ADD CONSTRAINT store_credits_source_type_check
    CHECK (source_type IN ('return', 'promotion', 'gift_purchase', 'manual', 'refund'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Widen credit_type constraint
DO $$ BEGIN
  ALTER TABLE store_credits DROP CONSTRAINT IF EXISTS store_credits_credit_type_check;
  ALTER TABLE store_credits ADD CONSTRAINT store_credits_credit_type_check
    CHECK (credit_type IN ('store_credit', 'gift_card'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Widen transaction_type to include 'expire'
DO $$ BEGIN
  ALTER TABLE store_credit_transactions DROP CONSTRAINT IF EXISTS store_credit_transactions_transaction_type_check;
  ALTER TABLE store_credit_transactions ADD CONSTRAINT store_credit_transactions_transaction_type_check
    CHECK (transaction_type IN ('issue', 'redeem', 'refund', 'adjustment', 'expire', 'cancel'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add order_id to store_credit_transactions (for unified_orders link)
ALTER TABLE store_credit_transactions ADD COLUMN IF NOT EXISTS order_id INTEGER;

-- Index on credit type for filtering
CREATE INDEX IF NOT EXISTS idx_store_credits_type ON store_credits(credit_type);
CREATE INDEX IF NOT EXISTS idx_store_credits_recipient_email ON store_credits(recipient_email);
