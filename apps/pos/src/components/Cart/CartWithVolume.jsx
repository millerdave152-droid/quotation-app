/**
 * TeleTime POS - Cart Component with Volume Pricing
 *
 * Enhanced cart container that integrates volume pricing:
 * - Wraps cart with VolumeProvider
 * - Uses CartItemWithVolume for line items
 * - Uses CartTotalsWithVolume for totals display
 * - Automatic tier loading and next-tier prompts
 */

import { useState, useCallback } from 'react';
import { ShoppingCartIcon, ArchiveBoxIcon, TagIcon } from '@heroicons/react/24/outline';
import { useCart } from '../../hooks/useCart';
import { VolumeProvider, useVolumeContext } from '../../context/VolumeContext';
import CartItemWithVolume from './CartItemWithVolume';
import CartTotalsWithVolume from './CartTotalsWithVolume';
import CartActions from './CartActions';
import CustomerBadge from './CustomerBadge';
import HeldTransactions from './HeldTransactions';

/**
 * Empty cart state component
 */
function EmptyCart() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <ShoppingCartIcon className="w-10 h-10 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Cart is Empty</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        Add products by clicking on them or scanning a barcode.
      </p>
    </div>
  );
}

/**
 * Held carts indicator button
 */
function HeldCartsButton({ count, onClick }) {
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        flex items-center gap-2
        px-3 py-2
        bg-yellow-100 hover:bg-yellow-200
        text-yellow-700 text-sm font-medium
        rounded-lg
        transition-colors duration-150
      "
    >
      <ArchiveBoxIcon className="w-5 h-5" />
      <span>{count} Held</span>
    </button>
  );
}

/**
 * Volume pricing indicator (shows when any item has volume discount)
 */
function VolumePricingIndicator({ hasVolumeDiscount, totalSavings }) {
  if (!hasVolumeDiscount) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
      <TagIcon className="w-3 h-3" />
      <span>Volume Pricing Active</span>
    </div>
  );
}

/**
 * Inner cart content component (uses volume context)
 */
function CartContent({
  onCheckout,
  onHold,
  onClear,
  onCustomerClick,
  onQuoteClick,
  className = '',
}) {
  const cart = useCart();
  const volumeContext = useVolumeContext();
  const [showHeldTransactions, setShowHeldTransactions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle quantity update
  const handleUpdateQuantity = useCallback(
    (itemId, quantity) => {
      cart.updateQuantity(itemId, quantity);
    },
    [cart]
  );

  // Handle item removal
  const handleRemoveItem = useCallback(
    (itemId) => {
      cart.removeItem(itemId);
    },
    [cart]
  );

  // Handle serial number change
  const handleSetSerialNumber = useCallback(
    (itemId, serialNumber) => {
      cart.setItemSerialNumber(itemId, serialNumber);
    },
    [cart]
  );

  // Handle checkout
  const handleCheckout = useCallback(async () => {
    // Validate cart
    const validation = cart.validateForCheckout();
    if (!validation.isValid) {
      alert(validation.errors.join('\n'));
      return;
    }

    setIsProcessing(true);
    try {
      await onCheckout?.();
    } finally {
      setIsProcessing(false);
    }
  }, [cart, onCheckout]);

  // Handle hold transaction
  const handleHold = useCallback(() => {
    if (onHold) {
      onHold();
    } else {
      const result = cart.holdCart();
      if (result.success) {
        console.log('[CartWithVolume] Transaction held successfully');
      }
    }
  }, [cart, onHold]);

  // Handle clear cart
  const handleClear = useCallback(() => {
    if (onClear) {
      onClear();
    } else {
      cart.clearCart();
      volumeContext.clearCache();
    }
  }, [cart, onClear, volumeContext]);

  // Handle customer removal
  const handleRemoveCustomer = useCallback(() => {
    cart.clearCustomer();
    volumeContext.clearCache();
  }, [cart, volumeContext]);

  // Handle recall held transaction
  const handleRecallHeld = useCallback(
    (heldId) => {
      const result = cart.recallCart(heldId);
      if (result.success) {
        setShowHeldTransactions(false);
        volumeContext.refreshCartPrices();
      }
    },
    [cart, volumeContext]
  );

  // Handle delete held transaction
  const handleDeleteHeld = useCallback(
    (heldId) => {
      cart.deleteHeldCart(heldId);
    },
    [cart]
  );

  // Handle clear all held transactions
  const handleClearAllHeld = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all held transactions?')) {
      cart.clearAllHeldCarts();
      setShowHeldTransactions(false);
    }
  }, [cart]);

  // Get items with volume info
  const itemsWithVolume = volumeContext.itemsWithVolumeInfo;

  return (
    <div
      className={`
        flex flex-col
        w-[380px] h-full
        bg-white
        border-l border-gray-200
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ShoppingCartIcon className="w-6 h-6 text-gray-700" />
          <h2 className="text-lg font-bold text-gray-900">Cart</h2>
          {cart.itemCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full">
              {cart.itemCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <VolumePricingIndicator
            hasVolumeDiscount={volumeContext.hasAnyVolumeDiscount}
            totalSavings={volumeContext.totalVolumeSavings}
          />
          <HeldCartsButton
            count={cart.heldCarts?.length || 0}
            onClick={() => setShowHeldTransactions(true)}
          />
        </div>
      </div>

      {/* Customer Badge */}
      {cart.customer && (
        <div className="p-3 border-b border-gray-100">
          <CustomerBadge
            customer={cart.customer}
            quoteId={cart.quoteId}
            quoteNumber={cart.quoteId}
            onRemove={handleRemoveCustomer}
          />
        </div>
      )}

      {/* Loading indicator */}
      {volumeContext.loading && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2 text-blue-600 text-sm">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Calculating volume pricing...</span>
          </div>
        </div>
      )}

      {/* Cart Items */}
      {cart.isEmpty ? (
        <EmptyCart />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {itemsWithVolume.map((item) => (
            <CartItemWithVolume
              key={item.id}
              item={item}
              volumeInfo={item.volumeInfo}
              nextTierInfo={item.nextTierInfo}
              tiers={item.tiers}
              onUpdateQuantity={handleUpdateQuantity}
              onRemove={handleRemoveItem}
              onSetSerialNumber={handleSetSerialNumber}
              onLoadTiers={volumeContext.loadTiersForProduct}
              disabled={isProcessing}
              showNextTierPrompt={true}
            />
          ))}
        </div>
      )}

      {/* Totals */}
      {!cart.isEmpty && (
        <CartTotalsWithVolume
          subtotal={volumeContext.volumeAdjustedTotals?.volumeSubtotal || cart.subtotal}
          originalSubtotal={volumeContext.volumeAdjustedTotals?.originalSubtotal}
          volumeSavings={volumeContext.volumeAdjustedTotals?.volumeSavingsTotal}
          itemDiscountTotal={volumeContext.volumeAdjustedTotals?.itemDiscountTotal || cart.itemDiscountTotal}
          cartDiscount={cart.cartDiscount}
          discountTotal={volumeContext.volumeAdjustedTotals?.totalSavings || cart.discountTotal}
          taxLabel={cart.taxLabel}
          hstAmount={cart.hstAmount}
          gstAmount={cart.gstAmount}
          pstAmount={cart.pstAmount}
          taxAmount={cart.taxAmount}
          total={cart.total}
          province={cart.province}
          showVolumeBreakdown={true}
        />
      )}

      {/* Actions */}
      <CartActions
        isEmpty={cart.isEmpty}
        hasCustomer={!!cart.customer}
        canCheckout={!cart.isEmpty && cart.hasActiveShift}
        onCheckout={handleCheckout}
        onHold={handleHold}
        onClear={handleClear}
        onCustomerLookup={onCustomerClick}
        onQuoteLookup={onQuoteClick}
        isProcessing={isProcessing}
      />

      {/* Held Transactions Modal */}
      <HeldTransactions
        isOpen={showHeldTransactions}
        onClose={() => setShowHeldTransactions(false)}
        heldCarts={cart.heldCarts || []}
        onRecall={handleRecallHeld}
        onDelete={handleDeleteHeld}
        onClearAll={handleClearAllHeld}
      />
    </div>
  );
}

/**
 * Main cart component with volume pricing
 * Wraps CartContent with VolumeProvider
 *
 * @param {object} props
 * @param {function} props.onCheckout - Callback when checkout is initiated
 * @param {function} props.onHold - Callback when cart is held
 * @param {function} props.onClear - Callback when cart is cleared
 * @param {function} props.onCustomerClick - Callback to open customer lookup
 * @param {function} props.onQuoteClick - Callback to open quote lookup
 * @param {string} props.className - Additional CSS classes
 */
export function CartWithVolume(props) {
  return (
    <VolumeProvider>
      <CartContent {...props} />
    </VolumeProvider>
  );
}

export default CartWithVolume;
