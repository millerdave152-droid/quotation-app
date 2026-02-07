import { authFetch } from '../../../services/authFetch';
/**
 * useQuickSearch - Hook for managing quick search state and API calls
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export const useQuickSearch = (searchQuery, filters, sortBy, userRole) => {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 24,
    totalCount: 0,
    totalPages: 0,
    hasMore: false
  });
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    statuses: [],
    categories: [],
    colors: [],
    priceRange: { min: 0, max: 10000 }
  });
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);

  // Build query string from filters
  const buildQueryString = useCallback((query, filtersObj, sort, page = 1) => {
    const params = new URLSearchParams();

    if (query) params.append('q', query);
    if (sort) params.append('sortBy', sort);
    params.append('page', page.toString());
    params.append('limit', '24');

    // Add filters
    if (filtersObj.productStatus?.length) {
      filtersObj.productStatus.forEach(s => params.append('productStatus', s));
    }
    if (filtersObj.brands?.length) {
      filtersObj.brands.forEach(b => params.append('brands', b));
    }
    if (filtersObj.categoryId) {
      params.append('categoryId', filtersObj.categoryId);
    }
    if (filtersObj.minPrice) {
      params.append('minPrice', filtersObj.minPrice.toString());
    }
    if (filtersObj.maxPrice) {
      params.append('maxPrice', filtersObj.maxPrice.toString());
    }
    if (filtersObj.stockStatus) {
      params.append('stockStatus', filtersObj.stockStatus);
    }
    if (filtersObj.colors?.length) {
      filtersObj.colors.forEach(c => params.append('colors', c));
    }
    if (filtersObj.energyStar) {
      params.append('energyStar', 'true');
    }
    if (filtersObj.smartEnabled) {
      params.append('smartEnabled', 'true');
    }
    if (filtersObj.onSale) {
      params.append('onSale', 'true');
    }

    return params.toString();
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const queryString = buildQueryString(
        searchQuery,
        filters,
        sortBy,
        filters.page || 1
      );

      const response = await authFetch(`${API_BASE}/api/quick-search?${queryString}`, {
        signal: abortControllerRef.current.signal,
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();

      setProducts(data.products || []);
      setPagination(data.pagination || {
        page: 1,
        limit: 24,
        totalCount: 0,
        totalPages: 0,
        hasMore: false
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled
      }
      console.error('Quick search error:', err);
      setError(err.message || 'Failed to search products');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filters, sortBy, buildQueryString]);

  // Fetch filter options
  const fetchFilterOptions = useCallback(async () => {
    try {
      const response = await authFetch(`${API_BASE}/api/quick-search/filters`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        console.error('Failed to fetch filter options');
        return;
      }

      const data = await response.json();
      setFilterOptions(data);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  }, []);

  // Fetch presets
  const fetchPresets = useCallback(async () => {
    try {
      const response = await authFetch(`${API_BASE}/api/quick-search/presets`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        console.error('Failed to fetch presets');
        return;
      }

      const data = await response.json();
      setPresets(data);
    } catch (err) {
      console.error('Error fetching presets:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchFilterOptions();
    fetchPresets();
  }, [fetchFilterOptions, fetchPresets]);

  // Fetch products when search/filters change
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    products,
    pagination,
    filterOptions,
    presets,
    loading,
    error,
    refresh: fetchProducts
  };
};

export default useQuickSearch;
