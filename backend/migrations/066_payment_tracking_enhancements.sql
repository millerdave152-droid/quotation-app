-- Migration 066: Payment Tracking Enhancements
-- Adds payment_status column, payment trigger, and robust balance tracking

-- ============================================================================
-- 1. ADD payment_status COLUMN TO unified_orders
-- ============================================================================

ALTER TABLE unified_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid';

-- Add CHECK constraint (use NOT VALID to avoid locking existing rows)
ALTER TABLE unified_orders ADD CONSTRAINT chk_unified_orders_payment_status
  CHECK (payment_status IN ('unpaid', 'deposit_paid', 'partially_paid', 'paid_in_full', 'refunded', 'awaiting_etransfer'))
  NOT VALID;

-- Index for filtering by payment status
CREATE INDEX IF NOT EXISTS idx_unified_orders_payment_status ON unified_orders(payment_status);

-- ============================================================================
-- 2. BACKFILL payment_status FOR EXISTING ORDERS
-- ============================================================================

UPDATE unified_orders SET payment_status = CASE
  WHEN amount_paid_cents >= total_cents AND total_cents > 0 THEN 'paid_in_full'
  WHEN amount_paid_cents > 0 AND deposit_required_cents > 0
       AND amount_paid_cents >= deposit_required_cents THEN 'deposit_paid'
  WHEN amount_paid_cents > 0 THEN 'partially_paid'
  WHEN status = 'awaiting_etransfer' THEN 'awaiting_etransfer'
  ELSE 'unpaid'
END
WHERE payment_status = 'unpaid' OR payment_status IS NULL;

-- ============================================================================
-- 3. UPDATE recalculate_order_totals TO SET payment_status
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_order_totals(p_order_id INTEGER)
RETURNS void AS $$
DECLARE
  v_subtotal INTEGER;
  v_item_discount INTEGER;
  v_taxable INTEGER;
  v_order unified_orders%ROWTYPE;
  v_hst INTEGER;
  v_gst INTEGER;
  v_pst INTEGER;
  v_paid INTEGER;
  v_refunded INTEGER;
  v_net_paid INTEGER;
  v_total INTEGER;
  v_deposit_required INTEGER;
  v_new_payment_status VARCHAR(20);
  v_has_pending_etransfer BOOLEAN;
BEGIN
  -- Get order details
  SELECT * INTO v_order FROM unified_orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Calculate item totals
  SELECT
    COALESCE(SUM(line_subtotal_cents), 0),
    COALESCE(SUM(line_discount_cents), 0)
  INTO v_subtotal, v_item_discount
  FROM unified_order_items
  WHERE order_id = p_order_id;

  -- Calculate taxable amount
  v_taxable := v_subtotal - v_item_discount - COALESCE(v_order.order_discount_cents, 0);

  -- Calculate taxes (only on taxable items if not tax exempt)
  IF NOT v_order.tax_exempt THEN
    SELECT COALESCE(SUM(line_total_cents), 0)
    INTO v_taxable
    FROM unified_order_items
    WHERE order_id = p_order_id AND taxable = TRUE;

    v_taxable := v_taxable - COALESCE(v_order.order_discount_cents, 0);
    IF v_taxable < 0 THEN v_taxable := 0; END IF;

    v_hst := ROUND(v_taxable * COALESCE(v_order.hst_rate, 0))::INTEGER;
    v_gst := ROUND(v_taxable * COALESCE(v_order.gst_rate, 0))::INTEGER;
    v_pst := ROUND(v_taxable * COALESCE(v_order.pst_rate, 0))::INTEGER;
  ELSE
    v_hst := 0;
    v_gst := 0;
    v_pst := 0;
  END IF;

  -- Calculate total
  v_total := v_subtotal - v_item_discount - COALESCE(v_order.order_discount_cents, 0) +
             v_hst + v_gst + v_pst + COALESCE(v_order.delivery_cents, 0);

  -- Update item totals and tax
  UPDATE unified_orders SET
    subtotal_cents = v_subtotal,
    item_discount_cents = v_item_discount,
    taxable_amount_cents = v_taxable,
    hst_cents = v_hst,
    gst_cents = v_gst,
    pst_cents = v_pst,
    total_cents = v_total,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_order_id;

  -- Calculate amount paid (completed payments minus completed refunds)
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid
  FROM unified_order_payments
  WHERE order_id = p_order_id AND status = 'completed' AND is_refund = FALSE;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_refunded
  FROM unified_order_payments
  WHERE order_id = p_order_id AND status = 'completed' AND is_refund = TRUE;

  v_net_paid := v_paid - v_refunded;

  -- Check for pending e-transfers
  SELECT EXISTS(
    SELECT 1 FROM unified_order_payments
    WHERE order_id = p_order_id AND payment_method = 'etransfer'
      AND status = 'pending'
  ) INTO v_has_pending_etransfer;

  -- Determine payment status
  v_deposit_required := COALESCE(v_order.deposit_required_cents, 0);

  IF v_net_paid <= 0 AND v_refunded > 0 THEN
    v_new_payment_status := 'refunded';
  ELSIF v_total > 0 AND v_net_paid >= v_total THEN
    v_new_payment_status := 'paid_in_full';
  ELSIF v_has_pending_etransfer AND v_net_paid = 0 THEN
    v_new_payment_status := 'awaiting_etransfer';
  ELSIF v_deposit_required > 0 AND v_net_paid >= v_deposit_required AND v_net_paid < v_total THEN
    v_new_payment_status := 'deposit_paid';
  ELSIF v_net_paid > 0 THEN
    v_new_payment_status := 'partially_paid';
  ELSE
    v_new_payment_status := 'unpaid';
  END IF;

  -- Update payment totals and status
  UPDATE unified_orders SET
    amount_paid_cents = v_net_paid,
    payment_status = v_new_payment_status
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. TRIGGER ON unified_order_payments TO AUTO-RECALCULATE
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_recalculate_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_order_totals(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_order_totals(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_on_payment_change ON unified_order_payments;

CREATE TRIGGER trg_recalculate_on_payment_change
  AFTER INSERT OR UPDATE OR DELETE ON unified_order_payments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_on_payment();
