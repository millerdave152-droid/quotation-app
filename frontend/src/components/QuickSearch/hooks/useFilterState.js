/**
 * useFilterState - Hook for URL-synced filter state
 *
 * Keeps filters in sync with URL query params for shareable searches
 */
import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// Parse URL params to filter object
const parseUrlParams = (searchParams) => {
  const filters = {};

  // Product status (array)
  const productStatus = searchParams.getAll('status');
  if (productStatus.length > 0) {
    filters.productStatus = productStatus;
  }

  // Brands (array)
  const brands = searchParams.getAll('brand');
  if (brands.length > 0) {
    filters.brands = brands;
  }

  // Category
  const categoryId = searchParams.get('category');
  if (categoryId) {
    filters.categoryId = categoryId;
  }

  // Price range
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  if (minPrice) filters.minPrice = parseFloat(minPrice);
  if (maxPrice) filters.maxPrice = parseFloat(maxPrice);

  // Stock status
  const stockStatus = searchParams.get('stock');
  if (stockStatus) {
    filters.stockStatus = stockStatus;
  }

  // Colors (array)
  const colors = searchParams.getAll('color');
  if (colors.length > 0) {
    filters.colors = colors;
  }

  // Boolean filters
  if (searchParams.get('energyStar') === 'true') {
    filters.energyStar = true;
  }
  if (searchParams.get('smart') === 'true') {
    filters.smartEnabled = true;
  }
  if (searchParams.get('onSale') === 'true') {
    filters.onSale = true;
  }

  // Page
  const page = searchParams.get('page');
  if (page) {
    filters.page = parseInt(page);
  }

  return filters;
};

// Build URL params from filter object
const buildUrlParams = (filters, searchQuery, sortBy) => {
  const params = new URLSearchParams();

  if (searchQuery) {
    params.set('q', searchQuery);
  }

  if (sortBy && sortBy !== 'relevance') {
    params.set('sort', sortBy);
  }

  // Product status
  if (filters.productStatus?.length) {
    filters.productStatus.forEach(s => params.append('status', s));
  }

  // Brands
  if (filters.brands?.length) {
    filters.brands.forEach(b => params.append('brand', b));
  }

  // Category
  if (filters.categoryId) {
    params.set('category', filters.categoryId);
  }

  // Price range
  if (filters.minPrice) {
    params.set('minPrice', filters.minPrice.toString());
  }
  if (filters.maxPrice) {
    params.set('maxPrice', filters.maxPrice.toString());
  }

  // Stock status
  if (filters.stockStatus) {
    params.set('stock', filters.stockStatus);
  }

  // Colors
  if (filters.colors?.length) {
    filters.colors.forEach(c => params.append('color', c));
  }

  // Boolean filters
  if (filters.energyStar) {
    params.set('energyStar', 'true');
  }
  if (filters.smartEnabled) {
    params.set('smart', 'true');
  }
  if (filters.onSale) {
    params.set('onSale', 'true');
  }

  // Page
  if (filters.page && filters.page > 1) {
    params.set('page', filters.page.toString());
  }

  return params;
};

export const useFilterState = () => {
  // Try to use react-router's useSearchParams if available
  let searchParams, setSearchParams;
  try {
    [searchParams, setSearchParams] = useSearchParams();
  } catch {
    // Fallback for non-router contexts
    searchParams = new URLSearchParams(window.location.search);
    setSearchParams = (params) => {
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    };
  }

  // Initialize state from URL
  const [filters, setFiltersState] = useState(() => parseUrlParams(searchParams));
  const [searchQuery, setSearchQueryState] = useState(searchParams.get('q') || '');
  const [sortBy, setSortByState] = useState(searchParams.get('sort') || 'relevance');

  // Update URL when state changes
  useEffect(() => {
    const params = buildUrlParams(filters, searchQuery, sortBy);
    setSearchParams(params);
  }, [filters, searchQuery, sortBy, setSearchParams]);

  // Set all filters at once
  const setFilters = useCallback((newFilters) => {
    setFiltersState(newFilters);
  }, []);

  // Update a single filter
  const updateFilter = useCallback((key, value) => {
    setFiltersState(prev => {
      const next = { ...prev };
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
        delete next[key];
      } else {
        next[key] = value;
      }
      // Reset page when filters change (unless updating page itself)
      if (key !== 'page') {
        delete next.page;
      }
      return next;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFiltersState({});
    setSearchQueryState('');
    setSortByState('relevance');
  }, []);

  // Set search query
  const setSearchQuery = useCallback((query) => {
    setSearchQueryState(query);
    // Reset page when search changes
    setFiltersState(prev => {
      const next = { ...prev };
      delete next.page;
      return next;
    });
  }, []);

  // Set sort
  const setSortBy = useCallback((sort) => {
    setSortByState(sort);
    // Reset page when sort changes
    setFiltersState(prev => {
      const next = { ...prev };
      delete next.page;
      return next;
    });
  }, []);

  return {
    filters,
    setFilters,
    updateFilter,
    clearFilters,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy
  };
};

export default useFilterState;
