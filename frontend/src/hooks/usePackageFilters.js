/**
 * usePackageFilters - Custom hook for Package Builder V2 filter state
 * Manages filter selections, API calls, and package generation
 */
import { useState, useCallback, useEffect, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const usePackageFilters = (packageType = 'kitchen') => {
  // Filter state
  const [selectedFilters, setSelectedFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Package state
  const [packages, setPackages] = useState(null);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState(null);

  // Preview state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Track package type changes
  const prevPackageType = useRef(packageType);

  // Debounce timer for filter updates
  const debounceTimer = useRef(null);

  /**
   * Fetch filter options with counts from the API
   */
  const fetchFilterOptions = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('package_type', packageType);

      if (filters.brand?.length > 0) {
        params.set('brand', filters.brand.join(','));
      }

      // Add category-specific filters
      const categories = ['refrigerator', 'range', 'dishwasher', 'washer', 'dryer'];
      for (const cat of categories) {
        if (filters[cat]) {
          for (const [key, value] of Object.entries(filters[cat])) {
            if (value) {
              params.set(`${cat}_${key}`, Array.isArray(value) ? value.join(',') : value);
            }
          }
        }
      }

      const response = await fetch(
        `${API_BASE}/api/package-builder-v2/filter-options?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch filter options');
      }

      const data = await response.json();

      if (data.success) {
        setFilterOptions(data.filters);
      } else {
        throw new Error(data.error || 'Failed to load filters');
      }
    } catch (err) {
      console.error('Error fetching filter options:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [packageType]);

  /**
   * Fetch preview (product counts by category) without generating packages
   */
  const fetchPreview = useCallback(async (filters = {}) => {
    setPreviewLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/package-builder-v2/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_type: packageType,
          filters
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch preview');
      }

      const data = await response.json();

      if (data.success) {
        setPreview(data);
      }
    } catch (err) {
      console.error('Error fetching preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [packageType]);

  /**
   * Generate packages based on current filters
   */
  const generatePackages = useCallback(async (filters = null) => {
    const filtersToUse = filters || selectedFilters;

    setPackagesLoading(true);
    setPackagesError(null);

    try {
      const response = await fetch(`${API_BASE}/api/package-builder-v2/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_type: packageType,
          filters: filtersToUse
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate packages');
      }

      const data = await response.json();
      console.log('Generate response:', data);

      if (data.success) {
        // The API returns { packages: { packages: { good, better, best } } }
        // We need to extract the inner packages object
        const packagesData = data.packages?.packages || data.packages;
        console.log('Packages data:', packagesData);
        setPackages(packagesData);
        // Update filter counts from response
        if (data.filter_counts) {
          setFilterOptions(data.filter_counts);
        }
      } else {
        throw new Error(data.error || 'Failed to generate packages');
      }
    } catch (err) {
      console.error('Error generating packages:', err);
      setPackagesError(err.message);
    } finally {
      setPackagesLoading(false);
    }
  }, [packageType, selectedFilters]);

  /**
   * Update filters with debounced API call
   */
  const updateFilters = useCallback((newFilters) => {
    setSelectedFilters(newFilters);
    setPackages(null); // Clear packages when filters change

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce the API calls
    debounceTimer.current = setTimeout(() => {
      fetchFilterOptions(newFilters);
      fetchPreview(newFilters);
    }, 300);
  }, [fetchFilterOptions, fetchPreview]);

  /**
   * Remove a specific filter
   */
  const removeFilter = useCallback((category, filterKey, value) => {
    const newFilters = { ...selectedFilters };

    if (category === 'global' && filterKey === 'brand') {
      newFilters.brand = (newFilters.brand || []).filter(b => b !== value);
      if (newFilters.brand.length === 0) {
        delete newFilters.brand;
      }
    } else if (category === 'global') {
      delete newFilters[filterKey];
    } else {
      if (newFilters[category]) {
        const catFilters = newFilters[category];
        if (Array.isArray(catFilters[filterKey])) {
          catFilters[filterKey] = catFilters[filterKey].filter(v => v !== value);
          if (catFilters[filterKey].length === 0) {
            delete catFilters[filterKey];
          }
        } else {
          delete catFilters[filterKey];
        }

        if (Object.keys(catFilters).length === 0) {
          delete newFilters[category];
        }
      }
    }

    updateFilters(newFilters);
  }, [selectedFilters, updateFilters]);

  /**
   * Clear all filters
   */
  const clearFilters = useCallback(() => {
    setSelectedFilters({});
    setPackages(null);
    setPreview(null);
    fetchFilterOptions({});
  }, [fetchFilterOptions]);

  /**
   * Check if filters have any selections
   */
  const hasActiveFilters = useCallback(() => {
    if (selectedFilters.brand?.length > 0) return true;
    if (selectedFilters.finish) return true;

    const categories = packageType === 'kitchen'
      ? ['refrigerator', 'range', 'dishwasher']
      : ['washer', 'dryer'];

    for (const cat of categories) {
      if (selectedFilters[cat] && Object.keys(selectedFilters[cat]).length > 0) {
        return true;
      }
    }

    return false;
  }, [selectedFilters, packageType]);

  // Initial load and package type change handling
  useEffect(() => {
    // If package type changed, reset everything
    if (prevPackageType.current !== packageType) {
      setSelectedFilters({});
      setPackages(null);
      setPreview(null);
      prevPackageType.current = packageType;
    }

    fetchFilterOptions({});
  }, [packageType, fetchFilterOptions]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    // Filter state
    selectedFilters,
    filterOptions,
    loading,
    error,

    // Package state
    packages,
    packagesLoading,
    packagesError,

    // Preview state
    preview,
    previewLoading,

    // Actions
    updateFilters,
    removeFilter,
    clearFilters,
    generatePackages,
    hasActiveFilters,
    refreshFilters: () => fetchFilterOptions(selectedFilters)
  };
};

export default usePackageFilters;
