/**
 * Transaction API Service for TeleTime POS
 * Handles sales transactions, voids, refunds, and reporting
 */

import api from './axios';

/**
 * Create a new transaction
 * @param {object} data - Transaction data
 * @param {number} data.shiftId - Current shift ID (required)
 * @param {number} data.customerId - Customer ID (optional)
 * @param {number} data.quoteId - Quote ID if converting (optional)
 * @param {number} data.salespersonId - Salesperson ID (optional)
 * @param {array} data.items - Line items (required)
 * @param {array} data.payments - Payment records (required)
 * @param {number} data.discountAmount - Transaction discount (optional)
 * @param {string} data.discountReason - Discount reason (optional)
 * @param {string} data.taxProvince - Province for tax (default: ON)
 * @returns {Promise<object>} Created transaction
 */
export const createTransaction = async (data) => {
  try {
    const normalizedFulfillment = data.fulfillment?.type
      ? {
          ...data.fulfillment,
          fee: data.fulfillment.fee || 0,
        }
      : {
          type: 'pickup_now',
          fee: 0,
        };

    // Validate required fields
    if (!data.shiftId) {
      return {
        success: false,
        error: 'Shift ID is required',
        data: null,
      };
    }

    if (!data.items || data.items.length === 0) {
      return {
        success: false,
        error: 'At least one item is required',
        data: null,
      };
    }

    if (!data.payments || data.payments.length === 0) {
      return {
        success: false,
        error: 'At least one payment is required',
        data: null,
      };
    }

    if (!data.salespersonId) {
      return {
        success: false,
        error: 'Salesperson is required',
        data: null,
      };
    }

    console.log('[Transactions] createTransaction request data:', JSON.stringify(data, null, 2));
    const response = await api.post('/transactions', {
      shiftId: data.shiftId,
      customerId: data.customerId || null,
      quoteId: data.quoteId || null,
      salespersonId: data.salespersonId,
      items: data.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost || null,
        discountPercent: item.discountPercent || 0,
        discountAmount: item.discountAmount || 0,
        serialNumber: item.serialNumber || null,
        taxable: item.taxable !== false,
      })),
      payments: data.payments.map(payment => ({
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        cardLastFour: payment.cardLastFour || null,
        cardBrand: payment.cardBrand || null,
        authorizationCode: payment.authorizationCode || null,
        processorReference: payment.processorReference || null,
        cashTendered: payment.cashTendered || null,
        changeGiven: payment.changeGiven || null,
      })),
      discountAmount: data.discountAmount || 0,
      discountReason: data.discountReason || null,
      taxProvince: data.taxProvince || 'ON',
      deliveryFee: data.deliveryFee || 0,
      fulfillment: normalizedFulfillment,
      promotion: data.promotion || null,
      commissionSplit: data.commissionSplit || null,
    });

    const result = response.data || response;
    return {
      success: result.success !== false,
      data: result.data || result,
    };
  } catch (error) {
    console.error('[Transactions] createTransaction error:', error);
    console.error(
      '[Transactions] Error response data:',
      error.response?.data || error.data || error.details || 'no response data'
    );
    console.error('[Transactions] Error status:', error.response?.status || error.status || 'no status');
    if (error.details) {
      console.error('[Transactions] Validation details:', error.details);
    }

    const responseData = error.response?.data || error.data || null;
    return {
      success: false,
      error: responseData?.error || error.message,
      code: responseData?.code || error.code || null,
      fraudAssessment: responseData?.fraudAssessment || error.fraudAssessment || null,
      details: responseData?.details || error.details || null,
      data: null,
    };
  }
};

/**
 * Get transaction by ID with full details
 * @param {number} id - Transaction ID
 * @returns {Promise<object>} Transaction details
 */
export const getTransaction = async (id) => {
  try {
    const response = await api.get(`/transactions/${id}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Transactions] getTransaction error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get transactions list with filtering and status counts
 * @param {object} params - Query parameters
 * @param {number} params.shiftId - Filter by shift
 * @param {number} params.customerId - Filter by customer
 * @param {string} params.status - Filter by status (pending, completed, voided, refunded)
 * @param {string} params.startDate - Start date (ISO string)
 * @param {string} params.endDate - End date (ISO string)
 * @param {string} params.dateRange - Date range preset (today, yesterday, this_week, last_week, this_month, last_month, custom)
 * @param {number} params.salesRepId - Filter by salesperson/cashier
 * @param {string} params.search - Search transaction number, customer name, or phone
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @param {boolean} params.includeCounts - Include status counts (default: true)
 * @returns {Promise<object>} Transactions list with counts
 */
export const getTransactions = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();

    if (params.shiftId) queryParams.append('shiftId', params.shiftId);
    if (params.customerId) queryParams.append('customerId', params.customerId);
    if (params.status) queryParams.append('status', params.status);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.dateRange) queryParams.append('dateRange', params.dateRange);
    if (params.salesRepId) queryParams.append('salesRepId', params.salesRepId);
    if (params.search) queryParams.append('search', params.search);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.includeCounts !== undefined) queryParams.append('includeCounts', params.includeCounts);

    const response = await api.get(`/transactions?${queryParams}`);

    return {
      success: true,
      data: response.data || [],
      counts: response.counts || null,
      pagination: response.pagination || null,
    };
  } catch (error) {
    console.error('[Transactions] getTransactions error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
      counts: null,
    };
  }
};

/**
 * Void a completed transaction
 * @param {number} id - Transaction ID
 * @param {string} reason - Void reason (required)
 * @returns {Promise<object>} Void result
 */
export const voidTransaction = async (id, reason) => {
  try {
    if (!reason || !reason.trim()) {
      return {
        success: false,
        error: 'Void reason is required',
        data: null,
      };
    }

    const response = await api.post(`/transactions/${id}/void`, {
      reason: reason.trim(),
    });

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Transactions] voidTransaction error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Process a refund
 * @param {number} id - Transaction ID
 * @param {object} data - Refund data
 * @param {number} data.amount - Refund amount (for partial refund)
 * @param {array} data.items - Items to refund (for item-level refund)
 * @param {string} data.reason - Refund reason
 * @returns {Promise<object>} Refund result
 */
export const refundTransaction = async (id, data = {}) => {
  try {
    const response = await api.post(`/transactions/${id}/refund`, {
      amount: data.amount || null,
      items: data.items || null,
      reason: data.reason || null,
    });

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Transactions] refundTransaction error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get daily summary for a shift
 * @param {number} shiftId - Shift ID
 * @returns {Promise<object>} Daily summary
 */
export const getDailySummary = async (shiftId) => {
  try {
    const response = await api.get(`/transactions/daily-summary?shiftId=${shiftId}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Transactions] getDailySummary error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get daily summary by date
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<object>} Daily summary
 */
export const getDailySummaryByDate = async (date) => {
  try {
    const response = await api.get(`/transactions/daily-summary?date=${date}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Transactions] getDailySummaryByDate error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Lookup transaction by number
 * @param {string} transactionNumber - Transaction number (TXN-YYYYMMDD-XXXX)
 * @returns {Promise<object>} Transaction if found
 */
export const lookupByNumber = async (transactionNumber) => {
  try {
    const response = await api.get(`/transactions?number=${encodeURIComponent(transactionNumber)}`);

    const transaction = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    return {
      success: true,
      data: transaction || null,
    };
  } catch (error) {
    console.error('[Transactions] lookupByNumber error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

/**
 * Get receipt data for printing
 * @param {number} id - Transaction ID
 * @returns {Promise<object>} Receipt data
 */
export const getReceiptData = async (id) => {
  try {
    // Get full transaction details for receipt
    const response = await api.get(`/transactions/${id}`);

    return {
      success: true,
      data: response.data || response,
    };
  } catch (error) {
    console.error('[Transactions] getReceiptData error:', error);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
};

export default {
  createTransaction,
  getTransaction,
  getTransactions,
  voidTransaction,
  refundTransaction,
  getDailySummary,
  getDailySummaryByDate,
  lookupByNumber,
  getReceiptData,
};
