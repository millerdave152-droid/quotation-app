/**
 * TeleTime POS - Quote Lookup Component
 * Modal for searching and selecting quotes for conversion to sale
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  DocumentTextIcon,
  UserIcon,
  CalendarIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { lookupQuote, getQuoteForSale, checkQuoteValidity } from '../../api/quotes';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Quote status badge
 */
function StatusBadge({ status }) {
  const statusConfig = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
    sent: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Sent' },
    accepted: { bg: 'bg-green-100', text: 'text-green-700', label: 'Accepted' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    expired: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Expired' },
    converted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Converted' },
  };

  const config = statusConfig[status?.toLowerCase()] || statusConfig.pending;

  return (
    <span
      className={`
        px-2 py-0.5
        text-xs font-medium
        rounded-full
        ${config.bg} ${config.text}
      `}
    >
      {config.label}
    </span>
  );
}

/**
 * Quote result item
 */
function QuoteResultItem({ quote, onClick, isSelected }) {
  const quoteNumber = quote.quoteNumber || quote.quote_number || quote.quotation_number;
  const customerName = quote.customerName || quote.customer_name || 'Unknown Customer';
  const createdAt = quote.createdAt || quote.created_at;
  const total = quote.totalAmount || quote.total_amount || quote.total_cents / 100 || 0;
  const itemCount = quote.itemCount || quote.item_count || quote.items?.length || 0;
  const status = quote.status || 'pending';
  const salesperson = quote.salespersonName || quote.salesperson_name || quote.userName || quote.user_name || 'Staff';

  return (
    <button
      type="button"
      onClick={() => onClick(quote)}
      className={`
        w-full p-4
        flex items-start gap-4
        text-left
        border-b border-gray-100 last:border-0
        hover:bg-gray-50
        transition-colors duration-150
        ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}
      `}
    >
      {/* Quote Icon */}
      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <DocumentTextIcon className="w-6 h-6 text-blue-600" />
      </div>

      {/* Quote Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-gray-900">{quoteNumber}</span>
          <StatusBadge status={status} />
        </div>

        <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
          <UserIcon className="w-4 h-4" />
          <span className="truncate">{customerName}</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            {formatDate(createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <ShoppingBagIcon className="w-3 h-3" />
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <span>by {salesperson}</span>
        </div>
      </div>

      {/* Total */}
      <div className="text-right flex-shrink-0">
        <span className="text-lg font-bold text-gray-900 tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>
    </button>
  );
}

/**
 * Quote preview panel for loading into cart
 */
function QuotePreviewPanel({ quote, onLoadQuote, onBack, isLoading }) {
  const [quoteDetails, setQuoteDetails] = useState(null);
  const [stockStatus, setStockStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const quoteId = quote?.quoteId || quote?.quote_id || quote?.id;
  const quoteNumber = quote?.quoteNumber || quote?.quote_number || quote?.quotation_number;

  // Fetch quote details with stock check
  useEffect(() => {
    async function fetchQuoteDetails() {
      if (!quoteId) return;

      setLoading(true);
      setError(null);

      try {
        const result = await getQuoteForSale(quoteId);

        if (result.success) {
          setQuoteDetails(result.data);
          setStockStatus(result.data?.stockStatus || []);
        } else {
          setError(result.error || 'Failed to load quote details');
        }
      } catch (err) {
        console.error('[QuotePreview] Error:', err);
        setError('Failed to load quote');
      } finally {
        setLoading(false);
      }
    }

    fetchQuoteDetails();
  }, [quoteId]);

  const items = quoteDetails?.items || quote?.items || [];
  const total = quoteDetails?.totalAmount || quote?.totalAmount || quote?.total_amount || 0;
  const customerName = quoteDetails?.customerName || quote?.customerName || quote?.customer_name || 'Customer';

  // Check if all items are in stock
  const hasStockIssues = stockStatus.some(s => s.available < s.required);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{quoteNumber}</h2>
          <p className="text-sm text-gray-500">for {customerName}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : (
          <>
            {/* Stock Warning */}
            {hasStockIssues && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-medium text-yellow-800">
                  Some items may have limited stock
                </p>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              {items.map((item, index) => {
                const stock = stockStatus.find(s => s.productId === (item.productId || item.product_id)) || {};
                const isLowStock = stock.available < stock.required;

                return (
                  <div
                    key={item.id || index}
                    className="p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {item.productName || item.product_name || item.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {item.quantity} × {formatCurrency(item.unitPrice || item.unit_price || item.price)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency((item.unitPrice || item.unit_price || item.price) * item.quantity)}
                        </p>
                        {isLowStock && (
                          <p className="text-xs text-yellow-600">
                            Only {stock.available} in stock
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <button
          type="button"
          onClick={() => onLoadQuote(quoteDetails || quote)}
          disabled={loading || !!error || isLoading}
          className="
            w-full h-14
            flex items-center justify-center gap-2
            bg-blue-600 hover:bg-blue-700
            disabled:bg-gray-300 disabled:cursor-not-allowed
            text-white text-lg font-bold
            rounded-xl
            transition-colors
          "
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <ShoppingCartIcon className="w-6 h-6" />
              Load Quote into Cart
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Quote lookup modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Callback to close modal
 * @param {function} props.onLoadQuote - Callback when quote is loaded
 */
export function QuoteLookup({
  isOpen,
  onClose,
  onLoadQuote,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedQuote(null);
      setShowPreview(false);
      setError(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (showPreview) {
          setShowPreview(false);
        } else {
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, showPreview, onClose]);

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

  // Debounced search
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await lookupQuote(searchQuery);

      if (result.success) {
        // Filter out converted and expired quotes
        const availableQuotes = (result.data || []).filter(
          (q) => q.status !== 'converted' && q.status !== 'expired'
        );
        setResults(availableQuotes);
      } else {
        setError(result.error || 'Search failed');
        setResults([]);
      }
    } catch (err) {
      console.error('[QuoteLookup] Search error:', err);
      setError('Failed to search quotes');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleQueryChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // Handle quote selection - show preview
  const handleSelectQuote = (quote) => {
    setSelectedQuote(quote);
    setShowPreview(true);
  };

  // Handle load quote into cart
  const handleLoadQuote = (quote) => {
    onLoadQuote?.(quote);
    onClose?.();
  };

  // Handle clear
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setSelectedQuote(null);
    inputRef.current?.focus();
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Show Preview Panel */}
        {showPreview && selectedQuote && (
          <QuotePreviewPanel
            quote={selectedQuote}
            onLoadQuote={handleLoadQuote}
            onBack={() => setShowPreview(false)}
            isLoading={isLoading}
          />
        )}

        {/* Main Search View */}
        {!showPreview && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Find Quote</h2>
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

            {/* Search Input */}
            <div className="p-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                  ) : (
                    <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="Search by quote #, customer, or phone..."
                  className="
                    w-full h-12 pl-12 pr-12
                    text-base
                    bg-gray-50 border-2 border-gray-200
                    rounded-xl
                    placeholder:text-gray-400
                    focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                    transition-all duration-150
                  "
                  autoComplete="off"
                />

                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="
                      absolute right-3 top-1/2 -translate-y-1/2
                      w-8 h-8
                      flex items-center justify-center
                      text-gray-400 hover:text-gray-600
                      hover:bg-gray-200
                      rounded-lg
                      transition-colors duration-150
                    "
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mx-4 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {results.length > 0 ? (
                <div>
                  <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
                    {results.length} {results.length === 1 ? 'quote' : 'quotes'} found
                  </div>
                  {results.map((quote) => (
                    <QuoteResultItem
                      key={quote.quoteId || quote.quote_id || quote.id}
                      quote={quote}
                      onClick={handleSelectQuote}
                      isSelected={selectedQuote?.id === quote.id}
                    />
                  ))}
                </div>
              ) : query && !isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <DocumentTextIcon className="w-12 h-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No quotes found
                  </h3>
                  <p className="text-sm text-gray-500 max-w-xs">
                    No pending quotes match your search. Try a different quote number or customer name.
                  </p>
                </div>
              ) : !query ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <MagnifyingGlassIcon className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Search for a Quote
                  </h3>
                  <p className="text-sm text-gray-500 max-w-xs">
                    Enter a quote number, customer name, or phone number to find quotes ready for checkout.
                  </p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default QuoteLookup;
