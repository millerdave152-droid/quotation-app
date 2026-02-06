/**
 * TeleTime POS - Customer Pricing Hook
 *
 * Provides customer-specific pricing functionality:
 * - Automatic price calculation based on customer tier
 * - Volume discount application
 * - Price override workflow
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';

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
 * Customer pricing hook
 * @param {object} options
 * @param {number|null} options.customerId - Current customer ID
 * @param {boolean} options.autoFetch - Auto-fetch pricing info when customer changes
 * @returns {object} Pricing state and functions
 */
export function useCustomerPricing({ customerId = null, autoFetch = true } = {}) {
  const { user } = useAuth();

  // State
  const [pricingInfo, setPricingInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cache for calculated prices
  const [priceCache, setPriceCache] = useState({});

  // Ref for cache to avoid stale closures in callbacks
  const priceCacheRef = useRef(priceCache);
  priceCacheRef.current = priceCache;

  // ============================================================================
  // PRICING INFO
  // ============================================================================

  /**
   * Fetch customer pricing information
   */
  const fetchPricingInfo = useCallback(async (custId) => {
    if (!custId) {
      setPricingInfo(getDefaultPricingInfo());
      return getDefaultPricingInfo();
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiRequest(`/customer-pricing/info/${custId}`);
      setPricingInfo(result.data);
      return result.data;
    } catch (err) {
      setError(err.message);
      setPricingInfo(getDefaultPricingInfo());
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch when customer changes
  useEffect(() => {
    if (autoFetch) {
      fetchPricingInfo(customerId);
      // Clear price cache when customer changes
      setPriceCache({});
    }
  }, [customerId, autoFetch, fetchPricingInfo]);

  // ============================================================================
  // PRICE CALCULATION
  // ============================================================================

  /**
   * Calculate customer price for a single product
   * FIXED: Uses ref to avoid recreating callback on every cache update
   */
  const calculatePrice = useCallback(
    async (productId, quantity = 1) => {
      const cacheKey = `${customerId || 'null'}-${productId}-${quantity}`;

      // Check cache using ref for latest value
      if (priceCacheRef.current[cacheKey]) {
        return priceCacheRef.current[cacheKey];
      }

      try {
        const result = await apiRequest('/customer-pricing/calculate', {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            productId,
            quantity,
          }),
        });

        // Cache the result
        setPriceCache((prev) => ({
          ...prev,
          [cacheKey]: result.data,
        }));

        return result.data;
      } catch (err) {
        console.error('[CustomerPricing] Calculate price error:', err);
        return null;
      }
    },
    [customerId] // Removed priceCache - use ref instead
  );

  /**
   * Calculate prices for multiple products
   */
  const calculateBulkPrices = useCallback(
    async (items) => {
      try {
        const result = await apiRequest('/customer-pricing/calculate-bulk', {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            items,
          }),
        });

        // Cache individual results
        const newCache = {};
        result.data.items.forEach((item) => {
          const cacheKey = `${customerId || 'null'}-${item.productId}-${item.quantity}`;
          newCache[cacheKey] = item;
        });

        setPriceCache((prev) => ({
          ...prev,
          ...newCache,
        }));

        return result.data;
      } catch (err) {
        console.error('[CustomerPricing] Bulk price error:', err);
        return null;
      }
    },
    [customerId]
  );

  /**
   * Get cached price or fetch
   * FIXED: Uses ref to avoid stale cache references
   */
  const getPrice = useCallback(
    async (productId, quantity = 1) => {
      const cacheKey = `${customerId || 'null'}-${productId}-${quantity}`;

      // Use ref for latest cache value
      if (priceCacheRef.current[cacheKey]) {
        return priceCacheRef.current[cacheKey];
      }

      return calculatePrice(productId, quantity);
    },
    [customerId, calculatePrice] // Removed priceCache - use ref instead
  );

  /**
   * Get volume discounts for a product
   */
  const getVolumeDiscounts = useCallback(
    async (productId) => {
      try {
        const url = `/customer-pricing/volume-discounts/${productId}${
          customerId ? `?customerId=${customerId}` : ''
        }`;
        const result = await apiRequest(url);
        return result.data;
      } catch (err) {
        console.error('[CustomerPricing] Volume discounts error:', err);
        return [];
      }
    },
    [customerId]
  );

  // ============================================================================
  // PRICE OVERRIDE
  // ============================================================================

  /**
   * Check if override requires approval
   */
  const checkOverrideApproval = useCallback(
    async (originalPriceCents, overridePriceCents) => {
      try {
        const result = await apiRequest('/customer-pricing/override/check', {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            originalPriceCents,
            overridePriceCents,
          }),
        });
        return result.data;
      } catch (err) {
        console.error('[CustomerPricing] Check override error:', err);
        return { requiresApproval: true, error: err.message };
      }
    },
    [customerId]
  );

  /**
   * Request a price override
   */
  const requestOverride = useCallback(
    async (overrideData) => {
      try {
        const result = await apiRequest('/customer-pricing/override/request', {
          method: 'POST',
          body: JSON.stringify({
            ...overrideData,
            customerId,
          }),
        });
        return { success: true, ...result.data };
      } catch (err) {
        console.error('[CustomerPricing] Request override error:', err);
        return { success: false, error: err.message };
      }
    },
    [customerId]
  );

  /**
   * Approve a pending override (manager only)
   */
  const approveOverride = useCallback(async (overrideId, notes = null) => {
    try {
      const result = await apiRequest(
        `/customer-pricing/override/${overrideId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes }),
        }
      );
      return { success: true, override: result.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Reject a pending override (manager only)
   */
  const rejectOverride = useCallback(async (overrideId, reason) => {
    try {
      const result = await apiRequest(
        `/customer-pricing/override/${overrideId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );
      return { success: true, override: result.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Get pending overrides for manager approval
   */
  const getPendingOverrides = useCallback(async (options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', options.limit);
      if (options.offset) params.set('offset', options.offset);

      const result = await apiRequest(
        `/customer-pricing/override/pending?${params.toString()}`
      );
      return result.data;
    } catch (err) {
      console.error('[CustomerPricing] Pending overrides error:', err);
      return [];
    }
  }, []);

  /**
   * Get override history
   */
  const getOverrideHistory = useCallback(async (options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.customerId) params.set('customerId', options.customerId);
      if (options.productId) params.set('productId', options.productId);
      if (options.status) params.set('status', options.status);
      if (options.limit) params.set('limit', options.limit);

      const result = await apiRequest(
        `/customer-pricing/override/history?${params.toString()}`
      );
      return result.data;
    } catch (err) {
      console.error('[CustomerPricing] Override history error:', err);
      return [];
    }
  }, []);

  // ============================================================================
  // TIER MANAGEMENT
  // ============================================================================

  /**
   * Get all pricing tiers
   */
  const getPricingTiers = useCallback(async () => {
    try {
      const result = await apiRequest('/customer-pricing/tiers');
      return result.data;
    } catch (err) {
      console.error('[CustomerPricing] Get tiers error:', err);
      return [];
    }
  }, []);

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Clear price cache
   */
  const clearCache = useCallback(() => {
    setPriceCache({});
  }, []);

  /**
   * Format price display with savings
   */
  const formatPriceWithSavings = useCallback((priceInfo) => {
    if (!priceInfo) return null;

    return {
      basePrice: formatCurrency(priceInfo.basePrice),
      customerPrice: formatCurrency(priceInfo.customerPrice),
      savings: formatCurrency(priceInfo.savings),
      savingsPercent: `${priceInfo.savingsPercent.toFixed(1)}%`,
      hasDiscount: priceInfo.savings > 0,
    };
  }, []);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const isManager = useMemo(() => {
    return user?.role === 'admin' || user?.role === 'manager';
  }, [user]);

  const canApproveOverrides = isManager;

  const tierDisplay = useMemo(() => {
    if (!pricingInfo) return null;

    return {
      name: pricingInfo.tierName,
      tier: pricingInfo.pricingTier,
      discount: pricingInfo.effectiveDiscount,
      discountDisplay: `${pricingInfo.effectiveDiscount}% off`,
      isSpecialTier: pricingInfo.pricingTier !== 'retail',
    };
  }, [pricingInfo]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    pricingInfo,
    loading,
    error,
    customerId,

    // Pricing info
    fetchPricingInfo,
    tierDisplay,

    // Price calculation
    calculatePrice,
    calculateBulkPrices,
    getPrice,
    getVolumeDiscounts,

    // Override workflow
    checkOverrideApproval,
    requestOverride,
    approveOverride,
    rejectOverride,
    getPendingOverrides,
    getOverrideHistory,
    canApproveOverrides,

    // Tier management
    getPricingTiers,

    // Utilities
    clearCache,
    formatPriceWithSavings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get default pricing info for non-customers
 */
function getDefaultPricingInfo() {
  return {
    customerId: null,
    customerName: null,
    pricingTier: 'retail',
    tierName: 'Retail',
    tierBaseDiscount: 0,
    customerDiscount: 0,
    effectiveDiscount: 0,
    costPlusMargin: null,
    canSeeCost: false,
    creditLimitCents: null,
    requiresApprovalOverPercent: 15,
    maxAdditionalDiscount: 10,
    volumeDiscountEligible: true,
  };
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

export default useCustomerPricing;
