/**
 * TeleTime POS - Held Transactions Component
 * Modal showing parked/held transactions
 */

import { useEffect } from 'react';
import {
  XMarkIcon,
  ClockIcon,
  ShoppingCartIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

/**
 * Held transaction item component
 */
function HeldTransactionItem({ transaction, onRecall, onDelete }) {
  const {
    id,
    timestamp,
    heldAt,
    label,
    items = [],
    customer,
    total,
    itemCount,
  } = transaction;

  // Support both timestamp and heldAt field names
  const heldTime = timestamp || (heldAt ? new Date(heldAt).getTime() : Date.now());

  // Calculate item count if not provided
  const count = itemCount || items.reduce((sum, item) => sum + item.quantity, 0);

  // Format time ago
  const getTimeAgo = (ts) => {
    const now = Date.now();
    const diff = now - ts;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return formatDateTime(new Date(ts));
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
      {/* Cart Icon */}
      <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <ShoppingCartIcon className="w-6 h-6 text-yellow-600" />
      </div>

      {/* Transaction Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {count} {count === 1 ? 'item' : 'items'}
          </span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>

        {customer && (
          <p className="text-xs text-gray-600 truncate">
            {customer.customerName || customer.name}
          </p>
        )}

        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
          <ClockIcon className="w-3 h-3" />
          <span>{label || getTimeAgo(heldTime)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRecall(id)}
          className="
            h-10 px-4
            flex items-center gap-2
            bg-blue-600 hover:bg-blue-700
            text-white text-sm font-medium
            rounded-lg
            transition-colors duration-150
          "
        >
          <ArrowPathIcon className="w-4 h-4" />
          Recall
        </button>

        <button
          type="button"
          onClick={() => onDelete(id)}
          className="
            w-10 h-10
            flex items-center justify-center
            text-gray-400 hover:text-red-500
            hover:bg-red-50
            rounded-lg
            transition-colors duration-150
          "
          aria-label="Delete held transaction"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Held transactions modal component
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Callback to close modal
 * @param {Array} props.heldCarts - Array of held transactions
 * @param {function} props.onRecall - Callback to recall a transaction
 * @param {function} props.onDelete - Callback to delete a transaction
 * @param {function} props.onClearAll - Callback to clear all held transactions
 */
export function HeldTransactions({
  isOpen,
  onClose,
  heldCarts = [],
  onRecall,
  onDelete,
  onClearAll,
}) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-50 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Held Transactions</h2>
            <p className="text-sm text-gray-500">
              {heldCarts.length} {heldCarts.length === 1 ? 'transaction' : 'transactions'} on hold
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="
              w-10 h-10
              flex items-center justify-center
              text-gray-400 hover:text-gray-600
              hover:bg-gray-100
              rounded-lg
              transition-colors duration-150
            "
            aria-label="Close"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {heldCarts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                <ShoppingCartIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Held Transactions
              </h3>
              <p className="text-sm text-gray-500 max-w-xs">
                When you put a transaction on hold, it will appear here for later recall.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {heldCarts.map((transaction) => (
                <HeldTransactionItem
                  key={transaction.id}
                  transaction={transaction}
                  onRecall={onRecall}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {heldCarts.length > 0 && (
          <div className="p-4 bg-white border-t border-gray-200">
            <button
              type="button"
              onClick={onClearAll}
              className="
                w-full h-11
                flex items-center justify-center gap-2
                bg-red-100 hover:bg-red-200
                text-red-700 font-medium
                rounded-lg
                transition-colors duration-150
              "
            >
              <TrashIcon className="w-5 h-5" />
              Clear All Held Transactions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default HeldTransactions;
