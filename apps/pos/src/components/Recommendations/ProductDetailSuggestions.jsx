/**
 * TeleTime POS - Product Detail Suggestions
 * "Goes great with:" section for product detail/quick view
 */

import { useEffect, useCallback, useState } from 'react';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useCartContext } from '../../context/CartContext';
import ProductSuggestionCard from './ProductSuggestionCard';
import { formatCurrency } from '../../utils/formatters';

/**
 * Product detail suggestions component
 * Shows accessories and related items for a specific product
 * @param {object} props
 * @param {number} props.productId - The product ID to get suggestions for
 * @param {object} props.product - Optional full product object (for additional context)
 * @param {number} props.limit - Max suggestions to show (default: 4)
 * @param {string} props.title - Section title
 * @param {boolean} props.horizontal - Display horizontally (default: true)
 * @param {string} props.className - Additional CSS classes
 */
export function ProductDetailSuggestions({
  productId,
  product,
  limit = 4,
  title = 'Goes great with:',
  horizontal = true,
  className = '',
}) {
  const { addItem, items: cartItems } = useCartContext();
  const [showAll, setShowAll] = useState(false);

  const {
    suggestions,
    loading,
    hasSuggestions,
    declineSuggestion,
    trackImpression,
    trackClick,
    trackAdd,
    refresh,
  } = useSuggestions({
    productId,
    context: 'product',
    limit: limit + 3, // Fetch extra in case some are filtered
    enabled: !!productId,
    filterDeclined: true,
    cartItems, // Pass cart items to filter out already-in-cart products
  });

  // Track impressions
  useEffect(() => {
    if (suggestions.length > 0) {
      const productIds = suggestions
        .slice(0, showAll ? suggestions.length : limit)
        .map((s) => s.productId || s.product_id);
      trackImpression(productIds);
    }
  }, [suggestions, showAll, limit, trackImpression]);

  // Handle add to cart
  const handleAdd = useCallback(
    (suggestedProduct) => {
      trackAdd(suggestedProduct.productId || suggestedProduct.product_id);
      addItem(suggestedProduct);
    },
    [addItem, trackAdd]
  );

  // Handle click
  const handleClick = useCallback(
    (suggestedProduct) => {
      trackClick(suggestedProduct.productId || suggestedProduct.product_id);
    },
    [trackClick]
  );

  // Handle dismiss
  const handleDismiss = useCallback(
    (dismissedProductId) => {
      declineSuggestion(dismissedProductId);
    },
    [declineSuggestion]
  );

  // Don't render if no product or no suggestions
  if (!productId) {
    return null;
  }

  // Loading skeleton
  if (loading && !hasSuggestions) {
    return (
      <div className={`mt-6 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-5 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className={`${horizontal ? 'flex gap-3 overflow-x-auto pb-2' : 'grid grid-cols-2 gap-3'}`}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`${horizontal ? 'flex-shrink-0 w-40' : ''} bg-gray-50 rounded-xl animate-pulse`}
            >
              <div className="h-24 bg-gray-200 rounded-t-xl" />
              <div className="p-3">
                <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-full bg-gray-200 rounded mb-2" />
                <div className="h-5 w-12 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Don't render if no suggestions
  if (!hasSuggestions) {
    return null;
  }

  const displayedSuggestions = showAll ? suggestions : suggestions.slice(0, limit);
  const hasMore = suggestions.length > limit;

  // Group by relationship type
  const accessories = displayedSuggestions.filter(
    (s) => s.relationship_type === 'accessory'
  );
  const boughtTogether = displayedSuggestions.filter(
    (s) => s.relationship_type === 'bought_together'
  );
  const upgrades = displayedSuggestions.filter(
    (s) => s.relationship_type === 'upgrade'
  );
  const others = displayedSuggestions.filter(
    (s) =>
      !['accessory', 'bought_together', 'upgrade'].includes(s.relationship_type)
  );

  // Render horizontal layout
  if (horizontal) {
    return (
      <div className={`mt-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          </div>
          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              See all ({suggestions.length})
            </button>
          )}
        </div>

        {/* Horizontal scroll container */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
          {displayedSuggestions.map((suggestion) => (
            <div
              key={suggestion.productId || suggestion.product_id}
              className="flex-shrink-0 w-40"
            >
              <ProductSuggestionCard
                product={suggestion}
                variant="standard"
                onAdd={handleAdd}
                onDismiss={handleDismiss}
                onClick={handleClick}
                reason={
                  suggestion.relationship_type === 'accessory'
                    ? 'Accessory'
                    : suggestion.relationship_type === 'bought_together'
                    ? 'Often bought together'
                    : null
                }
              />
            </div>
          ))}
        </div>

        {/* Show less button */}
        {showAll && hasMore && (
          <button
            onClick={() => setShowAll(false)}
            className="mt-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Show less
          </button>
        )}
      </div>
    );
  }

  // Render grid layout (vertical)
  return (
    <div className={`mt-6 ${className}`}>
      {/* Accessories section */}
      {accessories.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
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
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <h4 className="text-sm font-semibold text-gray-700">Accessories</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {accessories.map((suggestion) => (
              <ProductSuggestionCard
                key={suggestion.productId || suggestion.product_id}
                product={suggestion}
                variant="standard"
                onAdd={handleAdd}
                onDismiss={handleDismiss}
                onClick={handleClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* Bought together section */}
      {boughtTogether.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-4 h-4 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h4 className="text-sm font-semibold text-gray-700">Frequently bought together</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {boughtTogether.map((suggestion) => (
              <ProductSuggestionCard
                key={suggestion.productId || suggestion.product_id}
                product={suggestion}
                variant="standard"
                onAdd={handleAdd}
                onDismiss={handleDismiss}
                onClick={handleClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upgrades section */}
      {upgrades.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-4 h-4 text-purple-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            <h4 className="text-sm font-semibold text-gray-700">Upgrade options</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {upgrades.map((suggestion) => (
              <ProductSuggestionCard
                key={suggestion.productId || suggestion.product_id}
                product={suggestion}
                variant="standard"
                onAdd={handleAdd}
                onDismiss={handleDismiss}
                onClick={handleClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* Other suggestions */}
      {others.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {others.map((suggestion) => (
              <ProductSuggestionCard
                key={suggestion.productId || suggestion.product_id}
                product={suggestion}
                variant="standard"
                onAdd={handleAdd}
                onDismiss={handleDismiss}
                onClick={handleClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* Show more/less */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium text-center"
        >
          {showAll ? 'Show less' : `Show ${suggestions.length - limit} more`}
        </button>
      )}
    </div>
  );
}

export default ProductDetailSuggestions;
