/**
 * Product API Service for TeleTime POS
 * Handles product search, lookup, and category operations
 */

import api from './axios';

/**
 * Get products with search, pagination, and filtering
 * @param {object} params - Query parameters
 * @param {string} params.search - Search query (name, SKU)
 * @param {number} params.categoryId - Filter by category
 * @param {number} params.page - Page number (default: 1)
 * @param {number} params.limit - Items per page (default: 20)
 * @param {string} params.sortBy - Sort field
 * @param {string} params.sortOrder - Sort order (asc/desc)
 * @returns {Promise<object>} Products list with pagination
 */
export const getProducts = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();

    if (params.search) queryParams.append('search', params.search);
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    if (params.inStock !== undefined) queryParams.append('inStock', params.inStock);

    const response = await api.get(`/products?${queryParams}`);

    return {
      success: true,
      data: response.data || [],
      pagination: response.pagination || null,
    };
  } catch (error) {
    console.error('[Products] getProducts error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get a single product by ID
 * @param {number} id - Product ID
 * @returns {Promise<object>} Product details
 */
export const getProduct = async (id) => {
  try {
    const response = await api.get(`/products/${id}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Products] getProduct error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Search product by barcode
 * @param {string} barcode - Product barcode/UPC
 * @returns {Promise<object>} Product if found
 */
export const searchByBarcode = async (barcode) => {
  try {
    const response = await api.get(`/products/lookup?barcode=${encodeURIComponent(barcode)}`);

    // New lookup endpoint returns { product, match_type }
    const product = response.data?.product || response.data;

    if (!product) {
      return {
        success: false,
        error: 'Product not found',
        data: null,
      };
    }

    return {
      success: true,
      data: product,
      match_type: response.data?.match_type,
    };
  } catch (error) {
    console.error('[Products] searchByBarcode error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Search product by SKU
 * @param {string} sku - Product SKU
 * @returns {Promise<object>} Product if found
 */
export const searchBySku = async (sku) => {
  try {
    const response = await api.get(`/products?sku=${encodeURIComponent(sku)}`);

    const product = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    if (!product) {
      return {
        success: false,
        error: 'Product not found',
        data: null,
      };
    }

    return {
      success: true,
      data: product,
    };
  } catch (error) {
    console.error('[Products] searchBySku error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get all product categories
 * @returns {Promise<object>} Categories list
 */
export const getCategories = async () => {
  try {
    const response = await api.get('/categories');

    // Backend returns { success, categories: [...] } — extract correctly
    const categories = response.categories || response.data || [];

    return {
      success: true,
      data: categories,
    };
  } catch (error) {
    console.error('[Products] getCategories error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get products by category
 * @param {number} categoryId - Category ID
 * @param {object} params - Additional parameters
 * @returns {Promise<object>} Products in category
 */
export const getProductsByCategory = async (categoryId, params = {}) => {
  try {
    const queryParams = new URLSearchParams({
      categoryId,
      page: params.page || 1,
      limit: params.limit || 50,
    });

    const response = await api.get(`/products?${queryParams}`);

    return {
      success: true,
      data: response.data || [],
      pagination: response.pagination || null,
    };
  } catch (error) {
    console.error('[Products] getProductsByCategory error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Quick search products (for autocomplete)
 * @param {string} query - Search query
 * @param {number} limit - Max results (default: 10)
 * @returns {Promise<object>} Quick search results
 */
export const quickSearch = async (query, limit = 10) => {
  if (!query || query.length < 2) {
    return { success: true, data: [] };
  }

  try {
    // Use the dedicated search endpoint
    const response = await api.get(`/products/search?q=${encodeURIComponent(query)}&limit=${limit}`);

    // Response is already unwrapped by axios interceptor
    // Backend returns array directly from searchForAutocomplete
    const products = Array.isArray(response) ? response : (response.data || response || []);

    // Map the response to expected format
    const mappedProducts = products.map(p => ({
      id: p.id,
      productId: p.id,
      name: p.name,
      sku: p.model,
      model: p.model,
      manufacturer: p.manufacturer,
      description: p.description,
      price: p.msrp_cents ? p.msrp_cents / 100 : (p.price || 0),
      cost: p.cost_cents ? p.cost_cents / 100 : (p.cost || 0),
      stockQty: p.stock_quantity || p.qty_on_hand || 0,
    }));

    return {
      success: true,
      data: mappedProducts,
    };
  } catch (error) {
    console.error('[Products] quickSearch error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Check product stock availability
 * @param {number} productId - Product ID
 * @param {number} quantity - Required quantity
 * @returns {Promise<object>} Stock availability
 */
export const checkStock = async (productId, quantity = 1) => {
  try {
    const response = await api.get(`/products/${productId}`);
    const product = response.data || response;

    const available = product.quantity || 0;
    const isAvailable = available >= quantity;

    return {
      success: true,
      data: {
        productId,
        available,
        requested: quantity,
        isAvailable,
        shortage: isAvailable ? 0 : quantity - available,
      },
    };
  } catch (error) {
    console.error('[Products] checkStock error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

export default {
  getProducts,
  getProduct,
  searchByBarcode,
  searchBySku,
  getCategories,
  getProductsByCategory,
  quickSearch,
  checkStock,
};
