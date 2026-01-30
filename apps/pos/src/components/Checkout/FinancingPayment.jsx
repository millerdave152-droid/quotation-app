/**
 * TeleTime POS - Financing Payment Component
 * Wrapper that uses FinancingModal for the checkout flow
 */

import { FinancingModal } from './FinancingModal';

/**
 * Financing payment component for checkout
 * This is a thin wrapper around FinancingModal for integration with CheckoutModal
 *
 * @param {object} props
 * @param {number} props.amountDue - Amount to finance (in dollars)
 * @param {object} props.customer - Customer object
 * @param {number} props.orderId - Order ID (optional)
 * @param {function} props.onComplete - Callback when financing completed
 * @param {function} props.onBack - Callback to go back
 */
export function FinancingPayment({
  amountDue,
  customer,
  orderId,
  onComplete,
  onBack,
}) {
  return (
    <FinancingModal
      amountDue={amountDue}
      customer={customer}
      orderId={orderId}
      onComplete={onComplete}
      onCancel={onBack}
    />
  );
}

export default FinancingPayment;
