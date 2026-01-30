/**
 * Quote API Service for TeleTime POS
 * Handles quote lookup and conversion to sales
 */

import api from './axios';

/**
 * Lookup quote by number, customer name, phone, or email
 * Uses dedicated POS quote lookup endpoint
 * @param {string} query - Search query (quote number, customer name, phone, or email)
 * @returns {Promise<object>} Matching quotes
 */
export const lookupQuote = async (query) => {
  if (!query || query.length < 2) {
    return { success: true, data: [] };
  }

  try {
    // Use POS-specific quote lookup endpoint
    const response = await api.get(`/pos-quotes/lookup?query=${encodeURIComponent(query)}`);

    // Axios wraps in response.data = { success, data: [...] }
    const result = response.data || response;
    return {
      success: result.success !== false,
      data: result.data || result || [],
    };
  } catch (error) {
    console.error('[Quotes] lookupQuote error:', error);

    // Fallback to general quotations endpoint
    try {
      const fallbackResponse = await api.get(`/quotations?search=${encodeURIComponent(query)}`);
      return {
        success: true,
        data: fallbackResponse.data || [],
      };
    } catch (fallbackError) {
      // Ignore fallback error
    }

    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get quote details prepared for sale
 * Includes customer info, items with stock levels, and totals
 * @param {number} quoteId - Quote ID
 * @returns {Promise<object>} Quote details for sale
 */
export const getQuoteForSale = async (quoteId) => {
  try {
    // Use POS-specific for-sale endpoint with stock levels
    const response = await api.get(`/pos-quotes/${quoteId}/for-sale`);

    // Axios wraps in response.data = { success, data: {...} }
    const result = response.data || response;
    return {
      success: result.success !== false,
      data: result.data || result,
    };
  } catch (error) {
    console.error('[Quotes] getQuoteForSale error:', error);

    // Fallback: try getting regular quote and transform it
    try {
      const fallbackResponse = await api.get(`/quotations/${quoteId}`);
      const fallbackResult = fallbackResponse.data || fallbackResponse;
      const quote = fallbackResult.data || fallbackResult;

      // Transform to sale-ready format
      return {
        success: true,
        data: {
          quoteId: quote.quoteId || quote.quote_id || quote.id,
          quoteNumber: quote.quoteNumber || quote.quote_number || quote.quotation_number,
          customerId: quote.customerId || quote.customer_id,
          customerName: quote.customerName || quote.customer_name,
          customerEmail: quote.customerEmail || quote.customer_email,
          customerPhone: quote.customerPhone || quote.customer_phone,
          salespersonId: quote.userId || quote.user_id || quote.created_by,
          salespersonName: quote.userName || quote.user_name || quote.salesperson_name,
          items: (quote.items || []).map((item) => ({
            productId: item.productId || item.product_id,
            productName: item.productName || item.product_name || item.name,
            productSku: item.productSku || item.product_sku || item.sku,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice || item.unit_price || item.price || 0),
            unitCost: parseFloat(item.unitCost || item.unit_cost || 0),
            discountPercent: item.discountPercent || item.discount_percent || 0,
            discountAmount: item.discountAmount || item.discount_amount || 0,
            taxable: item.taxable !== false,
            stockQuantity: item.stockQuantity || item.stock_quantity || item.stock || 0,
          })),
          subtotal: parseFloat(quote.subtotal || quote.subtotal_cents / 100 || 0),
          discountAmount: parseFloat(quote.discountAmount || quote.discount_amount || quote.discount_cents / 100 || 0),
          discountReason: quote.discountReason || quote.discount_reason,
          taxAmount: parseFloat(quote.taxAmount || quote.tax_amount || quote.tax_cents / 100 || 0),
          totalAmount: parseFloat(quote.totalAmount || quote.total_amount || quote.total_cents / 100 || 0),
          notes: quote.notes || quote.internal_notes,
          status: quote.status,
          createdAt: quote.createdAt || quote.created_at,
          validUntil: quote.validUntil || quote.valid_until || quote.expires_at,
          customer: quote.customer_id
            ? {
                customerId: quote.customer_id,
                customerName: quote.customerName || quote.customer_name,
                email: quote.customerEmail || quote.customer_email,
                phone: quote.customerPhone || quote.customer_phone,
              }
            : null,
        },
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }
};

/**
 * Get quote by ID
 * @param {number} quoteId - Quote ID
 * @returns {Promise<object>} Quote details
 */
export const getQuote = async (quoteId) => {
  try {
    const response = await api.get(`/quotations/${quoteId}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Quotes] getQuote error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Convert quote to sale (mark as converted)
 * Called after transaction is successfully created
 * @param {number} quoteId - Quote ID
 * @param {object} transactionInfo - Transaction info for linking
 * @param {number} transactionInfo.transactionId - Transaction ID
 * @param {string} transactionInfo.transactionNumber - Transaction number
 * @returns {Promise<object>} Conversion result
 */
export const convertQuote = async (quoteId, transactionInfo = {}) => {
  try {
    // Use POS-specific convert endpoint
    const response = await api.post(`/pos-quotes/${quoteId}/convert`, {
      transactionId: transactionInfo.transactionId,
      transactionNumber: transactionInfo.transactionNumber,
    });

    // Axios wraps in response.data = { success, data: {...} }
    const result = response.data || response;
    return {
      success: result.success !== false,
      data: result.data || result,
    };
  } catch (error) {
    console.error('[Quotes] convertQuote error:', error);

    // Fallback: try updating status directly
    try {
      const fallbackResponse = await api.put(`/quotations/${quoteId}`, {
        status: 'converted',
      });

      return {
        success: true,
        data: fallbackResponse.data || fallbackResponse,
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }
};

/**
 * Get pending quotes for a customer
 * @param {number} customerId - Customer ID
 * @returns {Promise<object>} Pending quotes
 */
export const getCustomerPendingQuotes = async (customerId) => {
  try {
    const response = await api.get(`/quotations?customerId=${customerId}&status=pending`);

    return {
      success: true,
      data: response.data || [],
    };
  } catch (error) {
    console.error('[Quotes] getCustomerPendingQuotes error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Get all pending quotes (for dashboard)
 * @param {number} limit - Maximum number of quotes to return
 * @returns {Promise<object>} Pending quotes
 */
export const getPendingQuotes = async (limit = 10) => {
  try {
    const response = await api.get(`/pos-quotes/pending?limit=${limit}`);

    return {
      success: true,
      data: response.data || [],
      count: response.count || 0,
    };
  } catch (error) {
    console.error('[Quotes] getPendingQuotes error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Search quotes by various criteria
 * @param {object} params - Search parameters
 * @param {string} params.search - Search query
 * @param {string} params.status - Quote status filter
 * @param {number} params.customerId - Customer ID filter
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @returns {Promise<object>} Search results
 */
export const searchQuotes = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();

    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.customerId) queryParams.append('customerId', params.customerId);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/quotations?${queryParams}`);

    return {
      success: true,
      data: response.data || [],
      pagination: response.pagination || null,
    };
  } catch (error) {
    console.error('[Quotes] searchQuotes error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
};

/**
 * Check if quote is still valid (not expired, not converted)
 * Uses POS-specific status endpoint
 * @param {number} quoteId - Quote ID
 * @returns {Promise<object>} Validity status
 */
export const checkQuoteValidity = async (quoteId) => {
  try {
    // Use POS-specific status endpoint
    const response = await api.get(`/pos-quotes/${quoteId}/status`);

    if (!response.success) {
      return {
        success: false,
        error: response.error || 'Failed to check quote status',
        isValid: false,
      };
    }

    return {
      success: true,
      isValid: response.data?.isValid ?? false,
      isExpired: response.data?.isExpired ?? false,
      isConverted: response.data?.isConverted ?? false,
      isCancelled: response.data?.isCancelled ?? false,
      status: response.data?.status,
      validUntil: response.data?.validUntil,
    };
  } catch (error) {
    console.error('[Quotes] checkQuoteValidity error:', error);

    // Fallback to getting full quote
    try {
      const result = await getQuote(quoteId);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: 'Quote not found',
          isValid: false,
        };
      }

      const quote = result.data;
      const now = new Date();
      const validUntil = quote.validUntil || quote.valid_until || quote.expires_at;
      const isExpired = validUntil && new Date(validUntil) < now;
      const isConverted = quote.status === 'converted';
      const isCancelled = quote.status === 'cancelled' || quote.status === 'rejected';

      return {
        success: true,
        isValid: !isExpired && !isConverted && !isCancelled,
        isExpired,
        isConverted,
        isCancelled,
        status: quote.status,
        validUntil,
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: error.message,
        isValid: false,
      };
    }
  }
};

export default {
  lookupQuote,
  getQuoteForSale,
  getQuote,
  convertQuote,
  getCustomerPendingQuotes,
  getPendingQuotes,
  searchQuotes,
  checkQuoteValidity,
};
