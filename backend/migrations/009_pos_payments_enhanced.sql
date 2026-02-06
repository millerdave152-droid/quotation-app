-- TeleTime POS - Enhanced Payment Processing
-- Migration: 009_pos_payments_enhanced.sql
-- Description: Add account payment method, Stripe integration columns, and gift card schema

-- ============================================================================
-- 1. UPDATE PAYMENTS TABLE - Add 'account' payment method
-- ============================================================================

-- Drop existing constraint
ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_payment_method_check;

-- Add new constraint with 'account' method
ALTER TABLE payments
ADD CONSTRAINT payments_payment_method_check
CHECK (payment_method IN ('cash', 'credit', 'debit', 'gift_card', 'account'));

-- ============================================================================
-- 2. ADD STRIPE AND ACCOUNT COLUMNS TO PAYMENTS TABLE
-- ============================================================================

-- Stripe payment integration columns
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255);

-- Customer account reference (for account/tab payments)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS customer_account_id INTEGER REFERENCES customers(id);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id
ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_stripe_charge_id
ON payments(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_customer_account_id
ON payments(customer_account_id) WHERE customer_account_id IS NOT NULL;

-- ============================================================================
-- 3. GIFT CARD TABLES (For Future Implementation)
-- ============================================================================

-- Main gift cards table
CREATE TABLE IF NOT EXISTS gift_cards (
  id SERIAL PRIMARY KEY,
  card_number VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(255),
  initial_amount_cents INTEGER NOT NULL,
  current_balance_cents INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'exhausted', 'expired')),
  customer_id INTEGER REFERENCES customers(id),
  issued_by INTEGER REFERENCES users(id),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE gift_cards IS 'Gift cards for POS payments';
COMMENT ON COLUMN gift_cards.card_number IS 'Unique card number (typically 16-20 digits)';
COMMENT ON COLUMN gift_cards.pin_hash IS 'Optional PIN hash for security';
COMMENT ON COLUMN gift_cards.initial_amount_cents IS 'Original value when card was issued';
COMMENT ON COLUMN gift_cards.current_balance_cents IS 'Current remaining balance';

-- Gift card transaction history
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id SERIAL PRIMARY KEY,
  gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id),
  transaction_id INTEGER REFERENCES transactions(transaction_id),
  payment_id INTEGER REFERENCES payments(payment_id),
  amount_cents INTEGER NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('load', 'redeem', 'refund', 'adjustment', 'expire')),
  balance_after_cents INTEGER NOT NULL,
  notes TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE gift_card_transactions IS 'Transaction history for gift cards';
COMMENT ON COLUMN gift_card_transactions.transaction_type IS 'Type: load (add funds), redeem (use), refund (return), adjustment, expire';
COMMENT ON COLUMN gift_card_transactions.balance_after_cents IS 'Balance on gift card after this transaction';

-- Indexes for gift card lookups
CREATE INDEX IF NOT EXISTS idx_gift_cards_card_number ON gift_cards(card_number);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);
CREATE INDEX IF NOT EXISTS idx_gift_cards_customer_id ON gift_cards(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_gift_card_id ON gift_card_transactions(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_transaction_id ON gift_card_transactions(transaction_id) WHERE transaction_id IS NOT NULL;

-- ============================================================================
-- 4. FUNCTION: Generate Gift Card Number
-- Format: 16 digits starting with 6 (like store gift cards)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_gift_card_number()
RETURNS VARCHAR(20) AS $$
DECLARE
  card_num VARCHAR(20);
  exists_count INTEGER;
BEGIN
  LOOP
    -- Generate 16-digit number starting with 6
    card_num := '6' || LPAD(FLOOR(RANDOM() * 1000000000000000)::TEXT, 15, '0');

    -- Check if exists
    SELECT COUNT(*) INTO exists_count FROM gift_cards WHERE card_number = card_num;

    -- Exit loop if unique
    EXIT WHEN exists_count = 0;
  END LOOP;

  RETURN card_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. TRIGGER: Update gift card timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_gift_card_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_gift_card_timestamp ON gift_cards;

CREATE TRIGGER trigger_update_gift_card_timestamp
  BEFORE UPDATE ON gift_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_gift_card_timestamp();

-- ============================================================================
-- 6. TRIGGER: Auto-update gift card balance and status after transactions
-- ============================================================================

CREATE OR REPLACE FUNCTION update_gift_card_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the gift card balance
  UPDATE gift_cards
  SET current_balance_cents = NEW.balance_after_cents,
      status = CASE
        WHEN NEW.balance_after_cents <= 0 THEN 'exhausted'
        ELSE status
      END
  WHERE id = NEW.gift_card_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_gift_card_balance ON gift_card_transactions;

CREATE TRIGGER trigger_update_gift_card_balance
  AFTER INSERT ON gift_card_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_gift_card_balance();
