/**
 * TeleTime POS - Cart Suggestions
 * Sidebar component showing "You might also need:" suggestions
 */

import { useEffect, useCallback, useState } from 'react';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useCartContext } from '../../context/CartContext';
import ProductSuggestionCard from './ProductSuggestionCard';

/**
 * Cart suggestions component for sidebar
 * @param {object} props
 * @param {number} props.limit - Max suggestions to show (default: 3)
 * @param {boolean} props.collapsed - Start collapsed
 * @param {string} props.title - Section title
 * @param {boolean} props.showToggle - Show collapse toggle
 * @param {string} props.className - Additional CSS classes
 */
export function CartSuggestions({
  limit = 3,
  collapsed = false,
  title = 'You might also need:',
  showToggle = true,
  className = '',
}) {
  const { items, customer, addItem } = useCartContext();
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [hasInteracted, setHasInteracted] = useState(false);

  const {
    suggestions,
    loading,
    hasSuggestions,
    declineSuggestion,
    trackImpression,
    trackClick,
    trackAdd,
  } = useSuggestions({
    cartItems: items,
    customerId: customer?.customerId || customer?.customer_id,
    context: 'cart',
    limit: limit + 2, // Fetch extra in case some are declined
    enabled: items.length > 0,
    filterDeclined: true,
  });

  // Track impressions when suggestions are shown
  useEffect(() => {
    if (suggestions.length > 0 && !isCollapsed) {
      const productIds = suggestions.map((s) => s.productId || s.product_id);
      trackImpression(productIds);
    }
  }, [suggestions, isCollapsed, trackImpression]);

  // Handle add to cart
  const handleAdd = useCallback(
    (product) => {
      trackAdd(product.productId || product.product_id);
      addItem(product);
      setHasInteracted(true);
    },
    [addItem, trackAdd]
  );

  // Handle click (view details)
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
      setHasInteracted(true);
    },
    [declineSuggestion]
  );

  // Don't render if no cart items or no suggestions
  if (items.length === 0) {
    return null;
  }

  // Show loading skeleton
  if (loading && !hasSuggestions) {
    return (
      <div className={`mt-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg animate-pulse">
              <div className="w-12 h-12 bg-gray-200 rounded-md" />
              <div className="flex-1">
                <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
              </div>
              <div className="w-8 h-8 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Don't render if no suggestions available
  if (!hasSuggestions) {
    return null;
  }

  const displayedSuggestions = suggestions.slice(0, limit);

  return (
    <div className={`mt-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-blue-500"
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
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        </div>

        {showToggle && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                isCollapsed ? '' : 'rotate-180'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions list */}
      {!isCollapsed && (
        <div className="space-y-2">
          {displayedSuggestions.map((suggestion) => (
            <ProductSuggestionCard
              key={suggestion.productId || suggestion.product_id}
              product={suggestion}
              variant="compact"
              onAdd={handleAdd}
              onDismiss={handleDismiss}
              onClick={handleClick}
              reason={suggestion.reason}
            />
          ))}

          {/* Show more indicator */}
          {suggestions.length > limit && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-full py-2 text-xs text-blue-600 hover:text-blue-700 font-medium text-center"
            >
              +{suggestions.length - limit} more suggestions
            </button>
          )}
        </div>
      )}

      {/* Collapsed state */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full py-2 px-3 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 rounded-lg flex items-center justify-center gap-2"
        >
          <span>{displayedSuggestions.length} suggestions available</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Interaction feedback */}
      {hasInteracted && displayedSuggestions.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">
          No more suggestions for now
        </p>
      )}
    </div>
  );
}

export default CartSuggestions;
