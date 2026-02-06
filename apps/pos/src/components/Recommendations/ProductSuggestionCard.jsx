/**
 * TeleTime POS - Product Suggestion Card
 * Compact card for displaying recommended products
 */

import { useState, useCallback, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';

/**
 * Product suggestion card component
 * @param {object} props
 * @param {object} props.product - Product data
 * @param {function} props.onAdd - Callback when product is added to cart
 * @param {function} props.onDismiss - Callback when suggestion is dismissed
 * @param {function} props.onClick - Callback when card is clicked (for tracking)
 * @param {string} props.reason - Reason for recommendation (e.g., "Frequently bought together")
 * @param {number} props.score - Recommendation score (0-100)
 * @param {boolean} props.showScore - Show recommendation score (for staff)
 * @param {boolean} props.showMargin - Show margin info (for staff)
 * @param {string} props.variant - 'compact' | 'standard' | 'detailed'
 * @param {boolean} props.disabled - Disable interactions
 * @param {string} props.className - Additional CSS classes
 */
export function ProductSuggestionCard({
  product,
  onAdd,
  onDismiss,
  onClick,
  reason,
  score,
  showScore = false,
  showMargin = false,
  variant = 'standard',
  disabled = false,
  className = '',
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Extract product data
  const productId = product.productId || product.product_id || product.id;
  const productName = product.productName || product.product_name || product.name;
  const sku = product.sku || product.productSku || product.product_sku;
  const price = parseFloat(product.price || product.unitPrice || product.unit_price || 0);
  const imageUrl = product.imageUrl || product.image_url || product.image;
  const stockQty = product.stockQty || product.stock_quantity || product.qty_on_hand || 0;
  const marginPercent = product.marginPercent || product.margin_percent;
  const relationshipType = product.relationship_type || product.relationshipType;

  // Get relationship label
  const getRelationshipLabel = () => {
    if (reason) return reason;
    switch (relationshipType) {
      case 'bought_together':
        return 'Frequently bought together';
      case 'accessory':
        return 'Recommended accessory';
      case 'upgrade':
        return 'Upgrade option';
      case 'alternative':
        return 'Similar item';
      default:
        return 'You might like';
    }
  };

  // Handle add to cart
  const handleAdd = useCallback(
    (e) => {
      e.stopPropagation();
      if (disabled || isAdding) return;

      setIsAdding(true);
      onAdd?.(product);

      setTimeout(() => {
        setIsAdding(false);
      }, 300);
    },
    [product, onAdd, disabled, isAdding]
  );

  // Handle dismiss
  const handleDismiss = useCallback(
    (e) => {
      e.stopPropagation();
      setIsDismissing(true);

      setTimeout(() => {
        onDismiss?.(productId);
      }, 200);
    },
    [productId, onDismiss]
  );

  // Handle card click
  const handleClick = useCallback(() => {
    onClick?.(product);
  }, [product, onClick]);

  // Compact variant (for sidebar)
  if (variant === 'compact') {
    return (
      <div
        className={`
          group relative flex items-center gap-3 p-2
          bg-white border border-gray-100 rounded-lg
          hover:border-blue-200 hover:shadow-sm
          transition-all duration-200
          ${isDismissing ? 'opacity-0 scale-95' : ''}
          ${className}
        `}
        onClick={handleClick}
      >
        {/* Image */}
        <div className="w-12 h-12 flex-shrink-0 rounded-md bg-gray-50 overflow-hidden">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={productName}
              onError={() => setImageError(true)}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{productName}</p>
          <p className="text-sm font-semibold text-blue-600">{formatCurrency(price)}</p>
        </div>

        {/* Add button */}
        <button
          onClick={handleAdd}
          disabled={disabled || stockQty <= 0}
          className={`
            flex-shrink-0 p-2 rounded-full
            ${
              isAdding
                ? 'bg-green-500 text-white'
                : stockQty <= 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            }
            transition-all duration-200
          `}
        >
          {isAdding ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
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

  // Detailed variant (for modal)
  if (variant === 'detailed') {
    return (
      <div
        className={`
          group relative bg-white border border-gray-200 rounded-xl overflow-hidden
          hover:border-blue-300 hover:shadow-lg
          transition-all duration-200
          ${isDismissing ? 'opacity-0 scale-95' : ''}
          ${className}
        `}
        onClick={handleClick}
      >
        {/* Image */}
        <div className="relative w-full h-32 bg-gray-50 overflow-hidden">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={productName}
              onError={() => setImageError(true)}
              className="w-full h-full object-contain p-4"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}

          {/* Score badge */}
          {showScore && score && (
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full">
              {Math.round(score)}% match
            </div>
          )}

          {/* Dismiss button */}
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Relationship label */}
          <p className="text-xs text-blue-600 font-medium mb-1">
            {getRelationshipLabel()}
          </p>

          {/* Product name */}
          <h4 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1">
            {productName}
          </h4>

          {/* SKU */}
          {sku && (
            <p className="text-xs text-gray-500 mb-2">{sku}</p>
          )}

          {/* Price and margin */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-bold text-gray-900">
              {formatCurrency(price)}
            </span>
            {showMargin && marginPercent && (
              <span className="text-xs text-green-600 font-medium">
                {marginPercent.toFixed(1)}% margin
              </span>
            )}
          </div>

          {/* Stock status */}
          {stockQty <= 5 && stockQty > 0 && (
            <p className="text-xs text-orange-600 mb-2">
              Only {stockQty} left in stock
            </p>
          )}

          {/* Add button */}
          <button
            onClick={handleAdd}
            disabled={disabled || stockQty <= 0}
            className={`
              w-full py-2.5 px-4 rounded-lg font-medium text-sm
              flex items-center justify-center gap-2
              transition-all duration-200
              ${
                isAdding
                  ? 'bg-green-500 text-white'
                  : stockQty <= 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]'
              }
            `}
          >
            {isAdding ? (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Added!
              </>
            ) : stockQty <= 0 ? (
              'Out of Stock'
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add to Cart
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Standard variant (default)
  return (
    <div
      className={`
        group relative flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden
        hover:border-blue-200 hover:shadow-md
        transition-all duration-200
        ${isDismissing ? 'opacity-0 scale-95' : ''}
        ${className}
      `}
      onClick={handleClick}
    >
      {/* Image */}
      <div className="relative w-full h-24 bg-gray-50 overflow-hidden">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={productName}
            onError={() => setImageError(true)}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="absolute top-1 right-1 p-1 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-3">
        {/* Relationship label */}
        <p className="text-xs text-blue-600 font-medium mb-1 truncate">
          {getRelationshipLabel()}
        </p>

        {/* Product name */}
        <h4 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2 leading-tight">
          {productName}
        </h4>

        {/* Price row */}
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">
            {formatCurrency(price)}
          </span>

          {/* Quick add button */}
          <button
            onClick={handleAdd}
            disabled={disabled || stockQty <= 0}
            className={`
              p-1.5 rounded-full
              ${
                isAdding
                  ? 'bg-green-500 text-white'
                  : stockQty <= 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }
              transition-all duration-200
            `}
          >
            {isAdding ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductSuggestionCard;
