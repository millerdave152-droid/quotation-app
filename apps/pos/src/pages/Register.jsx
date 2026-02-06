/**
 * TeleTime POS - Main Register Screen
 * Primary interface for cashiers with full integration of all POS components
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  UserIcon,
  DocumentTextIcon,
  ClockIcon,
  Squares2X2Icon,
  ArrowPathIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../hooks/useCart';
import { useRegister } from '../hooks/useRegister';
import { formatCurrency, formatTime } from '../utils/formatters';

// Product Components
import {
  ProductSearch,
  CategoryBar,
  ProductGrid,
  BarcodeScanner,
} from '../components/Products';

// Cart Components
import {
  Cart,
  HeldTransactions,
} from '../components/Cart';

// Checkout Components
import { CheckoutModal } from '../components/Checkout';

// Quote Components
import {
  QuoteLookup,
  QuoteConversionBanner,
} from '../components/Quotes';

// Customer Components
import { CustomerLookup } from '../components/Customer';

/**
 * Main POS Register Screen
 */
function Register() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const cart = useCart();
  const {
    currentShift,
    shiftSummary,
    refreshShiftSummary,
    getShiftDuration,
  } = useRegister();

  // UI State
  const [view, setView] = useState('grid'); // 'grid' | 'search'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);
  const [showQuoteLookup, setShowQuoteLookup] = useState(false);
  const [showHeldTransactions, setShowHeldTransactions] = useState(false);

  // Transaction State
  const [lastTransaction, setLastTransaction] = useState(null);
  const [error, setError] = useState(null);

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Clear last transaction notification after timeout
  useEffect(() => {
    if (lastTransaction) {
      const timer = setTimeout(() => setLastTransaction(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [lastTransaction]);

  // ============================================================================
  // BARCODE SCANNER HANDLER
  // ============================================================================

  const handleBarcodeScan = useCallback(async (barcode) => {
    const result = await cart.addItemByBarcode(barcode);
    if (!result.success) {
      setError(`Product not found: ${barcode}`);
    }
  }, [cart]);

  // ============================================================================
  // PRODUCT HANDLERS
  // ============================================================================

  const handleProductSelect = useCallback((product) => {
    cart.addItem(product);
  }, [cart]);

  const handleCategorySelect = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
  }, []);

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (query) {
      setView('search');
    }
  }, []);

  // ============================================================================
  // CUSTOMER HANDLERS
  // ============================================================================

  const handleSelectCustomer = useCallback((customer) => {
    cart.setCustomer(customer);
    setShowCustomerLookup(false);
  }, [cart]);

  const handleLoadQuoteFromCustomer = useCallback((quote, customer) => {
    cart.setCustomer(customer);
    cart.loadFromQuote(quote);
    setShowCustomerLookup(false);
  }, [cart]);

  // ============================================================================
  // QUOTE HANDLERS
  // ============================================================================

  const handleLoadQuote = useCallback((quote) => {
    cart.loadFromQuote(quote);
    setShowQuoteLookup(false);
  }, [cart]);

  // ============================================================================
  // CART HANDLERS
  // ============================================================================

  const handleHoldCart = useCallback(() => {
    const label = cart.customer?.name || `Cart ${new Date().toLocaleTimeString()}`;
    const result = cart.holdCart(label);
    if (result.success) {
      setShowHeldTransactions(false);
    }
  }, [cart]);

  const handleRecallCart = useCallback((heldCartId) => {
    cart.recallCart(heldCartId);
    setShowHeldTransactions(false);
  }, [cart]);

  const handleDeleteHeldCart = useCallback((heldCartId) => {
    cart.deleteHeldCart(heldCartId);
  }, [cart]);

  // ============================================================================
  // CHECKOUT HANDLERS
  // ============================================================================

  const handleCheckout = useCallback(() => {
    const validation = cart.validateForCheckout();
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      return;
    }
    setShowCheckout(true);
  }, [cart]);

  const handleTransactionComplete = useCallback(async (transaction) => {
    setLastTransaction(transaction);
    setShowCheckout(false);
    await refreshShiftSummary();
  }, [refreshShiftSummary]);

  const handleCheckoutCancel = useCallback(() => {
    setShowCheckout(false);
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Barcode Scanner (invisible) */}
      <BarcodeScanner onScan={handleBarcodeScan} enabled={!showCheckout} />

      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between shadow-lg flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">
            {import.meta.env.VITE_APP_NAME || 'TeleTime POS'}
          </h1>
          <div className="text-sm text-gray-400">
            {currentShift?.registerName}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Shift Info */}
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Shift Active
            </span>
            <span className="text-gray-400">
              <ClockIcon className="w-4 h-4 inline mr-1" />
              {getShiftDuration?.() || '0:00'}
            </span>
            <span className="text-gray-400">
              {shiftSummary?.summary?.transactionCount || 0} sales
            </span>
          </div>

          {/* Held Transactions Badge */}
          {cart.hasHeldCarts && (
            <button
              onClick={() => setShowHeldTransactions(true)}
              className="relative px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors"
            >
              <ClockIcon className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
                {cart.heldCarts.length}
              </span>
            </button>
          )}

          {/* User Info */}
          <div className="flex items-center gap-3">
            <span className="text-sm">{user?.firstName || user?.username}</span>
            <button
              onClick={() => navigate('/close-shift')}
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors"
            >
              End Shift
            </button>
          </div>
        </div>
      </header>

      {/* Quote Conversion Banner (if converting a quote) */}
      {cart.quoteId && (
        <QuoteConversionBanner
          quoteId={cart.quoteId}
          quoteNumber={cart.quoteId}
          salespersonName={cart.salespersonId}
          onClearQuote={() => {
            cart.clearCart();
          }}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Products */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Quick Actions Bar */}
          <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <ProductSearch
                value={searchQuery}
                onChange={handleSearch}
                onSelect={handleProductSelect}
              />
            </div>

            {/* View Toggle */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setView('grid')}
                className={`p-2 ${view === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <Squares2X2Icon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setView('search')}
                className={`p-2 ${view === 'search' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <MagnifyingGlassIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCustomerLookup(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
              >
                <UserIcon className="w-5 h-5" />
                <span className="hidden lg:inline">Customer</span>
              </button>
              <button
                onClick={() => setShowQuoteLookup(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors"
              >
                <DocumentTextIcon className="w-5 h-5" />
                <span className="hidden lg:inline">Quote</span>
              </button>
              <button
                onClick={() => setShowHeldTransactions(true)}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-colors relative"
              >
                <ClockIcon className="w-5 h-5" />
                <span className="hidden lg:inline">Held</span>
                {cart.hasHeldCarts && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 text-white rounded-full text-xs flex items-center justify-center">
                    {cart.heldCarts.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Category Bar */}
          <CategoryBar
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategorySelect}
          />

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto">
            <ProductGrid
              categoryId={selectedCategory}
              searchQuery={view === 'search' ? searchQuery : ''}
              onProductSelect={handleProductSelect}
            />
          </div>
        </div>

        {/* Right Panel - Cart */}
        <div className="w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
          <Cart
            onCheckout={handleCheckout}
            onHold={handleHoldCart}
            onClear={() => cart.clearCart()}
            onCustomerClick={() => setShowCustomerLookup(true)}
            onQuoteClick={() => setShowQuoteLookup(true)}
          />
        </div>
      </div>

      {/* ================================================================== */}
      {/* MODALS */}
      {/* ================================================================== */}

      {/* Checkout Modal */}
      {showCheckout && (
        <CheckoutModal
          isOpen={showCheckout}
          onClose={handleCheckoutCancel}
          onComplete={handleTransactionComplete}
        />
      )}

      {/* Customer Lookup Modal */}
      <CustomerLookup
        isOpen={showCustomerLookup}
        onClose={() => setShowCustomerLookup(false)}
        onSelectCustomer={handleSelectCustomer}
        onLoadQuote={handleLoadQuoteFromCustomer}
      />

      {/* Quote Lookup Modal */}
      <QuoteLookup
        isOpen={showQuoteLookup}
        onClose={() => setShowQuoteLookup(false)}
        onLoadQuote={handleLoadQuote}
      />

      {/* Held Transactions Modal */}
      <HeldTransactions
        isOpen={showHeldTransactions}
        onClose={() => setShowHeldTransactions(false)}
        heldCarts={cart.heldCarts}
        onRecall={handleRecallCart}
        onDelete={handleDeleteHeldCart}
        onClearAll={() => cart.clearAllHeldCarts()}
      />

      {/* ================================================================== */}
      {/* NOTIFICATIONS */}
      {/* ================================================================== */}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 max-w-md z-50 animate-slide-in">
          <div className="bg-red-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-start gap-3">
            <div className="flex-1">
              <p className="font-medium">Error</p>
              <p className="text-sm text-red-100">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-200 hover:text-white"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {lastTransaction && (
        <div className="fixed bottom-4 left-4 max-w-md z-50 animate-slide-in">
          <div className="bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-bold">Transaction Complete!</p>
                <p className="text-sm text-green-100">
                  {lastTransaction.transactionNumber}
                </p>
                <p className="text-lg font-bold mt-1">
                  {formatCurrency(lastTransaction.totals?.totalAmount || lastTransaction.totalAmount)}
                </p>
              </div>
              <button
                onClick={() => setLastTransaction(null)}
                className="text-green-200 hover:text-white"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Register;
