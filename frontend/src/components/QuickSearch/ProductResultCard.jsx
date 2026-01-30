/**
 * ProductResultCard - Enhanced product card with badges and role-based pricing
 */
import React from 'react';

// Format cents to dollars
const formatPrice = (cents) => {
  if (!cents && cents !== 0) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(cents / 100);
};

const ProductResultCard = ({
  product,
  viewMode = 'grid',
  userRole = 'sales',
  onAddToQuote
}) => {
  const {
    id,
    model,
    name,
    manufacturer,
    image_url,
    badges = [],
    pricing = {},
    stock_quantity,
    product_status,
    discountGuidance,
    discount_percent
  } = product;

  // Determine stock status
  const getStockStatus = () => {
    if (stock_quantity === null || stock_quantity === undefined || stock_quantity <= 0) {
      return { class: 'out-of-stock', label: 'Out' };
    }
    if (stock_quantity <= 5) {
      return { class: 'low-stock', label: stock_quantity };
    }
    return { class: 'in-stock', label: stock_quantity };
  };

  const stockStatus = getStockStatus();

  // Calculate sell price
  const sellPrice = pricing.clearance || pricing.sellPrice || pricing.msrp;
  const originalPrice = pricing.clearance ? pricing.msrp : null;

  // Handle add to quote
  const handleAddToQuote = () => {
    if (onAddToQuote) {
      onAddToQuote(product);
    }
  };

  return (
    <div className={`product-result-card ${viewMode === 'list' ? 'list-view' : ''}`}>
      {/* Image */}
      <div className="product-card-image">
        {image_url ? (
          <img src={image_url} alt={model} loading="lazy" />
        ) : (
          <span className="no-image">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </span>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className="product-badges">
            {badges.slice(0, 3).map((badge, idx) => (
              <span key={idx} className={`product-badge ${badge.type}`}>
                {badge.label}
              </span>
            ))}
          </div>
        )}

        {/* Stock Indicator */}
        <div className="stock-indicator">
          <span className={`stock-dot ${stockStatus.class}`} />
          <span>{stockStatus.label}</span>
        </div>
      </div>

      {/* Content */}
      <div className="product-card-content">
        <div className="product-info">
          <span className="product-brand">{manufacturer}</span>
          <h3 className="product-model">{model}</h3>
          <p className="product-name">{name}</p>
        </div>

        {/* Pricing */}
        <div className="product-pricing">
          <div className="price-row">
            <span className="sell-price">{formatPrice(sellPrice)}</span>
            {originalPrice && (
              <span className="original-price">{formatPrice(originalPrice)}</span>
            )}
            {discount_percent > 0 && (
              <span className="product-badge discount" style={{ marginLeft: '0.5rem' }}>
                {discount_percent}% OFF
              </span>
            )}
          </div>

          {/* Role-specific pricing info */}
          {(userRole === 'admin' || userRole === 'manager') && pricing.cost && (
            <div className="price-row">
              <span className="price-label">Cost: {formatPrice(pricing.cost)}</span>
              {pricing.margin && (
                <span className="margin-info">{pricing.margin}% margin</span>
              )}
            </div>
          )}

          {userRole === 'admin' && pricing.floor && (
            <div className="price-row">
              <span className="price-label">Floor: {formatPrice(pricing.floor)}</span>
            </div>
          )}
        </div>

        {/* Stock Status - Prominent Display */}
        <div className={`stock-status-display ${stockStatus.class}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span className="stock-label">
            {stock_quantity === null || stock_quantity === undefined
              ? 'Stock: N/A'
              : stock_quantity <= 0
                ? 'Out of Stock'
                : stock_quantity <= 5
                  ? `Only ${stock_quantity} left!`
                  : `In Stock: ${stock_quantity}`
            }
          </span>
        </div>

        {/* Discount Guidance (Sales role) */}
        {userRole === 'sales' && discountGuidance?.canNegotiate && (
          <div className="discount-guidance">
            <span className="guidance-label">Discount OK:</span>
            <span className="guidance-value"> Up to {discountGuidance.maxDiscountPercent}%</span>
          </div>
        )}

        {/* Actions */}
        <div className="product-actions">
          <button
            className="add-to-quote-btn"
            onClick={handleAddToQuote}
            disabled={stock_quantity <= 0}
          >
            {stock_quantity <= 0 ? 'Out of Stock' : 'Add to Quote'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductResultCard;
