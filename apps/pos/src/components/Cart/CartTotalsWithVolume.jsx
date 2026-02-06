/**
 * TeleTime POS - Cart Totals with Volume Pricing
 *
 * Enhanced totals display showing:
 * - Original subtotal before volume discounts
 * - Volume savings breakdown
 * - Item-level and cart-level discounts
 * - Tax calculations
 * - Grand total with total savings
 */

import { useMemo } from 'react';
import { TagIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { formatCurrency } from '../../utils/formatters';
import { useVolumeContextOptional } from '../../context/VolumeContext';

/**
 * Cart totals component with volume pricing
 * @param {object} props
 * @param {number} props.subtotal - Subtotal before discounts (uses volume-adjusted if available)
 * @param {number} props.originalSubtotal - Original subtotal without volume discounts
 * @param {number} props.volumeSavings - Volume discount savings amount
 * @param {number} props.itemDiscountTotal - Total of item-level discounts
 * @param {number} props.cartDiscount - Cart-wide discount amount
 * @param {number} props.discountTotal - Total discounts (volume + items + cart)
 * @param {string} props.taxLabel - Tax label (e.g., "HST 13%")
 * @param {number} props.hstAmount - HST amount (if applicable)
 * @param {number} props.gstAmount - GST amount (if applicable)
 * @param {number} props.pstAmount - PST amount (if applicable)
 * @param {number} props.taxAmount - Total tax amount
 * @param {number} props.total - Grand total
 * @param {string} props.province - Province code
 * @param {boolean} props.showVolumeBreakdown - Show detailed volume breakdown
 * @param {string} props.className - Additional CSS classes
 */
export function CartTotalsWithVolume({
  subtotal: propSubtotal = 0,
  originalSubtotal: propOriginalSubtotal,
  volumeSavings: propVolumeSavings,
  itemDiscountTotal = 0,
  cartDiscount = 0,
  discountTotal: propDiscountTotal,
  taxLabel = '',
  hstAmount = 0,
  gstAmount = 0,
  pstAmount = 0,
  taxAmount = 0,
  total = 0,
  province = 'ON',
  showVolumeBreakdown = true,
  className = '',
}) {
  // Try to get volume context for automatic integration
  const volumeContext = useVolumeContextOptional();

  // Calculate values from context or props
  const totals = useMemo(() => {
    if (volumeContext?.volumeAdjustedTotals) {
      const vt = volumeContext.volumeAdjustedTotals;
      return {
        originalSubtotal: vt.originalSubtotal,
        subtotal: vt.volumeSubtotal,
        volumeSavings: vt.volumeSavingsTotal,
        itemDiscountTotal: vt.itemDiscountTotal,
        cartDiscount: vt.cartDiscount,
        totalSavings: vt.totalSavings,
        hasVolumeSavings: vt.hasVolumeSavings,
      };
    }

    // Fall back to props
    const volumeSavings = propVolumeSavings || 0;
    const originalSubtotal = propOriginalSubtotal || propSubtotal + volumeSavings;
    const totalSavings = volumeSavings + itemDiscountTotal + cartDiscount;

    return {
      originalSubtotal,
      subtotal: propSubtotal,
      volumeSavings,
      itemDiscountTotal,
      cartDiscount,
      totalSavings,
      hasVolumeSavings: volumeSavings > 0,
    };
  }, [
    volumeContext,
    propSubtotal,
    propOriginalSubtotal,
    propVolumeSavings,
    itemDiscountTotal,
    cartDiscount,
  ]);

  const {
    originalSubtotal,
    subtotal,
    volumeSavings,
    totalSavings,
    hasVolumeSavings,
  } = totals;

  const hasDiscount = totalSavings > 0;
  const hasItemDiscounts = itemDiscountTotal > 0;
  const hasCartDiscount = cartDiscount > 0;

  // Determine if we should show tax breakdown
  const showTaxBreakdown = gstAmount > 0 && pstAmount > 0;

  return (
    <div className={`bg-gray-50 p-4 ${className}`}>
      {/* Original Subtotal (if volume discounts apply) */}
      {showVolumeBreakdown && hasVolumeSavings && (
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">Original Subtotal</span>
          <span className="font-medium text-gray-400 tabular-nums line-through">
            {formatCurrency(originalSubtotal)}
          </span>
        </div>
      )}

      {/* Volume Savings */}
      {showVolumeBreakdown && hasVolumeSavings && (
        <div className="flex justify-between items-center text-sm mt-1">
          <span className="flex items-center gap-1 text-green-600">
            <TagIcon className="w-3.5 h-3.5" />
            Volume Savings
          </span>
          <span className="font-medium text-green-600 tabular-nums">
            -{formatCurrency(volumeSavings)}
          </span>
        </div>
      )}

      {/* Subtotal (after volume discounts) */}
      <div className={`flex justify-between items-center text-sm ${hasVolumeSavings ? 'mt-2 pt-2 border-t border-gray-200' : ''}`}>
        <span className="text-gray-600">Subtotal</span>
        <span className="font-medium text-gray-900 tabular-nums">
          {formatCurrency(subtotal)}
        </span>
      </div>

      {/* Item Discounts */}
      {hasItemDiscounts && (
        <div className="flex justify-between items-center text-sm mt-1">
          <span className="text-green-600">Item Discounts</span>
          <span className="font-medium text-green-600 tabular-nums">
            -{formatCurrency(itemDiscountTotal)}
          </span>
        </div>
      )}

      {/* Cart Discount */}
      {hasCartDiscount && (
        <div className="flex justify-between items-center text-sm mt-1">
          <span className="text-green-600">Cart Discount</span>
          <span className="font-medium text-green-600 tabular-nums">
            -{formatCurrency(cartDiscount)}
          </span>
        </div>
      )}

      {/* Tax Section */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        {showTaxBreakdown ? (
          <>
            {/* GST */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">GST (5%)</span>
              <span className="font-medium text-gray-900 tabular-nums">
                {formatCurrency(gstAmount)}
              </span>
            </div>
            {/* PST/QST */}
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-gray-600">
                {province === 'QC' ? 'QST' : 'PST'} (
                {province === 'BC'
                  ? '7%'
                  : province === 'SK'
                  ? '6%'
                  : province === 'MB'
                  ? '7%'
                  : province === 'QC'
                  ? '9.975%'
                  : '0%'}
                )
              </span>
              <span className="font-medium text-gray-900 tabular-nums">
                {formatCurrency(pstAmount)}
              </span>
            </div>
          </>
        ) : (
          /* Single tax line (HST or GST only) */
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">{taxLabel || 'Tax'}</span>
            <span className="font-medium text-gray-900 tabular-nums">
              {formatCurrency(taxAmount)}
            </span>
          </div>
        )}
      </div>

      {/* Grand Total */}
      <div className="mt-3 pt-3 border-t-2 border-gray-300">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">Total</span>
          <span className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      {/* Savings Summary */}
      {hasDiscount && (
        <div className="mt-2 py-2 px-3 bg-green-100 rounded-lg">
          <div className="flex items-center justify-center gap-2">
            <SparklesIcon className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-green-700">
              You save {formatCurrency(totalSavings)}
            </span>
          </div>

          {/* Savings breakdown */}
          {showVolumeBreakdown && (hasVolumeSavings || hasItemDiscounts || hasCartDiscount) && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-green-600">
              {hasVolumeSavings && (
                <span>Volume: {formatCurrency(volumeSavings)}</span>
              )}
              {hasItemDiscounts && (
                <span>Items: {formatCurrency(itemDiscountTotal)}</span>
              )}
              {hasCartDiscount && (
                <span>Cart: {formatCurrency(cartDiscount)}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CartTotalsWithVolume;
