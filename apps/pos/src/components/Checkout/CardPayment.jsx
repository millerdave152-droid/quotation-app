/**
 * TeleTime POS - Card Payment Component
 * Card payment entry with Stripe integration and manual mode
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ArrowLeftIcon,
  CreditCardIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Card brands for selection
 */
const CARD_BRANDS = [
  { id: 'visa', label: 'Visa', color: 'bg-blue-600' },
  { id: 'mastercard', label: 'Mastercard', color: 'bg-orange-600' },
  { id: 'amex', label: 'Amex', color: 'bg-blue-800' },
  { id: 'discover', label: 'Discover', color: 'bg-orange-500' },
  { id: 'other', label: 'Other', color: 'bg-gray-600' },
];

/**
 * Card payment component
 * @param {object} props
 * @param {number} props.amountDue - Amount to charge
 * @param {string} props.paymentType - 'credit' or 'debit'
 * @param {function} props.onComplete - Callback when payment completed
 * @param {function} props.onBack - Callback to go back
 * @param {boolean} props.isPartial - Whether this is a partial payment
 */
export function CardPayment({
  amountDue,
  paymentType = 'credit',
  onComplete,
  onBack,
  isPartial = false,
  customerId = null,
  transactionId = null,
}) {
  const [mode, setMode] = useState('waiting'); // 'waiting', 'manual', 'success', 'error', 'stripe'
  const [lastFour, setLastFour] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('visa');
  const [customAmount, setCustomAmount] = useState(amountDue.toFixed(2));
  const [errorMessage, setErrorMessage] = useState('');

  // Stripe PaymentIntent state
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);

  // Parse custom amount
  const paymentAmount = parseFloat(customAmount) || 0;
  const isValidAmount = paymentAmount > 0 && paymentAmount <= amountDue;

  // Create Stripe PaymentIntent on mount (for card payments)
  const intentIdRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    const createPaymentIntent = async () => {
      // Only create for credit/debit payments, not gift cards
      if (paymentType === 'giftcard') return;

      try {
        setStripeLoading(true);
        setStripeError(null);

        const amountCents = Math.round(amountDue * 100);
        const response = await fetch(`${API_BASE}/pos-payments/card/create-intent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify({
            amountCents,
            customerId,
            transactionId,
            description: `POS ${paymentType} payment`,
          }),
        });

        const result = await response.json();

        if (isCancelled) {
          // Component unmounted during fetch — cancel the intent
          if (result.success && result.data?.paymentIntentId) {
            fetch(`${API_BASE}/pos-payments/card/cancel`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
              },
              body: JSON.stringify({ paymentIntentId: result.data.paymentIntentId }),
            }).catch(() => {});
          }
          return;
        }

        if (!response.ok || !result.success) {
          // Don't fail - Stripe might not be configured
          console.warn('[CardPayment] Stripe not available:', result.error);
          setStripeError(result.error || 'Stripe not configured');
        } else {
          intentIdRef.current = result.data.paymentIntentId;
          setPaymentIntent(result.data);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[CardPayment] PaymentIntent creation failed:', err);
          setStripeError(err.message);
        }
      } finally {
        if (!isCancelled) setStripeLoading(false);
      }
    };

    createPaymentIntent();

    // Cancel PaymentIntent on unmount to avoid orphaned intents
    return () => {
      isCancelled = true;
      if (intentIdRef.current) {
        fetch(`${API_BASE}/pos-payments/card/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify({ paymentIntentId: intentIdRef.current }),
        }).catch(() => {}); // Best-effort cleanup
        intentIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountDue, paymentType, customerId, transactionId]);

  // Confirm Stripe payment (after terminal/card input)
  const confirmStripePayment = useCallback(async () => {
    if (!paymentIntent?.paymentIntentId) {
      setErrorMessage('No payment intent available');
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/pos-payments/card/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.paymentIntentId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Payment confirmation failed');
      }

      return result.data;
    } catch (err) {
      console.error('[CardPayment] Payment confirmation error:', err);
      setErrorMessage(err.message);
      return null;
    }
  }, [paymentIntent]);

  // Handle manual mode
  const handleManualMode = useCallback(() => {
    setMode('manual');
  }, []);

  // Handle complete payment
  const handleComplete = useCallback(() => {
    // Validate inputs in manual mode
    if (mode === 'manual') {
      if (lastFour.length !== 4 || !/^\d{4}$/.test(lastFour)) {
        setErrorMessage('Please enter the last 4 digits of the card');
        return;
      }
      if (!authCode.trim()) {
        setErrorMessage('Please enter the authorization code');
        return;
      }
    }

    const amount = isPartial ? paymentAmount : amountDue;

    // Send null instead of empty strings to avoid backend validation errors
    onComplete?.({
      paymentMethod: paymentType,
      amount,
      cardLastFour: lastFour || null,
      cardBrand: selectedBrand || null,
      authorizationCode: authCode.trim() || null,
      // Include Stripe info if available
      stripePaymentIntentId: paymentIntent?.paymentIntentId || null,
    });
  }, [mode, lastFour, authCode, selectedBrand, paymentType, isPartial, paymentAmount, amountDue, onComplete, paymentIntent]);

  // Simulate card reader (for demo/dev mode)
  const simulateCardRead = useCallback(async () => {
    setMode('success');

    // If Stripe is configured, try to confirm the payment
    let stripeData = null;
    if (paymentIntent?.paymentIntentId) {
      stripeData = await confirmStripePayment();
    }

    // Auto-complete after showing success
    setTimeout(() => {
      onComplete?.({
        paymentMethod: paymentType,
        amount: amountDue,
        cardLastFour: stripeData?.cardLastFour || '4242',
        cardBrand: stripeData?.cardBrand || 'visa',
        authorizationCode: stripeData?.authorizationCode || `AUTH${Date.now().toString().slice(-6)}`,
        stripePaymentIntentId: stripeData?.paymentIntentId || paymentIntent?.paymentIntentId || null,
        stripeChargeId: stripeData?.chargeId || null,
      });
    }, 1500);
  }, [paymentType, amountDue, onComplete, paymentIntent, confirmStripePayment]);

  // Render waiting state
  if (mode === 'waiting') {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back to payment selection"
            className="
              w-10 h-10
              flex items-center justify-center
              text-gray-500 hover:text-gray-700
              hover:bg-gray-100
              rounded-lg
              transition-colors duration-150
            "
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-gray-900 capitalize">
            {paymentType} Card Payment
          </h2>
        </div>

        {/* Amount */}
        <div className="text-center mb-8">
          <p className="text-sm text-gray-500 mb-1">Charge Amount</p>
          <p className="text-4xl font-bold text-gray-900 tabular-nums">
            {formatCurrency(amountDue)}
          </p>
        </div>

        {/* Waiting Animation */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
              <CreditCardIcon className="w-12 h-12 text-blue-600" />
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
          </div>

          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Waiting for Card...
          </h3>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            Tap, insert, or swipe the customer's card on the terminal
          </p>
        </div>

        {/* Stripe Status */}
        {stripeLoading && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Preparing secure payment...
            </p>
          </div>
        )}

        {paymentIntent && !stripeLoading && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">
              Secure payment ready
            </p>
          </div>
        )}

        {stripeError && !paymentIntent && !stripeLoading && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">
              Manual entry mode (Stripe not configured)
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 mt-auto">
          {/* Demo button - for development/testing */}
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={simulateCardRead}
              disabled={stripeLoading}
              className="
                w-full h-12
                bg-gray-100 hover:bg-gray-200
                disabled:bg-gray-50 disabled:text-gray-400
                text-gray-700 font-medium
                rounded-xl
                transition-colors duration-150
              "
            >
              Simulate Card Read (Dev)
            </button>
          )}

          <button
            type="button"
            onClick={handleManualMode}
            className="
              w-full h-12
              bg-gray-100 hover:bg-gray-200
              text-gray-700 font-medium
              rounded-xl
              transition-colors duration-150
            "
          >
            Enter Manually
          </button>
        </div>
      </div>
    );
  }

  // Render success state
  if (mode === 'success') {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircleIcon className="w-16 h-16 text-green-600" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Card Approved
        </h3>
        <p className="text-lg text-gray-600 tabular-nums">
          {formatCurrency(amountDue)}
        </p>
      </div>
    );
  }

  // Render error state
  if (mode === 'error') {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <XCircleIcon className="w-16 h-16 text-red-600" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Card Declined
        </h3>
        <p className="text-sm text-gray-600 mb-6">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setMode('waiting')}
          className="
            h-12 px-8
            bg-blue-600 hover:bg-blue-700
            text-white font-medium
            rounded-xl
            transition-colors duration-150
          "
        >
          Try Again
        </button>
      </div>
    );
  }

  // Render manual entry mode
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => setMode('waiting')}
          aria-label="Go back to card reader mode"
          className="
            w-10 h-10
            flex items-center justify-center
            text-gray-500 hover:text-gray-700
            hover:bg-gray-100
            rounded-lg
            transition-colors duration-150
          "
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">Manual Card Entry</h2>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Amount Input (for partial payments) */}
      {isPartial && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Charge Amount
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xl">
              $
            </span>
            <input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              step="0.01"
              min="0.01"
              max={amountDue}
              className="
                w-full h-14 pl-8 pr-4
                text-2xl font-bold text-right
                border-2 border-gray-200 rounded-xl
                focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                transition-colors duration-150
              "
            />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Maximum: {formatCurrency(amountDue)}
          </p>
        </div>
      )}

      {/* Card Brand Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Card Brand
        </label>
        <div className="flex gap-2">
          {CARD_BRANDS.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => setSelectedBrand(brand.id)}
              className={`
                flex-1 h-12
                flex items-center justify-center
                text-sm font-medium
                rounded-lg
                transition-all duration-150
                ${
                  selectedBrand === brand.id
                    ? `${brand.color} text-white`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {brand.label}
            </button>
          ))}
        </div>
      </div>

      {/* Last 4 Digits */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Last 4 Digits of Card
        </label>
        <input
          type="text"
          value={lastFour}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
            setLastFour(val);
            setErrorMessage('');
          }}
          placeholder="0000"
          maxLength={4}
          className="
            w-full h-14
            text-2xl font-mono text-center tracking-widest
            border-2 border-gray-200 rounded-xl
            focus:border-blue-500 focus:ring-2 focus:ring-blue-100
            transition-colors duration-150
          "
        />
      </div>

      {/* Authorization Code */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Authorization Code
        </label>
        <input
          type="text"
          value={authCode}
          onChange={(e) => {
            setAuthCode(e.target.value.toUpperCase());
            setErrorMessage('');
          }}
          placeholder="AUTH123456"
          className="
            w-full h-14
            text-xl font-mono text-center
            border-2 border-gray-200 rounded-xl
            focus:border-blue-500 focus:ring-2 focus:ring-blue-100
            transition-colors duration-150
          "
        />
      </div>

      {/* Complete Button */}
      <button
        type="button"
        onClick={handleComplete}
        disabled={!lastFour || !authCode || (isPartial && !isValidAmount)}
        className="
          w-full h-14 mt-auto
          flex items-center justify-center gap-2
          bg-green-600 hover:bg-green-700
          disabled:bg-gray-300 disabled:cursor-not-allowed
          text-white text-lg font-bold
          rounded-xl
          transition-colors duration-150
        "
      >
        <CheckCircleIcon className="w-6 h-6" />
        Confirm Payment
      </button>
    </div>
  );
}

export default CardPayment;
