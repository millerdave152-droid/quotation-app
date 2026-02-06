/**
 * TeleTime POS - Order Modification Hook
 *
 * Handles order modifications including:
 * - Adding/removing/modifying items
 * - Price lock management
 * - Amendment workflow
 * - Version history
 * - Partial fulfillment
 */

import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'API request failed');
  }

  return data;
}

/**
 * Order modification hook
 * @param {number} orderId - Order ID to modify
 * @returns {object} Modification state and functions
 */
export function useOrderModification(orderId) {
  const { user } = useAuth();

  // State
  const [order, setOrder] = useState(null);
  const [amendments, setAmendments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [fulfillment, setFulfillment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pending changes (not yet submitted as amendment)
  const [pendingChanges, setPendingChanges] = useState({
    addItems: [],
    removeItems: [],
    modifyItems: [],
  });

  // ============================================================================
  // ORDER LOADING
  // ============================================================================

  /**
   * Load order with quote info
   */
  const loadOrder = useCallback(async () => {
    if (!orderId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await apiRequest(`/order-modifications/${orderId}`);
      setOrder(result.data);
      return result.data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  /**
   * Load amendments for order
   */
  const loadAmendments = useCallback(async () => {
    if (!orderId) return;

    try {
      const result = await apiRequest(`/order-modifications/${orderId}/amendments`);
      setAmendments(result.data);
      return result.data;
    } catch (err) {
      console.error('[OrderModification] Load amendments error:', err);
      return [];
    }
  }, [orderId]);

  /**
   * Load version history
   */
  const loadVersions = useCallback(async () => {
    if (!orderId) return;

    try {
      const result = await apiRequest(`/order-modifications/${orderId}/versions`);
      setVersions(result.data);
      return result.data;
    } catch (err) {
      console.error('[OrderModification] Load versions error:', err);
      return [];
    }
  }, [orderId]);

  /**
   * Load shipments
   */
  const loadShipments = useCallback(async () => {
    if (!orderId) return;

    try {
      const result = await apiRequest(`/order-modifications/${orderId}/shipments`);
      setShipments(result.data);
      return result.data;
    } catch (err) {
      console.error('[OrderModification] Load shipments error:', err);
      return [];
    }
  }, [orderId]);

  /**
   * Load fulfillment summary
   */
  const loadFulfillment = useCallback(async () => {
    if (!orderId) return;

    try {
      const result = await apiRequest(`/order-modifications/${orderId}/fulfillment`);
      setFulfillment(result.data);
      return result.data;
    } catch (err) {
      console.error('[OrderModification] Load fulfillment error:', err);
      return null;
    }
  }, [orderId]);

  /**
   * Load all order data
   */
  const loadAll = useCallback(async () => {
    await Promise.all([
      loadOrder(),
      loadAmendments(),
      loadVersions(),
      loadShipments(),
      loadFulfillment(),
    ]);
  }, [loadOrder, loadAmendments, loadVersions, loadShipments, loadFulfillment]);

  // ============================================================================
  // PRICE LOCK
  // ============================================================================

  /**
   * Set price lock on order
   */
  const setPriceLock = useCallback(
    async (locked, lockUntil = null) => {
      try {
        const result = await apiRequest(`/order-modifications/${orderId}/price-lock`, {
          method: 'PUT',
          body: JSON.stringify({ locked, lockUntil }),
        });

        if (order) {
          setOrder({
            ...order,
            priceLocked: locked,
            priceLockUntil: lockUntil,
          });
        }

        return { success: true, ...result.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [orderId, order]
  );

  /**
   * Get price options for an item
   */
  const getPriceOptions = useCallback(
    async (productId) => {
      try {
        const result = await apiRequest(
          `/order-modifications/${orderId}/price-options/${productId}`
        );
        return result.data;
      } catch (err) {
        console.error('[OrderModification] Get price options error:', err);
        return null;
      }
    },
    [orderId]
  );

  // ============================================================================
  // PENDING CHANGES MANAGEMENT
  // ============================================================================

  /**
   * Add item to pending changes
   */
  const addItemToPending = useCallback((item) => {
    setPendingChanges((prev) => ({
      ...prev,
      addItems: [...prev.addItems, item],
    }));
  }, []);

  /**
   * Remove item from pending changes
   */
  const removeItemFromPending = useCallback((productId, reason = null) => {
    setPendingChanges((prev) => ({
      ...prev,
      removeItems: [...prev.removeItems, { productId, reason }],
    }));
  }, []);

  /**
   * Modify item in pending changes
   */
  const modifyItemInPending = useCallback((item) => {
    setPendingChanges((prev) => {
      // Check if already modifying this item
      const existingIndex = prev.modifyItems.findIndex(
        (i) => i.productId === item.productId
      );

      if (existingIndex >= 0) {
        const updated = [...prev.modifyItems];
        updated[existingIndex] = { ...updated[existingIndex], ...item };
        return { ...prev, modifyItems: updated };
      }

      return { ...prev, modifyItems: [...prev.modifyItems, item] };
    });
  }, []);

  /**
   * Clear all pending changes
   */
  const clearPendingChanges = useCallback(() => {
    setPendingChanges({
      addItems: [],
      removeItems: [],
      modifyItems: [],
    });
  }, []);

  /**
   * Remove specific pending change
   */
  const removePendingChange = useCallback((type, index) => {
    setPendingChanges((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }));
  }, []);

  // ============================================================================
  // AMENDMENTS
  // ============================================================================

  /**
   * Submit pending changes as an amendment
   */
  const submitAmendment = useCallback(
    async (amendmentType, reason = null, useQuotePrices = false) => {
      const hasPendingChanges =
        pendingChanges.addItems.length > 0 ||
        pendingChanges.removeItems.length > 0 ||
        pendingChanges.modifyItems.length > 0;

      if (!hasPendingChanges) {
        return { success: false, error: 'No changes to submit' };
      }

      try {
        const result = await apiRequest(`/order-modifications/${orderId}/amendments`, {
          method: 'POST',
          body: JSON.stringify({
            amendmentType,
            reason,
            useQuotePrices,
            addItems: pendingChanges.addItems,
            removeItems: pendingChanges.removeItems,
            modifyItems: pendingChanges.modifyItems,
          }),
        });

        clearPendingChanges();
        await loadAmendments();

        return { success: true, ...result.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [orderId, pendingChanges, clearPendingChanges, loadAmendments]
  );

  /**
   * Get amendment details
   */
  const getAmendment = useCallback(async (amendmentId) => {
    try {
      const result = await apiRequest(`/order-modifications/amendments/${amendmentId}`);
      return result.data;
    } catch (err) {
      console.error('[OrderModification] Get amendment error:', err);
      return null;
    }
  }, []);

  /**
   * Approve an amendment
   */
  const approveAmendment = useCallback(async (amendmentId, notes = null) => {
    try {
      const result = await apiRequest(
        `/order-modifications/amendments/${amendmentId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes }),
        }
      );

      await loadAmendments();
      return { success: true, amendment: result.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [loadAmendments]);

  /**
   * Reject an amendment
   */
  const rejectAmendment = useCallback(async (amendmentId, reason) => {
    try {
      const result = await apiRequest(
        `/order-modifications/amendments/${amendmentId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );

      await loadAmendments();
      return { success: true, amendment: result.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [loadAmendments]);

  /**
   * Apply an approved amendment
   */
  const applyAmendment = useCallback(
    async (amendmentId) => {
      try {
        const result = await apiRequest(
          `/order-modifications/amendments/${amendmentId}/apply`,
          { method: 'POST' }
        );

        await loadAll();
        return { success: true, ...result.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [loadAll]
  );

  /**
   * Get pending amendments for approval (manager)
   */
  const getPendingAmendments = useCallback(async (limit = 50) => {
    try {
      const result = await apiRequest(
        `/order-modifications/amendments/pending?limit=${limit}`
      );
      return result.data;
    } catch (err) {
      console.error('[OrderModification] Get pending amendments error:', err);
      return [];
    }
  }, []);

  // ============================================================================
  // VERSIONS
  // ============================================================================

  /**
   * Compare two versions
   */
  const compareVersions = useCallback(
    async (v1, v2) => {
      try {
        const result = await apiRequest(
          `/order-modifications/${orderId}/versions/compare?v1=${v1}&v2=${v2}`
        );
        return result.data;
      } catch (err) {
        console.error('[OrderModification] Compare versions error:', err);
        return null;
      }
    },
    [orderId]
  );

  // ============================================================================
  // FULFILLMENT
  // ============================================================================

  /**
   * Create a shipment
   */
  const createShipment = useCallback(
    async (items, shippingInfo = {}) => {
      try {
        const result = await apiRequest(`/order-modifications/${orderId}/shipments`, {
          method: 'POST',
          body: JSON.stringify({
            items,
            ...shippingInfo,
          }),
        });

        await Promise.all([loadShipments(), loadFulfillment()]);
        return { success: true, ...result.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [orderId, loadShipments, loadFulfillment]
  );

  /**
   * Mark items as backordered
   */
  const markBackordered = useCallback(
    async (items) => {
      try {
        const result = await apiRequest(`/order-modifications/${orderId}/backorder`, {
          method: 'POST',
          body: JSON.stringify({ items }),
        });

        await loadFulfillment();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [orderId, loadFulfillment]
  );

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const hasPendingChanges = useMemo(() => {
    return (
      pendingChanges.addItems.length > 0 ||
      pendingChanges.removeItems.length > 0 ||
      pendingChanges.modifyItems.length > 0
    );
  }, [pendingChanges]);

  const pendingChangeCount = useMemo(() => {
    return (
      pendingChanges.addItems.length +
      pendingChanges.removeItems.length +
      pendingChanges.modifyItems.length
    );
  }, [pendingChanges]);

  const isFromQuote = useMemo(() => {
    return order?.quote !== null;
  }, [order]);

  const canApprove = useMemo(() => {
    return user?.role === 'admin' || user?.role === 'manager';
  }, [user]);

  const priceChangeItems = useMemo(() => {
    if (!order?.items) return [];
    return order.items.filter((item) => item.hasPriceChange);
  }, [order]);

  const hasPriceChanges = priceChangeItems.length > 0;

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    order,
    amendments,
    versions,
    shipments,
    fulfillment,
    loading,
    error,
    pendingChanges,

    // Computed
    hasPendingChanges,
    pendingChangeCount,
    isFromQuote,
    canApprove,
    priceChangeItems,
    hasPriceChanges,

    // Loading
    loadOrder,
    loadAmendments,
    loadVersions,
    loadShipments,
    loadFulfillment,
    loadAll,

    // Price lock
    setPriceLock,
    getPriceOptions,

    // Pending changes
    addItemToPending,
    removeItemFromPending,
    modifyItemInPending,
    clearPendingChanges,
    removePendingChange,

    // Amendments
    submitAmendment,
    getAmendment,
    approveAmendment,
    rejectAmendment,
    applyAmendment,
    getPendingAmendments,

    // Versions
    compareVersions,

    // Fulfillment
    createShipment,
    markBackordered,
  };
}

export default useOrderModification;
