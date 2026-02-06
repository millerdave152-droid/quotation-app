/**
 * TeleTime - Unified Orders API Client
 * API client for the unified order service
 */

import api from './axios';
import type {
  UnifiedOrder,
  OrderItem,
  OrderPayment,
  CreateOrderDTO,
  CreatePOSTransactionDTO,
  UpdateOrderDTO,
  ProcessRefundDTO,
  OrderSearchFilters,
  PaginationOptions,
  PaginatedResponse,
  OrderStatus,
} from '../types/order';

// ============================================================================
// API RESPONSE TYPE
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// ============================================================================
// ORDER CRUD
// ============================================================================

/**
 * Create a new order (quote, direct order, etc.)
 */
export async function createOrder(data: CreateOrderDTO): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.post('/orders', data);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create order',
    };
  }
}

/**
 * Create a POS transaction with items and payments
 */
export async function createPOSTransaction(
  data: CreatePOSTransactionDTO
): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.post('/orders/pos-transaction', data);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create transaction',
    };
  }
}

/**
 * Create a new quote
 */
export async function createQuote(data: CreateOrderDTO): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.post('/orders/quote', {
      ...data,
      source: 'quote',
    });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create quote',
    };
  }
}

/**
 * Get order by ID
 */
export async function getOrder(
  id: number,
  options?: { includeItems?: boolean; includePayments?: boolean; includeHistory?: boolean }
): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const params = new URLSearchParams();
    if (options?.includeItems !== undefined) {
      params.append('includeItems', String(options.includeItems));
    }
    if (options?.includePayments !== undefined) {
      params.append('includePayments', String(options.includePayments));
    }
    if (options?.includeHistory !== undefined) {
      params.append('includeHistory', String(options.includeHistory));
    }

    const queryString = params.toString();
    const url = `/orders/${id}${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch order',
    };
  }
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(
  orderNumber: string,
  options?: { includeItems?: boolean; includePayments?: boolean; includeHistory?: boolean }
): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const params = new URLSearchParams();
    if (options?.includeItems !== undefined) {
      params.append('includeItems', String(options.includeItems));
    }
    if (options?.includePayments !== undefined) {
      params.append('includePayments', String(options.includePayments));
    }
    if (options?.includeHistory !== undefined) {
      params.append('includeHistory', String(options.includeHistory));
    }

    const queryString = params.toString();
    const url = `/orders/number/${encodeURIComponent(orderNumber)}${queryString ? `?${queryString}` : ''}`;
    const response = await api.get(url);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch order',
    };
  }
}

/**
 * Update an order
 */
export async function updateOrder(
  id: number,
  data: UpdateOrderDTO
): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.put(`/orders/${id}`, data);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to update order',
    };
  }
}

/**
 * Search/list orders with filters
 */
export async function searchOrders(
  filters?: OrderSearchFilters,
  pagination?: PaginationOptions
): Promise<ApiResponse<PaginatedResponse<UnifiedOrder>>> {
  try {
    const params = new URLSearchParams();

    // Add filters
    if (filters?.source) params.append('source', filters.source);
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        filters.status.forEach((s) => params.append('status', s));
      } else {
        params.append('status', filters.status);
      }
    }
    if (filters?.customerId) params.append('customerId', String(filters.customerId));
    if (filters?.salespersonId) params.append('salespersonId', String(filters.salespersonId));
    if (filters?.shiftId) params.append('shiftId', String(filters.shiftId));
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    if (filters?.search) params.append('search', filters.search);

    // Add pagination
    if (pagination?.page) params.append('page', String(pagination.page));
    if (pagination?.limit) params.append('limit', String(pagination.limit));
    if (pagination?.sortBy) params.append('sortBy', pagination.sortBy);
    if (pagination?.sortDir) params.append('sortDir', pagination.sortDir);

    const response = await api.get(`/orders?${params.toString()}`);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to search orders',
    };
  }
}

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

/**
 * Transition order to new status
 */
export async function transitionOrderStatus(
  id: number,
  newStatus: OrderStatus,
  options?: { reason?: string; notes?: string }
): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.post(`/orders/${id}/transition`, {
      status: newStatus,
      ...options,
    });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to update order status',
    };
  }
}

/**
 * Void an order
 */
export async function voidOrder(
  id: number,
  reason: string
): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.post(`/orders/${id}/void`, { reason });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to void order',
    };
  }
}

/**
 * Send quote to customer
 */
export async function sendQuote(id: number): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.post(`/orders/${id}/send-quote`);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to send quote',
    };
  }
}

/**
 * Convert quote to order
 */
export async function convertQuoteToOrder(id: number): Promise<ApiResponse<UnifiedOrder>> {
  try {
    const response = await api.post(`/orders/${id}/convert-to-order`);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to convert quote',
    };
  }
}

// ============================================================================
// PAYMENTS
// ============================================================================

/**
 * Get all payments on an order
 */
export async function getOrderPayments(
  orderId: number
): Promise<ApiResponse<OrderPayment[]>> {
  try {
    const response = await api.get(`/orders/${orderId}/payments`);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch payments',
    };
  }
}

/**
 * Get outstanding balance on an order
 */
export async function getOrderBalance(
  orderId: number
): Promise<ApiResponse<{
  orderId: number;
  orderNumber: string;
  totalCents: number;
  total: number;
  amountPaidCents: number;
  amountPaid: number;
  amountDueCents: number;
  amountDue: number;
  paymentStatus: string;
  payments: number;
}>> {
  try {
    const response = await api.get(`/orders/${orderId}/balance`);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch balance',
    };
  }
}

/**
 * Add payment to order
 */
export async function addPayment(
  orderId: number,
  payment: {
    paymentMethod: string;
    amountCents: number;
    cashTenderedCents?: number;
    changeGivenCents?: number;
    cardBrand?: string;
    cardLastFour?: string;
    authorizationCode?: string;
    notes?: string;
  }
): Promise<ApiResponse<OrderPayment>> {
  try {
    const response = await api.post(`/orders/${orderId}/payments`, payment);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to add payment',
    };
  }
}

/**
 * Process refund
 */
export async function processRefund(
  orderId: number,
  refund: ProcessRefundDTO
): Promise<ApiResponse<OrderPayment>> {
  try {
    const response = await api.post(`/orders/${orderId}/refund`, refund);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to process refund',
    };
  }
}

// ============================================================================
// ORDER ITEMS
// ============================================================================

/**
 * Add item to order
 */
export async function addOrderItem(
  orderId: number,
  item: {
    productId?: number;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    discountPercent?: number;
    notes?: string;
  }
): Promise<ApiResponse<OrderItem>> {
  try {
    const response = await api.post(`/orders/${orderId}/items`, item);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to add item',
    };
  }
}

/**
 * Update order item
 */
export async function updateOrderItem(
  orderId: number,
  itemId: number,
  updates: Partial<OrderItem>
): Promise<ApiResponse<OrderItem>> {
  try {
    const response = await api.put(`/orders/${orderId}/items/${itemId}`, updates);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to update item',
    };
  }
}

/**
 * Remove order item
 */
export async function removeOrderItem(
  orderId: number,
  itemId: number
): Promise<ApiResponse<void>> {
  try {
    const response = await api.delete(`/orders/${orderId}/items/${itemId}`);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to remove item',
    };
  }
}

// ============================================================================
// QUOTE-SPECIFIC
// ============================================================================

/**
 * Search quotes for POS conversion
 */
export async function searchQuotesForPOS(
  search: string,
  customerId?: number
): Promise<ApiResponse<UnifiedOrder[]>> {
  try {
    const params = new URLSearchParams();
    params.append('search', search);
    params.append('source', 'quote');
    params.append('status', 'quote_approved');
    params.append('status', 'quote_viewed');
    params.append('status', 'quote_sent');
    if (customerId) params.append('customerId', String(customerId));
    params.append('limit', '20');

    const response = await api.get(`/orders?${params.toString()}`);

    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data || [],
      };
    }
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to search quotes',
    };
  }
}

/**
 * Get quote with full details for loading into cart
 */
export async function getQuoteForCart(quoteId: number): Promise<ApiResponse<UnifiedOrder>> {
  return getOrder(quoteId, {
    includeItems: true,
    includePayments: true,
  });
}

// ============================================================================
// SHIFT REPORTS
// ============================================================================

/**
 * Get orders for a specific shift
 */
export async function getShiftOrders(shiftId: number): Promise<ApiResponse<UnifiedOrder[]>> {
  try {
    const response = await api.get(`/orders?shiftId=${shiftId}&source=pos`);
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data || [],
      };
    }
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch shift orders',
    };
  }
}

/**
 * Get shift sales summary
 */
export async function getShiftSummary(shiftId: number): Promise<
  ApiResponse<{
    orderCount: number;
    totalSales: number;
    totalRefunds: number;
    netSales: number;
    paymentBreakdown: Record<string, { count: number; total: number }>;
  }>
> {
  try {
    const response = await api.get(`/orders/shift/${shiftId}/summary`);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch shift summary',
    };
  }
}

// ============================================================================
// DAILY REPORTS
// ============================================================================

/**
 * Get daily sales summary
 */
export async function getDailySummary(date?: string): Promise<
  ApiResponse<{
    date: string;
    orderCount: number;
    quoteCount: number;
    totalSales: number;
    totalRefunds: number;
    averageOrderValue: number;
    topProducts: Array<{ productName: string; quantity: number; total: number }>;
    salesBySalesperson: Array<{ salespersonName: string; count: number; total: number }>;
  }>
> {
  try {
    const url = date ? `/orders/reports/daily?date=${date}` : '/orders/reports/daily';
    const response = await api.get(url);
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch daily summary',
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  // CRUD
  createOrder,
  createPOSTransaction,
  createQuote,
  getOrder,
  getOrderByNumber,
  updateOrder,
  searchOrders,

  // Status
  transitionOrderStatus,
  voidOrder,
  sendQuote,
  convertQuoteToOrder,

  // Payments
  getOrderPayments,
  getOrderBalance,
  addPayment,
  processRefund,

  // Items
  addOrderItem,
  updateOrderItem,
  removeOrderItem,

  // Quote-specific
  searchQuotesForPOS,
  getQuoteForCart,

  // Reports
  getShiftOrders,
  getShiftSummary,
  getDailySummary,
};
