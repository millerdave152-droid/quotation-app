/**
 * TeleTime - Unified Order Types
 * TypeScript interfaces for the unified order model
 */

// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

/**
 * Order status progression
 */
export type OrderStatus =
  | 'draft'           // Initial creation, not yet sent/finalized
  | 'quote_sent'      // Quote sent to customer
  | 'quote_viewed'    // Customer has viewed the quote
  | 'quote_expired'   // Quote past expiry date
  | 'quote_rejected'  // Customer rejected the quote
  | 'quote_approved'  // Customer approved/accepted
  | 'order_pending'   // Converted to order, awaiting fulfillment
  | 'order_processing'// Being processed/prepared
  | 'order_ready'     // Ready for pickup/delivery
  | 'order_completed' // Fulfilled/delivered
  | 'invoice_sent'    // Invoice sent to customer
  | 'invoice_overdue' // Past due date
  | 'paid'            // Fully paid
  | 'partial_refund'  // Partially refunded
  | 'refunded'        // Fully refunded
  | 'void'            // Voided/cancelled
  | 'archived';       // Archived for records

/**
 * Order source/origin
 */
export type OrderSource =
  | 'quote'    // Started as a quote
  | 'pos'      // Direct POS sale
  | 'online'   // E-commerce/online
  | 'phone'    // Phone order
  | 'import'   // Imported from external system
  | 'api';     // Created via API

/**
 * Payment method types
 */
export type PaymentMethod =
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'gift_card'
  | 'store_credit'
  | 'check'
  | 'bank_transfer'
  | 'financing'
  | 'other';

/**
 * Payment status
 */
export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'voided';

/**
 * Discount type
 */
export type DiscountType =
  | 'percent'
  | 'fixed_amount'
  | 'buy_x_get_y'
  | 'bundle';

/**
 * Fulfillment status for line items
 */
export type FulfillmentStatus =
  | 'pending'
  | 'reserved'
  | 'allocated'
  | 'shipped'
  | 'delivered'
  | 'backordered';

// ============================================================================
// MAIN ORDER INTERFACE
// ============================================================================

/**
 * Unified Order - supports quotes, POS transactions, orders, and invoices
 */
export interface UnifiedOrder {
  // Identifiers
  id: number;
  orderNumber: string;
  legacyQuoteId?: number;
  legacyTransactionId?: number;

  // Source and Status
  source: OrderSource;
  status: OrderStatus;

  // Customer Information
  customerId?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;

  // Attribution
  createdBy?: number;
  createdByName?: string;
  salespersonId?: number;
  salespersonName?: string;

  // POS-Specific Fields
  registerId?: number;
  registerName?: string;
  shiftId?: number;

  // Quote-Specific Fields
  quoteExpiryDate?: string;       // ISO date string
  quoteValidDays?: number;
  quoteRevision?: number;
  quoteSentAt?: string;           // ISO timestamp
  quoteViewedAt?: string;
  quoteApprovedAt?: string;
  quoteApprovedBy?: string;
  quoteRejectionReason?: string;

  // Financial Totals (in cents for precision)
  subtotalCents: number;
  subtotal: number;               // Dollar value for display

  // Item-level discounts
  itemDiscountCents: number;
  itemDiscount: number;

  // Order-level discount
  orderDiscountCents: number;
  orderDiscount: number;
  orderDiscountType?: DiscountType;
  orderDiscountReason?: string;
  orderDiscountCode?: string;

  // Taxable amount
  taxableAmountCents: number;

  // Tax breakdown
  taxProvince: string;
  hstRate: number;
  hstCents: number;
  hst: number;
  gstRate: number;
  gstCents: number;
  gst: number;
  pstRate: number;
  pstCents: number;
  pst: number;
  totalTaxCents: number;
  totalTax: number;
  taxExempt: boolean;
  taxExemptNumber?: string;

  // Delivery/Shipping
  deliveryCents: number;
  delivery: number;
  deliveryMethod?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  deliveryDate?: string;
  deliveryTimeSlot?: string;

  // Final total
  totalCents: number;
  total: number;

  // Payment tracking
  amountPaidCents: number;
  amountPaid: number;
  amountDueCents: number;
  amountDue: number;

  // Deposit tracking
  depositRequiredCents: number;
  depositRequired: number;
  depositPaidCents: number;
  depositPaid: number;

  // Invoice fields
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
  invoiceTerms?: string;

  // Notes
  internalNotes?: string;
  customerNotes?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  tags?: string[];
  itemCount?: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  voidedAt?: string;
  voidedBy?: number;
  voidReason?: string;

  // Related data (populated when requested)
  items?: OrderItem[];
  payments?: OrderPayment[];
  statusHistory?: OrderStatusHistory[];
}

// ============================================================================
// ORDER ITEM INTERFACE
// ============================================================================

/**
 * Order line item with pricing and fulfillment tracking
 */
export interface OrderItem {
  id: number;
  orderId: number;

  // Product reference
  productId?: number;
  productSku?: string;
  productName: string;
  productDescription?: string;
  manufacturer?: string;
  model?: string;

  // Quantity and Pricing (in cents)
  quantity: number;
  unitPriceCents: number;
  unitPrice: number;
  unitCostCents?: number;
  unitCost?: number;

  // Item-level discount
  discountType?: DiscountType;
  discountPercent: number;
  discountCents: number;
  discountReason?: string;

  // Calculated totals
  lineSubtotalCents: number;
  lineSubtotal: number;
  lineDiscountCents: number;
  lineDiscount: number;
  lineTotalCents: number;
  lineTotal: number;

  // Tax
  taxable: boolean;
  taxCents: number;

  // Serial/Inventory tracking
  serialNumber?: string;
  lotNumber?: string;

  // Fulfillment
  fulfilledQuantity: number;
  backorderedQuantity: number;
  fulfillmentStatus: FulfillmentStatus;

  // Special order tracking
  isSpecialOrder: boolean;
  specialOrderEta?: string;
  specialOrderNotes?: string;

  // Warranty
  warrantyId?: number;
  warrantyExpires?: string;

  // Display
  sortOrder: number;
  notes?: string;
  metadata?: Record<string, unknown>;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ORDER PAYMENT INTERFACE
// ============================================================================

/**
 * Payment record supporting multiple payment methods
 */
export interface OrderPayment {
  id: number;
  orderId: number;

  // Payment details
  paymentMethod: PaymentMethod;
  amountCents: number;
  amount: number;
  status: PaymentStatus;

  // Cash specific
  cashTenderedCents?: number;
  cashTendered?: number;
  changeGivenCents?: number;
  changeGiven?: number;

  // Card specific
  cardBrand?: string;
  cardLastFour?: string;
  cardExpiry?: string;
  authorizationCode?: string;
  processorReference?: string;
  processorResponse?: Record<string, unknown>;

  // Check specific
  checkNumber?: string;
  checkBank?: string;

  // Gift card / Store credit
  giftCardNumber?: string;
  giftCardBalanceCents?: number;

  // Financing
  financingProvider?: string;
  financingAccount?: string;
  financingTerms?: string;

  // Refund tracking
  isRefund: boolean;
  refundReason?: string;
  originalPaymentId?: number;

  // Attribution
  processedBy?: number;
  processedByName?: string;

  // Timestamps
  createdAt: string;
  processedAt?: string;
  voidedAt?: string;

  // Notes
  notes?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ORDER STATUS HISTORY INTERFACE
// ============================================================================

/**
 * Status transition record for audit trail
 */
export interface OrderStatusHistory {
  id: number;
  orderId: number;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  changedBy?: number;
  changedByName?: string;
  reason?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  changedAt: string;
}

// ============================================================================
// CREATE/UPDATE DTOs
// ============================================================================

/**
 * Data for creating a new order
 */
export interface CreateOrderDTO {
  source?: OrderSource;
  status?: OrderStatus;

  // Customer
  customerId?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;

  // Attribution
  createdBy: number;
  salespersonId?: number;

  // POS fields
  registerId?: number;
  shiftId?: number;

  // Quote fields
  quoteExpiryDate?: string;
  quoteValidDays?: number;

  // Discounts
  orderDiscountCents?: number;
  orderDiscountType?: DiscountType;
  orderDiscountReason?: string;
  orderDiscountCode?: string;

  // Tax
  taxProvince?: string;
  taxExempt?: boolean;
  taxExemptNumber?: string;

  // Delivery
  deliveryCents?: number;
  deliveryMethod?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  deliveryDate?: string;
  deliveryTimeSlot?: string;

  // Deposit
  depositRequiredCents?: number;

  // Notes
  internalNotes?: string;
  customerNotes?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  tags?: string[];

  // Items
  items: CreateOrderItemDTO[];
}

/**
 * Data for creating a POS transaction
 */
export interface CreatePOSTransactionDTO {
  shiftId: number;
  createdBy: number;
  salespersonId?: number;

  // Customer (optional)
  customerId?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;

  // From quote (optional)
  quoteId?: number;

  // Discount
  discountCents?: number;
  discountReason?: string;

  // Tax
  taxProvince?: string;

  // Items
  items: CreateOrderItemDTO[];

  // Payments
  payments: CreatePaymentDTO[];
}

/**
 * Data for creating an order item
 */
export interface CreateOrderItemDTO {
  productId?: number;
  productSku?: string;
  productName?: string;
  name?: string;        // Alias for productName
  productDescription?: string;
  description?: string; // Alias
  manufacturer?: string;
  model?: string;

  quantity: number;
  unitPriceCents: number;
  unitCostCents?: number;

  discountType?: DiscountType;
  discountPercent?: number;
  discountCents?: number;
  discountReason?: string;

  taxable?: boolean;
  serialNumber?: string;

  isSpecialOrder?: boolean;
  specialOrderNotes?: string;

  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Data for creating a payment
 */
export interface CreatePaymentDTO {
  paymentMethod: PaymentMethod;
  amountCents: number;
  status?: PaymentStatus;

  // Cash
  cashTenderedCents?: number;
  changeGivenCents?: number;

  // Card
  cardBrand?: string;
  cardLastFour?: string;
  authorizationCode?: string;
  processorReference?: string;

  // Check
  checkNumber?: string;

  // Gift card
  giftCardNumber?: string;

  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Data for updating an order
 */
export interface UpdateOrderDTO {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  salespersonId?: number;

  orderDiscountCents?: number;
  orderDiscountType?: DiscountType;
  orderDiscountReason?: string;
  orderDiscountCode?: string;

  taxExempt?: boolean;
  taxExemptNumber?: string;

  deliveryCents?: number;
  deliveryMethod?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  deliveryDate?: string;
  deliveryTimeSlot?: string;

  depositRequiredCents?: number;

  internalNotes?: string;
  customerNotes?: string;

  quoteExpiryDate?: string;
  quoteValidDays?: number;
  invoiceTerms?: string;

  tags?: string[];

  // Replace all items
  items?: CreateOrderItemDTO[];
}

/**
 * Data for processing a refund
 */
export interface ProcessRefundDTO {
  amountCents: number;
  paymentMethod?: PaymentMethod;
  reason?: string;
  originalPaymentId?: number;
  notes?: string;
}

// ============================================================================
// SEARCH / FILTER TYPES
// ============================================================================

/**
 * Search filters for orders
 */
export interface OrderSearchFilters {
  source?: OrderSource;
  status?: OrderStatus | OrderStatus[];
  customerId?: number;
  salespersonId?: number;
  shiftId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

/**
 * Status groups for filtering
 */
export const STATUS_GROUPS = {
  quote: ['draft', 'quote_sent', 'quote_viewed', 'quote_expired', 'quote_rejected', 'quote_approved'] as OrderStatus[],
  order: ['order_pending', 'order_processing', 'order_ready', 'order_completed'] as OrderStatus[],
  invoice: ['invoice_sent', 'invoice_overdue'] as OrderStatus[],
  paid: ['paid'] as OrderStatus[],
  refund: ['partial_refund', 'refunded'] as OrderStatus[],
  closed: ['void', 'archived'] as OrderStatus[],
};

/**
 * Status display labels
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  quote_sent: 'Quote Sent',
  quote_viewed: 'Quote Viewed',
  quote_expired: 'Quote Expired',
  quote_rejected: 'Quote Rejected',
  quote_approved: 'Quote Approved',
  order_pending: 'Order Pending',
  order_processing: 'Processing',
  order_ready: 'Ready',
  order_completed: 'Completed',
  invoice_sent: 'Invoice Sent',
  invoice_overdue: 'Overdue',
  paid: 'Paid',
  partial_refund: 'Partial Refund',
  refunded: 'Refunded',
  void: 'Voided',
  archived: 'Archived',
};

/**
 * Status colors for UI
 */
export const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: 'gray',
  quote_sent: 'blue',
  quote_viewed: 'cyan',
  quote_expired: 'orange',
  quote_rejected: 'red',
  quote_approved: 'green',
  order_pending: 'yellow',
  order_processing: 'blue',
  order_ready: 'cyan',
  order_completed: 'green',
  invoice_sent: 'blue',
  invoice_overdue: 'red',
  paid: 'green',
  partial_refund: 'orange',
  refunded: 'gray',
  void: 'red',
  archived: 'gray',
};

/**
 * Valid status transitions
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['quote_sent', 'order_pending', 'void'],
  quote_sent: ['quote_viewed', 'quote_expired', 'quote_rejected', 'quote_approved', 'void'],
  quote_viewed: ['quote_expired', 'quote_rejected', 'quote_approved', 'void'],
  quote_expired: ['quote_sent', 'void'],
  quote_rejected: ['quote_sent', 'void'],
  quote_approved: ['order_pending', 'invoice_sent', 'paid', 'void'],
  order_pending: ['order_processing', 'order_ready', 'order_completed', 'void'],
  order_processing: ['order_ready', 'order_completed', 'void'],
  order_ready: ['order_completed', 'void'],
  order_completed: ['invoice_sent', 'paid', 'partial_refund', 'refunded'],
  invoice_sent: ['invoice_overdue', 'paid', 'partial_refund', 'void'],
  invoice_overdue: ['paid', 'partial_refund', 'void'],
  paid: ['partial_refund', 'refunded'],
  partial_refund: ['refunded'],
  refunded: ['archived'],
  void: ['archived'],
  archived: [],
};

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Order summary for list views
 */
export type OrderSummary = Pick<
  UnifiedOrder,
  | 'id'
  | 'orderNumber'
  | 'source'
  | 'status'
  | 'customerName'
  | 'totalCents'
  | 'total'
  | 'amountPaidCents'
  | 'amountPaid'
  | 'amountDueCents'
  | 'amountDue'
  | 'itemCount'
  | 'createdAt'
  | 'salespersonName'
>;

/**
 * Quote-specific view
 */
export type Quote = UnifiedOrder & {
  source: 'quote';
  quoteExpiryDate: string;
  quoteValidDays: number;
  quoteRevision: number;
};

/**
 * POS Transaction view
 */
export type POSTransaction = UnifiedOrder & {
  source: 'pos';
  shiftId: number;
  registerId: number;
};

/**
 * Invoice view
 */
export type Invoice = UnifiedOrder & {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDueDate: string;
};
