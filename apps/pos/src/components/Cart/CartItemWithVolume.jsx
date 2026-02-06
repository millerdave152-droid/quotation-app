/**
 * TeleTime POS - Cart Item Component with Volume Pricing
 *
 * Enhanced cart item row with:
 * - Volume discount badge display
 * - Strikethrough original price
 * - Next tier prompt
 * - Tier tooltip
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { TrashIcon, MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { VolumeDiscountBadge, VolumePriceDisplay } from './VolumeDiscountBadge';
import { VolumeTierTooltip, NextTierPrompt } from './VolumeTierTooltip';

/**
 * Cart item component with volume pricing
 * @param {object} props
 * @param {object} props.item - Cart item data
 * @param {object} props.volumeInfo - Volume pricing info from useVolumePricing
 * @param {object} props.nextTierInfo - Next tier info (unitsNeeded, etc.)
 * @param {Array} props.tiers - Available volume tiers for tooltip
 * @param {function} props.onUpdateQuantity - Callback to update quantity
 * @param {function} props.onRemove - Callback to remove item
 * @param {function} props.onSetSerialNumber - Callback to set serial number
 * @param {function} props.onLoadTiers - Callback to load tiers for tooltip
 * @param {boolean} props.disabled - Disable interactions
 * @param {boolean} props.showNextTierPrompt - Show "add X more" prompt
 */
export function CartItemWithVolume({
  item,
  volumeInfo,
  nextTierInfo,
  tiers = [],
  onUpdateQuantity,
  onRemove,
  onSetSerialNumber,
  onLoadTiers,
  disabled = false,
  showNextTierPrompt = true,
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showSerialInput, setShowSerialInput] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Calculate pricing
  const pricing = useMemo(() => {
    // Use volume pricing if available, otherwise fall back to item pricing
    const hasVolumeDiscount = volumeInfo?.hasVolumeDiscount || volumeInfo?.percentOff > 0;

    const basePrice = item.unitPrice;
    const effectivePrice = hasVolumeDiscount
      ? volumeInfo.unitPrice || volumeInfo.volumePriceCents / 100
      : basePrice;

    const baseAmount = basePrice * item.quantity;
    const effectiveAmount = effectivePrice * item.quantity;

    // Item-level discount (separate from volume)
    const itemDiscountAmount = effectiveAmount * (item.discountPercent / 100);
    const lineTotal = effectiveAmount - itemDiscountAmount;

    // Volume savings
    const volumeSavings = hasVolumeDiscount ? (basePrice - effectivePrice) * item.quantity : 0;

    // Total savings (volume + item discount)
    const totalSavings = volumeSavings + itemDiscountAmount;

    return {
      basePrice,
      effectivePrice,
      baseAmount,
      effectiveAmount,
      lineTotal,
      hasVolumeDiscount,
      volumeSavings,
      itemDiscountAmount,
      totalSavings,
      percentOff: volumeInfo?.percentOff || 0,
      tierName: volumeInfo?.tierName,
      pricingSource: volumeInfo?.pricingSource,
    };
  }, [item, volumeInfo]);

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

    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 10) {
      setIsSwiping(true);
      const offset = Math.max(-100, Math.min(0, deltaX));
      setSwipeOffset(offset);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset < -60) {
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

  // Add units for next tier
  const handleAddForNextTier = (unitsToAdd) => {
    if (!disabled) {
      onUpdateQuantity?.(item.id, item.quantity + unitsToAdd);
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
            <div className="flex items-start gap-2">
              <h4 className="text-sm font-semibold text-gray-900 truncate flex-1">
                {item.productName}
              </h4>

              {/* Volume tier tooltip */}
              {(tiers.length > 0 || onLoadTiers) && (
                <VolumeTierTooltip
                  tiers={tiers}
                  currentQuantity={item.quantity}
                  basePrice={pricing.basePrice}
                  onLoadTiers={onLoadTiers}
                  productId={item.productId}
                />
              )}
            </div>

            <p className="text-xs text-gray-500 truncate">{item.sku}</p>

            {/* Price display with volume discount */}
            <div className="mt-1 space-y-1">
              {/* Unit price row */}
              <div className="flex items-center gap-2 flex-wrap">
                {pricing.hasVolumeDiscount ? (
                  <VolumePriceDisplay
                    originalPrice={pricing.basePrice}
                    discountedPrice={pricing.effectivePrice}
                    quantity={item.quantity}
                    showQuantity={true}
                  />
                ) : (
                  <span className="text-sm text-gray-600">
                    {formatCurrency(pricing.basePrice)} × {item.quantity}
                  </span>
                )}

                {/* Item-level discount (separate from volume) */}
                {item.discountPercent > 0 && (
                  <span className="text-xs text-orange-600 font-medium">
                    -{item.discountPercent}% item
                  </span>
                )}
              </div>

              {/* Volume discount badge */}
              {pricing.hasVolumeDiscount && (
                <VolumeDiscountBadge
                  percentOff={pricing.percentOff}
                  tierName={pricing.tierName}
                  quantity={item.quantity}
                  savingsPerUnit={pricing.volumeSavings / item.quantity}
                  pricingSource={pricing.pricingSource}
                  compact={true}
                />
              )}

              {/* Savings summary */}
              {pricing.totalSavings > 0 && (
                <p className="text-xs text-green-600 font-medium">
                  You save {formatCurrency(pricing.totalSavings)}
                </p>
              )}

              {/* Next tier prompt */}
              {showNextTierPrompt && nextTierInfo && nextTierInfo.unitsNeeded > 0 && (
                <NextTierPrompt
                  unitsNeeded={nextTierInfo.unitsNeeded}
                  nextTierName={nextTierInfo.nextTierName}
                  nextTierDiscount={nextTierInfo.nextTierDiscount}
                  onAddUnits={handleAddForNextTier}
                  className="mt-1"
                />
              )}
            </div>

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
              {formatCurrency(pricing.lineTotal)}
            </span>

            {/* Show original total if discounted */}
            {pricing.totalSavings > 0 && (
              <span className="text-xs text-gray-400 line-through tabular-nums">
                {formatCurrency(pricing.baseAmount)}
              </span>
            )}

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
}

export default CartItemWithVolume;
