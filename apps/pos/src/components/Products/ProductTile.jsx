/**
 * TeleTime POS - Product Tile Component
 * Individual product card for the product grid
 */

import { useState, useCallback } from 'react';
import { formatCurrency } from '../../utils/formatters';

/**
 * Get stock status indicator
 * @param {number} quantity - Stock quantity
 * @returns {object} Status with color and label
 */
const getStockStatus = (quantity) => {
  if (quantity <= 0) {
    return { color: 'bg-red-500', label: 'Out of stock', level: 'out' };
  }
  if (quantity <= 5) {
    return { color: 'bg-yellow-500', label: 'Low stock', level: 'low' };
  }
  return { color: 'bg-green-500', label: 'In stock', level: 'ok' };
};

/**
 * Product tile component
 * @param {object} props
 * @param {object} props.product - Product data
 * @param {function} props.onSelect - Callback when product is selected/clicked
 * @param {boolean} props.disabled - Disable interaction
 * @param {string} props.className - Additional CSS classes
 */
export function ProductTile({
  product,
  onSelect,
  disabled = false,
  className = '',
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Extract product data (handle different field naming)
  const productId = product.productId || product.product_id || product.id;
  const productName = product.productName || product.product_name || product.name;
  const sku = product.productSku || product.product_sku || product.sku;
  const price = parseFloat(product.unitPrice || product.unit_price || product.price || 0);
  // Handle various stock field names from different API responses
  const quantity = product.stockQty || product.stock_quantity || product.qty_on_hand || product.quantity || product.stock || 0;
  const imageUrl = product.imageUrl || product.image_url || product.image;

  const stockStatus = getStockStatus(quantity);
  const isOutOfStock = stockStatus.level === 'out';

  // Handle product click
  const handleClick = useCallback(() => {
    if (disabled || isOutOfStock) return;

    setIsAdding(true);
    onSelect?.(product);

    // Reset animation after completion
    setTimeout(() => {
      setIsAdding(false);
    }, 150);
  }, [product, onSelect, disabled, isOutOfStock]);

  // Handle image error
  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isOutOfStock}
      className={`
        relative
        flex flex-col
        w-full min-h-[160px]
        p-3
        bg-white
        border-2 border-gray-100
        rounded-xl
        text-left
        transition-all duration-150
        ${
          disabled || isOutOfStock
            ? 'opacity-60 cursor-not-allowed'
            : 'hover:border-blue-300 hover:shadow-lg active:scale-[0.98] cursor-pointer'
        }
        ${isAdding ? 'scale-[0.95] border-green-400 bg-green-50' : ''}
        ${className}
      `}
      aria-label={`Add ${productName} to cart`}
    >
      {/* Stock Badge */}
      <div
        className={`
          absolute top-1.5 right-1.5
          flex items-center gap-1
          px-1.5 py-0.5
          rounded-full
          text-[10px] font-semibold
          ${stockStatus.level === 'ok' ? 'bg-green-100 text-green-700' :
            stockStatus.level === 'low' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'}
        `}
        title={stockStatus.label}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${stockStatus.color}`} />
        {stockStatus.level === 'ok' ? 'In Stock' :
         stockStatus.level === 'low' ? `Low (${quantity})` :
         'Out'}
      </div>

      {/* Product Image */}
      <div className="w-full h-20 mb-2 flex items-center justify-center overflow-hidden rounded-lg bg-gray-50">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={productName}
            onError={handleImageError}
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Product Name */}
      <h3
        className="
          text-sm font-semibold text-gray-900
          line-clamp-2
          leading-tight
          mb-1
        "
        title={productName}
      >
        {productName}
      </h3>

      {/* SKU */}
      <p className="text-xs text-gray-500 mb-2 truncate" title={sku}>
        {sku}
      </p>

      {/* Price */}
      <div className="mt-auto">
        <span className="text-lg font-bold text-gray-900">
          {formatCurrency(price)}
        </span>
      </div>

      {/* Location Availability Pills */}
      {product.location_stock && product.location_stock.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {product.location_stock.map((loc) => (
            <span
              key={loc.location_id}
              className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                loc.quantity_available > 0
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-400'
              }`}
              title={`${loc.location_name}: ${loc.quantity_available} available`}
            >
              {(loc.location_code || loc.location_name || '').slice(0, 6)}
              {loc.quantity_available > 0 ? ' \u2713' : ' \u2717'}
            </span>
          ))}
        </div>
      )}

      {/* Out of stock overlay */}
      {isOutOfStock && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-xl">
          <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
            Out of Stock
          </span>
        </div>
      )}

      {/* Add animation pulse */}
      {isAdding && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center animate-ping opacity-75">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}

export default ProductTile;
