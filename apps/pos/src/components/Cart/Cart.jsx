/**
 * TeleTime POS - Cart Component
 * Main cart container with items, totals, trade-ins, and actions
 */

import { useState, useCallback } from 'react';
import { ShoppingCartIcon, ArchiveBoxIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { useCart } from '../../hooks/useCart';
import CartItem from './CartItem';
import CartTotals from './CartTotals';
import CartActions from './CartActions';
import CustomerBadge from './CustomerBadge';
import HeldTransactions from './HeldTransactions';
import { SalespersonSelector } from '../Checkout/SalespersonSelector';
import { TradeInCartSection } from '../TradeIn/TradeInCartSection';
import { TradeInModal } from '../TradeIn/TradeInModal';

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
      aria-label={`View ${count} held transaction${count !== 1 ? 's' : ''}`}
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
 * Main cart component
 * @param {object} props
 * @param {function} props.onCheckout - Callback when checkout is initiated
 * @param {function} props.onHold - Callback when cart is held (optional, uses internal handler if not provided)
 * @param {function} props.onClear - Callback when cart is cleared (optional, uses internal handler if not provided)
 * @param {function} props.onCustomerClick - Callback to open customer lookup
 * @param {function} props.onQuoteClick - Callback to open quote lookup
 * @param {string} props.className - Additional CSS classes
 */
export function Cart({
  onCheckout,
  onHold,
  onClear,
  onCustomerClick,
  onQuoteClick,
  className = '',
}) {
  const cart = useCart();
  const [showHeldTransactions, setShowHeldTransactions] = useState(false);
  const [showTradeInModal, setShowTradeInModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Trade-in values from cart context
  const { tradeIns, tradeInTotal, hasPendingTradeIns, amountToPay } = cart;

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
        console.log('[Cart] Transaction held successfully');
      }
    }
  }, [cart, onHold]);

  // Handle clear cart
  const handleClear = useCallback(() => {
    if (onClear) {
      onClear();
    } else {
      cart.clearCart();
    }
  }, [cart, onClear]);

  // Handle customer removal
  const handleRemoveCustomer = useCallback(() => {
    cart.clearCustomer();
  }, [cart]);

  // Handle salesperson selection
  const handleSalespersonSelect = useCallback(
    (salespersonId, rep) => {
      cart.setSalespersonId(salespersonId);
    },
    [cart]
  );

  // Handle recall held transaction
  const handleRecallHeld = useCallback(
    (heldId) => {
      const result = cart.recallCart(heldId);
      if (result.success) {
        setShowHeldTransactions(false);
      }
    },
    [cart]
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

  // Handle trade-in applied
  const handleTradeInApplied = useCallback((result) => {
    if (result.assessment) {
      cart.addTradeIn(result.assessment);
    }
    setShowTradeInModal(false);
  }, [cart]);

  // Handle remove trade-in
  const handleRemoveTradeIn = useCallback(async (tradeInId) => {
    await cart.removeTradeIn(tradeInId, true);
  }, [cart]);

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

        <HeldCartsButton
          count={cart.heldCarts?.length || 0}
          onClick={() => setShowHeldTransactions(true)}
        />
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

      {/* Salesperson Selector */}
      <div className="p-3 border-b border-gray-100">
        <SalespersonSelector
          selectedId={cart.salespersonId}
          onSelect={handleSalespersonSelect}
        />
      </div>

      {/* Cart Items */}
      {cart.isEmpty ? (
        <EmptyCart />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Product Items */}
          {cart.items.map((item) => (
            <CartItem
              key={item.id}
              item={item}
              onUpdateQuantity={handleUpdateQuantity}
              onRemove={handleRemoveItem}
              onSetSerialNumber={handleSetSerialNumber}
              disabled={isProcessing}
            />
          ))}

          {/* Trade-In Section (grouped at bottom of items) */}
          <TradeInCartSection
            tradeIns={tradeIns}
            onRemoveTradeIn={handleRemoveTradeIn}
            disabled={isProcessing}
          />
        </div>
      )}

      {/* Trade-In Button */}
      {!cart.isEmpty && (
        <div className="px-4 py-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setShowTradeInModal(true)}
            disabled={isProcessing}
            aria-label={`Add trade-in${tradeIns.length > 0 ? `, ${tradeIns.length} trade-ins added` : ''}`}
            className="
              w-full flex items-center justify-center gap-2
              px-4 py-2.5
              bg-emerald-50 hover:bg-emerald-100
              border-2 border-emerald-300 hover:border-emerald-400
              text-emerald-700 font-semibold
              rounded-lg
              transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <ArrowsRightLeftIcon className="w-5 h-5" />
            <span>Trade-In</span>
            {tradeIns.length > 0 && (
              <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-800 text-xs font-bold rounded">
                {tradeIns.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Totals */}
      {!cart.isEmpty && (
        <CartTotals
          subtotal={cart.subtotal}
          itemDiscountTotal={cart.itemDiscountTotal}
          cartDiscount={cart.cartDiscount}
          discountTotal={cart.discountTotal}
          taxLabel={cart.taxLabel}
          hstAmount={cart.hstAmount}
          gstAmount={cart.gstAmount}
          pstAmount={cart.pstAmount}
          taxAmount={cart.taxAmount}
          total={cart.total}
          province={cart.province}
          tradeInTotal={tradeInTotal}
          hasPendingTradeIns={hasPendingTradeIns}
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

      {/* Trade-In Modal */}
      <TradeInModal
        open={showTradeInModal}
        onClose={() => setShowTradeInModal(false)}
        cartId={cart.cartId}
        cartTotal={cart.total}
        customerId={cart.customer?.id}
        onTradeInApplied={handleTradeInApplied}
      />
    </div>
  );
}

export default Cart;
