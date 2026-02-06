/**
 * Cart Commission Footer
 * Subtle commission preview shown at bottom of cart
 * Only visible to users with view_commission permission
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CurrencyDollarIcon,
  ChevronRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { calculateCartCommission } from '../../api/commissions';
import CommissionBreakdownModal from './CommissionBreakdownModal';

/**
 * Format currency compactly
 */
function formatCurrency(amount) {
  if (amount == null) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

/**
 * Cart Commission Footer Component
 */
export default function CartCommissionFooter({
  cart,
  salesRepId,
  hasPermission = true, // Check 'view_commission' permission externally
  className = '',
}) {
  const [commission, setCommission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Calculate commission when cart changes
  const calculateCommission = useCallback(async () => {
    if (!cart?.items?.length || !salesRepId || !hasPermission) {
      setCommission(null);
      return;
    }

    // Format cart for API
    const formattedCart = {
      subtotal: cart.subtotal || cart.items.reduce((sum, i) => sum + (i.lineTotal || i.price * i.quantity), 0),
      discount: cart.discount || 0,
      total: cart.total || (cart.subtotal || 0) - (cart.discount || 0),
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

    try {
      const result = await calculateCartCommission(formattedCart, salesRepId);
      setCommission(result.data);
    } catch (err) {
      console.error('[CartCommissionFooter] Error:', err);
      setCommission(null);
    } finally {
      setLoading(false);
    }
  }, [cart, salesRepId, hasPermission]);

  // Debounced calculation
  useEffect(() => {
    const timer = setTimeout(calculateCommission, 400);
    return () => clearTimeout(timer);
  }, [calculateCommission]);

  // Don't render if no permission or no cart
  if (!hasPermission || !cart?.items?.length) {
    return null;
  }

  const hasBonus = commission?.summary?.bonusCommission > 0;
  const hasReduced = commission?.summary?.reducedItems > 0;

  return (
    <>
      {/* Subtle footer bar */}
      <button
        onClick={() => setShowModal(true)}
        disabled={!commission || loading}
        className={`
          w-full flex items-center justify-between
          px-4 py-2.5
          bg-gradient-to-r from-slate-50 to-slate-100
          border-t border-slate-200
          hover:from-slate-100 hover:to-slate-150
          transition-all duration-200
          group
          ${className}
        `}
      >
        <div className="flex items-center gap-2">
          <CurrencyDollarIcon className="w-4 h-4 text-slate-400 group-hover:text-green-500 transition-colors" />
          <span className="text-sm text-slate-500">Est. Commission</span>
          {hasBonus && (
            <SparklesIcon className="w-3.5 h-3.5 text-amber-500" title="Includes bonus" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {loading ? (
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
          ) : commission ? (
            <span className={`
              text-sm font-semibold
              ${hasBonus ? 'text-green-600' : 'text-slate-700'}
            `}>
              {formatCurrency(commission.totalCommission)}
            </span>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          )}
          <ChevronRightIcon className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </div>
      </button>

      {/* Breakdown modal */}
      <CommissionBreakdownModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        commission={commission}
        cart={cart}
      />
    </>
  );
}
