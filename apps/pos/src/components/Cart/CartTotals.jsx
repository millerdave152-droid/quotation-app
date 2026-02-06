/**
 * TeleTime POS - Cart Totals Component
 * Displays subtotal, discounts, trade-ins, taxes, and grand total
 */

import { formatCurrency } from '../../utils/formatters';
import { ArrowsRightLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

/**
 * Cart totals component
 * @param {object} props
 * @param {number} props.subtotal - Subtotal before discounts
 * @param {number} props.itemDiscountTotal - Total of item-level discounts
 * @param {number} props.cartDiscount - Cart-wide discount amount
 * @param {number} props.discountTotal - Total discounts (items + cart)
 * @param {string} props.taxLabel - Tax label (e.g., "HST 13%", "GST 5% + PST 7%")
 * @param {number} props.hstAmount - HST amount (if applicable)
 * @param {number} props.gstAmount - GST amount (if applicable)
 * @param {number} props.pstAmount - PST amount (if applicable)
 * @param {number} props.taxAmount - Total tax amount
 * @param {number} props.total - Grand total
 * @param {string} props.province - Province code
 * @param {number} props.tradeInTotal - Total trade-in credit
 * @param {boolean} props.hasPendingTradeIns - Whether any trade-ins are pending approval
 * @param {string} props.className - Additional CSS classes
 */
export function CartTotals({
  subtotal = 0,
  itemDiscountTotal = 0,
  cartDiscount = 0,
  discountTotal = 0,
  taxLabel = '',
  hstAmount = 0,
  gstAmount = 0,
  pstAmount = 0,
  taxAmount = 0,
  total = 0,
  province = 'ON',
  tradeInTotal = 0,
  hasPendingTradeIns = false,
  className = '',
}) {
  const hasDiscount = discountTotal > 0;
  const hasItemDiscounts = itemDiscountTotal > 0;
  const hasCartDiscount = cartDiscount > 0;
  const hasTradeIn = tradeInTotal > 0;

  // Adjust total for trade-in credit
  const finalTotal = Math.max(0, total - tradeInTotal);

  // Determine if we should show tax breakdown
  const showTaxBreakdown = gstAmount > 0 && pstAmount > 0;

  return (
    <div className={`bg-gray-50 p-4 ${className}`}>
      {/* Subtotal */}
      <div className="flex justify-between items-center text-sm">
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

      {/* Trade-In Credit */}
      {hasTradeIn && (
        <div className="flex justify-between items-center text-sm mt-1">
          <span className="text-emerald-600 flex items-center gap-1">
            <ArrowsRightLeftIcon className="w-4 h-4" />
            Trade-In Credit
            {hasPendingTradeIns && (
              <ExclamationTriangleIcon className="w-3 h-3 text-yellow-500" title="Pending approval" />
            )}
          </span>
          <span className="font-medium text-emerald-600 tabular-nums">
            -{formatCurrency(tradeInTotal)}
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
        {/* Show original total if trade-in applied */}
        {hasTradeIn && (
          <div className="flex justify-between items-center text-sm mb-1">
            <span className="text-gray-500">Order Total</span>
            <span className="text-gray-500 tabular-nums line-through">
              {formatCurrency(total)}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">
            {hasTradeIn ? 'Amount Due' : 'Total'}
          </span>
          <span className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatCurrency(finalTotal)}
          </span>
        </div>
      </div>

      {/* Savings Summary */}
      {(hasDiscount || hasTradeIn) && (
        <div className="mt-2 py-2 px-3 bg-green-100 rounded-lg">
          <div className="flex items-center justify-center gap-2">
            <svg
              className="w-4 h-4 text-green-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-semibold text-green-700">
              You save {formatCurrency(discountTotal + tradeInTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CartTotals;
