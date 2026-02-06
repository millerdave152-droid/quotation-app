/**
 * TeleTime POS - Quote Preview Component
 * Modal showing quote details with stock check and load to cart
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  DocumentTextIcon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ShoppingCartIcon,
  ChatBubbleLeftIcon,
} from '@heroicons/react/24/outline';
import { getQuoteForSale } from '../../api/quotes';
import { formatCurrency, formatDate, formatPhone } from '../../utils/formatters';

/**
 * Stock status indicator
 */
function StockIndicator({ stock, required }) {
  if (stock >= required) {
    return (
      <div className="flex items-center gap-1 text-green-600" title={`${stock} in stock`}>
        <CheckCircleIcon className="w-5 h-5" />
        <span className="text-xs">In Stock</span>
      </div>
    );
  }

  if (stock > 0) {
    return (
      <div className="flex items-center gap-1 text-yellow-600" title={`Only ${stock} in stock`}>
        <ExclamationTriangleIcon className="w-5 h-5" />
        <span className="text-xs">Low ({stock})</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-red-600" title="Out of stock">
      <XCircleIcon className="w-5 h-5" />
      <span className="text-xs">Out of Stock</span>
    </div>
  );
}

/**
 * Quote line item
 */
function QuoteLineItem({ item }) {
  const productName = item.productName || item.product_name || item.name;
  const sku = item.productSku || item.product_sku || item.sku;
  const quantity = item.quantity || 1;
  const unitPrice = item.unitPrice || item.unit_price || item.price || 0;
  const discount = item.discountPercent || item.discount_percent || 0;
  const lineTotal = unitPrice * quantity * (1 - discount / 100);
  const stock = item.stockQuantity || item.stock_quantity || item.stock || 0;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
      {/* Stock Indicator */}
      <div className="w-20 flex-shrink-0">
        <StockIndicator stock={stock} required={quantity} />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{productName}</p>
        <p className="text-xs text-gray-500">{sku}</p>
        <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
          <span>{quantity} × {formatCurrency(unitPrice)}</span>
          {discount > 0 && (
            <span className="text-green-600">(-{discount}%)</span>
          )}
        </div>
      </div>

      {/* Line Total */}
      <div className="text-right flex-shrink-0">
        <span className="font-bold text-gray-900 tabular-nums">
          {formatCurrency(lineTotal)}
        </span>
      </div>
    </div>
  );
}

/**
 * Quote preview modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {object} props.quote - Quote data (basic info for lookup)
 * @param {function} props.onClose - Callback to close modal
 * @param {function} props.onLoadToCart - Callback to load quote to cart
 */
export function QuotePreview({
  isOpen,
  quote,
  onClose,
  onLoadToCart,
}) {
  const [quoteDetails, setQuoteDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLoadingToCart, setIsLoadingToCart] = useState(false);

  // Fetch quote details when quote changes
  useEffect(() => {
    if (!isOpen || !quote) {
      setQuoteDetails(null);
      return;
    }

    const fetchQuoteDetails = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const quoteId = quote.quoteId || quote.quote_id || quote.id;
        const result = await getQuoteForSale(quoteId);

        if (result.success) {
          setQuoteDetails(result.data);
        } else {
          setError(result.error || 'Failed to load quote details');
        }
      } catch (err) {
        console.error('[QuotePreview] Fetch error:', err);
        setError('Failed to load quote details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuoteDetails();
  }, [isOpen, quote]);

  // Handle load to cart
  const handleLoadToCart = useCallback(async () => {
    if (!quoteDetails) return;

    setIsLoadingToCart(true);

    try {
      await onLoadToCart?.(quoteDetails);
      onClose?.();
    } catch (err) {
      console.error('[QuotePreview] Load to cart error:', err);
      setError('Failed to load quote to cart');
    } finally {
      setIsLoadingToCart(false);
    }
  }, [quoteDetails, onLoadToCart, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate totals and stock status
  const items = quoteDetails?.items || [];
  const hasOutOfStock = items.some(
    (item) => (item.stockQuantity || item.stock || 0) < (item.quantity || 1)
  );
  const allInStock = items.every(
    (item) => (item.stockQuantity || item.stock || 0) >= (item.quantity || 1)
  );

  const quoteNumber = quoteDetails?.quoteNumber || quoteDetails?.quote_number || quote?.quoteNumber || quote?.quote_number || 'N/A';
  const customerName = quoteDetails?.customerName || quoteDetails?.customer_name || 'Unknown Customer';
  const customerEmail = quoteDetails?.customerEmail || quoteDetails?.customer_email;
  const customerPhone = quoteDetails?.customerPhone || quoteDetails?.customer_phone;
  const salesperson = quoteDetails?.salespersonName || quoteDetails?.salesperson_name || 'Staff';
  const createdAt = quoteDetails?.createdAt || quoteDetails?.created_at;
  const notes = quoteDetails?.notes || quoteDetails?.internalNotes || quoteDetails?.internal_notes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <DocumentTextIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{quoteNumber}</h2>
              <p className="text-sm text-gray-500">
                Created {createdAt ? formatDate(createdAt) : 'N/A'} by {salesperson}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="
              w-10 h-10
              flex items-center justify-center
              text-gray-400 hover:text-gray-600
              hover:bg-gray-100
              rounded-lg
              transition-colors duration-150
            "
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                <XCircleIcon className="w-10 h-10 text-red-400 mx-auto mb-2" />
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          ) : quoteDetails ? (
            <div className="p-6">
              {/* Customer Info */}
              <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Customer</h3>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{customerName}</p>
                    {customerPhone && (
                      <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                        <PhoneIcon className="w-4 h-4" />
                        {formatPhone(customerPhone)}
                      </p>
                    )}
                    {customerEmail && (
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <EnvelopeIcon className="w-4 h-4" />
                        {customerEmail}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Stock Warning */}
              {hasOutOfStock && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
                    <p className="text-sm font-medium text-yellow-800">
                      Some items have stock issues. Check availability before proceeding.
                    </p>
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-3">
                  Items ({items.length})
                </h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {items.map((item, index) => (
                    <QuoteLineItem key={index} item={item} />
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(quoteDetails.subtotal || 0)}
                    </span>
                  </div>
                  {(quoteDetails.discountAmount || quoteDetails.discount_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">Discount</span>
                      <span className="font-medium text-green-600 tabular-nums">
                        -{formatCurrency(quoteDetails.discountAmount || quoteDetails.discount_amount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tax</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(quoteDetails.taxAmount || quoteDetails.tax_amount || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="text-lg font-bold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-gray-900 tabular-nums">
                      {formatCurrency(quoteDetails.totalAmount || quoteDetails.total_amount || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {notes && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <ChatBubbleLeftIcon className="w-4 h-4" />
                    Salesperson Notes
                  </h3>
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <p className="text-sm text-blue-900 whitespace-pre-wrap">{notes}</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {quoteDetails && !error && (
          <div className="p-4 bg-gray-50 border-t border-gray-200">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="
                  flex-1 h-12
                  bg-gray-200 hover:bg-gray-300
                  text-gray-700 font-medium
                  rounded-xl
                  transition-colors duration-150
                "
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLoadToCart}
                disabled={isLoadingToCart}
                className="
                  flex-1 h-12
                  flex items-center justify-center gap-2
                  bg-green-600 hover:bg-green-700
                  disabled:bg-gray-400
                  text-white font-bold
                  rounded-xl
                  transition-colors duration-150
                "
              >
                {isLoadingToCart ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ShoppingCartIcon className="w-5 h-5" />
                    Load to Cart
                  </>
                )}
              </button>
            </div>

            {allInStock && (
              <p className="mt-2 text-center text-sm text-green-600">
                <CheckCircleIcon className="w-4 h-4 inline mr-1" />
                All items in stock and ready
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuotePreview;
