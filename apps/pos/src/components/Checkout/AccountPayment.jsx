/**
 * TeleTime POS - Account Payment Component
 * Allows charging purchases to customer's account/tab
 */

import { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeftIcon,
  UserCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Account payment component
 * @param {object} props
 * @param {number} props.amountDue - Amount to charge
 * @param {object} props.customer - Customer object with id, name, etc.
 * @param {function} props.onComplete - Callback when payment completed
 * @param {function} props.onBack - Callback to go back
 * @param {boolean} props.isPartial - Whether this is a partial payment
 */
export function AccountPayment({
  amountDue,
  customer,
  onComplete,
  onBack,
  isPartial = false,
}) {
  const [creditInfo, setCreditInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customAmount, setCustomAmount] = useState(amountDue.toFixed(2));
  const [processing, setProcessing] = useState(false);

  // Parse custom amount
  const paymentAmount = parseFloat(customAmount) || 0;
  const isValidAmount = paymentAmount > 0 && paymentAmount <= amountDue;

  // Fetch customer credit info on mount
  useEffect(() => {
    const fetchCreditInfo = async () => {
      if (!customer?.id) {
        setError('No customer selected');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const amountCents = Math.round(amountDue * 100);
        const response = await fetch(`${API_BASE}/pos-payments/account/check-credit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify({
            customerId: customer.id,
            amountCents,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to check credit');
        }

        setCreditInfo(result.data);
      } catch (err) {
        console.error('[AccountPayment] Credit check error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCreditInfo();
  }, [customer?.id, amountDue]);

  // Handle charging to account
  const handleCharge = useCallback(async () => {
    if (!creditInfo?.isEligible) return;

    const amount = isPartial ? paymentAmount : amountDue;

    setProcessing(true);

    try {
      // Complete the payment - actual account charge happens on server
      // when transaction is processed
      onComplete?.({
        paymentMethod: 'account',
        amount,
        customerAccountId: customer.id,
        customerName: customer.name || customer.customerName,
      });
    } catch (err) {
      console.error('[AccountPayment] Charge error:', err);
      setError(err.message);
      setProcessing(false);
    }
  }, [creditInfo, isPartial, paymentAmount, amountDue, customer, onComplete]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-600">Checking customer credit...</p>
      </div>
    );
  }

  // No customer selected
  if (!customer) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">Account Payment</h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
            <ExclamationTriangleIcon className="w-12 h-12 text-yellow-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No Customer Selected
          </h3>
          <p className="text-gray-500 max-w-sm">
            Please select a customer before using account payment.
            Account payments require a customer with an established credit limit.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !creditInfo) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">Account Payment</h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <ExclamationTriangleIcon className="w-12 h-12 text-red-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Error</h3>
          <p className="text-red-600 max-w-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // No credit limit set
  if (creditInfo && !creditInfo.hasCredit) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">Account Payment</h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
            <CreditCardIcon className="w-12 h-12 text-yellow-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No Credit Account
          </h3>
          <p className="text-gray-500 max-w-sm mb-2">
            <strong>{creditInfo.customerName}</strong> does not have a credit account set up.
          </p>
          <p className="text-sm text-gray-400 max-w-sm">
            Please contact a manager to establish a credit limit for this customer.
          </p>
        </div>
      </div>
    );
  }

  // Main render - credit info available
  const isEligible = creditInfo?.isEligible;
  const availableCredit = creditInfo?.availableCredit || 0;
  const currentBalance = creditInfo?.currentBalance || 0;
  const creditLimit = creditInfo?.creditLimit || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">Account Payment</h2>
      </div>

      {/* Customer Info */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <UserCircleIcon className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {creditInfo?.customerName || customer?.name || 'Customer'}
            </p>
            <p className="text-sm text-blue-600">
              Credit Account
            </p>
          </div>
        </div>
      </div>

      {/* Amount */}
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-1">Charge Amount</p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums">
          {formatCurrency(isPartial ? paymentAmount : amountDue)}
        </p>
      </div>

      {/* Credit Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-xl space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Credit Limit</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatCurrency(creditLimit)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Current Balance</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatCurrency(currentBalance)}
          </span>
        </div>
        <div className="border-t border-gray-200 pt-3">
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Available Credit</span>
            <span className={`font-bold tabular-nums ${isEligible ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(availableCredit)}
            </span>
          </div>
        </div>
      </div>

      {/* Partial Payment Amount Input */}
      {isPartial && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Amount
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xl">$</span>
            <input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              step="0.01"
              min="0.01"
              max={Math.min(amountDue, availableCredit)}
              className="w-full h-14 pl-8 pr-4 text-2xl font-bold text-right border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
            />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Maximum: {formatCurrency(Math.min(amountDue, availableCredit))}
          </p>
        </div>
      )}

      {/* Warning if insufficient credit */}
      {!isEligible && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Insufficient Credit</p>
              <p className="text-sm text-red-600 mt-1">
                This customer needs {formatCurrency(creditInfo?.shortfall || 0)} more available credit
                to complete this payment.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance After Charge Preview */}
      {isEligible && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Credit Available</p>
              <p className="text-sm text-green-600">
                After this charge: {formatCurrency(availableCredit - (isPartial ? paymentAmount : amountDue))} remaining
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charge Button */}
      <button
        type="button"
        onClick={handleCharge}
        disabled={!isEligible || processing || (isPartial && !isValidAmount)}
        className={`
          w-full h-14 mt-auto
          flex items-center justify-center gap-2
          text-lg font-bold rounded-xl
          transition-colors duration-150
          ${isEligible && !processing
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {processing ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <CheckCircleIcon className="w-6 h-6" />
            <span>Charge to Account</span>
          </>
        )}
      </button>
    </div>
  );
}

export default AccountPayment;
