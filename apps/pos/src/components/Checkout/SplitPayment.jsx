/**
 * TeleTime POS - Split Payment Component
 * Shows applied payments and remaining balance
 */

import {
  BanknotesIcon,
  CreditCardIcon,
  GiftIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Get icon for payment method
 */
const getPaymentIcon = (method) => {
  switch (method) {
    case 'cash':
      return BanknotesIcon;
    case 'credit':
    case 'debit':
      return CreditCardIcon;
    case 'giftcard':
      return GiftIcon;
    default:
      return CreditCardIcon;
  }
};

/**
 * Get color classes for payment method
 */
const getPaymentColor = (method) => {
  switch (method) {
    case 'cash':
      return 'bg-green-100 text-green-700';
    case 'credit':
      return 'bg-blue-100 text-blue-700';
    case 'debit':
      return 'bg-blue-100 text-blue-700';
    case 'giftcard':
      return 'bg-purple-100 text-purple-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

/**
 * Payment item component
 */
function PaymentItem({ payment, onRemove, index }) {
  const Icon = getPaymentIcon(payment.paymentMethod);
  const colorClass = getPaymentColor(payment.paymentMethod);

  return (
    <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg">
      {/* Icon */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Payment Details */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 capitalize">
            {payment.paymentMethod}
          </span>
          {payment.cardLastFour && (
            <span className="text-xs text-gray-500">
              •••• {payment.cardLastFour}
            </span>
          )}
        </div>
        {payment.cashTendered && (
          <p className="text-xs text-gray-500">
            Tendered: {formatCurrency(payment.cashTendered)}
            {payment.changeGiven > 0 && ` • Change: ${formatCurrency(payment.changeGiven)}`}
          </p>
        )}
        {payment.authorizationCode && (
          <p className="text-xs text-gray-500">
            Auth: {payment.authorizationCode}
          </p>
        )}
      </div>

      {/* Amount */}
      <span className="text-lg font-bold text-gray-900 tabular-nums">
        {formatCurrency(payment.amount)}
      </span>

      {/* Remove Button */}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="
            w-8 h-8
            flex items-center justify-center
            text-gray-400 hover:text-red-500
            hover:bg-red-50
            rounded-lg
            transition-colors duration-150
          "
          aria-label="Remove payment"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Split payment component
 * @param {object} props
 * @param {number} props.totalAmount - Total order amount
 * @param {Array} props.payments - Applied payments
 * @param {number} props.remainingBalance - Amount still due
 * @param {function} props.onAddPayment - Callback to add another payment
 * @param {function} props.onRemovePayment - Callback to remove a payment
 * @param {function} props.onComplete - Callback when fully paid
 */
export function SplitPayment({
  totalAmount,
  payments = [],
  remainingBalance,
  onAddPayment,
  onRemovePayment,
  onComplete,
  onBack,
}) {
  const isPaid = remainingBalance <= 0.01; // Allow for small rounding differences
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Split Payment</h2>

        {/* Progress Bar */}
        <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (totalPaid / totalAmount) * 100)}%` }}
          />
        </div>

        {/* Progress Text */}
        <div className="flex justify-between mt-2 text-sm">
          <span className="text-gray-500">
            Paid: {formatCurrency(totalPaid)}
          </span>
          <span className={`font-medium ${isPaid ? 'text-green-600' : 'text-gray-900'}`}>
            {isPaid ? 'Fully Paid' : `Remaining: ${formatCurrency(remainingBalance)}`}
          </span>
        </div>
      </div>

      {/* Applied Payments */}
      <div className="flex-1 overflow-y-auto mb-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">
          Applied Payments ({payments.length})
        </h3>

        {payments.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No payments applied yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment, index) => (
              <PaymentItem
                key={index}
                payment={payment}
                index={index}
                onRemove={onRemovePayment}
              />
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="p-4 bg-gray-50 rounded-xl mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">Order Total</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatCurrency(totalAmount)}
          </span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">Total Paid</span>
          <span className="font-medium text-green-600 tabular-nums">
            {formatCurrency(totalPaid)}
          </span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
          <span className="text-sm font-medium text-gray-700">Remaining</span>
          <span className={`text-xl font-bold tabular-nums ${isPaid ? 'text-green-600' : 'text-gray-900'}`}>
            {formatCurrency(Math.max(0, remainingBalance))}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {!isPaid && (
          <button
            type="button"
            onClick={onAddPayment}
            className="
              w-full h-14
              flex items-center justify-center gap-2
              bg-blue-600 hover:bg-blue-700
              text-white text-lg font-semibold
              rounded-xl
              transition-colors duration-150
            "
          >
            <PlusIcon className="w-6 h-6" />
            Add Payment Method
          </button>
        )}

        {isPaid && (
          <button
            type="button"
            onClick={onComplete}
            className="
              w-full h-14
              flex items-center justify-center gap-2
              bg-green-600 hover:bg-green-700
              text-white text-lg font-bold
              rounded-xl
              transition-colors duration-150
            "
          >
            Complete Transaction
          </button>
        )}

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="
              w-full h-12
              flex items-center justify-center
              text-sm font-medium
              text-gray-600 hover:text-gray-800
              hover:bg-gray-100
              rounded-xl
              transition-colors duration-150
            "
          >
            Back to Payment Methods
          </button>
        )}
      </div>
    </div>
  );
}

export default SplitPayment;
