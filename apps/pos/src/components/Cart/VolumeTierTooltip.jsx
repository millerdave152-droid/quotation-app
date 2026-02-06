/**
 * TeleTime POS - Volume Tier Tooltip
 *
 * Shows all available volume tiers for a product:
 * - Quantity ranges
 * - Price at each tier
 * - Current tier highlight
 * - Next tier prompt
 */

import { useState, useEffect, useRef } from 'react';
import { InformationCircleIcon, ChevronRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Volume tier tooltip component
 * @param {object} props
 * @param {Array} props.tiers - Available volume tiers
 * @param {number} props.currentQuantity - Current quantity in cart
 * @param {number} props.basePrice - Base product price
 * @param {function} props.onLoadTiers - Callback to load tiers if not provided
 * @param {number} props.productId - Product ID for loading tiers
 * @param {string} props.className - Additional CSS classes
 */
export function VolumeTierTooltip({
  tiers = [],
  currentQuantity = 1,
  basePrice = 0,
  onLoadTiers,
  productId,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadedTiers, setLoadedTiers] = useState(tiers);
  const [loading, setLoading] = useState(false);
  const tooltipRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Load tiers on open if not provided
  const handleOpen = async () => {
    setIsOpen(!isOpen);

    if (!isOpen && loadedTiers.length === 0 && onLoadTiers && productId) {
      setLoading(true);
      try {
        const fetchedTiers = await onLoadTiers(productId);
        setLoadedTiers(fetchedTiers || []);
      } catch (err) {
        console.error('Failed to load tiers:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  // Find current tier index
  const currentTierIndex = loadedTiers.findIndex((tier) => {
    const maxQty = tier.maxQty || Infinity;
    return currentQuantity >= tier.minQty && currentQuantity <= maxQty;
  });

  // Don't show tooltip icon if no tiers available and not loading
  if (loadedTiers.length === 0 && !onLoadTiers) {
    return null;
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="
          p-1
          text-gray-400 hover:text-blue-500
          transition-colors duration-150
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
          rounded
        "
        aria-label="View volume tiers"
        title="View volume pricing tiers"
      >
        <InformationCircleIcon className="w-4 h-4" />
      </button>

      {/* Tooltip */}
      {isOpen && (
        <div
          ref={tooltipRef}
          className="
            absolute z-50
            bottom-full left-1/2 -translate-x-1/2 mb-2
            w-64
            bg-white
            rounded-lg
            shadow-lg
            border border-gray-200
            overflow-hidden
          "
        >
          {/* Header */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">
              Volume Pricing Tiers
            </h4>
            <p className="text-xs text-gray-500">
              Buy more, save more
            </p>
          </div>

          {/* Tiers list */}
          <div className="p-2">
            {loading ? (
              <div className="py-4 text-center">
                <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
                <p className="text-xs text-gray-500 mt-2">Loading tiers...</p>
              </div>
            ) : loadedTiers.length === 0 ? (
              <div className="py-4 text-center text-gray-500 text-sm">
                No volume tiers available
              </div>
            ) : (
              <div className="space-y-1">
                {loadedTiers.map((tier, index) => {
                  const isCurrentTier = index === currentTierIndex;
                  const isPastTier = index < currentTierIndex;
                  const isFutureTier = index > currentTierIndex;

                  // Calculate price for tier
                  const tierPrice = tier.priceCents
                    ? tier.priceCents / 100
                    : tier.discountPercent
                    ? basePrice * (1 - tier.discountPercent / 100)
                    : basePrice;

                  const savings = basePrice - tierPrice;
                  const savingsPercent = basePrice > 0 ? (savings / basePrice) * 100 : 0;

                  // Quantity range display
                  const qtyRange = tier.maxQty
                    ? `${tier.minQty}-${tier.maxQty}`
                    : `${tier.minQty}+`;

                  return (
                    <div
                      key={tier.id || index}
                      className={`
                        flex items-center gap-2 px-2 py-1.5 rounded
                        ${isCurrentTier ? 'bg-green-50 border border-green-200' : ''}
                        ${isPastTier ? 'opacity-50' : ''}
                      `}
                    >
                      {/* Status indicator */}
                      <div className="flex-shrink-0 w-5">
                        {isCurrentTier && (
                          <CheckCircleIcon className="w-4 h-4 text-green-500" />
                        )}
                        {isFutureTier && (
                          <ChevronRightIcon className="w-4 h-4 text-gray-300" />
                        )}
                      </div>

                      {/* Tier info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`text-xs font-medium ${
                              isCurrentTier ? 'text-green-700' : 'text-gray-700'
                            }`}
                          >
                            {qtyRange} units
                          </span>
                          <span
                            className={`text-xs font-semibold tabular-nums ${
                              isCurrentTier ? 'text-green-700' : 'text-gray-900'
                            }`}
                          >
                            {formatCurrency(tierPrice)}/ea
                          </span>
                        </div>

                        {/* Savings display */}
                        {savingsPercent > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {tier.tierName && (
                              <span className="text-xs text-gray-500">
                                {tier.tierName}
                              </span>
                            )}
                            <span className="text-xs text-green-600 font-medium">
                              {savingsPercent.toFixed(0)}% off
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {currentTierIndex >= 0 && currentTierIndex < loadedTiers.length - 1 && (
            <div className="px-3 py-2 bg-blue-50 border-t border-blue-100">
              <p className="text-xs text-blue-700">
                {(() => {
                  const nextTier = loadedTiers[currentTierIndex + 1];
                  if (!nextTier) return null;
                  const unitsNeeded = nextTier.minQty - currentQuantity;
                  return `Add ${unitsNeeded} more for ${
                    nextTier.discountPercent
                      ? `${nextTier.discountPercent}% off`
                      : 'better pricing'
                  }!`;
                })()}
              </p>
            </div>
          )}

          {/* Arrow */}
          <div
            className="
              absolute -bottom-2 left-1/2 -translate-x-1/2
              w-4 h-4
              bg-white
              border-r border-b border-gray-200
              transform rotate-45
            "
          />
        </div>
      )}
    </div>
  );
}

/**
 * Next tier prompt component
 * Shows "Add X more for Y% off" message
 */
export function NextTierPrompt({
  unitsNeeded,
  nextTierName,
  nextTierDiscount,
  onAddUnits,
  className = '',
}) {
  if (!unitsNeeded || unitsNeeded <= 0) {
    return null;
  }

  const discountDisplay = nextTierDiscount
    ? `${nextTierDiscount}% off`
    : nextTierName || 'better pricing';

  return (
    <div
      className={`
        flex items-center gap-2
        px-2 py-1
        bg-amber-50 border border-amber-200
        rounded-md
        ${className}
      `}
    >
      <span className="text-xs text-amber-700">
        Add <span className="font-semibold">{unitsNeeded}</span> more for{' '}
        <span className="font-semibold">{discountDisplay}</span>
      </span>

      {onAddUnits && (
        <button
          type="button"
          onClick={() => onAddUnits(unitsNeeded)}
          className="
            px-2 py-0.5
            text-xs font-medium
            text-amber-700 hover:text-amber-800
            bg-amber-100 hover:bg-amber-200
            rounded
            transition-colors duration-150
          "
        >
          +{unitsNeeded}
        </button>
      )}
    </div>
  );
}

export default VolumeTierTooltip;
