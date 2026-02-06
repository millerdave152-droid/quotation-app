/**
 * TeleTime POS - Volume Pricing Hook
 *
 * Provides volume/quantity tier pricing functionality:
 * - Fetches volume prices from VolumeDiscountService API
 * - Calculates next tier thresholds
 * - Provides tier preview for product detail views
 * - Real-time cart recalculation when quantities change
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

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
 * Debounce function for API calls with cancel support
 */
function debounce(fn, delay) {
  let timeoutId;
  const debouncedFn = (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
  debouncedFn.cancel = () => clearTimeout(timeoutId);
  return debouncedFn;
}

/**
 * Volume pricing hook
 * @param {object} options
 * @param {number|null} options.customerId - Current customer ID
 * @param {Array} options.cartItems - Current cart items
 * @param {boolean} options.autoFetch - Auto-fetch when items change
 * @returns {object} Volume pricing state and functions
 */
export function useVolumePricing({ customerId = null, cartItems = [], autoFetch = true } = {}) {
  // State
  const [volumePrices, setVolumePrices] = useState({}); // productId -> price info
  const [productTiers, setProductTiers] = useState({}); // productId -> all tiers
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cache for API responses
  const priceCache = useRef({});
  const tierCache = useRef({});

  // ============================================================================
  // SINGLE PRODUCT VOLUME PRICE
  // ============================================================================

  /**
   * Get volume price for a single product
   * @param {number} productId
   * @param {number} quantity
   * @returns {object} Volume pricing info
   */
  const getVolumePrice = useCallback(
    async (productId, quantity) => {
      const cacheKey = `${productId}-${quantity}-${customerId || 'null'}`;

      // Check cache first
      if (priceCache.current[cacheKey]) {
        return priceCache.current[cacheKey];
      }

      try {
        const result = await apiRequest(
          `/pricing/volume/${productId}?quantity=${quantity}${
            customerId ? `&customerId=${customerId}` : ''
          }`
        );

        if (result.success) {
          const priceInfo = {
            ...result.data,
            hasVolumeDiscount: result.data.percentOff > 0,
            nextTier: null, // Will be populated below
          };

          // Cache the result
          priceCache.current[cacheKey] = priceInfo;

          return priceInfo;
        }

        return null;
      } catch (err) {
        console.error('[VolumePricing] Get volume price error:', err);
        return null;
      }
    },
    [customerId]
  );

  // ============================================================================
  // BATCH CART PRICING
  // ============================================================================

  /**
   * Get volume prices for entire cart
   * @param {Array} items - Cart items [{productId, quantity}]
   * @returns {object} Cart volume pricing result
   */
  const getCartVolumePrices = useCallback(
    async (items) => {
      if (!items || items.length === 0) {
        return { success: true, items: [], totals: {} };
      }

      try {
        const result = await apiRequest('/pricing/volume/cart', {
          method: 'POST',
          body: JSON.stringify({
            items: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            customerId,
          }),
        });

        if (result.success) {
          // Update volume prices state
          const newPrices = {};
          result.data.items.forEach((item) => {
            newPrices[item.productId] = {
              ...item,
              hasVolumeDiscount: item.discountPercent > 0,
            };
          });
          setVolumePrices(newPrices);

          return result.data;
        }

        return null;
      } catch (err) {
        console.error('[VolumePricing] Get cart volume prices error:', err);
        setError(err.message);
        return null;
      }
    },
    [customerId]
  );

  // ============================================================================
  // PRODUCT TIERS (for tooltip/preview)
  // ============================================================================

  /**
   * Get all volume tiers for a product
   * @param {number} productId
   * @returns {Array} Volume tiers
   */
  const getProductTiers = useCallback(
    async (productId) => {
      const cacheKey = `tiers-${productId}`;

      // Check cache
      if (tierCache.current[cacheKey]) {
        return tierCache.current[cacheKey];
      }

      try {
        const result = await apiRequest(`/pricing/volume/${productId}/tiers`);

        if (result.success) {
          tierCache.current[cacheKey] = result.data;
          setProductTiers((prev) => ({
            ...prev,
            [productId]: result.data,
          }));
          return result.data;
        }

        return [];
      } catch (err) {
        console.error('[VolumePricing] Get product tiers error:', err);
        return [];
      }
    },
    []
  );

  /**
   * Get volume pricing preview for a product (all tiers with prices)
   * @param {number} productId
   * @returns {Array} Tier previews
   */
  const getVolumePricingPreview = useCallback(
    async (productId) => {
      try {
        const result = await apiRequest(
          `/pricing/volume/${productId}/preview${
            customerId ? `?customerId=${customerId}` : ''
          }`
        );

        if (result.success) {
          return result.data;
        }

        return [];
      } catch (err) {
        console.error('[VolumePricing] Get preview error:', err);
        return [];
      }
    },
    [customerId]
  );

  // ============================================================================
  // NEXT TIER CALCULATION
  // ============================================================================

  /**
   * Calculate how many more units needed for next tier
   * @param {number} productId
   * @param {number} currentQuantity
   * @returns {object|null} Next tier info
   */
  const getNextTierInfo = useCallback(
    async (productId, currentQuantity) => {
      // Get all tiers for this product
      let tiers = productTiers[productId];
      if (!tiers) {
        tiers = await getProductTiers(productId);
      }

      if (!tiers || tiers.length === 0) {
        return null;
      }

      // Find the next tier above current quantity
      const activeTiers = tiers.filter((t) => t.isActive !== false);
      const sortedTiers = activeTiers.sort((a, b) => a.minQty - b.minQty);

      // Find current tier and next tier
      let currentTier = null;
      let nextTier = null;

      for (let i = 0; i < sortedTiers.length; i++) {
        const tier = sortedTiers[i];
        const maxQty = tier.maxQty || Infinity;

        if (currentQuantity >= tier.minQty && currentQuantity <= maxQty) {
          currentTier = tier;
          nextTier = sortedTiers[i + 1] || null;
          break;
        }
      }

      if (!nextTier) {
        // Already at highest tier
        return null;
      }

      const unitsNeeded = nextTier.minQty - currentQuantity;

      return {
        currentTier,
        nextTier,
        unitsNeeded,
        nextTierName: nextTier.tierName || `${nextTier.minQty}+ units`,
        nextTierDiscount: nextTier.discountPercent || null,
        nextTierPrice: nextTier.priceCents ? nextTier.priceCents / 100 : null,
        message: `Add ${unitsNeeded} more for ${
          nextTier.discountPercent
            ? `${nextTier.discountPercent}% off`
            : 'better pricing'
        }`,
      };
    },
    [productTiers, getProductTiers]
  );

  // ============================================================================
  // AUTO-FETCH CART PRICES
  // ============================================================================

  // Ref to track if component is mounted (for async operations)
  const isMountedRef = useRef(true);

  // Debounced cart price fetch
  const debouncedFetchCartPrices = useMemo(
    () =>
      debounce(async (items) => {
        if (items.length > 0 && isMountedRef.current) {
          setLoading(true);
          await getCartVolumePrices(items);
          if (isMountedRef.current) {
            setLoading(false);
          }
        }
      }, 300),
    [getCartVolumePrices]
  );

  // Auto-fetch when cart items change
  useEffect(() => {
    if (autoFetch && cartItems.length > 0) {
      debouncedFetchCartPrices(cartItems);
    } else if (cartItems.length === 0) {
      setVolumePrices({});
    }

    // Cleanup: cancel pending debounced calls
    return () => {
      debouncedFetchCartPrices.cancel?.();
    };
  }, [cartItems, autoFetch, debouncedFetchCartPrices]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Clear cache when customer changes
  useEffect(() => {
    priceCache.current = {};
    setVolumePrices({});
  }, [customerId]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  /**
   * Get volume price info for a specific product in cart
   */
  const getVolumeInfoForProduct = useCallback(
    (productId) => {
      return volumePrices[productId] || null;
    },
    [volumePrices]
  );

  /**
   * Check if any cart item has volume discount
   */
  const hasAnyVolumeDiscount = useMemo(() => {
    return Object.values(volumePrices).some((p) => p.hasVolumeDiscount);
  }, [volumePrices]);

  /**
   * Total volume savings across cart
   */
  const totalVolumeSavings = useMemo(() => {
    return Object.values(volumePrices).reduce((sum, p) => {
      return sum + (p.savings || 0) * (p.quantity || 1);
    }, 0);
  }, [volumePrices]);

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Clear all caches
   */
  const clearCache = useCallback(() => {
    priceCache.current = {};
    tierCache.current = {};
    setVolumePrices({});
    setProductTiers({});
  }, []);

  /**
   * Refresh prices for current cart
   */
  const refreshCartPrices = useCallback(async () => {
    if (cartItems.length > 0) {
      setLoading(true);
      await getCartVolumePrices(cartItems);
      setLoading(false);
    }
  }, [cartItems, getCartVolumePrices]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    volumePrices,
    productTiers,
    loading,
    error,

    // Single product
    getVolumePrice,
    getVolumeInfoForProduct,

    // Cart batch
    getCartVolumePrices,
    refreshCartPrices,

    // Tiers
    getProductTiers,
    getVolumePricingPreview,
    getNextTierInfo,

    // Computed
    hasAnyVolumeDiscount,
    totalVolumeSavings,

    // Utilities
    clearCache,
  };
}

export default useVolumePricing;
