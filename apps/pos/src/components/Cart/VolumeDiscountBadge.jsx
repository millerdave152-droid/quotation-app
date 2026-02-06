/**
 * TeleTime POS - Volume Discount Badge
 *
 * Displays volume discount info with:
 * - Green badge when discount is applied
 * - Percentage off indicator
 * - Tier name display
 * - Savings amount
 */

import { useMemo } from 'react';
import { TagIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { formatCurrency } from '../../utils/formatters';

/**
 * Volume discount badge component
 * @param {object} props
 * @param {number} props.percentOff - Discount percentage
 * @param {string} props.tierName - Name of the volume tier
 * @param {number} props.quantity - Current quantity
 * @param {number} props.savingsPerUnit - Savings per unit in dollars
 * @param {string} props.pricingSource - Source of the pricing (customer_volume, tier_volume, etc.)
 * @param {boolean} props.compact - Show compact version
 * @param {string} props.className - Additional CSS classes
 */
export function VolumeDiscountBadge({
  percentOff = 0,
  tierName,
  quantity,
  savingsPerUnit = 0,
  pricingSource,
  compact = false,
  className = '',
}) {
  // Don't render if no discount
  if (!percentOff || percentOff <= 0) {
    return null;
  }

  // Determine badge style based on pricing source
  const badgeStyle = useMemo(() => {
    switch (pricingSource) {
      case 'customer_volume':
        return {
          bg: 'bg-purple-100',
          text: 'text-purple-700',
          border: 'border-purple-200',
          icon: SparklesIcon,
          label: 'VIP',
        };
      case 'tier_volume':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          border: 'border-blue-200',
          icon: TagIcon,
          label: 'Tier',
        };
      case 'product_volume+tier_bonus':
        return {
          bg: 'bg-emerald-100',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
          icon: SparklesIcon,
          label: 'Bonus',
        };
      default:
        return {
          bg: 'bg-green-100',
          text: 'text-green-700',
          border: 'border-green-200',
          icon: TagIcon,
          label: 'Volume',
        };
    }
  }, [pricingSource]);

  const IconComponent = badgeStyle.icon;

  if (compact) {
    return (
      <span
        className={`
          inline-flex items-center gap-1
          px-1.5 py-0.5
          text-xs font-medium
          ${badgeStyle.bg} ${badgeStyle.text}
          rounded
          ${className}
        `}
        title={`Volume discount: ${percentOff}% off (${tierName || `${quantity}+ units`})`}
      >
        <IconComponent className="w-3 h-3" />
        -{percentOff}%
      </span>
    );
  }

  return (
    <div
      className={`
        inline-flex items-center gap-1.5
        px-2 py-1
        text-xs font-medium
        ${badgeStyle.bg} ${badgeStyle.text}
        border ${badgeStyle.border}
        rounded-full
        ${className}
      `}
    >
      <IconComponent className="w-3.5 h-3.5" />
      <span>
        {percentOff}% off
        {tierName && (
          <span className="opacity-75 ml-1">({tierName})</span>
        )}
      </span>
      {savingsPerUnit > 0 && (
        <span className="opacity-75">
          · Save {formatCurrency(savingsPerUnit)}/ea
        </span>
      )}
    </div>
  );
}

/**
 * Volume savings display - shows strikethrough original and discounted price
 * @param {object} props
 * @param {number} props.originalPrice - Original price per unit
 * @param {number} props.discountedPrice - Discounted price per unit
 * @param {number} props.quantity - Quantity
 * @param {boolean} props.showQuantity - Whether to show quantity multiplier
 */
export function VolumePriceDisplay({
  originalPrice,
  discountedPrice,
  quantity = 1,
  showQuantity = true,
}) {
  const hasDiscount = discountedPrice < originalPrice;

  if (!hasDiscount) {
    return (
      <span className="text-sm text-gray-600">
        {formatCurrency(originalPrice)}
        {showQuantity && quantity > 1 && ` × ${quantity}`}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-400 line-through">
        {formatCurrency(originalPrice)}
      </span>
      <span className="text-sm font-medium text-green-600">
        {formatCurrency(discountedPrice)}
        {showQuantity && quantity > 1 && ` × ${quantity}`}
      </span>
    </div>
  );
}

export default VolumeDiscountBadge;
