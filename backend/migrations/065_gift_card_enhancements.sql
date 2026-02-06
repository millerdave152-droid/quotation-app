-- Migration 065: Gift Card Enhancements
-- Adds gift card specific columns and 'reload' transaction type

-- ============================================================================
-- GIFT CARD COLUMNS ON store_credits
-- ============================================================================

-- Delivery method: email, print, physical
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20) DEFAULT 'email';
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS purchaser_customer_id INTEGER REFERENCES customers(id);
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS send_date DATE;
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS needs_printing BOOLEAN DEFAULT FALSE;
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE store_credits ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- ============================================================================
-- ADD 'reload' TRANSACTION TYPE
-- ============================================================================

ALTER TABLE store_credit_transactions DROP CONSTRAINT IF EXISTS store_credit_transactions_transaction_type_check;
ALTER TABLE store_credit_transactions ADD CONSTRAINT store_credit_transactions_transaction_type_check
  CHECK (transaction_type IN ('issue', 'redeem', 'refund', 'adjustment', 'cancel', 'expire', 'reload'));

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_store_credits_send_date ON store_credits(send_date) WHERE send_date IS NOT NULL AND email_sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_store_credits_expiry ON store_credits(expiry_date) WHERE status = 'active' AND expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_credits_purchaser ON store_credits(purchaser_customer_id) WHERE purchaser_customer_id IS NOT NULL;
