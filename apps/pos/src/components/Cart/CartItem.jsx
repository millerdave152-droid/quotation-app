/**
 * TeleTime POS - Cart Item Component
 * Individual item row in the shopping cart
 */

import { useState, useRef, useCallback, memo } from 'react';
import { TrashIcon, MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Cart item component
 * @param {object} props
 * @param {object} props.item - Cart item data
 * @param {function} props.onUpdateQuantity - Callback to update quantity
 * @param {function} props.onRemove - Callback to remove item
 * @param {function} props.onSetSerialNumber - Callback to set serial number
 * @param {boolean} props.disabled - Disable interactions
 */
export const CartItem = memo(function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
  onSetSerialNumber,
  disabled = false,
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showSerialInput, setShowSerialInput] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Calculate line total
  const baseAmount = item.unitPrice * item.quantity;
  const discountAmount = baseAmount * (item.discountPercent / 100);
  const lineTotal = baseAmount - discountAmount;

  // Touch handlers for swipe-to-remove
  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e) => {
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y);

    // Only swipe if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 10) {
      setIsSwiping(true);
      // Only allow left swipe (negative values), max -100px
      const offset = Math.max(-100, Math.min(0, deltaX));
      setSwipeOffset(offset);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset < -60) {
      // Trigger remove if swiped more than 60px
      onRemove?.(item.id);
    }
    setSwipeOffset(0);
    setIsSwiping(false);
  }, [swipeOffset, item.id, onRemove]);

  // Quantity handlers
  const handleIncrement = () => {
    if (!disabled) {
      onUpdateQuantity?.(item.id, item.quantity + 1);
    }
  };

  const handleDecrement = () => {
    if (!disabled && item.quantity > 1) {
      onUpdateQuantity?.(item.id, item.quantity - 1);
    }
  };

  // Serial number handler
  const handleSerialChange = (e) => {
    onSetSerialNumber?.(item.id, e.target.value);
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Delete backdrop (revealed on swipe) */}
      <div className="absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-center">
        <TrashIcon className="w-6 h-6 text-white" />
      </div>

      {/* Main item content */}
      <div
        className={`
          relative bg-white
          p-3 border-b border-gray-100
          transition-transform duration-150
          ${isSwiping ? '' : 'transition-transform'}
        `}
        style={{ transform: `translateX(${swipeOffset}px)` }}
      >
        <div className="flex items-start gap-3">
          {/* Product info */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 truncate">
              {item.productName}
            </h4>
            <p className="text-xs text-gray-500 truncate">{item.sku}</p>

            {/* Price per unit */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {formatCurrency(item.unitPrice)} × {item.quantity}
              </span>
              {item.discountPercent > 0 && (
                <span className="text-xs text-green-600 font-medium">
                  -{item.discountPercent}%
                </span>
              )}
            </div>

            {/* Discount savings */}
            {item.discountPercent > 0 && (
              <p className="text-xs text-green-600">
                Save {formatCurrency(discountAmount)}
              </p>
            )}

            {/* Serial number input */}
            {item.requiresSerial && (
              <div className="mt-2">
                {showSerialInput || item.serialNumber ? (
                  <input
                    type="text"
                    value={item.serialNumber || ''}
                    onChange={handleSerialChange}
                    placeholder="Enter serial number"
                    className="
                      w-full h-8 px-2
                      text-xs font-mono
                      border border-gray-300 rounded
                      focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                    "
                    disabled={disabled}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSerialInput(true)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                    disabled={disabled}
                  >
                    + Add Serial Number
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quantity controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={disabled || item.quantity <= 1}
              className="
                w-8 h-8
                flex items-center justify-center
                bg-gray-100 hover:bg-gray-200
                rounded-lg
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
              "
              aria-label="Decrease quantity"
            >
              <MinusIcon className="w-4 h-4" />
            </button>

            <span className="w-8 text-center text-sm font-semibold">
              {item.quantity}
            </span>

            <button
              type="button"
              onClick={handleIncrement}
              disabled={disabled}
              className="
                w-8 h-8
                flex items-center justify-center
                bg-gray-100 hover:bg-gray-200
                rounded-lg
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
              "
              aria-label="Increase quantity"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Line total and remove */}
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm font-bold text-gray-900 tabular-nums">
              {formatCurrency(lineTotal)}
            </span>

            <button
              type="button"
              onClick={() => onRemove?.(item.id)}
              disabled={disabled}
              className="
                w-6 h-6
                flex items-center justify-center
                text-gray-400 hover:text-red-500
                hover:bg-red-50 rounded
                transition-colors duration-150
              "
              aria-label="Remove item"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CartItem;
