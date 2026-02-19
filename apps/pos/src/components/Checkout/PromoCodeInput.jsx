/**
 * TeleTime POS - Promo Code Input Component
 * Allows entering and applying promotional codes during checkout
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  TagIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Promo code input and display component
 * @param {object} props
 * @param {object} props.cart - Cart object with items and subtotal
 * @param {object|null} props.appliedPromotion - Currently applied promotion
 * @param {function} props.onApplyPromotion - Callback when promotion applied
 * @param {function} props.onRemovePromotion - Callback when promotion removed
 * @param {boolean} props.disabled - Whether input is disabled
 */
export function PromoCodeInput({
  cart,
  appliedPromotion,
  onApplyPromotion,
  onRemovePromotion,
  disabled = false,
}) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef(null);
  const successTimeoutRef = useRef(null);

  // Clear success message after delay
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Reset error when code changes
  useEffect(() => {
    if (error) {
      setError(null);
    }
  }, [code]);

  /**
   * Apply the promo code
   */
  const handleApply = useCallback(async () => {
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedCode) {
      setError('Please enter a promo code');
      inputRef.current?.focus();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build cart payload for the API
      const cartPayload = {
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: Math.round(item.unitPrice * 100),
          categoryId: item.categoryId || null,
        })),
        customer: cart.customer || null,
        subtotalCents: Math.round(cart.subtotal * 100),
        code: trimmedCode,
      };

      // Call the promo engine API
      const response = await fetch(`${API_BASE}/pos-promotions/engine/apply-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify(cartPayload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Map error codes to user-friendly messages
        const errorMessages = {
          INVALID_CODE: 'Invalid promo code. Please check and try again.',
          EXPIRED: 'This promo code has expired.',
          NOT_STARTED: 'This promo code is not yet active.',
          USAGE_LIMIT_REACHED: 'This promo code has reached its usage limit.',
          CUSTOMER_LIMIT_REACHED: 'You have already used this promo code.',
          MIN_ORDER_NOT_MET: 'Your order does not meet the minimum amount for this code.',
          MIN_QUANTITY_NOT_MET: 'Your order does not have enough items for this code.',
          CUSTOMER_TIER_MISMATCH: 'This promo code is not available for your account type.',
          ALREADY_APPLIED: 'A promo code is already applied to this order.',
        };

        const rawError = result.error;
        const errorCode = result.errorCode || (typeof rawError === 'object' ? rawError?.code : null);
        const errorStr = (typeof rawError === 'string' && rawError !== '[object Object]')
          ? rawError
          : rawError?.message || 'Failed to apply promo code';
        const userMessage = errorMessages[errorCode] || errorStr;
        setError(userMessage);
        return;
      }

      // Success - apply the promotion
      const promotion = {
        id: result.data.promotion.id,
        code: trimmedCode,
        name: result.data.promotion.name,
        promoType: result.data.promotion.promo_type,
        discountCents: result.data.discountCents,
        discountAmount: result.data.discountDollars,
        isSingleUse: result.data.promotion.max_uses_per_customer === 1,
        description: result.data.promotion.description || null,
      };

      onApplyPromotion(promotion);
      setCode('');
      setShowSuccess(true);

      // Hide success message after 3 seconds
      successTimeoutRef.current = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('[PromoCode] Apply error:', err);
      setError('Unable to apply promo code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [code, cart, onApplyPromotion]);

  /**
   * Handle key press in input
   */
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !isLoading && !disabled) {
      e.preventDefault();
      handleApply();
    }
  }, [handleApply, isLoading, disabled]);

  /**
   * Handle removing applied promotion
   */
  const handleRemove = useCallback(() => {
    onRemovePromotion();
    setShowSuccess(false);
  }, [onRemovePromotion]);

  // If a promotion is already applied, show it
  if (appliedPromotion) {
    return (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-green-800">
                  {appliedPromotion.code}
                </span>
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                  -{formatCurrency(appliedPromotion.discountAmount)}
                </span>
              </div>
              {appliedPromotion.name && (
                <p className="text-xs text-green-700 mt-0.5 truncate">
                  {appliedPromotion.name}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="
              p-1
              text-green-600 hover:text-green-800
              hover:bg-green-100
              rounded
              transition-colors duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            title="Remove promo code"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Input Row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <TagIcon className="w-4 h-4 text-gray-400" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Enter promo code"
            disabled={disabled || isLoading}
            className={`
              w-full h-10 pl-9 pr-3
              text-sm font-medium uppercase
              placeholder:normal-case placeholder:font-normal
              border rounded-lg
              transition-colors duration-150
              disabled:bg-gray-100 disabled:cursor-not-allowed
              ${error
                ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
              }
            `}
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={disabled || isLoading || !code.trim()}
          className="
            h-10 px-4
            text-sm font-medium
            text-white
            bg-blue-600 hover:bg-blue-700
            disabled:bg-gray-300 disabled:cursor-not-allowed
            rounded-lg
            transition-colors duration-150
            flex items-center gap-2
          "
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Applying...</span>
            </>
          ) : (
            'Apply'
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Success Message (temporary) */}
      {showSuccess && !appliedPromotion && (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircleIcon className="w-4 h-4 text-green-600" />
          <p className="text-xs text-green-700">Promo code applied successfully!</p>
        </div>
      )}
    </div>
  );
}

export default PromoCodeInput;
