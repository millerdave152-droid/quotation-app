/**
 * Commission Preview Component
 * Shows sales rep their commission on the current cart
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { calculateCartCommission } from '../../api/commissions';

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Commission line item row
 */
function CommissionItem({ item, compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center justify-between text-sm py-1">
        <span className="text-gray-600 truncate flex-1 mr-2">{item.itemName}</span>
        <span className="text-gray-900 font-medium">{formatCurrency(item.commission)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{item.itemName}</span>
          {item.isBonus && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
              <SparklesIcon className="w-3 h-3" />
              Bonus
            </span>
          )}
          {item.isReduced && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">
              <ExclamationTriangleIcon className="w-3 h-3" />
              Reduced
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {formatCurrency(item.saleAmount)} × {item.ratePercent}
          {item.categoryName && ` • ${item.categoryName}`}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold ${item.isBonus ? 'text-green-600' : 'text-gray-900'}`}>
          {formatCurrency(item.commission)}
        </div>
      </div>
    </div>
  );
}

/**
 * Commission Preview Widget
 */
export default function CommissionPreview({
  cart,
  salesRepId,
  showBreakdown = true,
  compact = false,
  className = '',
}) {
  const [commission, setCommission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Debounced commission calculation
  const calculateCommission = useCallback(async () => {
    if (!cart?.items?.length || !salesRepId) {
      setCommission(null);
      return;
    }

    // Format cart for API
    const formattedCart = {
      subtotal: cart.subtotal || cart.items.reduce((sum, i) => sum + (i.lineTotal || i.price * i.quantity), 0),
      discount: cart.discount || 0,
      total: cart.total || cart.subtotal - (cart.discount || 0),
      items: cart.items.map(item => ({
        itemId: item.id || item.itemId,
        productId: item.productId || item.product_id,
        name: item.name || item.productName || item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice || item.unit_price || item.price,
        lineTotal: item.lineTotal || item.line_total || (item.price * item.quantity),
        discountCents: item.discountCents || 0,
        discountPercent: item.discountPercent || 0,
        itemType: item.itemType || item.item_type || 'product',
        categoryId: item.categoryId || item.category_id,
        categoryName: item.categoryName || item.category_name,
        productType: item.productType || item.product_type,
      })),
    };

    setLoading(true);
    setError(null);

    try {
      const result = await calculateCartCommission(formattedCart, salesRepId);
      setCommission(result.data);
    } catch (err) {
      console.error('[CommissionPreview] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cart, salesRepId]);

  // Recalculate when cart changes
  useEffect(() => {
    const timer = setTimeout(calculateCommission, 300); // Debounce
    return () => clearTimeout(timer);
  }, [calculateCommission]);

  // Don't show if no cart
  if (!cart?.items?.length) {
    return null;
  }

  // Compact view - just shows total
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <CurrencyDollarIcon className="w-4 h-4 text-green-600" />
        <span className="text-sm text-gray-600">Commission:</span>
        {loading ? (
          <span className="text-sm text-gray-400">Calculating...</span>
        ) : commission ? (
          <span className="text-sm font-semibold text-green-600">
            {formatCurrency(commission.totalCommission)}
          </span>
        ) : null}
      </div>
    );
  }

  // Full widget view
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-100 rounded-lg">
            <CurrencyDollarIcon className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">Your Commission</div>
            {commission?.summary && (
              <div className="text-xs text-gray-500">
                {commission.summary.itemCount} items
                {commission.summary.bonusCommission > 0 && (
                  <span className="text-green-600 ml-1">
                    (+{formatCurrency(commission.summary.bonusCommission)} bonus)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {loading ? (
            <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          ) : commission ? (
            <span className="text-lg font-bold text-green-600">
              {formatCurrency(commission.totalCommission)}
            </span>
          ) : error ? (
            <span className="text-sm text-red-500">Error</span>
          ) : null}

          {showBreakdown && (
            expanded ? (
              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            )
          )}
        </div>
      </button>

      {/* Breakdown */}
      {showBreakdown && expanded && commission && (
        <div className="border-t border-gray-200">
          {/* Items */}
          <div className="p-3 max-h-64 overflow-y-auto">
            {commission.breakdown.map((item, index) => (
              <CommissionItem key={item.itemId || index} item={item} />
            ))}
          </div>

          {/* Notes */}
          {commission.notes?.length > 0 && (
            <div className="px-3 pb-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <div className="text-xs font-medium text-blue-800 mb-1">Notes</div>
                <ul className="text-xs text-blue-700 space-y-0.5">
                  {commission.notes.map((note, i) => (
                    <li key={i}>• {note}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="px-3 pb-3 pt-2 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Base Commission</span>
              <span className="font-medium">{formatCurrency(commission.summary?.baseCommission)}</span>
            </div>
            {commission.summary?.bonusCommission > 0 && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-green-600">Bonus Commission</span>
                <span className="font-medium text-green-600">
                  +{formatCurrency(commission.summary.bonusCommission)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(commission.totalCommission)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-3 bg-red-50 border-t border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
