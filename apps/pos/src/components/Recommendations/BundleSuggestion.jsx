/**
 * TeleTime POS - Bundle Suggestion Component
 * Displays smart bundle offers with savings highlight
 */

import { useState, useCallback } from 'react';
import { formatCurrency } from '../../utils/formatters';

/**
 * Bundle suggestion component
 * @param {object} props
 * @param {object} props.bundle - Bundle data with products, pricing, savings
 * @param {function} props.onAdd - Callback when bundle is added to cart
 * @param {function} props.onDismiss - Callback when bundle is dismissed
 * @param {string} props.variant - 'standard' | 'compact' | 'featured'
 * @param {string} props.className - Additional CSS classes
 */
export function BundleSuggestion({
  bundle,
  onAdd,
  onDismiss,
  variant = 'standard',
  className = '',
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const {
    id,
    name,
    products = [],
    originalPrice,
    bundlePrice,
    savings,
    savingsPercent,
  } = bundle;

  // Handle add bundle
  const handleAdd = useCallback(() => {
    if (isAdding) return;

    setIsAdding(true);
    onAdd?.(bundle);

    setTimeout(() => {
      setIsAdding(false);
    }, 500);
  }, [bundle, onAdd, isAdding]);

  // Handle dismiss
  const handleDismiss = useCallback(
    (e) => {
      e.stopPropagation();
      setIsDismissing(true);

      setTimeout(() => {
        onDismiss?.(id);
      }, 200);
    },
    [id, onDismiss]
  );

  // Compact variant
  if (variant === 'compact') {
    return (
      <div
        className={`
          group relative flex items-center gap-4 p-3
          bg-gradient-to-r from-green-50 to-emerald-50
          border border-green-200 rounded-xl
          hover:border-green-300 hover:shadow-md
          transition-all duration-200
          ${isDismissing ? 'opacity-0 scale-95' : ''}
          ${className}
        `}
      >
        {/* Bundle icon */}
        <div className="p-2 bg-green-100 rounded-lg">
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{name}</p>
            <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">
              Save {formatCurrency(savings)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {products.length} items included
          </p>
        </div>

        {/* Price */}
        <div className="text-right">
          <p className="text-xs text-gray-400 line-through">
            {formatCurrency(originalPrice)}
          </p>
          <p className="text-lg font-bold text-green-600">
            {formatCurrency(bundlePrice)}
          </p>
        </div>

        {/* Add button */}
        <button
          onClick={handleAdd}
          className={`
            px-4 py-2 rounded-lg font-medium text-sm
            ${
              isAdding
                ? 'bg-green-500 text-white'
                : 'bg-green-600 text-white hover:bg-green-700'
            }
            transition-all duration-200
          `}
        >
          {isAdding ? 'Added!' : 'Add Bundle'}
        </button>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="absolute -top-1 -right-1 p-1 bg-white rounded-full shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Featured variant (larger, more prominent)
  if (variant === 'featured') {
    return (
      <div
        className={`
          group relative overflow-hidden
          bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600
          rounded-2xl shadow-lg
          ${isDismissing ? 'opacity-0 scale-95' : ''}
          ${className}
        `}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <pattern id="bundle-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="2" fill="white" />
            </pattern>
            <rect width="100" height="100" fill="url(#bundle-pattern)" />
          </svg>
        </div>

        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="inline-block px-3 py-1 bg-white/20 text-white text-xs font-bold rounded-full mb-2">
                BUNDLE DEAL
              </span>
              <h3 className="text-xl font-bold text-white">{name}</h3>
            </div>
            <div className="text-right">
              <p className="text-green-100 text-sm line-through">
                {formatCurrency(originalPrice)}
              </p>
              <p className="text-3xl font-bold text-white">
                {formatCurrency(bundlePrice)}
              </p>
            </div>
          </div>

          {/* Products */}
          <div className="flex gap-3 mb-4">
            {products.slice(0, 4).map((product, index) => (
              <div
                key={product.productId || product.product_id || index}
                className="w-16 h-16 bg-white rounded-lg overflow-hidden shadow-md"
              >
                {product.imageUrl || product.image_url ? (
                  <img
                    src={product.imageUrl || product.image_url}
                    alt={product.productName || product.name}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
            {products.length > 4 && (
              <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
                <span className="text-white font-semibold">+{products.length - 4}</span>
              </div>
            )}
          </div>

          {/* Savings badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className="px-3 py-1.5 bg-yellow-400 text-yellow-900 font-bold text-sm rounded-full flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
              </svg>
              Save {savingsPercent}%
            </div>
            <span className="text-green-100 text-sm">
              You save {formatCurrency(savings)}
            </span>
          </div>

          {/* Add button */}
          <button
            onClick={handleAdd}
            className={`
              w-full py-3 rounded-xl font-bold text-lg
              flex items-center justify-center gap-2
              ${
                isAdding
                  ? 'bg-yellow-400 text-yellow-900'
                  : 'bg-white text-green-600 hover:bg-green-50'
              }
              transition-all duration-200 shadow-lg
            `}
          >
            {isAdding ? (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Added to Cart!
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Add Complete Bundle
              </>
            )}
          </button>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Standard variant (default)
  return (
    <div
      className={`
        group relative overflow-hidden
        bg-white border-2 border-green-200 rounded-xl
        hover:border-green-300 hover:shadow-lg
        transition-all duration-200
        ${isDismissing ? 'opacity-0 scale-95' : ''}
        ${className}
      `}
    >
      {/* Savings ribbon */}
      <div className="absolute top-3 -right-8 transform rotate-45 bg-green-500 text-white text-xs font-bold py-1 px-8 shadow-sm">
        SAVE {savingsPercent}%
      </div>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-semibold text-gray-900">{name}</h4>
            <p className="text-xs text-gray-500">
              {products.length} items · Complete setup
            </p>
          </div>
        </div>

        {/* Products preview */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {products.map((product, index) => (
            <div
              key={product.productId || product.product_id || index}
              className="flex-shrink-0"
            >
              <div className="w-14 h-14 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                {product.imageUrl || product.image_url ? (
                  <img
                    src={product.imageUrl || product.image_url}
                    alt={product.productName || product.name}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-500 text-center mt-1 truncate w-14">
                {product.productName || product.name}
              </p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="flex items-center justify-between mb-4 py-3 px-4 bg-green-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Bundle Price</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-green-600">
                {formatCurrency(bundlePrice)}
              </span>
              <span className="text-sm text-gray-400 line-through">
                {formatCurrency(originalPrice)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-green-600 font-medium">You save</p>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency(savings)}
            </p>
          </div>
        </div>

        {/* Add button */}
        <button
          onClick={handleAdd}
          className={`
            w-full py-3 rounded-lg font-semibold
            flex items-center justify-center gap-2
            ${
              isAdding
                ? 'bg-green-500 text-white'
                : 'bg-green-600 text-white hover:bg-green-700 active:scale-[0.98]'
            }
            transition-all duration-200
          `}
        >
          {isAdding ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Added!
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Bundle to Cart
            </>
          )}
        </button>
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={handleDismiss}
          className="absolute top-2 left-2 p-1 bg-white rounded-full shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default BundleSuggestion;
