/**
 * TeleTime POS - Pre-Checkout Suggestions Modal
 * Full-screen modal showing "Before you go..." suggestions at checkout
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useSuggestions, useCrossSell } from '../../hooks/useSuggestions';
import { useCartContext } from '../../context/CartContext';
import ProductSuggestionCard from './ProductSuggestionCard';
import BundleSuggestion from './BundleSuggestion';
import { formatCurrency } from '../../utils/formatters';

/**
 * Pre-checkout suggestions modal
 * @param {object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {function} props.onClose - Close callback
 * @param {function} props.onProceed - Proceed to payment callback
 * @param {boolean} props.showMargin - Show margin info (for staff)
 * @param {string} props.className - Additional CSS classes
 */
export function PreCheckoutSuggestions({
  isOpen,
  onClose,
  onProceed,
  showMargin = false,
  className = '',
}) {
  const { items, customer, addItem, total } = useCartContext();
  const [addedItems, setAddedItems] = useState([]);
  const [showThankYou, setShowThankYou] = useState(false);
  const modalRef = useRef(null);

  const {
    suggestions,
    bundles,
    loading,
    hasSuggestions,
    hasBundles,
    declineSuggestion,
    trackImpression,
    trackClick,
    trackAdd,
    hasUsedTouchpoint,
    markTouchpointUsed,
  } = useSuggestions({
    cartItems: items,
    customerId: customer?.customerId || customer?.customer_id,
    context: 'checkout',
    limit: 6,
    enabled: isOpen && items.length > 0,
    filterDeclined: true,
  });

  const { crossSells } = useCrossSell({
    cartItems: items,
    customerId: customer?.customerId || customer?.customer_id,
    enabled: isOpen,
    limit: 4,
  });

  // Mark touchpoint as used when modal opens
  useEffect(() => {
    if (isOpen && !hasUsedTouchpoint()) {
      markTouchpointUsed();
    }
  }, [isOpen, hasUsedTouchpoint, markTouchpointUsed]);

  // Track impressions
  useEffect(() => {
    if (isOpen && suggestions.length > 0) {
      const productIds = suggestions.map((s) => s.productId || s.product_id);
      trackImpression(productIds);
    }
  }, [isOpen, suggestions, trackImpression]);

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

  // Handle add to cart
  const handleAdd = useCallback(
    (product) => {
      const productId = product.productId || product.product_id;
      trackAdd(productId);
      addItem(product);
      setAddedItems((prev) => [...prev, productId]);

      // Show brief thank you animation
      setShowThankYou(true);
      setTimeout(() => setShowThankYou(false), 1500);
    },
    [addItem, trackAdd]
  );

  // Handle bundle add
  const handleAddBundle = useCallback(
    (bundle) => {
      bundle.products.forEach((product) => {
        const productId = product.productId || product.product_id;
        trackAdd(productId);
        addItem(product);
        setAddedItems((prev) => [...prev, productId]);
      });

      setShowThankYou(true);
      setTimeout(() => setShowThankYou(false), 1500);
    },
    [addItem, trackAdd]
  );

  // Handle click
  const handleClick = useCallback(
    (product) => {
      trackClick(product.productId || product.product_id);
    },
    [trackClick]
  );

  // Handle dismiss
  const handleDismiss = useCallback(
    (productId) => {
      declineSuggestion(productId);
    },
    [declineSuggestion]
  );

  // Handle proceed to checkout
  const handleProceed = useCallback(() => {
    onProceed?.();
  }, [onProceed]);

  // Handle skip all
  const handleSkip = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Calculate potential savings from adding suggestions
  const potentialSavings = suggestions.reduce((sum, s) => {
    const margin = s.marginPercent || 0;
    const price = parseFloat(s.price || s.unitPrice || 0);
    return sum + price * (margin / 100);
  }, 0);

  if (!isOpen) return null;

  // Filter out already added items
  const filteredSuggestions = suggestions.filter(
    (s) => !addedItems.includes(s.productId || s.product_id)
  );

  const filteredCrossSells = crossSells.filter(
    (s) => !addedItems.includes(s.productId || s.product_id)
  );

  // Check if there's anything to show
  const hasAnythingToShow = filteredSuggestions.length > 0 || hasBundles || filteredCrossSells.length > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`
          absolute inset-4 md:inset-8 lg:inset-12
          bg-white rounded-2xl shadow-2xl
          flex flex-col overflow-hidden
          animate-in fade-in slide-in-from-bottom-4 duration-300
          ${className}
        `}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Before you go...
                </h2>
                <p className="text-sm text-gray-600">
                  Items that go great with your purchase
                </p>
              </div>
            </div>

            <button
              onClick={handleSkip}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Added items indicator */}
          {addedItems.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">{addedItems.length} item{addedItems.length !== 1 ? 's' : ''} added to cart</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && !hasSuggestions ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-gray-50 rounded-xl animate-pulse">
                  <div className="h-32 bg-gray-200 rounded-t-xl" />
                  <div className="p-4">
                    <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
                    <div className="h-4 w-full bg-gray-200 rounded mb-3" />
                    <div className="h-10 w-full bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasAnythingToShow ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium">You're all set!</p>
              <p className="text-sm">No additional suggestions for this order</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Bundle suggestions */}
              {hasBundles && bundles.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Save with a Bundle
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {bundles.map((bundle) => (
                      <BundleSuggestion
                        key={bundle.id}
                        bundle={bundle}
                        onAdd={handleAddBundle}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* High-margin cross-sells (for staff view) */}
              {showMargin && filteredCrossSells.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    High-Value Add-Ons
                    <span className="text-xs font-normal text-gray-400">(Staff view)</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredCrossSells.slice(0, 4).map((product) => (
                      <ProductSuggestionCard
                        key={product.productId || product.product_id}
                        product={product}
                        variant="detailed"
                        onAdd={handleAdd}
                        onDismiss={handleDismiss}
                        onClick={handleClick}
                        showMargin={showMargin}
                        showScore
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Regular suggestions */}
              {filteredSuggestions.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    Recommended for You
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredSuggestions.map((product) => (
                      <ProductSuggestionCard
                        key={product.productId || product.product_id}
                        product={product}
                        variant="detailed"
                        onAdd={handleAdd}
                        onDismiss={handleDismiss}
                        onClick={handleClick}
                        showMargin={showMargin}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            {/* Cart total */}
            <div>
              <p className="text-sm text-gray-500">Cart Total</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(total)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSkip}
                className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
              >
                No thanks
              </button>

              <button
                onClick={handleProceed}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                Proceed to Payment
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Thank you toast */}
        {showThankYou && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-500 text-white font-medium rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
            Added to cart!
          </div>
        )}
      </div>
    </div>
  );
}

export default PreCheckoutSuggestions;
