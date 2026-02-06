/**
 * TeleTime POS - Customer Price Display Components
 *
 * Components for displaying customer-specific pricing:
 * - Price with savings badge
 * - Tier indicator
 * - Volume discount preview
 */

import { useState, useEffect, useCallback } from 'react';
import {
  TagIcon,
  SparklesIcon,
  TrophyIcon,
  BuildingStorefrontIcon,
  UserGroupIcon,
  BriefcaseIcon,
  IdentificationIcon,
  CubeIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

// ============================================================================
// TIER BADGE COMPONENT
// ============================================================================

/**
 * Tier icon mapping
 */
const TIER_ICONS = {
  retail: BuildingStorefrontIcon,
  wholesale: CubeIcon,
  vip: TrophyIcon,
  contractor: BriefcaseIcon,
  dealer: IdentificationIcon,
  employee: UserGroupIcon,
  cost_plus: SparklesIcon,
};

/**
 * Tier color mapping
 */
const TIER_COLORS = {
  retail: 'bg-gray-100 text-gray-700',
  wholesale: 'bg-blue-100 text-blue-700',
  vip: 'bg-purple-100 text-purple-700',
  contractor: 'bg-orange-100 text-orange-700',
  dealer: 'bg-green-100 text-green-700',
  employee: 'bg-indigo-100 text-indigo-700',
  cost_plus: 'bg-yellow-100 text-yellow-700',
};

/**
 * Customer tier badge
 */
export function TierBadge({ tier, tierName, discount, size = 'md', showDiscount = true }) {
  const Icon = TIER_ICONS[tier] || BuildingStorefrontIcon;
  const colorClass = TIER_COLORS[tier] || TIER_COLORS.retail;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        ${sizeClasses[size]}
        ${colorClass}
        font-medium rounded-full
      `}
    >
      <Icon className={iconSizes[size]} />
      <span>{tierName || tier}</span>
      {showDiscount && discount > 0 && (
        <span className="opacity-75">({discount}% off)</span>
      )}
    </span>
  );
}

// ============================================================================
// CUSTOMER PRICE DISPLAY
// ============================================================================

/**
 * Display customer price with comparison to base price
 */
export function CustomerPriceDisplay({
  basePrice,
  customerPrice,
  savings,
  savingsPercent,
  pricingSource,
  volumeDiscount,
  quantity = 1,
  showBasePrice = true,
  showSavings = true,
  size = 'md',
  className = '',
}) {
  const hasDiscount = savings > 0;

  const priceClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  const baseClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Customer Price */}
      <div className="flex items-baseline gap-2">
        <span className={`font-bold text-gray-900 ${priceClasses[size]} tabular-nums`}>
          {formatCurrency(customerPrice)}
        </span>

        {showBasePrice && hasDiscount && (
          <span className={`line-through text-gray-400 ${baseClasses[size]} tabular-nums`}>
            {formatCurrency(basePrice)}
          </span>
        )}
      </div>

      {/* Savings Badge */}
      {showSavings && hasDiscount && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <ArrowTrendingDownIcon className="w-3 h-3" />
            Save {formatCurrency(savings)} ({savingsPercent.toFixed(0)}%)
          </span>

          {/* Pricing source indicator */}
          {pricingSource && pricingSource !== 'base' && (
            <PricingSourceBadge source={pricingSource} size="sm" />
          )}

          {/* Volume discount indicator */}
          {volumeDiscount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              <CubeIcon className="w-3 h-3" />
              +{volumeDiscount.toFixed(0)}% volume
            </span>
          )}
        </div>
      )}

      {/* Per-unit price for quantities > 1 */}
      {quantity > 1 && (
        <p className="text-xs text-gray-500 mt-1">
          {formatCurrency(customerPrice / quantity)} each
        </p>
      )}
    </div>
  );
}

// ============================================================================
// PRICING SOURCE BADGE
// ============================================================================

const SOURCE_LABELS = {
  base: 'Base Price',
  tier: 'Tier Discount',
  tier_cost_plus: 'Cost Plus',
  category: 'Category Discount',
  customer_fixed: 'Special Price',
  customer_discount: 'Customer Discount',
  customer_cost_plus: 'Cost Plus',
};

const SOURCE_COLORS = {
  base: 'bg-gray-100 text-gray-600',
  tier: 'bg-blue-100 text-blue-700',
  tier_cost_plus: 'bg-yellow-100 text-yellow-700',
  category: 'bg-purple-100 text-purple-700',
  customer_fixed: 'bg-green-100 text-green-700',
  customer_discount: 'bg-green-100 text-green-700',
  customer_cost_plus: 'bg-yellow-100 text-yellow-700',
};

/**
 * Pricing source indicator badge
 */
export function PricingSourceBadge({ source, size = 'sm' }) {
  const label = SOURCE_LABELS[source] || source;
  const colorClass = SOURCE_COLORS[source] || 'bg-gray-100 text-gray-600';

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-0.5 text-sm',
  };

  return (
    <span className={`inline-flex ${sizeClasses[size]} ${colorClass} font-medium rounded`}>
      {label}
    </span>
  );
}

// ============================================================================
// VOLUME DISCOUNT PREVIEW
// ============================================================================

/**
 * Show available volume discounts
 */
export function VolumeDiscountPreview({
  volumeDiscounts = [],
  currentQuantity = 1,
  basePrice,
  className = '',
}) {
  if (!volumeDiscounts || volumeDiscounts.length === 0) {
    return null;
  }

  // Find next tier
  const nextTier = volumeDiscounts.find((vd) => vd.minQuantity > currentQuantity);
  const currentTier = volumeDiscounts
    .filter((vd) => vd.minQuantity <= currentQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];

  return (
    <div className={`text-sm ${className}`}>
      {/* Current volume discount */}
      {currentTier && (
        <div className="flex items-center gap-1.5 text-green-700">
          <CubeIcon className="w-4 h-4" />
          <span>
            {currentTier.discountPercent}% volume discount applied (qty {currentQuantity})
          </span>
        </div>
      )}

      {/* Next tier hint */}
      {nextTier && (
        <div className="flex items-center gap-1.5 text-gray-500 mt-1">
          <SparklesIcon className="w-4 h-4" />
          <span>
            Buy {nextTier.minQuantity - currentQuantity} more for{' '}
            {nextTier.discountPercent}% off
            {basePrice && (
              <span className="font-medium text-green-600 ml-1">
                (save {formatCurrency(basePrice * (nextTier.discountPercent / 100))}/ea)
              </span>
            )}
          </span>
        </div>
      )}

      {/* All tiers table */}
      {volumeDiscounts.length > 1 && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
          {volumeDiscounts.slice(0, 5).map((vd, i) => (
            <div
              key={i}
              className={`
                px-2 py-1 rounded text-center
                ${
                  vd.minQuantity <= currentQuantity
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }
              `}
            >
              {vd.minQuantity}+: {vd.discountPercent}%
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PRICE COMPARISON LINE
// ============================================================================

/**
 * Simple inline price comparison
 */
export function PriceComparisonLine({
  label,
  basePrice,
  customerPrice,
  showDifference = true,
}) {
  const diff = basePrice - customerPrice;
  const hasSavings = diff > 0;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        {hasSavings && (
          <span className="line-through text-gray-400 text-xs tabular-nums">
            {formatCurrency(basePrice)}
          </span>
        )}
        <span className="font-semibold text-gray-900 tabular-nums">
          {formatCurrency(customerPrice)}
        </span>
        {showDifference && hasSavings && (
          <span className="text-green-600 text-xs tabular-nums">
            (-{formatCurrency(diff)})
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CUSTOMER PRICING CARD
// ============================================================================

/**
 * Full customer pricing info card
 */
export function CustomerPricingCard({
  customer,
  pricingInfo,
  onChangeTier,
  isEditable = false,
  className = '',
}) {
  if (!customer || !pricingInfo) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
        <p className="text-sm text-gray-500">No customer selected - using retail pricing</p>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{customer.name}</h3>
          <p className="text-sm text-gray-500">{customer.email || customer.phone}</p>
        </div>
        <TierBadge
          tier={pricingInfo.pricingTier}
          tierName={pricingInfo.tierName}
          discount={pricingInfo.effectiveDiscount}
        />
      </div>

      {/* Pricing Details */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Base Tier Discount</span>
          <span className="font-medium">{pricingInfo.tierBaseDiscount}%</span>
        </div>

        {pricingInfo.customerDiscount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Customer Discount</span>
            <span className="font-medium">{pricingInfo.customerDiscount}%</span>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-gray-100">
          <span className="text-gray-700 font-medium">Effective Discount</span>
          <span className="font-bold text-green-600">
            {pricingInfo.effectiveDiscount}%
          </span>
        </div>

        {pricingInfo.costPlusMargin && (
          <div className="flex justify-between text-yellow-700">
            <span>Cost Plus Margin</span>
            <span className="font-medium">{pricingInfo.costPlusMargin}%</span>
          </div>
        )}

        {pricingInfo.creditLimitCents && (
          <div className="flex justify-between text-blue-700">
            <span>Credit Limit</span>
            <span className="font-medium">
              {formatCurrency(pricingInfo.creditLimitCents / 100)}
            </span>
          </div>
        )}
      </div>

      {/* Volume Discount Eligibility */}
      {pricingInfo.volumeDiscountEligible && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-sm text-blue-600">
            <CubeIcon className="w-4 h-4" />
            <span>Volume discounts apply</span>
          </div>
        </div>
      )}

      {/* Edit Tier Button */}
      {isEditable && onChangeTier && (
        <button
          onClick={onChangeTier}
          className="
            mt-3 w-full py-2
            text-sm font-medium
            text-blue-600 hover:text-blue-700
            hover:bg-blue-50
            rounded-lg
            transition-colors
          "
        >
          Change Pricing Tier
        </button>
      )}
    </div>
  );
}

export default CustomerPriceDisplay;
