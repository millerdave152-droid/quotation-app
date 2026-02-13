/**
 * TeleTime POS - Cart Item Component
 * Individual item row in the shopping cart with tap-to-expand detail view
 */

import { useState, useRef, useCallback, memo } from 'react';
import {
  TrashIcon,
  MinusIcon,
  PlusIcon,
  PencilSquareIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { DiscountSlider } from '../Discount/DiscountSlider';

/**
 * Cart item component
 * @param {object} props
 * @param {object} props.item - Cart item data
 * @param {function} props.onUpdateQuantity - Callback to update quantity
 * @param {function} props.onRemove - Callback to remove item
 * @param {function} props.onSetSerialNumber - Callback to set serial number
 * @param {function} props.onPriceOverride - Callback to open price override
 * @param {function} props.onApplyDiscount - Callback to apply discount (itemId, percent)
 * @param {boolean} props.disabled - Disable interactions
 */
export const CartItem = memo(function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
  onSetSerialNumber,
  onPriceOverride,
  onApplyDiscount,
  discountTier,
  discountBudget,
  onRequestEscalation,
  onBudgetUpdate,
  myEscalations,
  disabled = false,
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showSerialInput, setShowSerialInput] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Per-item escalation status
  const pendingEsc = myEscalations?.find(
    (e) => Number(e.product_id) === Number(item.productId) && (e.status || '').toLowerCase() === 'pending'
  );
  const approvedEsc = myEscalations?.find(
    (e) => Number(e.product_id) === Number(item.productId)
      && (e.status || '').toLowerCase() === 'approved'
      && !e.used_in_transaction_id
  );

  // Calculate line total
  const baseAmount = item.unitPrice * item.quantity;
  const discountAmount = baseAmount * (item.discountPercent / 100);
  const lineTotal = baseAmount - discountAmount;

  // Stock level check
  const stockQty = item.stockQty ?? item.stock_quantity ?? item.qty_on_hand ?? item.stock ?? null;
  const isLowStock = stockQty !== null && stockQty <= 3 && stockQty > 0;
  const isOutOfStock = stockQty !== null && stockQty <= 0;

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
  const handleIncrement = (e) => {
    e.stopPropagation();
    if (!disabled) {
      onUpdateQuantity?.(item.id, item.quantity + 1);
    }
  };

  const handleDecrement = (e) => {
    e.stopPropagation();
    if (!disabled && item.quantity > 1) {
      onUpdateQuantity?.(item.id, item.quantity - 1);
    }
  };

  // Serial number handler
  const handleSerialChange = (e) => {
    onSetSerialNumber?.(item.id, e.target.value);
  };

  // Toggle expanded view
  const toggleExpanded = () => {
    if (!isSwiping) {
      setIsExpanded((prev) => !prev);
    }
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
          border-b border-gray-100
          transition-transform duration-150
          ${isSwiping ? '' : 'transition-transform'}
        `}
        style={{ transform: `translateX(${swipeOffset}px)` }}
      >
        {/* Clickable main row */}
        <div
          className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={toggleExpanded}
        >
          <div className="flex items-start gap-3">
            {/* Product info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className={`text-sm font-semibold text-gray-900 ${isExpanded ? '' : 'truncate'}`}>
                  {item.productName}
                </h4>
                {isExpanded ? (
                  <ChevronUpIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                )}
              </div>
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

              {/* Low stock / Out of stock warning */}
              {isOutOfStock && (
                <div className="mt-1 flex items-center gap-1 text-xs text-red-600 font-medium">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Out of stock
                </div>
              )}
              {isLowStock && !isOutOfStock && (
                <div className="mt-1 flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Low stock ({stockQty} left)
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
                  w-10 h-10
                  flex items-center justify-center
                  bg-gray-100 hover:bg-gray-200
                  rounded-lg
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-150
                "
                aria-label="Decrease quantity"
              >
                <MinusIcon className="w-5 h-5" />
              </button>

              <span className="w-10 text-center text-sm font-semibold">
                {item.quantity}
              </span>

              <button
                type="button"
                onClick={handleIncrement}
                disabled={disabled}
                className="
                  w-10 h-10
                  flex items-center justify-center
                  bg-gray-100 hover:bg-gray-200
                  rounded-lg
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-150
                "
                aria-label="Increase quantity"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Line total and actions */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-bold text-gray-900 tabular-nums">
                {formatCurrency(lineTotal)}
              </span>

              <div className="flex items-center gap-1">
                {onPriceOverride && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPriceOverride?.(item); }}
                    disabled={disabled}
                    className="
                      w-6 h-6
                      flex items-center justify-center
                      text-gray-400 hover:text-blue-500
                      hover:bg-blue-50 rounded
                      transition-colors duration-150
                    "
                    aria-label="Override price"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove?.(item.id); }}
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

        {/* Expanded detail panel */}
        {isExpanded && (
          <div className="px-3 pb-3 bg-gray-50 border-t border-gray-100">
            {/* Discount Controls */}
            {onApplyDiscount && (
              <div className="mb-2 pt-2">
                {discountTier ? (
                  /* Full Discount Slider with margin/commission/budget */
                  <DiscountSlider
                    item={item}
                    tier={discountTier}
                    budget={discountBudget}
                    onApplyDiscount={onApplyDiscount}
                    onRequestEscalation={onRequestEscalation}
                    onBudgetUpdate={onBudgetUpdate}
                    pendingEscalation={pendingEsc}
                    approvedEscalation={approvedEsc}
                  />
                ) : (
                  /* Loading state while tier data loads */
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Loading discount authority...</span>
                  </div>
                )}
              </div>
            )}

            {/* Serial number input */}
            {item.requiresSerial && (
              <div className="mt-2">
                {showSerialInput || item.serialNumber ? (
                  <input
                    type="text"
                    value={item.serialNumber || ''}
                    onChange={handleSerialChange}
                    onClick={(e) => e.stopPropagation()}
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
                    onClick={(e) => { e.stopPropagation(); setShowSerialInput(true); }}
                    className="text-xs text-blue-600 hover:text-blue-700"
                    disabled={disabled}
                  >
                    + Add Serial Number
                  </button>
                )}
              </div>
            )}

            {/* Item details */}
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>Unit: {formatCurrency(item.unitPrice)}</span>
              {item.priceOverride && (
                <span className="text-blue-600 font-medium">Price override applied</span>
              )}
              {stockQty !== null && (
                <span>Stock: {stockQty}</span>
              )}
            </div>
          </div>
        )}

        {/* Serial input when NOT expanded (preserve existing behavior) */}
        {!isExpanded && item.requiresSerial && (
          <div className="px-3 pb-2">
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
    </div>
  );
});

export default CartItem;
