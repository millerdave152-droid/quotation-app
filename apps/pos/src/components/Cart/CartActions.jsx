/**
 * TeleTime POS - Cart Actions Component
 * Action buttons for cart operations
 */

import { useState } from 'react';
import {
  CreditCardIcon,
  PauseCircleIcon,
  TrashIcon,
  UserPlusIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

/**
 * Confirmation dialog component
 */
function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>

        <p className="text-sm text-gray-600 mb-6">{message}</p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="
              flex-1 h-11
              bg-gray-100 hover:bg-gray-200
              text-gray-700 font-medium
              rounded-lg
              transition-colors duration-150
            "
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="
              flex-1 h-11
              bg-red-600 hover:bg-red-700
              text-white font-medium
              rounded-lg
              transition-colors duration-150
            "
          >
            Clear Cart
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Cart actions component
 * @param {object} props
 * @param {boolean} props.isEmpty - Whether cart is empty
 * @param {boolean} props.hasCustomer - Whether customer is attached
 * @param {boolean} props.canCheckout - Whether checkout is allowed
 * @param {function} props.onCheckout - Callback for checkout
 * @param {function} props.onHold - Callback to hold transaction
 * @param {function} props.onClear - Callback to clear cart
 * @param {function} props.onCustomerLookup - Callback to open customer lookup
 * @param {boolean} props.isProcessing - Whether a transaction is processing
 * @param {string} props.className - Additional CSS classes
 */
export function CartActions({
  isEmpty = true,
  hasCustomer = false,
  canCheckout = false,
  onCheckout,
  onHold,
  onClear,
  onCustomerLookup,
  isProcessing = false,
  className = '',
}) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearClick = () => {
    if (!isEmpty) {
      setShowClearConfirm(true);
    }
  };

  const handleConfirmClear = () => {
    setShowClearConfirm(false);
    onClear?.();
  };

  const handleCancelClear = () => {
    setShowClearConfirm(false);
  };

  return (
    <div className={`p-4 bg-white border-t border-gray-200 ${className}`}>
      {/* Primary action: Checkout */}
      <button
        type="button"
        onClick={onCheckout}
        disabled={!canCheckout || isProcessing}
        className="
          w-full h-14
          flex items-center justify-center gap-2
          bg-green-600 hover:bg-green-700
          disabled:bg-gray-300 disabled:cursor-not-allowed
          text-white text-lg font-bold
          rounded-xl
          shadow-lg
          transition-all duration-150
          active:scale-[0.98]
        "
      >
        {isProcessing ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <CreditCardIcon className="w-6 h-6" />
            <span>Checkout</span>
          </>
        )}
      </button>

      {/* Secondary actions */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {/* Customer Lookup */}
        <button
          type="button"
          onClick={onCustomerLookup}
          disabled={isProcessing}
          className="
            h-12
            flex flex-col items-center justify-center
            bg-gray-100 hover:bg-gray-200
            disabled:opacity-50 disabled:cursor-not-allowed
            text-gray-700
            rounded-lg
            transition-colors duration-150
          "
        >
          <UserPlusIcon className="w-5 h-5" />
          <span className="text-xs mt-0.5">
            {hasCustomer ? 'Change' : 'Customer'}
          </span>
        </button>

        {/* Hold Transaction */}
        <button
          type="button"
          onClick={onHold}
          disabled={isEmpty || isProcessing}
          className="
            h-12
            flex flex-col items-center justify-center
            bg-yellow-100 hover:bg-yellow-200
            disabled:opacity-50 disabled:cursor-not-allowed
            text-yellow-700
            rounded-lg
            transition-colors duration-150
          "
        >
          <PauseCircleIcon className="w-5 h-5" />
          <span className="text-xs mt-0.5">Hold</span>
        </button>

        {/* Clear Cart */}
        <button
          type="button"
          onClick={handleClearClick}
          disabled={isEmpty || isProcessing}
          className="
            h-12
            flex flex-col items-center justify-center
            bg-red-100 hover:bg-red-200
            disabled:opacity-50 disabled:cursor-not-allowed
            text-red-700
            rounded-lg
            transition-colors duration-150
          "
        >
          <TrashIcon className="w-5 h-5" />
          <span className="text-xs mt-0.5">Clear</span>
        </button>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Clear Cart"
        message="Are you sure you want to clear all items from the cart? This action cannot be undone."
        onConfirm={handleConfirmClear}
        onCancel={handleCancelClear}
      />
    </div>
  );
}

export default CartActions;
