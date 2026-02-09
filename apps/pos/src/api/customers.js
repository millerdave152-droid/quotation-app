/**
 * Customer API Service for TeleTime POS
 * Handles customer search, lookup, and quick creation
 */

import api from './axios';

/**
 * Search customers by name, email, or phone
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @param {number} options.limit - Max results (default: 10)
 * @returns {Promise<object>} Search results
 */
export const searchCustomers = async (query, options = {}) => {
  if (!query || query.length < 2) {
    return { success: true, data: [] };
  }

  try {
    const params = new URLSearchParams({
      search: query,
      limit: options.limit || 10,
    });

    const response = await api.get(`/customers?${params}`);

    return {
      success: true,
      data: response.customers || response.data || [],
    };
  } catch (error) {
    console.error('[Customers] searchCustomers error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get customer by ID with full details
 * @param {number} id - Customer ID
 * @returns {Promise<object>} Customer details
 */
export const getCustomer = async (id) => {
  try {
    const response = await api.get(`/customers/${id}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Customers] getCustomer error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Create a new customer (quick add from POS)
 * @param {object} data - Customer data
 * @param {string} data.name - Customer name (required)
 * @param {string} data.email - Email address
 * @param {string} data.phone - Phone number
 * @param {string} data.company - Company name
 * @param {string} data.address - Address
 * @param {string} data.city - City
 * @param {string} data.province - Province code
 * @param {string} data.postalCode - Postal code
 * @returns {Promise<object>} Created customer
 */
export const createCustomer = async (data) => {
  try {
    // Validate required fields
    if (!data.name || !data.name.trim()) {
      return {
        success: false,
        error: 'Customer name is required',
        data: null,
      };
    }

    const response = await api.post('/customers', {
      name: data.name.trim(),
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      company: data.company?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      province: data.province || null,
      postal_code: data.postalCode?.trim() || null,
      marketing_source: data.marketingSource || null,
      marketing_source_detail: data.marketingSourceDetail || null,
      email_transactional: data.emailTransactional ?? true,
      email_marketing: data.emailMarketing ?? false,
      sms_transactional: data.smsTransactional ?? false,
      sms_marketing: data.smsMarketing ?? false,
    });

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Customers] createCustomer error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Update customer information
 * @param {number} id - Customer ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated customer
 */
export const updateCustomer = async (id, data) => {
  try {
    const response = await api.put(`/customers/${id}`, data);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Customers] updateCustomer error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get customer's pending quotes (for conversion to sale)
 * @param {number} customerId - Customer ID
 * @returns {Promise<object>} Pending quotes
 */
export const getCustomerQuotes = async (customerId) => {
  try {
    const response = await api.get(`/customers/${customerId}/quotes?status=pending`);

    return {
      success: true,
      data: response.data || [],
    };
  } catch (error) {
    console.error('[Customers] getCustomerQuotes error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get customer's transaction history
 * @param {number} customerId - Customer ID
 * @param {object} options - Query options
 * @param {number} options.limit - Max results
 * @param {number} options.page - Page number
 * @returns {Promise<object>} Transaction history
 */
export const getCustomerTransactions = async (customerId, options = {}) => {
  try {
    const params = new URLSearchParams({
      customerId,
      limit: options.limit || 10,
      page: options.page || 1,
    });

    const response = await api.get(`/transactions?${params}`);

    return {
      success: true,
      data: response.data || [],
      pagination: response.pagination || null,
    };
  } catch (error) {
    console.error('[Customers] getCustomerTransactions error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Search customer by phone number
 * @param {string} phone - Phone number
 * @returns {Promise<object>} Customer if found
 */
export const findByPhone = async (phone) => {
  try {
    // Clean phone number (remove non-digits)
    const cleanPhone = phone.replace(/\D/g, '');

    if (cleanPhone.length < 7) {
      return { success: true, data: null };
    }

    const response = await api.get(`/customers?phone=${encodeURIComponent(cleanPhone)}`);

    const customer = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    return {
      success: true,
      data: customer || null,
    };
  } catch (error) {
    console.error('[Customers] findByPhone error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Search customer by email
 * @param {string} email - Email address
 * @returns {Promise<object>} Customer if found
 */
export const findByEmail = async (email) => {
  try {
    if (!email || !email.includes('@')) {
      return { success: true, data: null };
    }

    const response = await api.get(`/customers?email=${encodeURIComponent(email)}`);

    const customer = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    return {
      success: true,
      data: customer || null,
    };
  } catch (error) {
    console.error('[Customers] findByEmail error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get customer's trade-in history
 * @param {number} customerId - Customer ID
 * @returns {Promise<object>} Trade-in assessments
 */
export const getCustomerTradeIns = async (customerId) => {
  try {
    const response = await api.get(`/trade-in/customer/${customerId}`);

    return {
      success: true,
      data: response.data || response.assessments || [],
    };
  } catch (error) {
    console.error('[Customers] getCustomerTradeIns error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get marketing source options
 * @returns {Promise<string[]>} Array of source labels
 */
export const getMarketingSources = async () => {
  try {
    const response = await api.get('/marketing-sources');
    return (response.data || response || []).map(s => s.label || s);
  } catch {
    return [];
  }
};

/**
 * Get quick stats for a customer (transaction count, total spent, loyalty points)
 * @param {number} customerId - Customer ID
 * @returns {Promise<object>} Quick stats
 */
export const getCustomerQuickStats = async (customerId) => {
  try {
    const response = await api.get(`/customers/${customerId}/quick-stats`);
    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    return { success: false, data: null };
  }
};

export default {
  searchCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  getCustomerQuotes,
  getCustomerTransactions,
  getCustomerTradeIns,
  findByPhone,
  findByEmail,
  getMarketingSources,
  getCustomerQuickStats,
};
