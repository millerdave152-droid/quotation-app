/**
 * useCommission Hook
 * Manages commission calculations, recording, and display state
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  calculateCartCommission,
  calculateOrderCommission,
  getMyCommissions,
  getRepCommissions as fetchRepCommissions,
  recordCommission as apiRecordCommission,
} from '../api/commissions';

/**
 * Hook for managing commission calculations on a cart
 * @param {object} options - Configuration options
 * @returns {object} Commission state and actions
 */
export function useCommission(options = {}) {
  const {
    salesRepId,
    autoCalculate = true,
    debounceMs = 400,
  } = options;

  const [cart, setCart] = useState(null);
  const [commission, setCommission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const abortControllerRef = useRef(null);

  /**
   * Format cart for API
   */
  const formatCartForApi = useCallback((cartData) => {
    if (!cartData?.items?.length) return null;

    return {
      subtotal: cartData.subtotal || cartData.items.reduce((sum, i) =>
        sum + (i.lineTotal || i.line_total || (i.price || i.unitPrice) * i.quantity), 0),
      discount: cartData.discount || 0,
      total: cartData.total || (cartData.subtotal || 0) - (cartData.discount || 0),
      items: cartData.items.map(item => ({
        itemId: item.id || item.itemId,
        productId: item.productId || item.product_id,
        name: item.name || item.productName || item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice || item.unit_price || item.price,
        lineTotal: item.lineTotal || item.line_total || ((item.price || item.unitPrice) * item.quantity),
        discountCents: item.discountCents || (item.discount ? item.discount * 100 : 0),
        discountPercent: item.discountPercent || item.discount_percent || 0,
        itemType: item.itemType || item.item_type || item.type || 'product',
        categoryId: item.categoryId || item.category_id,
        categoryName: item.categoryName || item.category_name,
        productType: item.productType || item.product_type,
      })),
    };
  }, []);

  /**
   * Calculate commission for given cart
   */
  const calculate = useCallback(async (cartData, repId = salesRepId) => {
    const formattedCart = formatCartForApi(cartData);

    if (!formattedCart || !repId) {
      setCommission(null);
      return null;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await calculateCartCommission(formattedCart, repId);
      setCommission(result.data);
      return result.data;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[useCommission] Calculate error:', err);
        setError(err.message);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [salesRepId, formatCartForApi]);

  /**
   * Debounced calculate
   */
  const debouncedCalculate = useCallback((cartData, repId) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      calculate(cartData, repId);
    }, debounceMs);
  }, [calculate, debounceMs]);

  /**
   * Update cart and optionally recalculate
   */
  const updateCart = useCallback((newCart) => {
    setCart(newCart);

    if (autoCalculate && newCart?.items?.length) {
      debouncedCalculate(newCart, salesRepId);
    } else if (!newCart?.items?.length) {
      setCommission(null);
    }
  }, [autoCalculate, debouncedCalculate, salesRepId]);

  /**
   * Calculate commission for a completed order
   */
  const calculateForOrder = useCallback(async (orderId, repId = salesRepId) => {
    if (!orderId || !repId) {
      throw new Error('Order ID and sales rep ID required');
    }

    setLoading(true);
    setError(null);

    try {
      const result = await calculateOrderCommission(orderId, repId);
      return result.data;
    } catch (err) {
      console.error('[useCommission] Calculate order error:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [salesRepId]);

  /**
   * Record commission for completed order
   */
  const recordCommission = useCallback(async (orderId, repId = salesRepId) => {
    if (!orderId || !repId) {
      throw new Error('Order ID and sales rep ID required');
    }

    try {
      const result = await apiRecordCommission(orderId, repId);
      return result.data;
    } catch (err) {
      console.error('[useCommission] Record error:', err);
      throw err;
    }
  }, [salesRepId]);

  /**
   * Clear commission state
   */
  const clear = useCallback(() => {
    setCart(null);
    setCommission(null);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    cart,
    commission,
    loading,
    error,

    // Derived values
    totalCommission: commission?.totalCommission || 0,
    breakdown: commission?.breakdown || [],
    notes: commission?.notes || [],
    summary: commission?.summary || null,
    hasCommission: (commission?.totalCommission || 0) > 0,
    hasBonus: (commission?.summary?.bonusCommission || 0) > 0,
    hasReducedItems: (commission?.summary?.reducedItems || 0) > 0,

    // Actions
    calculate,
    calculateForOrder,
    updateCart,
    recordCommission,
    clear,
  };
}

/**
 * Hook for fetching a rep's commission report
 * @param {number} repId - Sales rep user ID (null for current user)
 * @param {object} dateRange - { startDate, endDate }
 */
export function useRepCommissions(repId = null, dateRange = {}) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Extract date range values to avoid object reference issues in dependencies
  const { startDate, endDate } = dateRange;

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const dateRangeParam = { startDate, endDate };
      const result = repId
        ? await fetchRepCommissions(repId, dateRangeParam)
        : await getMyCommissions(dateRangeParam);
      setReport(result.data);
    } catch (err) {
      console.error('[useRepCommissions] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [repId, startDate, endDate]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  return {
    report,
    loading,
    error,
    refresh: fetchCommissions,

    // Convenience accessors
    summary: report?.summary || null,
    earnings: report?.earnings || [],
    dailyBreakdown: report?.dailyBreakdown || [],
    targetProgress: report?.targetProgress || null,
    dateRange: report?.dateRange || null,
  };
}

/**
 * Hook for post-sale commission confirmation
 * Manages the confirmation state after a sale
 */
export function useCommissionConfirmation() {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [commissionData, setCommissionData] = useState(null);
  const [saleData, setSaleData] = useState(null);

  /**
   * Show confirmation after successful sale
   */
  const showSaleConfirmation = useCallback((commission, sale) => {
    setCommissionData(commission);
    setSaleData(sale);

    // Show toast for small commissions, modal for larger ones
    if (commission?.totalCommission >= 10) {
      setShowConfirmation(true);
    } else {
      setShowToast(true);
    }
  }, []);

  /**
   * Close all confirmations
   */
  const closeConfirmation = useCallback(() => {
    setShowConfirmation(false);
    setShowToast(false);
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setShowConfirmation(false);
    setShowToast(false);
    setCommissionData(null);
    setSaleData(null);
  }, []);

  return {
    // State
    showConfirmation,
    showToast,
    commissionData,
    saleData,

    // Actions
    showSaleConfirmation,
    closeConfirmation,
    closeModal: () => setShowConfirmation(false),
    closeToast: () => setShowToast(false),
    reset,
  };
}

export default useCommission;
