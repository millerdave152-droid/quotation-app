/**
 * TeleTime POS - useCart Hook
 * Enhanced cart hook with transaction processing and utilities
 * Updated: Fixed stale closure issue in processTransaction
 */

import { useCallback, useMemo, useRef } from 'react';
import { useCartContext } from '../context/CartContext';
import { useRegister } from './useRegister';
import { createTransaction } from '../api/transactions';
import { formatCurrency } from '../utils/formatters';

/**
 * Enhanced cart hook with transaction processing
 * Combines cart context with register context for full POS functionality
 */
export function useCart() {
  const cart = useCartContext();
  const register = useRegister();

  // Ref to always have current cart state (avoids stale closure issues)
  // Updated synchronously during render to ensure latest values
  const cartRef = useRef(cart);
  cartRef.current = cart;

  // ============================================================================
  // TRANSACTION PROCESSING
  // ============================================================================

  /**
   * Process current cart as a transaction
   * @param {Array} payments - Array of payment objects
   * @returns {Promise<object>} Transaction result
   */
  const processTransaction = useCallback(
    async (payments) => {
      // IMPORTANT: Use cartRef.current to get the LATEST cart state
      // This avoids stale closure issues where cart.total might be outdated
      const currentCart = cartRef.current;

      // Validate cart
      if (currentCart.isEmpty) {
        return { success: false, error: 'Cart is empty' };
      }

      // Validate shift
      if (!register.currentShift) {
        return { success: false, error: 'No active shift. Please open a shift first.' };
      }

      // Validate payments
      if (!payments || payments.length === 0) {
        return { success: false, error: 'At least one payment is required' };
      }

      // Validate payment total (skip for deposit payments)
      const isDeposit = payments.some(p => p.isDeposit);
      const paymentTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const roundedPaymentTotal = Math.round(paymentTotal * 100) / 100;
      const roundedCartTotal = Math.round(currentCart.total * 100) / 100;

      // Debug logging for cart total mismatch issues
      console.log('[useCart] processTransaction validation:', {
        paymentTotal: roundedPaymentTotal,
        cartTotal: roundedCartTotal,
        itemCount: currentCart.itemCount,
        isDeposit,
      });

      if (isDeposit) {
        if (payments.length !== 1) {
          return { success: false, error: 'Deposit payments must be a single payment' };
        }
        if (paymentTotal <= 0) {
          return { success: false, error: 'Deposit amount must be greater than zero' };
        }
        if (paymentTotal >= currentCart.total) {
          return { success: false, error: 'Deposit amount must be less than the order total' };
        }
      }

      if (!isDeposit && Math.abs(roundedPaymentTotal - roundedCartTotal) > 0.01) {
        return {
          success: false,
          error: `Payment total (${formatCurrency(paymentTotal)}) does not match cart total (${formatCurrency(currentCart.total)})`,
        };
      }

      try {
        // Prepare transaction data using current cart state
        const transactionData = currentCart.getTransactionData(
          register.currentShift.shiftId,
          payments
        );

        // Create transaction
        const result = await createTransaction(transactionData);

        if (result.success) {
          // Clear cart after successful transaction
          currentCart.clearCart();

          // Refresh shift summary
          if (register.refreshShiftSummary) {
            await register.refreshShiftSummary();
          }

          return {
            success: true,
            transaction: result.data,
          };
        }

        return {
          success: false,
          error: result.error || 'Transaction failed',
        };
      } catch (error) {
        console.error('[useCart] processTransaction error:', error);
        return {
          success: false,
          error: error.message || 'Transaction failed',
        };
      }
    },
    [register]
  );

  /**
   * Process cash payment
   * @param {number} cashTendered - Amount of cash given
   * @returns {Promise<object>} Transaction result with change info
   */
  const processCashPayment = useCallback(
    async (cashTendered) => {
      // Use ref for current cart total to avoid stale closure
      const currentTotal = cartRef.current.total;
      const changeRequired = Math.max(0, cashTendered - currentTotal);

      const payments = [
        {
          paymentMethod: 'cash',
          amount: currentTotal,
          cashTendered,
          changeGiven: changeRequired,
        },
      ];

      const result = await processTransaction(payments);

      return {
        ...result,
        cashTendered,
        changeGiven: changeRequired,
      };
    },
    [processTransaction]
  );

  /**
   * Process card payment
   * @param {object} cardDetails - Card payment details
   * @returns {Promise<object>} Transaction result
   */
  const processCardPayment = useCallback(
    async (cardDetails = {}) => {
      // Use ref for current cart total to avoid stale closure
      const currentTotal = cartRef.current.total;

      const payments = [
        {
          paymentMethod: cardDetails.type || 'credit',
          amount: currentTotal,
          cardLastFour: cardDetails.lastFour || null,
          cardBrand: cardDetails.brand || null,
          authorizationCode: cardDetails.authCode || null,
          processorReference: cardDetails.reference || null,
        },
      ];

      return processTransaction(payments);
    },
    [processTransaction]
  );

  /**
   * Process split payment
   * @param {Array} payments - Array of payment methods with amounts
   * @returns {Promise<object>} Transaction result
   */
  const processSplitPayment = useCallback(
    async (payments) => {
      return processTransaction(payments);
    },
    [processTransaction]
  );

  // ============================================================================
  // CASH CALCULATION UTILITIES
  // ============================================================================

  /**
   * Calculate change for cash payment
   * @param {number} cashTendered - Amount given
   * @returns {object} Change calculation
   */
  const calculateChange = useCallback(
    (cashTendered) => {
      // Use ref for current cart total to avoid stale closure
      const currentTotal = cartRef.current.total;
      const tendered = parseFloat(cashTendered) || 0;
      const change = tendered - currentTotal;

      return {
        cashTendered: tendered,
        totalDue: currentTotal,
        change: Math.max(0, Math.round(change * 100) / 100),
        isExact: Math.abs(change) < 0.01,
        isShort: change < -0.01,
        shortAmount: change < 0 ? Math.abs(Math.round(change * 100) / 100) : 0,
        isValid: tendered >= currentTotal,
      };
    },
    []
  );

  /**
   * Get suggested cash amounts (for quick tender buttons)
   * @returns {Array} Suggested tender amounts
   */
  const getSuggestedCashAmounts = useMemo(() => {
    const total = cart.total;
    if (total <= 0) return [];

    const suggestions = new Set();

    // Exact amount
    suggestions.add(total);

    // Round up to nearest $5
    const roundTo5 = Math.ceil(total / 5) * 5;
    if (roundTo5 > total) suggestions.add(roundTo5);

    // Round up to nearest $10
    const roundTo10 = Math.ceil(total / 10) * 10;
    if (roundTo10 > total) suggestions.add(roundTo10);

    // Round up to nearest $20
    const roundTo20 = Math.ceil(total / 20) * 20;
    if (roundTo20 > total && roundTo20 <= total + 20) suggestions.add(roundTo20);

    // Common bills
    [20, 50, 100].forEach((amount) => {
      if (amount >= total && amount <= total * 2) {
        suggestions.add(amount);
      }
    });

    return Array.from(suggestions)
      .filter((amount) => amount >= total)
      .sort((a, b) => a - b)
      .slice(0, 5);
  }, [cart.total]);

  // ============================================================================
  // ITEM LINE CALCULATIONS
  // ============================================================================

  /**
   * Get line total for an item
   * @param {object} item - Cart item
   * @returns {number} Line total
   */
  const getLineTotal = useCallback((item) => {
    const baseAmount = item.unitPrice * item.quantity;
    const discountAmount = baseAmount * (item.discountPercent / 100);
    return Math.round((baseAmount - discountAmount) * 100) / 100;
  }, []);

  /**
   * Get line discount amount for an item
   * @param {object} item - Cart item
   * @returns {number} Discount amount
   */
  const getLineDiscount = useCallback((item) => {
    const baseAmount = item.unitPrice * item.quantity;
    return Math.round(baseAmount * (item.discountPercent / 100) * 100) / 100;
  }, []);

  /**
   * Get line margin for an item (if cost is available)
   * @param {object} item - Cart item
   * @returns {object|null} Margin info or null if no cost
   */
  const getLineMargin = useCallback((item) => {
    if (!item.unitCost) return null;

    const revenue = getLineTotal(item);
    const cost = item.unitCost * item.quantity;
    const margin = revenue - cost;
    const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

    return {
      revenue,
      cost: Math.round(cost * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      marginPercent: Math.round(marginPercent * 10) / 10,
    };
  }, [getLineTotal]);

  /**
   * Get items with calculated line totals
   */
  const itemsWithTotals = useMemo(() => {
    return cart.items.map((item) => ({
      ...item,
      lineTotal: getLineTotal(item),
      lineDiscount: getLineDiscount(item),
      lineMargin: getLineMargin(item),
    }));
  }, [cart.items, getLineTotal, getLineDiscount, getLineMargin]);

  // ============================================================================
  // QUICK ACTIONS
  // ============================================================================

  /**
   * Apply quick discount to all items
   * @param {number} percent - Discount percentage
   */
  const applyDiscountToAll = useCallback(
    (percent) => {
      cart.items.forEach((item) => {
        cart.applyItemDiscount(item.id, percent);
      });
    },
    [cart]
  );

  /**
   * Clear all item discounts
   */
  const clearAllItemDiscounts = useCallback(() => {
    cart.items.forEach((item) => {
      cart.applyItemDiscount(item.id, 0);
    });
  }, [cart]);

  /**
   * Quick add multiple items
   * @param {Array} products - Array of products to add
   */
  const addMultipleItems = useCallback(
    (products) => {
      products.forEach((product) => {
        cart.addItem(product, { quantity: product.quantity || 1 });
      });
    },
    [cart]
  );

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate cart is ready for checkout
   * @returns {object} Validation result
   */
  const validateForCheckout = useCallback(() => {
    // Use ref for current cart state to avoid stale closure
    const currentCart = cartRef.current;
    const errors = [];

    if (currentCart.isEmpty) {
      errors.push('Cart is empty');
    }

    if (!register.currentShift) {
      errors.push('No active shift');
    }

    if (currentCart.total <= 0) {
      errors.push('Cart total must be greater than zero');
    }

    if (!currentCart.salespersonId) {
      errors.push('Salesperson is required');
    }

    // Check for items with zero price
    const zeroPriceItems = currentCart.items.filter((item) => item.unitPrice <= 0);
    if (zeroPriceItems.length > 0) {
      errors.push(`${zeroPriceItems.length} item(s) have zero or negative price`);
    }

    // Check for items with 100% discount
    const fullDiscountItems = currentCart.items.filter((item) => item.discountPercent >= 100);
    if (fullDiscountItems.length > 0) {
      errors.push(`${fullDiscountItems.length} item(s) have 100% discount`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [register.currentShift]);

  // ============================================================================
  // RECEIPT DATA
  // ============================================================================

  /**
   * Get data formatted for receipt display
   * @returns {object} Receipt data
   */
  const getReceiptData = useCallback(() => {
    return {
      items: itemsWithTotals,
      customer: cart.customer,
      subtotal: cart.subtotal,
      discount: cart.discount,
      appliedPromotion: cart.appliedPromotion,
      promoDiscount: cart.promoDiscount,
      discountTotal: cart.discountTotal,
      taxLabel: cart.taxLabel,
      taxAmount: cart.taxAmount,
      hstAmount: cart.hstAmount,
      gstAmount: cart.gstAmount,
      pstAmount: cart.pstAmount,
      total: cart.total,
      itemCount: cart.itemCount,
      province: cart.province,
    };
  }, [itemsWithTotals, cart]);

  // ============================================================================
  // RETURN VALUE
  // ============================================================================

  return {
    // Cart state (from context)
    items: cart.items,
    itemsWithTotals,
    customer: cart.customer,
    quoteId: cart.quoteId,
    discount: cart.discount,
    province: cart.province,
    loading: cart.loading,
    error: cart.error,
    isEmpty: cart.isEmpty,

    // Calculations (from context)
    itemCount: cart.itemCount,
    subtotal: cart.subtotal,
    itemDiscountTotal: cart.itemDiscountTotal,
    cartDiscount: cart.cartDiscount,
    promoDiscount: cart.promoDiscount,
    discountTotal: cart.discountTotal,
    subtotalAfterDiscount: cart.subtotalAfterDiscount,
    hstAmount: cart.hstAmount,
    gstAmount: cart.gstAmount,
    pstAmount: cart.pstAmount,
    taxAmount: cart.taxAmount,
    taxLabel: cart.taxLabel,
    total: cart.total,
    totalCost: cart.totalCost,
    margin: cart.margin,
    marginPercent: cart.marginPercent,
    taxRates: cart.taxRates,

    // Promotion (from context)
    appliedPromotion: cart.appliedPromotion,
    applyPromotion: cart.applyPromotion,
    clearPromotion: cart.clearPromotion,
    hasPromotion: cart.hasPromotion,

    // Item operations (from context)
    addItem: cart.addItem,
    addItemByBarcode: cart.addItemByBarcode,
    removeItem: cart.removeItem,
    removeItemByProductId: cart.removeItemByProductId,
    updateQuantity: cart.updateQuantity,
    updateQuantityByProductId: cart.updateQuantityByProductId,
    incrementQuantity: cart.incrementQuantity,
    decrementQuantity: cart.decrementQuantity,
    applyItemDiscount: cart.applyItemDiscount,
    applyItemDiscountByProductId: cart.applyItemDiscountByProductId,
    updateItemPrice: cart.updateItemPrice,
    setItemSerialNumber: cart.setItemSerialNumber,

    // Cart operations (from context)
    setCustomer: cart.setCustomer,
    clearCustomer: cart.clearCustomer,
    setCartDiscount: cart.setCartDiscount,
    clearCartDiscount: cart.clearCartDiscount,
    setProvince: cart.setProvince,
    loadFromQuote: cart.loadFromQuote,
    clearCart: cart.clearCart,
    clearError: cart.clearError,

    // Salesperson (from context)
    salespersonId: cart.salespersonId,
    setSalespersonId: cart.setSalespersonId,

    // Commission split (from context)
    commissionSplit: cart.commissionSplit,
    setCommissionSplit: cart.setCommissionSplit,

    // Held transactions (from context)
    heldCarts: cart.heldCarts,
    holdCart: cart.holdCart,
    recallCart: cart.recallCart,
    deleteHeldCart: cart.deleteHeldCart,
    clearAllHeldCarts: cart.clearAllHeldCarts,
    hasHeldCarts: cart.hasHeldCarts,

    // Transaction processing
    processTransaction,
    processCashPayment,
    processCardPayment,
    processSplitPayment,
    getTransactionData: cart.getTransactionData,

    // Cash utilities
    calculateChange,
    getSuggestedCashAmounts,

    // Line calculations
    getLineTotal,
    getLineDiscount,
    getLineMargin,

    // Quick actions
    applyDiscountToAll,
    clearAllItemDiscounts,
    addMultipleItems,

    // Validation
    validateForCheckout,

    // Receipt
    getReceiptData,

    // Fulfillment (from context)
    selectedFulfillment: cart.selectedFulfillment,
    setFulfillment: cart.setFulfillment,
    hasFulfillment: cart.hasFulfillment,

    // Trade-ins (from context)
    tradeIns: cart.tradeIns || [],
    tradeInTotal: cart.tradeInTotal || 0,
    hasPendingTradeIns: cart.hasPendingTradeIns || false,
    hasTradeIns: cart.hasTradeIns || false,
    amountToPay: cart.amountToPay ?? cart.total,
    addTradeIn: cart.addTradeIn,
    removeTradeIn: cart.removeTradeIn,
    clearTradeIns: cart.clearTradeIns,

    // Register info (for convenience)
    currentShift: register.currentShift,
    hasActiveShift: register.hasActiveShift,
  };
}

export default useCart;
