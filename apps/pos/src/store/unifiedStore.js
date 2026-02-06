/**
 * Unified Store - Zustand Store with Slices
 * Shared between Quote Builder and POS Interface
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createIDBStorage } from './idbStorage';
import { calculateTax, TAX_RATES } from './taxCalculations';

// ============================================================================
// TAX & PRICING UTILITIES
// ============================================================================

const roundCurrency = (value) => Math.round(value * 100) / 100;

const calculateItemTotal = (item) => {
  const basePrice = item.unitPriceCents * item.quantity;
  const discountAmount = item.discountPercent
    ? Math.round(basePrice * (item.discountPercent / 100))
    : (item.discountAmountCents || 0);
  return basePrice - discountAmount;
};

const calculateMargin = (revenue, cost) => {
  if (revenue === 0) return 0;
  return roundCurrency(((revenue - cost) / revenue) * 100);
};

// ============================================================================
// CUSTOMER SLICE
// ============================================================================

const createCustomerSlice = (set, get) => ({
  // State
  customer: null,
  customerPricing: null, // Special pricing rules for this customer
  customerHistory: [], // Recent transactions

  // Actions
  setCustomer: (customer) => set((state) => {
    state.customer = customer;
    // Clear customer-specific pricing when customer changes
    if (!customer) {
      state.customerPricing = null;
    }
  }),

  setCustomerPricing: (pricing) => set((state) => {
    state.customerPricing = pricing;
  }),

  loadCustomerHistory: async (customerId) => {
    // Will be populated by API call
    set((state) => {
      state.customerHistory = [];
    });
  },

  clearCustomer: () => set((state) => {
    state.customer = null;
    state.customerPricing = null;
    state.customerHistory = [];
  }),
});

// ============================================================================
// CART/LINE ITEMS SLICE
// ============================================================================

const createCartSlice = (set, get) => ({
  // State
  items: [],
  quoteId: null, // If loaded from a quote
  quoteNumber: null,
  sourceType: null, // 'quote' | 'pos' | 'new'
  notes: '',
  internalNotes: '',
  salespersonId: null,
  salespersonName: '',

  // Actions
  addItem: (product, quantity = 1, options = {}) => set((state) => {
    const existingIndex = state.items.findIndex(
      (item) => item.productId === product.id && !item.serialNumber && !options.serialNumber
    );

    if (existingIndex >= 0 && !options.forceNew) {
      // Increment quantity for existing item
      state.items[existingIndex].quantity += quantity;
    } else {
      // Add new item
      const customerPricing = get().customerPricing;
      const customPrice = customerPricing?.products?.[product.id];

      state.items.push({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId: product.id,
        productName: product.name,
        sku: product.model || product.sku,
        barcode: product.barcode,
        imageUrl: product.image_url || product.imageUrl,
        quantity,
        unitPriceCents: customPrice?.priceCents || product.sell_cents || product.sellCents || 0,
        unitCostCents: product.cost_cents || product.costCents || 0,
        originalPriceCents: product.sell_cents || product.sellCents || 0,
        discountPercent: options.discountPercent || 0,
        discountAmountCents: options.discountAmountCents || 0,
        discountReason: options.discountReason || '',
        taxable: product.taxable !== false,
        serialNumber: options.serialNumber || null,
        notes: options.notes || '',
        addedAt: new Date().toISOString(),
      });
    }
  }),

  updateItem: (itemId, updates) => set((state) => {
    const index = state.items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      state.items[index] = { ...state.items[index], ...updates };
    }
  }),

  removeItem: (itemId) => set((state) => {
    state.items = state.items.filter((item) => item.id !== itemId);
  }),

  setItemQuantity: (itemId, quantity) => set((state) => {
    const index = state.items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      if (quantity <= 0) {
        state.items = state.items.filter((item) => item.id !== itemId);
      } else {
        state.items[index].quantity = quantity;
      }
    }
  }),

  applyItemDiscount: (itemId, discountPercent, reason = '') => set((state) => {
    const index = state.items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      state.items[index].discountPercent = discountPercent;
      state.items[index].discountAmountCents = 0; // Clear fixed discount
      state.items[index].discountReason = reason;
    }
  }),

  setItemSerialNumber: (itemId, serialNumber) => set((state) => {
    const index = state.items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      state.items[index].serialNumber = serialNumber;
    }
  }),

  clearCart: () => set((state) => {
    state.items = [];
    state.quoteId = null;
    state.quoteNumber = null;
    state.sourceType = null;
    state.notes = '';
    state.internalNotes = '';
    // Keep salesperson
  }),

  loadFromQuote: (quote) => set((state) => {
    state.quoteId = quote.id;
    state.quoteNumber = quote.quote_number || quote.quoteNumber;
    state.sourceType = 'quote';
    state.notes = quote.notes || '';
    state.internalNotes = quote.internal_notes || quote.internalNotes || '';

    // Set customer if available
    if (quote.customer) {
      state.customer = quote.customer;
    }

    // Map quote items to cart items
    state.items = (quote.items || []).map((item, index) => ({
      id: `quote-item-${quote.id}-${index}`,
      productId: item.product_id || item.productId,
      productName: item.product_name || item.productName || item.name,
      sku: item.sku || item.model,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents || item.unitPriceCents ||
        Math.round((item.unit_price || item.unitPrice || 0) * 100),
      unitCostCents: item.unit_cost_cents || item.unitCostCents ||
        Math.round((item.unit_cost || item.unitCost || 0) * 100),
      originalPriceCents: item.original_price_cents || item.originalPriceCents ||
        item.unit_price_cents || Math.round((item.unit_price || 0) * 100),
      discountPercent: item.discount_percent || item.discountPercent || 0,
      discountAmountCents: item.discount_amount_cents || item.discountAmountCents || 0,
      taxable: item.taxable !== false,
      serialNumber: item.serial_number || item.serialNumber || null,
      notes: item.notes || '',
      addedAt: new Date().toISOString(),
    }));
  }),

  setNotes: (notes) => set((state) => {
    state.notes = notes;
  }),

  setInternalNotes: (notes) => set((state) => {
    state.internalNotes = notes;
  }),

  setSalesperson: (id, name) => set((state) => {
    state.salespersonId = id;
    state.salespersonName = name;
  }),
});

// ============================================================================
// DISCOUNT SLICE
// ============================================================================

const createDiscountSlice = (set, get) => ({
  // State
  cartDiscount: {
    type: 'percent', // 'percent' | 'fixed'
    value: 0,
    reason: '',
  },
  appliedPromotions: [], // Auto-applied promotions
  manualAdjustments: [], // Manager overrides

  // Actions
  setCartDiscount: (type, value, reason = '') => set((state) => {
    state.cartDiscount = { type, value, reason };
  }),

  clearCartDiscount: () => set((state) => {
    state.cartDiscount = { type: 'percent', value: 0, reason: '' };
  }),

  addPromotion: (promotion) => set((state) => {
    // Avoid duplicates
    if (!state.appliedPromotions.find((p) => p.id === promotion.id)) {
      state.appliedPromotions.push(promotion);
    }
  }),

  removePromotion: (promotionId) => set((state) => {
    state.appliedPromotions = state.appliedPromotions.filter((p) => p.id !== promotionId);
  }),

  addManualAdjustment: (adjustment) => set((state) => {
    state.manualAdjustments.push({
      ...adjustment,
      id: `adj-${Date.now()}`,
      appliedAt: new Date().toISOString(),
    });
  }),

  clearDiscounts: () => set((state) => {
    state.cartDiscount = { type: 'percent', value: 0, reason: '' };
    state.appliedPromotions = [];
    state.manualAdjustments = [];
  }),
});

// ============================================================================
// PRICING SLICE (Computed values + tax settings)
// ============================================================================

const createPricingSlice = (set, get) => ({
  // State
  taxProvince: 'ON',
  taxExempt: false,
  taxExemptReason: '',
  currency: 'CAD',

  // Actions
  setTaxProvince: (province) => set((state) => {
    state.taxProvince = province;
  }),

  setTaxExempt: (exempt, reason = '') => set((state) => {
    state.taxExempt = exempt;
    state.taxExemptReason = reason;
  }),

  // Computed getters (called as functions)
  getSubtotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  },

  getItemDiscountTotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => {
      const basePrice = item.unitPriceCents * item.quantity;
      const discountAmount = item.discountPercent
        ? Math.round(basePrice * (item.discountPercent / 100))
        : (item.discountAmountCents || 0);
      return sum + discountAmount;
    }, 0);
  },

  getCartDiscountAmount: () => {
    const { cartDiscount } = get();
    const subtotal = get().getSubtotal();

    if (cartDiscount.type === 'percent') {
      return Math.round(subtotal * (cartDiscount.value / 100));
    }
    return Math.round(cartDiscount.value * 100); // Convert dollars to cents
  },

  getTaxableAmount: () => {
    const { items, taxExempt } = get();
    if (taxExempt) return 0;

    const subtotal = get().getSubtotal();
    const cartDiscountAmount = get().getCartDiscountAmount();
    const discountedSubtotal = subtotal - cartDiscountAmount;

    // Calculate taxable portion
    const taxableItems = items.filter((item) => item.taxable);
    const taxableSubtotal = taxableItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);

    // Proportionally apply cart discount to taxable amount
    const taxableRatio = subtotal > 0 ? taxableSubtotal / subtotal : 0;
    return Math.round(discountedSubtotal * taxableRatio);
  },

  getTaxBreakdown: () => {
    const { taxProvince, taxExempt } = get();
    if (taxExempt) {
      return { hst: 0, gst: 0, pst: 0, qst: 0, total: 0, label: 'Tax Exempt' };
    }

    const taxableAmount = get().getTaxableAmount();
    return calculateTax(taxableAmount, taxProvince);
  },

  getTotal: () => {
    const subtotal = get().getSubtotal();
    const cartDiscountAmount = get().getCartDiscountAmount();
    const taxBreakdown = get().getTaxBreakdown();
    return subtotal - cartDiscountAmount + taxBreakdown.total;
  },

  getTotalCost: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + (item.unitCostCents * item.quantity), 0);
  },

  getMargin: () => {
    const revenue = get().getSubtotal() - get().getCartDiscountAmount();
    const cost = get().getTotalCost();
    return calculateMargin(revenue, cost);
  },

  getItemCount: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.quantity, 0);
  },

  getSummary: () => {
    const state = get();
    return {
      itemCount: state.getItemCount(),
      lineCount: state.items.length,
      subtotalCents: state.getSubtotal(),
      itemDiscountCents: state.getItemDiscountTotal(),
      cartDiscountCents: state.getCartDiscountAmount(),
      taxableAmountCents: state.getTaxableAmount(),
      taxBreakdown: state.getTaxBreakdown(),
      taxCents: state.getTaxBreakdown().total,
      totalCents: state.getTotal(),
      totalCostCents: state.getTotalCost(),
      marginPercent: state.getMargin(),
      // Formatted values
      subtotal: (state.getSubtotal() / 100).toFixed(2),
      total: (state.getTotal() / 100).toFixed(2),
      tax: (state.getTaxBreakdown().total / 100).toFixed(2),
    };
  },
});

// ============================================================================
// DRAFT SLICE
// ============================================================================

const createDraftSlice = (set, get) => ({
  // State
  draftId: null,
  draftType: null, // 'quote' | 'pos' | 'order'
  lastSavedAt: null,
  isDirty: false,
  autoSaveEnabled: true,
  syncStatus: 'synced', // 'synced' | 'pending' | 'error'

  // Actions
  setDraftId: (id, type) => set((state) => {
    state.draftId = id;
    state.draftType = type;
  }),

  markDirty: () => set((state) => {
    state.isDirty = true;
  }),

  markSaved: (timestamp = new Date().toISOString()) => set((state) => {
    state.isDirty = false;
    state.lastSavedAt = timestamp;
  }),

  setSyncStatus: (status) => set((state) => {
    state.syncStatus = status;
  }),

  setAutoSave: (enabled) => set((state) => {
    state.autoSaveEnabled = enabled;
  }),

  // Generate draft snapshot for saving
  getDraftSnapshot: () => {
    const state = get();
    return {
      // Cart data
      items: state.items,
      quoteId: state.quoteId,
      quoteNumber: state.quoteNumber,
      sourceType: state.sourceType,
      notes: state.notes,
      internalNotes: state.internalNotes,
      salespersonId: state.salespersonId,
      salespersonName: state.salespersonName,
      // Customer
      customer: state.customer,
      customerPricing: state.customerPricing,
      // Discounts
      cartDiscount: state.cartDiscount,
      appliedPromotions: state.appliedPromotions,
      manualAdjustments: state.manualAdjustments,
      // Pricing
      taxProvince: state.taxProvince,
      taxExempt: state.taxExempt,
      taxExemptReason: state.taxExemptReason,
      // Metadata
      draftType: state.draftType,
      savedAt: new Date().toISOString(),
    };
  },

  // Restore from draft snapshot
  restoreFromDraft: (draft) => set((state) => {
    // Cart data
    state.items = draft.items || [];
    state.quoteId = draft.quoteId || null;
    state.quoteNumber = draft.quoteNumber || null;
    state.sourceType = draft.sourceType || null;
    state.notes = draft.notes || '';
    state.internalNotes = draft.internalNotes || '';
    state.salespersonId = draft.salespersonId || null;
    state.salespersonName = draft.salespersonName || '';
    // Customer
    state.customer = draft.customer || null;
    state.customerPricing = draft.customerPricing || null;
    // Discounts
    state.cartDiscount = draft.cartDiscount || { type: 'percent', value: 0, reason: '' };
    state.appliedPromotions = draft.appliedPromotions || [];
    state.manualAdjustments = draft.manualAdjustments || [];
    // Pricing
    state.taxProvince = draft.taxProvince || 'ON';
    state.taxExempt = draft.taxExempt || false;
    state.taxExemptReason = draft.taxExemptReason || '';
    // Metadata
    state.draftType = draft.draftType || null;
    state.isDirty = false;
    state.lastSavedAt = draft.savedAt || null;
  }),

  // Clear all state
  resetAll: () => set((state) => {
    // Cart
    state.items = [];
    state.quoteId = null;
    state.quoteNumber = null;
    state.sourceType = null;
    state.notes = '';
    state.internalNotes = '';
    // Customer
    state.customer = null;
    state.customerPricing = null;
    state.customerHistory = [];
    // Discounts
    state.cartDiscount = { type: 'percent', value: 0, reason: '' };
    state.appliedPromotions = [];
    state.manualAdjustments = [];
    // Pricing
    state.taxExempt = false;
    state.taxExemptReason = '';
    // Draft
    state.draftId = null;
    state.draftType = null;
    state.isDirty = false;
    state.lastSavedAt = null;
    state.syncStatus = 'synced';
  }),
});

// ============================================================================
// HELD TRANSACTIONS SLICE (POS-specific)
// ============================================================================

const createHeldTransactionsSlice = (set, get) => ({
  // State
  heldTransactions: [],
  maxHeldTransactions: 10,

  // Actions
  holdCurrentTransaction: (label = '') => {
    const state = get();
    if (state.items.length === 0) return false;

    const heldTransaction = {
      id: `held-${Date.now()}`,
      label: label || `Transaction ${state.heldTransactions.length + 1}`,
      snapshot: state.getDraftSnapshot(),
      heldAt: new Date().toISOString(),
      itemCount: state.getItemCount(),
      totalCents: state.getTotal(),
      customerName: state.customer?.name || null,
    };

    set((s) => {
      if (s.heldTransactions.length >= s.maxHeldTransactions) {
        // Remove oldest
        s.heldTransactions.shift();
      }
      s.heldTransactions.push(heldTransaction);
    });

    // Clear current cart
    get().resetAll();
    return true;
  },

  recallTransaction: (heldId) => {
    const state = get();
    const held = state.heldTransactions.find((t) => t.id === heldId);
    if (!held) return false;

    // If current cart has items, hold it first
    if (state.items.length > 0) {
      state.holdCurrentTransaction('Auto-held');
    }

    // Restore the held transaction
    state.restoreFromDraft(held.snapshot);

    // Remove from held list
    set((s) => {
      s.heldTransactions = s.heldTransactions.filter((t) => t.id !== heldId);
    });

    return true;
  },

  deleteHeldTransaction: (heldId) => set((state) => {
    state.heldTransactions = state.heldTransactions.filter((t) => t.id !== heldId);
  }),

  clearAllHeld: () => set((state) => {
    state.heldTransactions = [];
  }),
});

// ============================================================================
// SYNC SLICE (Online/Offline)
// ============================================================================

const createSyncSlice = (set, get) => ({
  // State
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingOperations: [],
  lastSyncAt: null,
  syncError: null,

  // Actions
  setOnline: (online) => set((state) => {
    state.isOnline = online;
  }),

  addPendingOperation: (operation) => set((state) => {
    state.pendingOperations.push({
      ...operation,
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    });
    state.syncStatus = 'pending';
  }),

  removePendingOperation: (operationId) => set((state) => {
    state.pendingOperations = state.pendingOperations.filter((op) => op.id !== operationId);
    if (state.pendingOperations.length === 0) {
      state.syncStatus = 'synced';
    }
  }),

  incrementRetryCount: (operationId) => set((state) => {
    const op = state.pendingOperations.find((o) => o.id === operationId);
    if (op) {
      op.retryCount++;
    }
  }),

  setSyncError: (error) => set((state) => {
    state.syncError = error;
    state.syncStatus = 'error';
  }),

  clearSyncError: () => set((state) => {
    state.syncError = null;
  }),

  markSynced: () => set((state) => {
    state.lastSyncAt = new Date().toISOString();
    state.syncStatus = 'synced';
  }),
});

// ============================================================================
// CREATE UNIFIED STORE
// ============================================================================

export const useUnifiedStore = create(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        // Combine all slices
        ...createCustomerSlice(set, get),
        ...createCartSlice(set, get),
        ...createDiscountSlice(set, get),
        ...createPricingSlice(set, get),
        ...createDraftSlice(set, get),
        ...createHeldTransactionsSlice(set, get),
        ...createSyncSlice(set, get),
      })),
      {
        name: 'unified-store',
        storage: createIDBStorage(),
        partialize: (state) => ({
          // Persist these fields
          items: state.items,
          customer: state.customer,
          customerPricing: state.customerPricing,
          quoteId: state.quoteId,
          quoteNumber: state.quoteNumber,
          sourceType: state.sourceType,
          notes: state.notes,
          internalNotes: state.internalNotes,
          salespersonId: state.salespersonId,
          salespersonName: state.salespersonName,
          cartDiscount: state.cartDiscount,
          appliedPromotions: state.appliedPromotions,
          taxProvince: state.taxProvince,
          taxExempt: state.taxExempt,
          heldTransactions: state.heldTransactions,
          pendingOperations: state.pendingOperations,
          draftId: state.draftId,
          draftType: state.draftType,
        }),
      }
    )
  )
);

// ============================================================================
// SELECTOR HOOKS (For convenience)
// ============================================================================

// Customer-related state
export const useCustomer = () => useUnifiedStore((state) => ({
  customer: state.customer,
  customerPricing: state.customerPricing,
  customerHistory: state.customerHistory,
  setCustomer: state.setCustomer,
  setCustomerPricing: state.setCustomerPricing,
  clearCustomer: state.clearCustomer,
  loadCustomerHistory: state.loadCustomerHistory,
}));

// Cart/items state
export const useCart = () => useUnifiedStore((state) => ({
  items: state.items,
  quoteId: state.quoteId,
  quoteNumber: state.quoteNumber,
  sourceType: state.sourceType,
  notes: state.notes,
  salespersonId: state.salespersonId,
  salespersonName: state.salespersonName,
  addItem: state.addItem,
  updateItem: state.updateItem,
  removeItem: state.removeItem,
  setItemQuantity: state.setItemQuantity,
  applyItemDiscount: state.applyItemDiscount,
  setItemSerialNumber: state.setItemSerialNumber,
  clearCart: state.clearCart,
  loadFromQuote: state.loadFromQuote,
  setNotes: state.setNotes,
  setSalesperson: state.setSalesperson,
  // Held transactions
  heldTransactions: state.heldTransactions,
  holdCurrentTransaction: state.holdCurrentTransaction,
  recallTransaction: state.recallTransaction,
  deleteHeldTransaction: state.deleteHeldTransaction,
}));

// Pricing/calculations
export const usePricing = () => {
  const store = useUnifiedStore();
  return {
    taxProvince: store.taxProvince,
    taxExempt: store.taxExempt,
    currency: store.currency,
    setTaxProvince: store.setTaxProvince,
    setTaxExempt: store.setTaxExempt,
    // Discounts
    cartDiscount: store.cartDiscount,
    appliedPromotions: store.appliedPromotions,
    setCartDiscount: store.setCartDiscount,
    clearCartDiscount: store.clearCartDiscount,
    addPromotion: store.addPromotion,
    removePromotion: store.removePromotion,
    // Computed values
    summary: store.getSummary(),
  };
};

// Draft management
export const useDrafts = () => useUnifiedStore((state) => ({
  draftId: state.draftId,
  draftType: state.draftType,
  lastSavedAt: state.lastSavedAt,
  isDirty: state.isDirty,
  autoSaveEnabled: state.autoSaveEnabled,
  syncStatus: state.syncStatus,
  setDraftId: state.setDraftId,
  markDirty: state.markDirty,
  markSaved: state.markSaved,
  setAutoSave: state.setAutoSave,
  getDraftSnapshot: state.getDraftSnapshot,
  restoreFromDraft: state.restoreFromDraft,
  resetAll: state.resetAll,
}));

// Sync status
export const useSync = () => useUnifiedStore((state) => ({
  isOnline: state.isOnline,
  pendingOperations: state.pendingOperations,
  lastSyncAt: state.lastSyncAt,
  syncError: state.syncError,
  syncStatus: state.syncStatus,
  setOnline: state.setOnline,
  addPendingOperation: state.addPendingOperation,
  removePendingOperation: state.removePendingOperation,
  setSyncError: state.setSyncError,
  clearSyncError: state.clearSyncError,
  markSynced: state.markSynced,
}));
