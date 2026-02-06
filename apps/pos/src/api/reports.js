/**
 * Unified Reports API Service for TeleTime POS
 * Handles combined Quote + POS analytics endpoints
 */

import api from './axios';

/**
 * Get dashboard summary with key metrics
 * @returns {Promise<object>} Dashboard summary
 */
export const getDashboardSummary = async () => {
  try {
    const response = await api.get('/reports/unified/dashboard');
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getDashboardSummary error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get sales summary for a period
 * @param {object} params - Query parameters
 * @param {string} params.startDate - Start date (ISO)
 * @param {string} params.endDate - End date (ISO)
 * @param {string} params.groupBy - Group by (day, week, month)
 * @returns {Promise<object>} Sales summary
 */
export const getSalesSummary = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.groupBy) queryParams.append('groupBy', params.groupBy);

    const response = await api.get(`/reports/unified/sales/summary?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getSalesSummary error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get daily sales report
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<object>} Daily report
 */
export const getDailySalesReport = async (date) => {
  try {
    const response = await api.get(`/reports/unified/sales/daily${date ? `?date=${date}` : ''}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getDailySalesReport error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get monthly sales trend
 * @param {number} months - Number of months
 * @returns {Promise<object>} Monthly trend
 */
export const getMonthlySalesTrend = async (months = 12) => {
  try {
    const response = await api.get(`/reports/unified/sales/monthly-trend?months=${months}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getMonthlySalesTrend error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get hourly sales patterns
 * @param {number} dayOfWeek - Day of week (0-6)
 * @returns {Promise<object>} Hourly patterns
 */
export const getHourlySalesPatterns = async (dayOfWeek) => {
  try {
    const url = dayOfWeek !== undefined
      ? `/reports/unified/sales/hourly-patterns?dayOfWeek=${dayOfWeek}`
      : '/reports/unified/sales/hourly-patterns';
    const response = await api.get(url);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getHourlySalesPatterns error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get quote conversion metrics
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Conversion metrics
 */
export const getQuoteConversionMetrics = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.salesRep) queryParams.append('salesRep', params.salesRep);

    const response = await api.get(`/reports/unified/quotes/conversion?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getQuoteConversionMetrics error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get quote conversion trend
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Conversion trend
 */
export const getQuoteConversionTrend = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.groupBy) queryParams.append('groupBy', params.groupBy);

    const response = await api.get(`/reports/unified/quotes/conversion-trend?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getQuoteConversionTrend error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get AOV comparison between quotes and POS
 * @param {object} params - Query parameters
 * @returns {Promise<object>} AOV comparison
 */
export const getAOVComparison = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await api.get(`/reports/unified/aov/comparison?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getAOVComparison error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get product performance across channels
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Product performance
 */
export const getProductPerformance = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.category) queryParams.append('category', params.category);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/reports/unified/products/performance?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getProductPerformance error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get category performance
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Category performance
 */
export const getCategoryPerformance = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await api.get(`/reports/unified/products/categories?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getCategoryPerformance error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get customer purchase history
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Customer history
 */
export const getCustomerPurchaseHistory = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.customerId) queryParams.append('customerId', params.customerId);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response = await api.get(`/reports/unified/customers/purchase-history?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getCustomerPurchaseHistory error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get customer transaction history
 * @param {number} customerId - Customer ID
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Transaction history
 */
export const getCustomerTransactionHistory = async (customerId, params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/reports/unified/customers/${customerId}/transactions?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getCustomerTransactionHistory error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get sales rep performance
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Sales rep performance
 */
export const getSalesRepPerformance = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await api.get(`/reports/unified/sales-reps/performance?${queryParams}`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Reports] getSalesRepPerformance error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Export sales data as CSV
 * @param {object} params - Query parameters
 * @returns {Promise<Blob>} CSV file
 */
export const exportSalesCSV = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await api.get(`/reports/unified/export/sales?${queryParams}`, {
      responseType: 'blob',
    });

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    console.error('[Reports] exportSalesCSV error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Export product performance as CSV
 * @param {object} params - Query parameters
 * @returns {Promise<Blob>} CSV file
 */
export const exportProductsCSV = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.category) queryParams.append('category', params.category);

    const response = await api.get(`/reports/unified/export/products?${queryParams}`, {
      responseType: 'blob',
    });

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    console.error('[Reports] exportProductsCSV error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

export default {
  getDashboardSummary,
  getSalesSummary,
  getDailySalesReport,
  getMonthlySalesTrend,
  getHourlySalesPatterns,
  getQuoteConversionMetrics,
  getQuoteConversionTrend,
  getAOVComparison,
  getProductPerformance,
  getCategoryPerformance,
  getCustomerPurchaseHistory,
  getCustomerTransactionHistory,
  getSalesRepPerformance,
  exportSalesCSV,
  exportProductsCSV,
};
