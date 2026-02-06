/**
 * Standardized API Types and Interfaces
 * Shared between Quote, Order, and POS endpoints
 */

// ============================================================================
// BASE RESPONSE TYPES
// ============================================================================

export interface ApiMeta {
  timestamp: string;
  requestId?: string;
  message?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: ApiErrorDetail | null;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown> | unknown[];
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INSUFFICIENT_CREDIT'
  | 'QUOTE_EXPIRED'
  | 'APPROVAL_REQUIRED'
  | 'INVALID_STATUS_TRANSITION';

// ============================================================================
// USER & AUTH TYPES
// ============================================================================

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
}

export type UserRole = 'admin' | 'manager' | 'sales' | 'cashier' | 'viewer';

// ============================================================================
// MONEY & TAX TYPES
// ============================================================================

export interface Money {
  cents: number;
  dollars: number;
  formatted: string;
}

export interface TaxBreakdown {
  subtotal: Money;
  discount: Money;
  taxableAmount: Money;
  hst?: Money;
  gst?: Money;
  pst?: Money;
  totalTax: Money;
  total: Money;
}

export type TaxProvince = 'ON' | 'BC' | 'AB' | 'SK' | 'MB' | 'QC' | 'NB' | 'NS' | 'PE' | 'NL' | 'YT' | 'NT' | 'NU';

// ============================================================================
// CUSTOMER TYPES
// ============================================================================

export interface Customer {
  id: number;
  name: string;
  email?: string;
  phone: string;
  company?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  customerType: CustomerType;
  taxNumber?: string;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  paymentTerms: PaymentTerms;
  creditStatus: CreditStatus;
  createdAt: string;
  updatedAt: string;
}

export type CustomerType = 'Retail' | 'Commercial' | 'Wholesale' | 'VIP';
export type PaymentTerms = 'immediate' | 'net_7' | 'net_15' | 'net_30' | 'net_45' | 'net_60';
export type CreditStatus = 'good' | 'warning' | 'hold' | 'blocked';

export interface CustomerSummary {
  id: number;
  name: string;
  company?: string;
  phone: string;
  email?: string;
}

// ============================================================================
// PRODUCT TYPES
// ============================================================================

export interface Product {
  id: number;
  name: string;
  model?: string;
  manufacturer?: string;
  category: string;
  description?: string;
  costCents: number;
  msrpCents: number;
  priceCents: number;
  promoPriceCents?: number;
  promoStart?: string;
  promoEnd?: string;
  margin?: number;
  imageUrl?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSummary {
  id: number;
  name: string;
  model?: string;
  manufacturer?: string;
  category: string;
  priceCents: number;
}

// ============================================================================
// LINE ITEM TYPES (Shared between Quote, Order, Transaction)
// ============================================================================

export interface LineItem {
  id: number;
  productId: number;
  productName: string;
  productSku?: string;
  manufacturer?: string;
  category?: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents?: number;
  discountPercent: number;
  discountAmountCents: number;
  taxable: boolean;
  lineTotalCents: number;
  serialNumber?: string;
  notes?: string;
}

export interface CreateLineItem {
  productId: number;
  quantity: number;
  unitPriceCents?: number;
  discountPercent?: number;
  discountAmountCents?: number;
  taxable?: boolean;
  serialNumber?: string;
  notes?: string;
}

export interface UpdateLineItem {
  quantity?: number;
  unitPriceCents?: number;
  discountPercent?: number;
  discountAmountCents?: number;
  taxable?: boolean;
  serialNumber?: string;
  notes?: string;
}

// ============================================================================
// QUOTE TYPES
// ============================================================================

export type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'WON'
  | 'LOST'
  | 'EXPIRED';

export interface Quote {
  id: number;
  quotationNumber: string;
  customerId: number;
  customer: CustomerSummary;
  salesRepName: string;
  salesRepId?: number;
  status: QuoteStatus;
  items: QuoteItem[];
  subtotalCents: number;
  discountCents: number;
  discountPercent?: number;
  taxCents: number;
  totalCents: number;
  taxProvince: TaxProvince;
  notes?: string;
  internalNotes?: string;
  validUntil?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  expiredAt?: string;
  requiresApproval: boolean;
  approvalStatus?: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteItem extends LineItem {
  quotationId: number;
  msrpCents?: number;
  costCents?: number;
  marginPercent?: number;
  lineProfitCents?: number;
}

export interface CreateQuote {
  customerId: number;
  salesRepId?: number;
  salesRepName?: string;
  items: CreateLineItem[];
  discountPercent?: number;
  discountCents?: number;
  taxProvince?: TaxProvince;
  notes?: string;
  internalNotes?: string;
  validUntil?: string;
}

export interface UpdateQuote {
  customerId?: number;
  salesRepId?: number;
  salesRepName?: string;
  items?: CreateLineItem[];
  discountPercent?: number;
  discountCents?: number;
  taxProvince?: TaxProvince;
  notes?: string;
  internalNotes?: string;
  validUntil?: string;
}

export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

// ============================================================================
// ORDER TYPES
// ============================================================================

export type OrderSource = 'quote' | 'pos' | 'online' | 'phone' | 'import';

export type OrderStatus =
  | 'pending'
  | 'order_confirmed'
  | 'processing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'order_completed'
  | 'cancelled'
  | 'voided';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded' | 'overdue';

export type DeliveryStatus = 'not_applicable' | 'pending' | 'scheduled' | 'in_transit' | 'delivered';

export interface Order {
  id: number;
  orderNumber: string;
  source: OrderSource;
  sourceId?: number;
  sourceReference?: string;
  customerId?: number;
  customer?: CustomerSummary;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  items: OrderItem[];
  payments: Payment[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  taxProvince: TaxProvince;
  shiftId?: number;
  registerId?: number;
  salesRepId?: number;
  salesRepName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  voidedAt?: string;
  voidReason?: string;
}

export interface OrderItem extends LineItem {
  orderId: number;
}

export interface CreateOrder {
  source: OrderSource;
  sourceId?: number;
  customerId?: number;
  items: CreateLineItem[];
  payments?: CreatePayment[];
  discountPercent?: number;
  discountCents?: number;
  taxProvince?: TaxProvince;
  shiftId?: number;
  registerId?: number;
  salesRepId?: number;
  notes?: string;
}

export interface UpdateOrder {
  customerId?: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  deliveryStatus?: DeliveryStatus;
  notes?: string;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export type PaymentMethod = 'cash' | 'credit' | 'debit' | 'gift_card' | 'account' | 'check' | 'other';

export interface Payment {
  id: number;
  orderId?: number;
  transactionId?: number;
  paymentMethod: PaymentMethod;
  amountCents: number;
  cashTenderedCents?: number;
  changeGivenCents?: number;
  cardLastFour?: string;
  cardBrand?: string;
  authorizationCode?: string;
  processorReference?: string;
  stripePaymentIntentId?: string;
  giftCardNumber?: string;
  customerAccountId?: number;
  status: PaymentTransactionStatus;
  refundedCents?: number;
  createdAt: string;
}

export type PaymentTransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'voided';

export interface CreatePayment {
  paymentMethod: PaymentMethod;
  amountCents: number;
  cashTenderedCents?: number;
  cardLastFour?: string;
  cardBrand?: string;
  authorizationCode?: string;
  processorReference?: string;
  giftCardNumber?: string;
  giftCardPin?: string;
}

// ============================================================================
// POS TRANSACTION TYPES
// ============================================================================

export type TransactionStatus = 'pending' | 'completed' | 'voided' | 'refunded';

export interface POSTransaction {
  transactionId: number;
  transactionNumber: string;
  shiftId: number;
  registerId: number;
  registerName?: string;
  userId: number;
  userName?: string;
  customerId?: number;
  customer?: CustomerSummary;
  quoteId?: number;
  quoteNumber?: string;
  items: TransactionItem[];
  payments: Payment[];
  subtotal: number;
  discountAmount: number;
  discountReason?: string;
  hstAmount: number;
  gstAmount: number;
  pstAmount: number;
  totalAmount: number;
  taxProvince: TaxProvince;
  status: TransactionStatus;
  createdAt: string;
  completedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  refundedAt?: string;
  refundReason?: string;
  originalTransactionId?: number;
}

export interface TransactionItem extends LineItem {
  transactionId: number;
}

export interface CreateTransaction {
  shiftId: number;
  customerId?: number;
  quoteId?: number;
  salespersonId?: number;
  items: CreateLineItem[];
  payments: CreatePayment[];
  discountAmount?: number;
  discountReason?: string;
  taxProvince?: TaxProvince;
}

// ============================================================================
// REGISTER & SHIFT TYPES
// ============================================================================

export interface Register {
  registerId: number;
  registerName: string;
  location?: string;
  isActive: boolean;
  currentShift?: Shift;
  createdAt: string;
}

export interface Shift {
  shiftId: number;
  registerId: number;
  userId: number;
  userName?: string;
  openingCashCents: number;
  closingCashCents?: number;
  expectedCashCents?: number;
  cashVarianceCents?: number;
  openedAt: string;
  closedAt?: string;
  status: ShiftStatus;
  transactionCount?: number;
  totalSalesCents?: number;
}

export type ShiftStatus = 'open' | 'closing' | 'closed';

export interface OpenShiftRequest {
  openingCash: number;
  denominations?: Denominations;
}

export interface CloseShiftRequest {
  closingCash: number;
  denominations?: Denominations;
  blindClose?: boolean;
}

export interface Denominations {
  bills: {
    hundreds: number;
    fifties: number;
    twenties: number;
    tens: number;
    fives: number;
  };
  coins: {
    toonies: number;
    loonies: number;
    quarters: number;
    dimes: number;
    nickels: number;
    pennies: number;
  };
  rolls?: {
    toonies: number;
    loonies: number;
    quarters: number;
    dimes: number;
    nickels: number;
  };
}

// ============================================================================
// COMMON QUERY PARAMS
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc';
}

export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

export interface QuoteQueryParams extends PaginationParams, DateRangeParams {
  status?: QuoteStatus | QuoteStatus[];
  customerId?: number;
  salesRepId?: number;
  search?: string;
  requiresApproval?: boolean;
}

export interface OrderQueryParams extends PaginationParams, DateRangeParams {
  status?: OrderStatus | OrderStatus[];
  paymentStatus?: PaymentStatus | PaymentStatus[];
  deliveryStatus?: DeliveryStatus | DeliveryStatus[];
  source?: OrderSource | OrderSource[];
  customerId?: number;
  search?: string;
}

export interface TransactionQueryParams extends PaginationParams, DateRangeParams {
  status?: TransactionStatus | TransactionStatus[];
  shiftId?: number;
  registerId?: number;
  customerId?: number;
  search?: string;
}

// ============================================================================
// REPORT TYPES
// ============================================================================

export interface SalesSummary {
  totalSalesCents: number;
  transactionCount: number;
  averageOrderValueCents: number;
  quoteRevenueCents: number;
  posRevenueCents: number;
  uniqueCustomers: number;
}

export interface DailySalesReport {
  date: string;
  summary: SalesSummary;
  bySource: {
    source: 'quote' | 'pos';
    transactionCount: number;
    totalCents: number;
    averageOrderValueCents: number;
  }[];
  topProducts: {
    productName: string;
    unitsSold: number;
    revenueCents: number;
  }[];
}

export interface QuoteConversionMetrics {
  totalQuotes: number;
  convertedQuotes: number;
  conversionRate: number;
  avgDaysToConvert: number;
  byStatus: {
    status: string;
    count: number;
    totalValueCents: number;
  }[];
}
