/**
 * TeleTime POS - Customer Lookup Component
 * Search and select customers with pending quote indicators
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  UserPlusIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { searchCustomers } from '../../api/customers';
import { getCustomerPendingQuotes } from '../../api/quotes';
import { formatPhone } from '../../utils/formatters';
import QuickAddCustomer from './QuickAddCustomer';
import CustomerQuotesPanel from './CustomerQuotesPanel';
import { CustomerPurchaseHistory } from './CustomerPurchaseHistory';
import { CustomerTradeInHistory } from './CustomerTradeInHistory';

/**
 * Customer result item
 */
function CustomerResultItem({ customer, pendingQuoteCount, onClick, onViewHistory, onViewTradeIns, isSelected }) {
  const name = customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown';
  const phone = customer.phone || customer.phoneNumber;
  const email = customer.email;

  return (
    <button
      type="button"
      onClick={() => onClick(customer)}
      className={`
        w-full p-4
        flex items-center gap-4
        text-left
        border-b border-gray-100 last:border-0
        hover:bg-gray-50
        transition-colors duration-150
        ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}
      `}
    >
      {/* Avatar */}
      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
        <UserIcon className="w-6 h-6 text-blue-600" />
      </div>

      {/* Customer Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 truncate">{name}</span>
          {pendingQuoteCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              <DocumentTextIcon className="w-3 h-3" />
              {pendingQuoteCount} {pendingQuoteCount === 1 ? 'quote' : 'quotes'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
          {phone && (
            <span className="flex items-center gap-1">
              <PhoneIcon className="w-4 h-4" />
              {formatPhone(phone)}
            </span>
          )}
          {email && (
            <span className="flex items-center gap-1 truncate">
              <EnvelopeIcon className="w-4 h-4" />
              {email}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onViewHistory?.(customer); }}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Purchase History"
        >
          <ClockIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onViewTradeIns?.(customer); }}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
          title="Trade-In History"
        >
          <ArrowsRightLeftIcon className="w-4 h-4" />
        </button>
        {pendingQuoteCount > 0 && (
          <div className="text-blue-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Customer lookup modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Callback to close modal
 * @param {function} props.onSelectCustomer - Callback when customer is selected
 * @param {function} props.onLoadQuote - Callback when quote is loaded
 */
export function CustomerLookup({
  isOpen,
  onClose,
  onSelectCustomer,
  onLoadQuote,
}) {
  // State
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [quoteCounts, setQuoteCounts] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showQuotesPanel, setShowQuotesPanel] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(null); // 'history' | 'tradeins' | null
  const [customerQuotes, setCustomerQuotes] = useState([]);

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
      setQuoteCounts({});
      setSelectedCustomer(null);
      setShowQuickAdd(false);
      setShowQuotesPanel(false);
      setShowDetailPanel(null);
      setCustomerQuotes([]);
    }
  }, [isOpen]);

  // Search customers
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      setQuoteCounts({});
      return;
    }

    setIsLoading(true);

    try {
      const result = await searchCustomers(searchQuery);

      if (result.success) {
        const customers = result.data || [];
        setResults(customers);

        // Fetch pending quote counts for each customer
        const counts = {};
        await Promise.all(
          customers.slice(0, 10).map(async (customer) => {
            const customerId = customer.id || customer.customerId || customer.customer_id;
            try {
              const quotesResult = await getCustomerPendingQuotes(customerId);
              if (quotesResult.success) {
                counts[customerId] = (quotesResult.data || []).length;
              }
            } catch (err) {
              // Ignore quote fetch errors
            }
          })
        );
        setQuoteCounts(counts);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('[CustomerLookup] Search error:', err);
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

  // Handle customer selection
  const handleSelectCustomer = useCallback(async (customer) => {
    const customerId = customer.id || customer.customerId || customer.customer_id;
    setSelectedCustomer(customer);

    // Check for pending quotes
    const quoteCount = quoteCounts[customerId] || 0;

    if (quoteCount > 0) {
      // Fetch quotes and show panel
      try {
        const quotesResult = await getCustomerPendingQuotes(customerId);
        if (quotesResult.success && quotesResult.data?.length > 0) {
          setCustomerQuotes(quotesResult.data);
          setShowQuotesPanel(true);
          return;
        }
      } catch (err) {
        console.error('[CustomerLookup] Failed to fetch quotes:', err);
      }
    }

    // No pending quotes, select customer directly
    onSelectCustomer?.(customer);
    onClose?.();
  }, [quoteCounts, onSelectCustomer, onClose]);

  // Handle continue without quote
  const handleContinueWithoutQuote = useCallback(() => {
    if (selectedCustomer) {
      onSelectCustomer?.(selectedCustomer);
      onClose?.();
    }
  }, [selectedCustomer, onSelectCustomer, onClose]);

  // Handle quote load
  const handleLoadQuote = useCallback((quote) => {
    onLoadQuote?.(quote, selectedCustomer);
    onClose?.();
  }, [selectedCustomer, onLoadQuote, onClose]);

  // Handle quick add complete
  const handleQuickAddComplete = useCallback((newCustomer) => {
    setShowQuickAdd(false);
    onSelectCustomer?.(newCustomer);
    onClose?.();
  }, [onSelectCustomer, onClose]);

  // Handle clear
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setQuoteCounts({});
    inputRef.current?.focus();
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (showDetailPanel) {
          setShowDetailPanel(null);
        } else if (showQuotesPanel) {
          setShowQuotesPanel(false);
        } else if (showQuickAdd) {
          setShowQuickAdd(false);
        } else {
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, showQuotesPanel, showQuickAdd, onClose]);

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
        {/* Show Quick Add Form */}
        {showQuickAdd && (
          <QuickAddCustomer
            onComplete={handleQuickAddComplete}
            onCancel={() => setShowQuickAdd(false)}
            initialPhone={query}
          />
        )}

        {/* Show Quotes Panel */}
        {showQuotesPanel && selectedCustomer && (
          <CustomerQuotesPanel
            customer={selectedCustomer}
            quotes={customerQuotes}
            onLoadQuote={handleLoadQuote}
            onContinueWithoutQuote={handleContinueWithoutQuote}
            onBack={() => setShowQuotesPanel(false)}
          />
        )}

        {/* Show Detail Panel (Purchase History / Trade-Ins) */}
        {showDetailPanel && selectedCustomer && !showQuotesPanel && !showQuickAdd && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDetailPanel(null)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedCustomer.name || 'Customer'}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {showDetailPanel === 'history' ? 'Purchase History' : 'Trade-In History'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setShowDetailPanel('history')}
                className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
                  showDetailPanel === 'history'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Purchases
              </button>
              <button
                type="button"
                onClick={() => setShowDetailPanel('tradeins')}
                className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
                  showDetailPanel === 'tradeins'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Trade-Ins
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-hidden">
              {showDetailPanel === 'history' ? (
                <CustomerPurchaseHistory customer={selectedCustomer} />
              ) : (
                <CustomerTradeInHistory customer={selectedCustomer} />
              )}
            </div>

            {/* Select Customer Button */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={handleContinueWithoutQuote}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
              >
                Select Customer
              </button>
            </div>
          </div>
        )}

        {/* Main Search View */}
        {!showQuickAdd && !showQuotesPanel && !showDetailPanel && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Find Customer</h2>
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
                  placeholder="Search by name, phone, or email..."
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

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {results.length > 0 ? (
                <div>
                  <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
                    {results.length} {results.length === 1 ? 'customer' : 'customers'} found
                  </div>
                  {results.map((customer) => {
                    const customerId = customer.id || customer.customerId || customer.customer_id;
                    return (
                      <CustomerResultItem
                        key={customerId}
                        customer={customer}
                        pendingQuoteCount={quoteCounts[customerId] || 0}
                        onClick={handleSelectCustomer}
                        onViewHistory={(c) => { setSelectedCustomer(c); setShowDetailPanel('history'); }}
                        onViewTradeIns={(c) => { setSelectedCustomer(c); setShowDetailPanel('tradeins'); }}
                        isSelected={selectedCustomer?.id === customerId}
                      />
                    );
                  })}
                </div>
              ) : query && !isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <UserIcon className="w-12 h-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No customers found
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-xs">
                    No customers match "{query}". Would you like to add a new customer?
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(true)}
                    className="
                      flex items-center gap-2
                      h-11 px-5
                      bg-blue-600 hover:bg-blue-700
                      text-white font-medium
                      rounded-xl
                      transition-colors duration-150
                    "
                  >
                    <UserPlusIcon className="w-5 h-5" />
                    Add New Customer
                  </button>
                </div>
              ) : !query ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <MagnifyingGlassIcon className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Search for a Customer
                  </h3>
                  <p className="text-sm text-gray-500 max-w-xs">
                    Enter a name, phone number, or email to find an existing customer.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Quick Add Button (Footer) */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowQuickAdd(true)}
                className="
                  w-full h-12
                  flex items-center justify-center gap-2
                  bg-gray-200 hover:bg-gray-300
                  text-gray-700 font-medium
                  rounded-xl
                  transition-colors duration-150
                "
              >
                <UserPlusIcon className="w-5 h-5" />
                Quick Add New Customer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CustomerLookup;
