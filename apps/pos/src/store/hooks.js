/**
 * React Hooks for Unified State
 * Convenience hooks that work for both Quote Builder and POS
 */

import { useCallback, useMemo } from 'react';
import { useUnifiedStore, useCustomer, useCart, usePricing, useDrafts, useSync } from './unifiedStore';
import { useOfflineSync } from './offlineSync';
import { draftApi, generateDraftKey, getDeviceId } from './draftApi';

// ============================================================================
// UNIFIED CART HOOK
// Combines cart operations with pricing calculations
// ============================================================================

/**
 * useUnifiedCart - Main hook for cart operations
 * Works for both POS and Quote Builder
 */
export const useUnifiedCart = (options = {}) => {
  const { mode = 'pos' } = options; // 'pos' or 'quote'

  const cart = useCart();
  const customer = useCustomer();
  const pricing = usePricing();
  const drafts = useDrafts();
  const sync = useSync();

  // Combined state
  const state = useMemo(() => ({
    // Items
    items: cart.items,
    itemCount: pricing.summary.itemCount,
    lineCount: pricing.summary.lineCount,

    // Customer
    customer: customer.customer,
    customerPricing: customer.customerPricing,

    // Source
    quoteId: cart.quoteId,
    quoteNumber: cart.quoteNumber,
    sourceType: cart.sourceType,
    notes: cart.notes,

    // Salesperson
    salespersonId: cart.salespersonId,
    salespersonName: cart.salespersonName,

    // Pricing
    subtotalCents: pricing.summary.subtotalCents,
    itemDiscountCents: pricing.summary.itemDiscountCents,
    cartDiscountCents: pricing.summary.cartDiscountCents,
    taxCents: pricing.summary.taxCents,
    taxBreakdown: pricing.summary.taxBreakdown,
    totalCents: pricing.summary.totalCents,
    marginPercent: pricing.summary.marginPercent,

    // Discounts
    cartDiscount: pricing.cartDiscount,
    appliedPromotions: pricing.appliedPromotions,

    // Tax settings
    taxProvince: pricing.taxProvince,
    taxExempt: pricing.taxExempt,

    // Held transactions (POS only)
    heldTransactions: cart.heldTransactions,

    // Draft status
    isDirty: drafts.isDirty,
    lastSavedAt: drafts.lastSavedAt,
    syncStatus: sync.syncStatus,
    isOnline: sync.isOnline,

    // Computed for display
    subtotal: pricing.summary.subtotal,
    total: pricing.summary.total,
    tax: pricing.summary.tax,

    // Mode
    mode,
  }), [cart, customer, pricing, drafts, sync, mode]);

  // Actions
  const actions = useMemo(() => ({
    // Item actions
    addItem: cart.addItem,
    updateItem: cart.updateItem,
    removeItem: cart.removeItem,
    setItemQuantity: cart.setItemQuantity,
    applyItemDiscount: cart.applyItemDiscount,
    setItemSerialNumber: cart.setItemSerialNumber,

    // Cart actions
    clearCart: cart.clearCart,
    loadFromQuote: cart.loadFromQuote,
    setNotes: cart.setNotes,

    // Customer actions
    setCustomer: customer.setCustomer,
    setCustomerPricing: customer.setCustomerPricing,
    clearCustomer: customer.clearCustomer,

    // Salesperson
    setSalesperson: cart.setSalesperson,

    // Discount actions
    setCartDiscount: pricing.setCartDiscount,
    clearCartDiscount: pricing.clearCartDiscount,
    addPromotion: pricing.addPromotion,
    removePromotion: pricing.removePromotion,

    // Tax actions
    setTaxProvince: pricing.setTaxProvince,
    setTaxExempt: pricing.setTaxExempt,

    // Held transactions (POS)
    holdCurrentTransaction: cart.holdCurrentTransaction,
    recallTransaction: cart.recallTransaction,
    deleteHeldTransaction: cart.deleteHeldTransaction,

    // Draft actions
    getDraftSnapshot: drafts.getDraftSnapshot,
    restoreFromDraft: drafts.restoreFromDraft,
    resetAll: drafts.resetAll,
  }), [cart, customer, pricing, drafts]);

  return { ...state, ...actions };
};

// ============================================================================
// CUSTOMER STATE HOOK
// Manages customer selection and pricing
// ============================================================================

/**
 * useCustomerState - Customer management hook
 */
export const useCustomerState = () => {
  const {
    customer,
    customerPricing,
    customerHistory,
    setCustomer,
    setCustomerPricing,
    clearCustomer,
    loadCustomerHistory,
  } = useCustomer();

  // Load customer with their special pricing
  const selectCustomer = useCallback(async (customerData, fetchPricing = true) => {
    setCustomer(customerData);

    if (fetchPricing && customerData?.id) {
      try {
        // Fetch customer-specific pricing from API
        const response = await fetch(`/api/customer-pricing/${customerData.id}`);
        if (response.ok) {
          const data = await response.json();
          setCustomerPricing(data.data);
        }
      } catch (error) {
        console.warn('Failed to fetch customer pricing:', error);
      }
    }
  }, [setCustomer, setCustomerPricing]);

  // Check if customer has special pricing for a product
  const getCustomerPrice = useCallback((productId) => {
    if (!customerPricing?.products) return null;
    return customerPricing.products[productId] || null;
  }, [customerPricing]);

  // Check if customer has available credit
  const hasAvailableCredit = useMemo(() => {
    if (!customer) return false;
    const available = customer.available_credit || customer.availableCredit || 0;
    return available > 0;
  }, [customer]);

  return {
    customer,
    customerPricing,
    customerHistory,
    hasAvailableCredit,
    selectCustomer,
    clearCustomer,
    getCustomerPrice,
    loadCustomerHistory,
  };
};

// ============================================================================
// PRICING HOOK
// Handles all pricing calculations and tax
// ============================================================================

/**
 * usePricingCalculations - Pricing and tax calculations
 */
export const usePricingCalculations = () => {
  const pricing = usePricing();
  const store = useUnifiedStore();

  // Format currency for display
  const formatCurrency = useCallback((cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(cents / 100);
  }, []);

  // Calculate line total for an item
  const calculateLineTotal = useCallback((item) => {
    const basePrice = item.unitPriceCents * item.quantity;
    const discountAmount = item.discountPercent
      ? Math.round(basePrice * (item.discountPercent / 100))
      : (item.discountAmountCents || 0);
    return basePrice - discountAmount;
  }, []);

  // Get effective price for a product (considering customer pricing)
  const getEffectivePrice = useCallback((product, customerPricing) => {
    if (customerPricing?.products?.[product.id]) {
      return customerPricing.products[product.id].priceCents;
    }
    return product.sell_cents || product.sellCents || 0;
  }, []);

  return {
    ...pricing,
    formatCurrency,
    calculateLineTotal,
    getEffectivePrice,
    // Convenience getters
    getSubtotal: () => store.getSubtotal(),
    getTaxBreakdown: () => store.getTaxBreakdown(),
    getTotal: () => store.getTotal(),
    getMargin: () => store.getMargin(),
  };
};

// ============================================================================
// DRAFT MANAGEMENT HOOK
// Handles draft save/restore with offline support
// ============================================================================

/**
 * useDraftManagement - Draft persistence and offline sync
 */
export const useDraftManagement = (options = {}) => {
  const {
    draftType = 'pos',
    userId,
    autoSave = true,
  } = options;

  const drafts = useDrafts();
  const store = useUnifiedStore();

  // Use offline sync
  const offlineSync = useOfflineSync({
    draftType,
    userId,
    autoSave,
  });

  // Save current state as draft
  const saveDraft = useCallback(async (label = '') => {
    const snapshot = drafts.getDraftSnapshot();
    const draftKey = generateDraftKey(draftType, userId);

    try {
      const result = await offlineSync.saveDraft(true);
      drafts.setDraftId(result.id, draftType);
      return result;
    } catch (error) {
      console.error('Failed to save draft:', error);
      throw error;
    }
  }, [draftType, userId, drafts, offlineSync]);

  // Load a draft
  const loadDraft = useCallback(async (draftIdOrKey) => {
    try {
      const draft = typeof draftIdOrKey === 'number'
        ? await draftApi.getDraft(draftIdOrKey)
        : await draftApi.getDraftByKey(draftIdOrKey);

      if (draft && draft.data) {
        drafts.restoreFromDraft(draft.data);
        drafts.setDraftId(draft.id, draft.draft_type);
        return draft;
      }
      return null;
    } catch (error) {
      // Try loading from local storage
      return offlineSync.loadDraft(draftIdOrKey);
    }
  }, [drafts, offlineSync]);

  // List available drafts
  const listDrafts = useCallback(async () => {
    try {
      const result = await draftApi.listDrafts({
        draftType,
        deviceId: getDeviceId(),
      });
      return result.data;
    } catch (error) {
      console.error('Failed to list drafts:', error);
      return [];
    }
  }, [draftType]);

  // Delete a draft
  const deleteDraft = useCallback(async (draftId) => {
    try {
      await draftApi.deleteDraft(draftId);
      if (drafts.draftId === draftId) {
        drafts.setDraftId(null, null);
      }
      return true;
    } catch (error) {
      console.error('Failed to delete draft:', error);
      return false;
    }
  }, [drafts]);

  // Create new (clear current draft)
  const newDraft = useCallback(() => {
    drafts.resetAll();
    drafts.setDraftId(null, draftType);
  }, [drafts, draftType]);

  return {
    // State
    draftId: drafts.draftId,
    draftType: drafts.draftType,
    isDirty: drafts.isDirty,
    lastSavedAt: drafts.lastSavedAt,
    autoSaveEnabled: drafts.autoSaveEnabled,
    syncStatus: offlineSync.syncStatus,
    isOnline: offlineSync.isOnline,

    // Actions
    saveDraft,
    loadDraft,
    listDrafts,
    deleteDraft,
    newDraft,
    forceSync: offlineSync.forceSync,

    // Auto-save control
    setAutoSave: drafts.setAutoSave,
  };
};

// ============================================================================
// HELD TRANSACTIONS HOOK (POS-specific)
// ============================================================================

/**
 * useHeldTransactions - Manage parked transactions
 */
export const useHeldTransactions = () => {
  const {
    heldTransactions,
    holdCurrentTransaction,
    recallTransaction,
    deleteHeldTransaction,
    items,
  } = useCart();

  const store = useUnifiedStore();

  // Hold current cart with optional label
  const holdCart = useCallback((label = '') => {
    if (items.length === 0) {
      return { success: false, error: 'Cart is empty' };
    }

    const success = holdCurrentTransaction(label);
    return { success, heldCount: store.heldTransactions.length };
  }, [items, holdCurrentTransaction, store.heldTransactions.length]);

  // Recall a held transaction
  const recallCart = useCallback((heldId) => {
    const success = recallTransaction(heldId);
    return { success };
  }, [recallTransaction]);

  // Get held transaction details
  const getHeldTransaction = useCallback((heldId) => {
    return heldTransactions.find((t) => t.id === heldId) || null;
  }, [heldTransactions]);

  return {
    heldTransactions,
    heldCount: heldTransactions.length,
    canHold: items.length > 0,
    holdCart,
    recallCart,
    deleteHeld: deleteHeldTransaction,
    getHeldTransaction,
  };
};

// ============================================================================
// EXPORT ALL HOOKS
// ============================================================================

export {
  useUnifiedStore,
  useCustomer,
  useCart,
  usePricing,
  useDrafts,
  useSync,
  useOfflineSync,
};
