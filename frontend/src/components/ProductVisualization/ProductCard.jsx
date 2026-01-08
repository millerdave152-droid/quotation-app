import React from 'react';

const API_BASE = '/api';

/**
 * ProductCard - Card display for a vendor product
 * Supports grid and list view modes
 */
function ProductCard({ product, viewMode = 'grid', onClick }) {
  // Format price from cents
  const formatPrice = (cents) => {
    if (!cents) return null;
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  // Brand colors for styled placeholders
  const brandColors = {
    'Whirlpool': { bg: '#1a4480', text: '#ffffff', accent: '#ffc107' },
    'KitchenAid': { bg: '#b71c1c', text: '#ffffff', accent: '#ffffff' },
    'Maytag': { bg: '#0d47a1', text: '#ffffff', accent: '#ffc107' },
    'Amana': { bg: '#2e7d32', text: '#ffffff', accent: '#ffffff' },
    'JennAir': { bg: '#212121', text: '#ffffff', accent: '#b0bec5' },
    'default': { bg: '#37474f', text: '#ffffff', accent: '#90a4ae' }
  };

  // Get primary image URL with branded placeholder
  const getImageUrl = () => {
    if (product.primary_image) {
      return product.primary_image;
    }

    // Get brand colors
    const colors = brandColors[product.brand] || brandColors.default;
    const brand = (product.brand || 'PRODUCT').toUpperCase();
    const model = product.model_number || '';

    // Category icons (simple shapes)
    let categoryIcon = '';
    const category = (product.category || '').toLowerCase();
    if (category.includes('refriger')) {
      categoryIcon = `<rect x="85" y="55" width="30" height="45" rx="2" fill="none" stroke="${colors.accent}" stroke-width="2"/>
                      <line x1="85" y1="75" x2="115" y2="75" stroke="${colors.accent}" stroke-width="1"/>`;
    } else if (category.includes('cook') || category.includes('range')) {
      categoryIcon = `<rect x="80" y="55" width="40" height="35" rx="2" fill="none" stroke="${colors.accent}" stroke-width="2"/>
                      <circle cx="90" cy="68" r="5" fill="none" stroke="${colors.accent}" stroke-width="1.5"/>
                      <circle cx="110" cy="68" r="5" fill="none" stroke="${colors.accent}" stroke-width="1.5"/>`;
    } else if (category.includes('laundry') || category.includes('wash') || category.includes('dry')) {
      categoryIcon = `<circle cx="100" cy="70" r="20" fill="none" stroke="${colors.accent}" stroke-width="2"/>
                      <circle cx="100" cy="70" r="10" fill="none" stroke="${colors.accent}" stroke-width="1"/>`;
    } else if (category.includes('clean') || category.includes('dish')) {
      categoryIcon = `<rect x="80" y="55" width="40" height="40" rx="3" fill="none" stroke="${colors.accent}" stroke-width="2"/>
                      <line x1="85" y1="65" x2="115" y2="65" stroke="${colors.accent}" stroke-width="1"/>`;
    }

    // Create branded SVG placeholder
    return 'data:image/svg+xml,' + encodeURIComponent(`
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="${colors.bg}"/>
        <text x="100" y="30" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="${colors.accent}" text-anchor="middle" letter-spacing="2">${brand}</text>
        ${categoryIcon}
        <text x="100" y="130" font-family="monospace" font-size="12" font-weight="bold" fill="${colors.text}" text-anchor="middle">${model}</text>
        <text x="100" y="155" font-family="Arial, sans-serif" font-size="9" fill="${colors.text}" text-anchor="middle" opacity="0.7">${(product.category || '').substring(0, 20)}</text>
        <rect x="0" y="180" width="200" height="20" fill="rgba(0,0,0,0.3)"/>
        <text x="100" y="193" font-family="Arial, sans-serif" font-size="9" fill="rgba(255,255,255,0.8)" text-anchor="middle">VENDOR PORTAL</text>
      </svg>
    `);
  };

  if (viewMode === 'list') {
    return (
      <div className="product-card-list" onClick={onClick}>
        <div className="pcl-image">
          <img src={getImageUrl()} alt={product.name} loading="lazy" />
        </div>

        <div className="pcl-info">
          <div className="pcl-brand">{product.brand || 'Unknown Brand'}</div>
          <h3 className="pcl-name">{product.name}</h3>
          <div className="pcl-model">{product.model_number}</div>
          {product.category && (
            <div className="pcl-category">{product.category}</div>
          )}
        </div>

        <div className="pcl-meta">
          {product.image_count > 0 && (
            <span className="pcl-images">{product.image_count} images</span>
          )}
        </div>

        <div className="pcl-pricing">
          {product.msrp_cents && (
            <div className="pcl-msrp">MSRP: {formatPrice(product.msrp_cents)}</div>
          )}
          {product.dealer_price_cents && (
            <div className="pcl-dealer">Dealer: {formatPrice(product.dealer_price_cents)}</div>
          )}
        </div>

        <style jsx>{`
          .product-card-list {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .product-card-list:hover {
            border-color: #2196F3;
            box-shadow: 0 2px 8px rgba(33, 150, 243, 0.15);
          }

          .pcl-image {
            width: 80px;
            height: 80px;
            flex-shrink: 0;
            border-radius: 6px;
            overflow: hidden;
            background: #f5f5f5;
          }

          .pcl-image img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }

          .pcl-info {
            flex: 1;
            min-width: 0;
          }

          .pcl-brand {
            font-size: 12px;
            color: #2196F3;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .pcl-name {
            margin: 4px 0;
            font-size: 16px;
            font-weight: 500;
            color: #1a1a2e;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .pcl-model {
            font-size: 13px;
            color: #666;
            font-family: monospace;
          }

          .pcl-category {
            font-size: 12px;
            color: #888;
            margin-top: 4px;
          }

          .pcl-meta {
            width: 100px;
            text-align: center;
          }

          .pcl-images {
            font-size: 12px;
            color: #666;
            background: #f5f5f5;
            padding: 4px 8px;
            border-radius: 12px;
          }

          .pcl-pricing {
            width: 140px;
            text-align: right;
          }

          .pcl-msrp {
            font-size: 14px;
            color: #666;
          }

          .pcl-dealer {
            font-size: 16px;
            font-weight: 600;
            color: #4CAF50;
          }
        `}</style>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div className="product-card-grid" onClick={onClick}>
      <div className="pcg-image">
        <img src={getImageUrl()} alt={product.name} loading="lazy" />
        {product.image_count > 1 && (
          <span className="pcg-image-count">+{product.image_count - 1}</span>
        )}
      </div>

      <div className="pcg-content">
        <div className="pcg-brand">{product.brand || 'Unknown'}</div>
        <h3 className="pcg-name">{product.name}</h3>
        <div className="pcg-model">{product.model_number}</div>

        <div className="pcg-footer">
          {product.category && (
            <span className="pcg-category">{product.category}</span>
          )}
          {product.msrp_cents && (
            <span className="pcg-price">{formatPrice(product.msrp_cents)}</span>
          )}
        </div>
      </div>

      <style jsx>{`
        .product-card-grid {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
        }

        .product-card-grid:hover {
          border-color: #2196F3;
          box-shadow: 0 4px 12px rgba(33, 150, 243, 0.15);
          transform: translateY(-2px);
        }

        .pcg-image {
          position: relative;
          aspect-ratio: 1;
          background: #f8f8f8;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .pcg-image img {
          max-width: 90%;
          max-height: 90%;
          object-fit: contain;
        }

        .pcg-image-count {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
        }

        .pcg-content {
          padding: 16px;
        }

        .pcg-brand {
          font-size: 11px;
          color: #2196F3;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .pcg-name {
          margin: 0 0 4px 0;
          font-size: 14px;
          font-weight: 500;
          color: #1a1a2e;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 36px;
        }

        .pcg-model {
          font-size: 12px;
          color: #888;
          font-family: monospace;
          margin-bottom: 12px;
        }

        .pcg-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid #f0f0f0;
        }

        .pcg-category {
          font-size: 11px;
          color: #666;
          background: #f5f5f5;
          padding: 3px 8px;
          border-radius: 10px;
        }

        .pcg-price {
          font-size: 14px;
          font-weight: 600;
          color: #1a1a2e;
        }
      `}</style>
    </div>
  );
}

export default ProductCard;
