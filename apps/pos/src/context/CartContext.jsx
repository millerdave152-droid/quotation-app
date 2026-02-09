/**
 * TeleTime POS - Cart Context
 * Manages shopping cart state, calculations, and persistence
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { searchByBarcode } from '../api/products';
import { trackFavorite } from '../components/Cart/QuickAddFavorites';
import { useAuth } from './AuthContext';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'pos_cart';
const HELD_CARTS_KEY = 'pos_held_carts';
const MAX_HELD_CARTS = 10;

// Canadian tax rates by province
const TAX_RATES = {
  ON: { hst: 0.13, gst: 0, pst: 0, label: 'HST 13%' },
  BC: { hst: 0, gst: 0.05, pst: 0.07, label: 'GST 5% + PST 7%' },
  AB: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
  SK: { hst: 0, gst: 0.05, pst: 0.06, label: 'GST 5% + PST 6%' },
  MB: { hst: 0, gst: 0.05, pst: 0.07, label: 'GST 5% + PST 7%' },
  QC: { hst: 0, gst: 0.05, pst: 0.09975, label: 'GST 5% + QST 9.975%' },
  NB: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },
  NS: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },
  PE: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },
  NL: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },
  YT: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
  NT: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
  NU: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
};

// Default province
const DEFAULT_PROVINCE = import.meta.env.VITE_DEFAULT_TAX_PROVINCE || 'ON';

// ============================================================================
// CONTEXT
// ============================================================================

const CartContext = createContext(null);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique cart item ID
 */
const generateItemId = () => {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Calculate line total for an item
 */
const calculateLineTotal = (item) => {
  const baseAmount = item.unitPrice * item.quantity;
  const discountAmount = baseAmount * (item.discountPercent / 100);
  return baseAmount - discountAmount;
};

/**
 * Calculate tax amounts for a given subtotal and province
 */
const calculateTaxes = (taxableAmount, province = DEFAULT_PROVINCE) => {
  const rates = TAX_RATES[province] || TAX_RATES.ON;

  const hstAmount = taxableAmount * rates.hst;
  const gstAmount = taxableAmount * rates.gst;
  // QC: QST is applied on (amount + GST), not just amount
  const pstBase = province === 'QC' ? taxableAmount + gstAmount : taxableAmount;
  const pstAmount = pstBase * rates.pst;

  return {
    hstAmount: Math.round(hstAmount * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    pstAmount: Math.round(pstAmount * 100) / 100,
    totalTax: Math.round((hstAmount + gstAmount + pstAmount) * 100) / 100,
    rates,
  };
};

/**
 * Load cart from localStorage
 */
const loadCartFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        items: parsed.items || [],
        customer: parsed.customer || null,
        quoteId: parsed.quoteId || null,
        discount: parsed.discount || { amount: 0, reason: '' },
        province: parsed.province || DEFAULT_PROVINCE,
        salespersonId: parsed.salespersonId || null,
        appliedPromotion: parsed.appliedPromotion || null,
        selectedFulfillment: parsed.selectedFulfillment || null,
        tradeIns: parsed.tradeIns || [],
      };
    }
  } catch (error) {
    console.error('[Cart] Failed to load from storage:', error);
  }
  return null;
};

/**
 * Save cart to localStorage
 */
const saveCartToStorage = (cart) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (error) {
    console.error('[Cart] Failed to save to storage:', error);
  }
};

/**
 * Load held carts from localStorage
 */
const loadHeldCarts = () => {
  try {
    const stored = localStorage.getItem(HELD_CARTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[Cart] Failed to load held carts:', error);
    return [];
  }
};

/**
 * Save held carts to localStorage
 */
const saveHeldCarts = (carts) => {
  try {
    localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(carts));
  } catch (error) {
    console.error('[Cart] Failed to save held carts:', error);
  }
};

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function CartProvider({ children }) {
  const { user } = useAuth();

  // Lazy initialization from localStorage to prevent empty cart flash
  const [initialCart] = useState(() => loadCartFromStorage());

  // Cart state — initialized from localStorage synchronously
  const [items, setItems] = useState(() => initialCart?.items || []);
  const [customer, setCustomerState] = useState(() => initialCart?.customer || null);
  const [quoteId, setQuoteId] = useState(() => initialCart?.quoteId || null);
  const [discount, setDiscountState] = useState(() => initialCart?.discount || { amount: 0, reason: '' });
  const [province, setProvinceState] = useState(() => initialCart?.province || DEFAULT_PROVINCE);
  const [salespersonId, setSalespersonId] = useState(() => initialCart?.salespersonId || null);
  const [commissionSplit, setCommissionSplit] = useState(null); // { enabled, secondaryRepId, secondaryRepName, preset, primaryPct, secondaryPct }
  const [appliedPromotion, setAppliedPromotion] = useState(() => initialCart?.appliedPromotion || null);
  const [selectedFulfillment, setSelectedFulfillment] = useState(() => initialCart?.selectedFulfillment || null);

  // Trade-ins state
  const [tradeIns, setTradeIns] = useState(() => initialCart?.tradeIns || []);

  // Held carts
  const [heldCarts, setHeldCarts] = useState(() => loadHeldCarts());

  // Loading state for async operations
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track if initial load is done (always true now since we load synchronously)
  const initialLoadDone = useRef(true);

  // Auto-set salesperson from logged-in user when no salesperson is selected
  useEffect(() => {
    if (!salespersonId && user?.id) {
      setSalespersonId(user.id);
    }
  }, [user?.id, salespersonId]);

  // ============================================================================
  // PERSISTENCE - Save to localStorage on changes
  // ============================================================================

  useEffect(() => {
    if (!initialLoadDone.current) return;

    saveCartToStorage({
      items,
      customer,
      quoteId,
      discount,
      province,
      salespersonId,
      appliedPromotion,
      selectedFulfillment,
      tradeIns,
    });
  }, [items, customer, quoteId, discount, province, salespersonId, appliedPromotion, selectedFulfillment, tradeIns]);

  // ============================================================================
  // CALCULATED VALUES
  // ============================================================================

  const calculations = useMemo(() => {
    // Item count (total quantity)
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    // Line totals and subtotal (before cart discount and tax)
    let subtotal = 0;
    let itemDiscountTotal = 0;
    let totalCost = 0;

    items.forEach((item) => {
      const baseAmount = item.unitPrice * item.quantity;
      const itemDiscount = baseAmount * (item.discountPercent / 100);
      const lineTotal = baseAmount - itemDiscount;

      subtotal += lineTotal;
      itemDiscountTotal += itemDiscount;

      if (item.unitCost) {
        totalCost += item.unitCost * item.quantity;
      }
    });

    // Apply cart-level discount
    const cartDiscount = discount.amount || 0;

    // Apply promotion discount (from promo code)
    const promoDiscount = appliedPromotion?.discountAmount || 0;

    // Calculate subtotal after all discounts
    const subtotalAfterDiscount = Math.max(0, subtotal - cartDiscount - promoDiscount);

    // Total discounts (all types combined)
    const discountTotal = itemDiscountTotal + cartDiscount + promoDiscount;

    // Calculate taxes
    const taxes = calculateTaxes(subtotalAfterDiscount, province);

    // Delivery fee
    const deliveryFee = selectedFulfillment?.fee || 0;

    // Order total before trade-in (subtotal after discounts + tax + delivery)
    const orderTotal = subtotalAfterDiscount + taxes.totalTax + deliveryFee;

    // Trade-in calculations
    const tradeInCount = tradeIns.length;
    const tradeInTotalRaw = tradeIns.reduce(
      (sum, ti) => sum + parseFloat(ti.final_value || ti.finalValue || 0),
      0
    );
    // Cap trade-in at order total (cannot make order negative)
    const tradeInTotal = Math.min(tradeInTotalRaw, orderTotal);
    const tradeInExcess = Math.max(0, tradeInTotalRaw - orderTotal);
    const hasPendingTradeIns = tradeIns.some(
      (ti) => ti.requires_approval && ti.status === 'pending'
    );

    // Final amount to pay after trade-in credit
    const amountToPay = Math.max(0, orderTotal - tradeInTotal);

    // Margin calculation
    const margin = subtotal - totalCost;
    const marginPercent = subtotal > 0 ? (margin / subtotal) * 100 : 0;

    return {
      itemCount,
      subtotal: Math.round(subtotal * 100) / 100,
      itemDiscountTotal: Math.round(itemDiscountTotal * 100) / 100,
      cartDiscount: Math.round(cartDiscount * 100) / 100,
      promoDiscount: Math.round(promoDiscount * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      subtotalAfterDiscount: Math.round(subtotalAfterDiscount * 100) / 100,
      hstAmount: taxes.hstAmount,
      gstAmount: taxes.gstAmount,
      pstAmount: taxes.pstAmount,
      taxAmount: taxes.totalTax,
      taxLabel: taxes.rates.label,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      // Order total before trade-in
      orderTotal: Math.round(orderTotal * 100) / 100,
      // Keep 'total' as orderTotal for backward compatibility
      total: Math.round(orderTotal * 100) / 100,
      // Trade-in values
      tradeInCount,
      tradeInTotal: Math.round(tradeInTotal * 100) / 100,
      tradeInExcess: Math.round(tradeInExcess * 100) / 100,
      hasPendingTradeIns,
      // Amount customer needs to pay after trade-in
      amountToPay: Math.round(amountToPay * 100) / 100,
      // Margin
      totalCost: Math.round(totalCost * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      marginPercent: Math.round(marginPercent * 10) / 10,
    };
  }, [items, discount, province, appliedPromotion, selectedFulfillment, tradeIns]);

  // ============================================================================
  // CART OPERATIONS
  // ============================================================================

  /**
   * Add item to cart (or increment quantity if exists)
   */
  const addItem = useCallback((product, options = {}) => {
    setError(null);

    const {
      quantity = 1,
      discountPercent = 0,
      serialNumber = null,
    } = options;

    setItems((currentItems) => {
      // Check if product already exists (by productId, and no serial number)
      // Items with serial numbers are always added as new items
      const existingIndex = currentItems.findIndex(
        (item) =>
          item.productId === (product.productId || product.product_id) &&
          !item.serialNumber &&
          !serialNumber
      );

      if (existingIndex >= 0) {
        // Update quantity of existing item
        const updated = [...currentItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }

      // Add new item
      const newItem = {
        id: generateItemId(),
        productId: product.productId || product.product_id,
        productName: product.name || product.productName || product.product_name,
        sku: product.sku || product.productSku || product.product_sku || '',
        unitPrice: parseFloat(product.price || product.unitPrice || product.unit_price || 0),
        unitCost: product.cost || product.unitCost || product.unit_cost
          ? parseFloat(product.cost || product.unitCost || product.unit_cost)
          : null,
        quantity,
        discountPercent,
        taxable: product.taxable !== false,
        serialNumber,
        imageUrl: product.imageUrl || product.image_url || null,
        barcode: product.barcode || product.upc || null,
      };

      // Track as favorite
      trackFavorite(product);

      return [...currentItems, newItem];
    });
  }, []);

  /**
   * Add item by barcode scan
   */
  const addItemByBarcode = useCallback(async (barcode) => {
    setLoading(true);
    setError(null);

    try {
      const result = await searchByBarcode(barcode);

      if (result.success && result.data) {
        addItem(result.data);
        return { success: true, product: result.data };
      } else {
        const errorMsg = `Product not found: ${barcode}`;
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to lookup barcode';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [addItem]);

  /**
   * Remove item from cart
   */
  const removeItem = useCallback((itemId) => {
    setItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId)
    );
  }, []);

  /**
   * Remove item by product ID (removes first match)
   */
  const removeItemByProductId = useCallback((productId) => {
    setItems((currentItems) => {
      const index = currentItems.findIndex((item) => item.productId === productId);
      if (index >= 0) {
        const updated = [...currentItems];
        updated.splice(index, 1);
        return updated;
      }
      return currentItems;
    });
  }, []);

  /**
   * Update item quantity
   */
  const updateQuantity = useCallback((itemId, quantity) => {
    if (quantity < 1) {
      removeItem(itemId);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      )
    );
  }, [removeItem]);

  /**
   * Update quantity by product ID
   */
  const updateQuantityByProductId = useCallback((productId, quantity) => {
    if (quantity < 1) {
      removeItemByProductId(productId);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  }, [removeItemByProductId]);

  /**
   * Increment item quantity
   */
  const incrementQuantity = useCallback((itemId) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  }, []);

  /**
   * Decrement item quantity
   */
  const decrementQuantity = useCallback((itemId) => {
    setItems((currentItems) => {
      const item = currentItems.find((i) => i.id === itemId);
      if (!item) return currentItems;

      if (item.quantity <= 1) {
        return currentItems.filter((i) => i.id !== itemId);
      }

      return currentItems.map((i) =>
        i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
      );
    });
  }, []);

  /**
   * Apply discount to item
   */
  const applyItemDiscount = useCallback((itemId, percent) => {
    const discountPercent = Math.max(0, Math.min(100, percent));

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, discountPercent } : item
      )
    );
  }, []);

  /**
   * Apply discount by product ID
   */
  const applyItemDiscountByProductId = useCallback((productId, percent) => {
    const discountPercent = Math.max(0, Math.min(100, percent));

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.productId === productId ? { ...item, discountPercent } : item
      )
    );
  }, []);

  /**
   * Override item price (from price override modal)
   */
  const updateItemPrice = useCallback((itemId, newPrice, reason) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              unitPrice: newPrice,
              priceOverride: true,
              priceOverrideReason: reason,
              discountPercent: 0,
            }
          : item
      )
    );
  }, []);

  /**
   * Set item serial number
   */
  const setItemSerialNumber = useCallback((itemId, serialNumber) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, serialNumber } : item
      )
    );
  }, []);

  /**
   * Set customer
   */
  const setCustomer = useCallback((customerData) => {
    setCustomerState(customerData);
  }, []);

  /**
   * Clear customer
   */
  const clearCustomer = useCallback(() => {
    setCustomerState(null);
  }, []);

  /**
   * Set cart-level discount
   */
  const setCartDiscount = useCallback((amount, reason = '') => {
    setDiscountState({
      amount: Math.max(0, parseFloat(amount) || 0),
      reason: reason || '',
    });
  }, []);

  /**
   * Clear cart discount
   */
  const clearCartDiscount = useCallback(() => {
    setDiscountState({ amount: 0, reason: '' });
  }, []);

  /**
   * Apply a promotion (from promo code)
   * @param {object} promotion - Promotion object with id, code, name, discountAmount, etc.
   */
  const applyPromotion = useCallback((promotion) => {
    if (!promotion || !promotion.id) {
      console.error('[Cart] Invalid promotion object');
      return;
    }
    setAppliedPromotion(promotion);
  }, []);

  /**
   * Remove applied promotion
   */
  const clearPromotion = useCallback(() => {
    setAppliedPromotion(null);
  }, []);

  /**
   * Set tax province
   */
  const setProvince = useCallback((provinceCode) => {
    if (TAX_RATES[provinceCode]) {
      setProvinceState(provinceCode);
    }
  }, []);

  /**
   * Load items from a quote
   */
  const loadFromQuote = useCallback((quoteData) => {
    // Clear current cart first
    setItems([]);
    setDiscountState({ amount: 0, reason: '' });

    // Set quote ID
    setQuoteId(quoteData.quoteId || quoteData.quote_id);

    // Set customer if available
    if (quoteData.customer || quoteData.customerId) {
      setCustomerState(
        quoteData.customer || {
          customerId: quoteData.customerId || quoteData.customer_id,
          name: quoteData.customerName || quoteData.customer_name,
          email: quoteData.customerEmail || quoteData.customer_email,
          phone: quoteData.customerPhone || quoteData.customer_phone,
        }
      );
    }

    // Set salesperson
    setSalespersonId(quoteData.userId || quoteData.user_id || quoteData.salespersonId);

    // Load items
    const quoteItems = quoteData.items || [];
    const cartItems = quoteItems.map((item) => ({
      id: generateItemId(),
      productId: item.productId || item.product_id,
      productName: item.productName || item.product_name || item.name,
      sku: item.sku || item.productSku || item.product_sku || '',
      unitPrice: parseFloat(item.unitPrice || item.unit_price || item.price || 0),
      unitCost: item.unitCost || item.unit_cost || item.cost
        ? parseFloat(item.unitCost || item.unit_cost || item.cost)
        : null,
      quantity: item.quantity || 1,
      discountPercent: item.discountPercent || item.discount_percent || 0,
      taxable: item.taxable !== false,
      serialNumber: null,
      fromQuote: true,
    }));

    setItems(cartItems);

    // Set quote-level discount if any
    if (quoteData.discountAmount || quoteData.discount_amount) {
      setDiscountState({
        amount: parseFloat(quoteData.discountAmount || quoteData.discount_amount),
        reason: quoteData.discountReason || quoteData.discount_reason || 'Quote discount',
      });
    }
  }, []);

  // ============================================================================
  // TRADE-IN OPERATIONS
  // ============================================================================

  /**
   * Add a trade-in assessment to the cart
   * @param {object} tradeIn - Trade-in assessment object
   */
  const addTradeIn = useCallback((tradeIn) => {
    if (!tradeIn || !tradeIn.id) {
      console.error('[Cart] Invalid trade-in object');
      return { success: false, error: 'Invalid trade-in' };
    }

    // Check if already added
    setTradeIns((current) => {
      const exists = current.some((ti) => ti.id === tradeIn.id);
      if (exists) {
        console.warn('[Cart] Trade-in already in cart:', tradeIn.id);
        return current;
      }
      return [...current, tradeIn];
    });

    return { success: true };
  }, []);

  /**
   * Remove a trade-in from the cart
   * @param {number|string} tradeInId - Trade-in assessment ID
   * @param {boolean} voidOnServer - Whether to void the assessment on the server
   */
  const removeTradeIn = useCallback(async (tradeInId, voidOnServer = true) => {
    // Optionally void on server
    if (voidOnServer) {
      try {
        await fetch(`/api/trade-in/assessments/${tradeInId}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Removed from cart' }),
        });
      } catch (error) {
        console.warn('[Cart] Failed to void trade-in on server:', error);
        // Continue with local removal anyway
      }
    }

    setTradeIns((current) => current.filter((ti) => ti.id !== tradeInId));
    return { success: true };
  }, []);

  /**
   * Clear all trade-ins from the cart
   * @param {boolean} voidOnServer - Whether to void assessments on the server
   */
  const clearTradeIns = useCallback(async (voidOnServer = false) => {
    if (voidOnServer) {
      // Void each trade-in on server
      const voidPromises = tradeIns.map((ti) =>
        fetch(`/api/trade-in/assessments/${ti.id}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Cart cleared' }),
        }).catch((err) => console.warn('[Cart] Failed to void trade-in:', ti.id, err))
      );
      await Promise.all(voidPromises);
    }

    setTradeIns([]);
  }, [tradeIns]);

  /**
   * Clear entire cart
   */
  const clearCart = useCallback(() => {
    setItems([]);
    setCustomerState(null);
    setQuoteId(null);
    setDiscountState({ amount: 0, reason: '' });
    setAppliedPromotion(null);
    setSelectedFulfillment(null);
    setTradeIns([]);
    setSalespersonId(null);
    setCommissionSplit(null);
    setError(null);
  }, []);

  // ============================================================================
  // FULFILLMENT OPERATIONS
  // ============================================================================

  /**
   * Set fulfillment option for the order
   * @param {object} fulfillment - Fulfillment details
   * @param {string} fulfillment.type - 'pickup_now', 'pickup_scheduled', 'local_delivery', 'shipping'
   * @param {number} fulfillment.fee - Delivery fee
   * @param {string} fulfillment.scheduledDate - Scheduled date (YYYY-MM-DD)
   * @param {string} fulfillment.scheduledTimeStart - Start time
   * @param {string} fulfillment.scheduledTimeEnd - End time
   * @param {object} fulfillment.address - Delivery address
   * @param {number} fulfillment.zoneId - Delivery zone ID
   * @param {string} fulfillment.notes - Customer notes
   */
  const setFulfillment = useCallback((fulfillment) => {
    if (!fulfillment || !fulfillment.type) {
      console.error('[Cart] Invalid fulfillment object');
      return;
    }
    setSelectedFulfillment(fulfillment);
  }, []);

  /**
   * Clear selected fulfillment
   */
  const clearFulfillment = useCallback(() => {
    setSelectedFulfillment(null);
  }, []);

  // ============================================================================
  // HELD TRANSACTIONS
  // ============================================================================

  /**
   * Hold (park) current cart
   */
  const holdCart = useCallback((label = '') => {
    if (items.length === 0 && tradeIns.length === 0) {
      return { success: false, error: 'Cart is empty' };
    }

    const heldCart = {
      id: `held_${Date.now()}`,
      label: label || `Transaction ${new Date().toLocaleTimeString()}`,
      heldAt: new Date().toISOString(),
      items: [...items],
      customer,
      quoteId,
      discount: { ...discount },
      appliedPromotion: appliedPromotion ? { ...appliedPromotion } : null,
      province,
      salespersonId,
      tradeIns: [...tradeIns],
      itemCount: calculations.itemCount,
      total: calculations.total,
      tradeInTotal: calculations.tradeInTotal,
      amountToPay: calculations.amountToPay,
    };

    setHeldCarts((current) => {
      // Limit number of held carts
      const updated = [heldCart, ...current].slice(0, MAX_HELD_CARTS);
      saveHeldCarts(updated);
      return updated;
    });

    // Clear current cart
    clearCart();

    return { success: true, heldCart };
  }, [items, customer, quoteId, discount, appliedPromotion, province, salespersonId, tradeIns, calculations, clearCart]);

  /**
   * Recall a held cart
   */
  const recallCart = useCallback((heldCartId) => {
    const heldCart = heldCarts.find((c) => c.id === heldCartId);

    if (!heldCart) {
      return { success: false, error: 'Held transaction not found' };
    }

    // If current cart has items, offer to hold it first
    if (items.length > 0) {
      // Automatically hold current cart
      holdCart('Auto-held');
    }

    // Restore held cart
    setItems(heldCart.items);
    setCustomerState(heldCart.customer);
    setQuoteId(heldCart.quoteId);
    setDiscountState(heldCart.discount);
    setAppliedPromotion(heldCart.appliedPromotion || null);
    setProvinceState(heldCart.province);
    setSalespersonId(heldCart.salespersonId);
    setTradeIns(heldCart.tradeIns || []);

    // Remove from held carts
    setHeldCarts((current) => {
      const updated = current.filter((c) => c.id !== heldCartId);
      saveHeldCarts(updated);
      return updated;
    });

    return { success: true };
  }, [heldCarts, items, holdCart]);

  /**
   * Delete a held cart without recalling
   */
  const deleteHeldCart = useCallback((heldCartId) => {
    setHeldCarts((current) => {
      const updated = current.filter((c) => c.id !== heldCartId);
      saveHeldCarts(updated);
      return updated;
    });
  }, []);

  /**
   * Clear all held carts
   */
  const clearAllHeldCarts = useCallback(() => {
    setHeldCarts([]);
    saveHeldCarts([]);
  }, []);

  // ============================================================================
  // TRANSACTION PREPARATION
  // ============================================================================

  /**
   * Get cart data formatted for transaction API
   */
  const getTransactionData = useCallback((shiftId, payments) => {
    return {
      shiftId,
      customerId: customer?.customerId || customer?.customer_id || null,
      quoteId: quoteId || null,
      salespersonId: Number.isFinite(Number(salespersonId)) ? Number(salespersonId) : (user?.id || null),
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        discountPercent: item.discountPercent,
        discountAmount: 0, // Using percent discount
        serialNumber: item.serialNumber,
        taxable: item.taxable,
      })),
      payments,
      discountAmount: discount.amount,
      discountReason: discount.reason,
      taxProvince: province,
      deliveryFee: selectedFulfillment?.fee || 0,
      // Promotion data
      promotion: appliedPromotion
        ? {
            promotionId: appliedPromotion.id,
            code: appliedPromotion.code,
            discountAmount: appliedPromotion.discountAmount,
            discountCents: appliedPromotion.discountCents,
          }
        : null,
      // Fulfillment data - spread all fields to include pickup-specific and delivery-specific data
      fulfillment: selectedFulfillment
        ? {
            ...selectedFulfillment,
            fee: selectedFulfillment.fee || 0,
          }
        : null,
      // Trade-in data - simplified for backend (only needs assessmentId and creditAmount)
      tradeIns: tradeIns.map((ti) => ({
        assessmentId: ti.id,
        creditAmount: parseFloat(ti.final_value || ti.finalValue || 0),
      })),
      // Commission split data
      commissionSplit: commissionSplit?.enabled ? {
        splits: [
          { userId: Number.isFinite(Number(salespersonId)) ? Number(salespersonId) : user?.id, splitPercentage: commissionSplit.primaryPct, role: 'primary' },
          { userId: commissionSplit.secondaryRepId, splitPercentage: commissionSplit.secondaryPct, role: 'secondary' },
        ],
      } : null,
      tradeInTotal: calculations.tradeInTotal,
      tradeInExcess: calculations.tradeInExcess,
      amountToPay: calculations.amountToPay,
      // Deposit flag — set if any payment is marked as deposit
      isDeposit: payments.some(p => p.isDeposit),
      // Marketing attribution — pulled from customer record if available
      marketingSource: customer?.marketing_source || customer?.marketingSource || null,
      marketingSourceDetail: customer?.marketing_source_detail || customer?.marketingSourceDetail || null,
    };
  }, [items, customer, quoteId, salespersonId, user, commissionSplit, discount, province, appliedPromotion, selectedFulfillment, tradeIns, calculations]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value = {
    // State
    items,
    customer,
    quoteId,
    discount,
    province,
    salespersonId,
    commissionSplit,
    appliedPromotion,
    selectedFulfillment,
    tradeIns,
    loading,
    error,

    // Calculations
    ...calculations,
    taxRates: TAX_RATES,
    isEmpty: items.length === 0,

    // Item operations
    addItem,
    addItemByBarcode,
    removeItem,
    removeItemByProductId,
    updateQuantity,
    updateQuantityByProductId,
    incrementQuantity,
    decrementQuantity,
    applyItemDiscount,
    applyItemDiscountByProductId,
    updateItemPrice,
    setItemSerialNumber,

    // Cart operations
    setCustomer,
    clearCustomer,
    setCartDiscount,
    clearCartDiscount,
    setProvince,
    loadFromQuote,
    clearCart,
    setSalespersonId,
    setCommissionSplit,

    // Promotion operations
    applyPromotion,
    clearPromotion,
    hasPromotion: !!appliedPromotion,

    // Fulfillment operations
    setFulfillment,
    clearFulfillment,
    hasFulfillment: !!selectedFulfillment,

    // Trade-in operations
    addTradeIn,
    removeTradeIn,
    clearTradeIns,
    hasTradeIns: tradeIns.length > 0,

    // Held transactions
    heldCarts,
    holdCart,
    recallCart,
    deleteHeldCart,
    clearAllHeldCarts,
    hasHeldCarts: heldCarts.length > 0,

    // Transaction preparation
    getTransactionData,

    // Utilities
    clearError: () => setError(null),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCartContext() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
}

export default CartContext;
