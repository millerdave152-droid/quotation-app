/**
 * TeleTime POS - Payment Methods Component
 * Grid of available payment method buttons
 */

import {
  BanknotesIcon,
  CreditCardIcon,
  GiftIcon,
  DevicePhoneMobileIcon,
  UserCircleIcon,
  CalendarDaysIcon,
  EnvelopeIcon,
  TicketIcon,
  ArrowDownTrayIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Payment method button component
 */
function PaymentMethodButton({
  icon: Icon,
  label,
  color,
  onClick,
  disabled,
}) {
  const colorClasses = {
    green: 'bg-green-100 hover:bg-green-200 text-green-700 border-green-200',
    blue: 'bg-blue-100 hover:bg-blue-200 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 hover:bg-purple-200 text-purple-700 border-purple-200',
    orange: 'bg-orange-100 hover:bg-orange-200 text-orange-700 border-orange-200',
    teal: 'bg-teal-100 hover:bg-teal-200 text-teal-700 border-teal-200',
    indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-indigo-200',
    amber: 'bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-200',
    rose: 'bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-200',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center
        p-6
        border-2 rounded-xl
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98]
        ${colorClasses[color] || colorClasses.blue}
      `}
    >
      <Icon className="w-10 h-10 mb-2" />
      <span className="text-lg font-semibold">{label}</span>
    </button>
  );
}

/**
 * Payment methods component
 * @param {object} props
 * @param {number} props.remainingAmount - Amount still due
 * @param {function} props.onSelectMethod - Callback when method is selected
 * @param {boolean} props.disabled - Disable all buttons
 * @param {Array} props.appliedPayments - Already applied payments
 * @param {object} props.customer - Customer object (for account payment)
 */
export function PaymentMethods({
  remainingAmount,
  onSelectMethod,
  disabled = false,
  appliedPayments = [],
  customer = null,
}) {
  const hasAppliedPayments = appliedPayments.length > 0;
  const hasCustomer = customer !== null && customer !== undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Remaining Amount Display */}
      <div className="text-center mb-8">
        <p className="text-sm text-gray-500 mb-1">
          {hasAppliedPayments ? 'Remaining Balance' : 'Amount Due'}
        </p>
        <p className="text-5xl font-bold text-gray-900 tabular-nums">
          {formatCurrency(remainingAmount)}
        </p>
      </div>

      {/* Applied Payments Summary */}
      {hasAppliedPayments && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg">
          <p className="text-sm font-medium text-green-800 mb-2">
            Payments Applied:
          </p>
          <div className="space-y-1">
            {appliedPayments.map((payment, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-green-700 capitalize">
                  {payment.paymentMethod}
                </span>
                <span className="font-medium text-green-800 tabular-nums">
                  {formatCurrency(payment.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Method Grid */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        <PaymentMethodButton
          icon={BanknotesIcon}
          label="Cash"
          color="green"
          onClick={() => onSelectMethod('cash')}
          disabled={disabled || remainingAmount <= 0}
        />

        <PaymentMethodButton
          icon={CreditCardIcon}
          label="Credit"
          color="blue"
          onClick={() => onSelectMethod('credit')}
          disabled={disabled || remainingAmount <= 0}
        />

        <PaymentMethodButton
          icon={DevicePhoneMobileIcon}
          label="Debit"
          color="blue"
          onClick={() => onSelectMethod('debit')}
          disabled={disabled || remainingAmount <= 0}
        />

        <PaymentMethodButton
          icon={GiftIcon}
          label="Gift Card"
          color="purple"
          onClick={() => onSelectMethod('giftcard')}
          disabled={disabled || remainingAmount <= 0}
        />

        <PaymentMethodButton
          icon={TicketIcon}
          label="Store Credit"
          color="purple"
          onClick={() => onSelectMethod('store_credit')}
          disabled={disabled || remainingAmount <= 0}
        />

        {/* Account Payment - only shown when customer is selected */}
        {hasCustomer && (
          <PaymentMethodButton
            icon={UserCircleIcon}
            label="Account"
            color="orange"
            onClick={() => onSelectMethod('account')}
            disabled={disabled || remainingAmount <= 0}
          />
        )}

        {/* Financing - shown for qualifying amounts with customer */}
        {hasCustomer && remainingAmount >= 50 && (
          <PaymentMethodButton
            icon={CalendarDaysIcon}
            label="Financing"
            color="teal"
            onClick={() => onSelectMethod('financing')}
            disabled={disabled || remainingAmount <= 0}
          />
        )}

        {/* Loyalty Points - only when customer is selected */}
        {hasCustomer && (
          <PaymentMethodButton
            icon={StarIcon}
            label="Loyalty Points"
            color="rose"
            onClick={() => onSelectMethod('loyalty_points')}
            disabled={disabled || remainingAmount <= 0}
          />
        )}

        {/* E-Transfer - always available */}
        <PaymentMethodButton
          icon={EnvelopeIcon}
          label="E-Transfer"
          color="indigo"
          onClick={() => onSelectMethod('etransfer')}
          disabled={disabled || remainingAmount <= 0}
        />

        {/* Deposit - only when no partial payments applied yet */}
        {!hasAppliedPayments && (
          <PaymentMethodButton
            icon={ArrowDownTrayIcon}
            label="Deposit"
            color="amber"
            onClick={() => onSelectMethod('deposit')}
            disabled={disabled || remainingAmount <= 0}
          />
        )}
      </div>

      {/* Account/Financing Payment Hint */}
      {!hasCustomer && (
        <p className="mt-2 text-center text-xs text-gray-400">
          Select a customer to enable account payment and financing
        </p>
      )}

      {/* Split Payment Note */}
      {hasAppliedPayments && remainingAmount > 0 && (
        <p className="mt-4 text-center text-sm text-gray-500">
          Select another payment method to complete the transaction
        </p>
      )}
    </div>
  );
}

export default PaymentMethods;
