import React, { createContext, useState, useContext, useCallback, useMemo } from 'react';
import { cachedFetch } from '../services/apiCache';

const ProductContext = createContext(null);

export const useProduct = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProduct must be used within a ProductProvider');
  }
  return context;
};

// Optional hook that doesn't throw if context is missing
export const useProductOptional = () => {
  return useContext(ProductContext);
};

export const ProductProvider = ({ children }) => {
  // Products data
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Categories
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    manufacturer: '',
    minPrice: '',
    maxPrice: '',
    inStock: false
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  // Loading states
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Fetch products with current filters
  const fetchProducts = useCallback(async (options = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: options.page || pagination.page,
        limit: options.limit || pagination.limit,
        ...(searchTerm && { search: searchTerm }),
        ...(filters.category && { category: filters.category }),
        ...(filters.manufacturer && { manufacturer: filters.manufacturer }),
        ...(filters.minPrice && { minPrice: filters.minPrice }),
        ...(filters.maxPrice && { maxPrice: filters.maxPrice }),
        ...(filters.inStock && { inStock: 'true' })
      });

      const data = await cachedFetch(`/api/products?${params}`);

      if (data.success !== false) {
        setProducts(data.data || data.products || data);
        if (data.pagination) {
          setPagination(prev => ({ ...prev, ...data.pagination }));
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filters, pagination.page, pagination.limit]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const data = await cachedFetch('/api/categories');
      if (data.success !== false) {
        setCategories(data.data || data.categories || data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  // Update a single filter
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({
      category: '',
      manufacturer: '',
      minPrice: '',
      maxPrice: '',
      inStock: false
    });
    setSearchTerm('');
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Change page
  const goToPage = useCallback((page) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  // Get product by ID
  const getProductById = useCallback((productId) => {
    return products.find(p => p.id === productId);
  }, [products]);

  // Format price helper
  const formatPrice = useCallback((cents) => {
    if (!cents && cents !== 0) return '$0.00';
    return `$${(cents / 100).toFixed(2)}`;
  }, []);

  // Filtered products (client-side filtering for small result sets)
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;

    const term = searchTerm.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.manufacturer?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const value = useMemo(() => ({
    // State
    products,
    filteredProducts,
    selectedProduct,
    categories,
    selectedCategory,
    searchTerm,
    filters,
    pagination,
    loading,
    categoriesLoading,

    // Setters
    setProducts,
    setSelectedProduct,
    setCategories,
    setSelectedCategory,
    setSearchTerm,
    setFilters,
    setPagination,

    // Actions
    fetchProducts,
    fetchCategories,
    updateFilter,
    clearFilters,
    goToPage,

    // Helpers
    getProductById,
    formatPrice,
    hasProducts: products.length > 0
  }), [
    products,
    filteredProducts,
    selectedProduct,
    categories,
    selectedCategory,
    searchTerm,
    filters,
    pagination,
    loading,
    categoriesLoading,
    fetchProducts,
    fetchCategories,
    updateFilter,
    clearFilters,
    goToPage,
    getProductById,
    formatPrice
  ]);

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};
