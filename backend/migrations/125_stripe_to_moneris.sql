-- Migration 125: Rename Stripe columns/tables to Moneris
-- Switches payment processor references from Stripe to Moneris

-- ============================================================
-- 1. Rename stripe_webhook_events → moneris_webhook_events
-- ============================================================
ALTER TABLE IF EXISTS stripe_webhook_events RENAME TO moneris_webhook_events;

-- Rename columns inside the webhook events table
ALTER TABLE moneris_webhook_events RENAME COLUMN stripe_event_id TO moneris_event_id;

-- ============================================================
-- 2. Quotations table — rename Stripe columns to Moneris
-- ============================================================
ALTER TABLE quotations RENAME COLUMN stripe_payment_intent_id TO moneris_order_id;
ALTER TABLE quotations RENAME COLUMN stripe_checkout_session_id TO moneris_checkout_id;
ALTER TABLE quotations RENAME COLUMN stripe_customer_id TO moneris_customer_id;

-- ============================================================
-- 3. Customers table — rename Stripe columns to Moneris
-- ============================================================
ALTER TABLE customers RENAME COLUMN stripe_customer_id TO moneris_customer_id;
ALTER TABLE customers RENAME COLUMN stripe_default_payment_method TO moneris_default_payment_method;
ALTER TABLE customers RENAME COLUMN stripe_created_at TO moneris_created_at;

-- ============================================================
-- 4. Payments table — rename Stripe columns to Moneris
-- ============================================================
ALTER TABLE payments RENAME COLUMN stripe_payment_intent_id TO moneris_order_id;
ALTER TABLE payments RENAME COLUMN stripe_charge_id TO moneris_trans_id;

-- ============================================================
-- 5. Payment transactions table — rename Stripe columns
-- ============================================================
DO $$
BEGIN
  -- Rename only if old columns exist (safe migration)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_transactions' AND column_name = 'stripe_checkout_session_id') THEN
    ALTER TABLE payment_transactions RENAME COLUMN stripe_checkout_session_id TO moneris_checkout_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_transactions' AND column_name = 'stripe_payment_intent_id') THEN
    ALTER TABLE payment_transactions RENAME COLUMN stripe_payment_intent_id TO moneris_order_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_transactions' AND column_name = 'stripe_charge_id') THEN
    ALTER TABLE payment_transactions RENAME COLUMN stripe_charge_id TO moneris_trans_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_transactions' AND column_name = 'stripe_refund_id') THEN
    ALTER TABLE payment_transactions RENAME COLUMN stripe_refund_id TO moneris_refund_id;
  END IF;

  -- Add moneris_order_id if it doesn't exist yet (in case rename above didn't run)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_transactions' AND column_name = 'moneris_order_id') THEN
    ALTER TABLE payment_transactions ADD COLUMN moneris_order_id VARCHAR(100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_transactions' AND column_name = 'moneris_trans_id') THEN
    ALTER TABLE payment_transactions ADD COLUMN moneris_trans_id VARCHAR(100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_transactions' AND column_name = 'moneris_refund_id') THEN
    ALTER TABLE payment_transactions ADD COLUMN moneris_refund_id VARCHAR(100);
  END IF;
END $$;

-- ============================================================
-- 6. POS Returns table — rename Stripe refund column
-- ============================================================
ALTER TABLE pos_returns RENAME COLUMN stripe_refund_id TO moneris_refund_id;

-- ============================================================
-- 7. Customer payment methods table — rename if exists
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_payment_methods' AND column_name = 'stripe_payment_method_id') THEN
    ALTER TABLE customer_payment_methods RENAME COLUMN stripe_payment_method_id TO moneris_data_key;
  END IF;
END $$;

-- ============================================================
-- 8. Invoices table — add Moneris columns if not present
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'stripe_checkout_session_id') THEN
    ALTER TABLE invoices RENAME COLUMN stripe_checkout_session_id TO moneris_checkout_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'moneris_checkout_id') THEN
    ALTER TABLE invoices ADD COLUMN moneris_checkout_id VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'moneris_order_id') THEN
    ALTER TABLE invoices ADD COLUMN moneris_order_id VARCHAR(100);
  END IF;
END $$;

-- ============================================================
-- 9. Rename Stripe config table
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stripe_config') THEN
    ALTER TABLE stripe_config RENAME TO moneris_config;
  END IF;
END $$;

-- ============================================================
-- 10. Rename indexes (cosmetic — won't break anything if skipped)
-- ============================================================
DO $$
BEGIN
  -- Best-effort index renames — silently skip if they don't exist
  BEGIN ALTER INDEX IF EXISTS idx_stripe_webhook_events_event_id RENAME TO idx_moneris_webhook_events_event_id; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER INDEX IF EXISTS idx_stripe_webhook_events_type RENAME TO idx_moneris_webhook_events_type; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER INDEX IF EXISTS idx_quotations_stripe_payment_intent RENAME TO idx_quotations_moneris_order; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER INDEX IF EXISTS idx_customers_stripe_customer RENAME TO idx_customers_moneris_customer; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER INDEX IF EXISTS idx_payments_stripe_intent RENAME TO idx_payments_moneris_order; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER INDEX IF EXISTS idx_payments_stripe_charge RENAME TO idx_payments_moneris_trans; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;
