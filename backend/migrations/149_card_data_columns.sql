-- Migration 149: Card data columns on payments table
-- Adds card_entry_method, card_present, card_bin for fraud analysis.
-- avs_result and cvv_result deferred until Moneris integration.

BEGIN;

-- Card entry method: how the card was read
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_entry_method VARCHAR(20);
-- Values: 'swipe', 'chip', 'contactless', 'manual', 'online'

-- Whether the physical card was present during the transaction
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_present BOOLEAN DEFAULT true;

-- First 6 digits of card number (Bank Identification Number)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_bin VARCHAR(6);

-- Partial indexes for fraud queries
CREATE INDEX IF NOT EXISTS idx_payments_card_not_present
  ON payments(card_present) WHERE card_present = false;

CREATE INDEX IF NOT EXISTS idx_payments_card_bin
  ON payments(card_bin) WHERE card_bin IS NOT NULL;

COMMIT;
