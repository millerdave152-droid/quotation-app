-- Migration 166: Rename Stripe columns to Moneris on invoice_payments
-- Migration 125 missed this table during the Stripe-to-Moneris migration.
-- InvoiceService.recordPayment() inserts moneris_order_id & moneris_trans_id
-- but the table still has the old stripe_* column names.

DO $$
BEGIN
  -- stripe_payment_intent_id → moneris_order_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'invoice_payments' AND column_name = 'stripe_payment_intent_id') THEN
    ALTER TABLE invoice_payments RENAME COLUMN stripe_payment_intent_id TO moneris_order_id;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'invoice_payments' AND column_name = 'moneris_order_id') THEN
    ALTER TABLE invoice_payments ADD COLUMN moneris_order_id VARCHAR(255);
  END IF;

  -- stripe_charge_id → moneris_trans_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'invoice_payments' AND column_name = 'stripe_charge_id') THEN
    ALTER TABLE invoice_payments RENAME COLUMN stripe_charge_id TO moneris_trans_id;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'invoice_payments' AND column_name = 'moneris_trans_id') THEN
    ALTER TABLE invoice_payments ADD COLUMN moneris_trans_id VARCHAR(255);
  END IF;

  -- stripe_refund_id → moneris_refund_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'invoice_payments' AND column_name = 'stripe_refund_id') THEN
    ALTER TABLE invoice_payments RENAME COLUMN stripe_refund_id TO moneris_refund_id;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'invoice_payments' AND column_name = 'moneris_refund_id') THEN
    ALTER TABLE invoice_payments ADD COLUMN moneris_refund_id VARCHAR(255);
  END IF;
END $$;

-- Rename the old Stripe index if it exists
DO $$
BEGIN
  BEGIN
    ALTER INDEX IF EXISTS idx_invoice_payments_stripe RENAME TO idx_invoice_payments_moneris;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;
