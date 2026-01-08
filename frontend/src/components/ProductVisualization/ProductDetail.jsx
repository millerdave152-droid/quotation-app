import React, { useState, useEffect } from 'react';
import ImageGallery from './ImageGallery';

const API_BASE = '/api';

/**
 * ProductDetail - Full product detail view with image gallery,
 * specifications, features, and downloadable assets
 */
function ProductDetail({ productId, onBack }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('specs');

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/vendor-products/${productId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch product');
      }

      const data = await response.json();
      setProduct(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents) => {
    if (!cents) return 'N/A';
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  // Helper to get asset download URL - prefer local path over external URL
  const getAssetDownloadUrl = (asset) => {
    if (asset.local_path) {
      return asset.local_path;
    }
    return asset.original_url;
  };

  if (loading) {
    return (
      <div className="pd-loading">
        <div className="pd-spinner"></div>
        <span>Loading product details...</span>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="pd-error">
        <p>{error || 'Product not found'}</p>
        <button onClick={onBack}>Go Back</button>
      </div>
    );
  }

  const specs = product.specifications || {};
  const features = product.features || [];
  const dimensions = product.dimensions || {};
  const assets = product.assets || [];
  const images = product.images || [];

  return (
    <div className="product-detail">
      {/* Back Button */}
      <button className="pd-back" onClick={onBack}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"/>
        </svg>
        Back to Products
      </button>

      <div className="pd-main">
        {/* Image Gallery */}
        <div className="pd-gallery">
          <ImageGallery images={images} productName={product.name} />
        </div>

        {/* Product Info */}
        <div className="pd-info">
          <div className="pd-brand">{product.brand || 'Unknown Brand'}</div>
          <h1 className="pd-name">{product.name}</h1>
          <div className="pd-model">Model: {product.model_number}</div>

          {product.category && (
            <div className="pd-category">
              <span>{product.category}</span>
              {product.subcategory && <span> / {product.subcategory}</span>}
            </div>
          )}

          {/* Pricing */}
          <div className="pd-pricing">
            <div className="pd-price-row">
              <span className="pd-price-label">MSRP:</span>
              <span className="pd-price-value">{formatPrice(product.msrp_cents)}</span>
            </div>
            {product.dealer_price_cents && (
              <div className="pd-price-row pd-dealer">
                <span className="pd-price-label">Dealer Price:</span>
                <span className="pd-price-value">{formatPrice(product.dealer_price_cents)}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div className="pd-description">
              <p>{product.description}</p>
            </div>
          )}

          {/* Quick Info */}
          <div className="pd-quick-info">
            {product.color_finish && (
              <div className="pd-qi-item">
                <span className="pd-qi-label">Color/Finish:</span>
                <span className="pd-qi-value">{product.color_finish}</span>
              </div>
            )}
            {product.energy_rating && (
              <div className="pd-qi-item">
                <span className="pd-qi-label">Energy Rating:</span>
                <span className="pd-qi-value">{product.energy_rating}</span>
              </div>
            )}
            {Object.keys(dimensions).length > 0 && (
              <div className="pd-qi-item">
                <span className="pd-qi-label">Dimensions:</span>
                <span className="pd-qi-value">
                  {dimensions.width && `${dimensions.width}"W`}
                  {dimensions.height && ` x ${dimensions.height}"H`}
                  {dimensions.depth && ` x ${dimensions.depth}"D`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pd-tabs">
        <button
          className={activeTab === 'specs' ? 'active' : ''}
          onClick={() => setActiveTab('specs')}
        >
          Specifications ({Object.keys(specs).length})
        </button>
        <button
          className={activeTab === 'features' ? 'active' : ''}
          onClick={() => setActiveTab('features')}
        >
          Features ({features.length})
        </button>
        <button
          className={activeTab === 'assets' ? 'active' : ''}
          onClick={() => setActiveTab('assets')}
        >
          Downloads ({assets.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="pd-tab-content">
        {activeTab === 'specs' && (
          <div className="pd-specs">
            {Object.keys(specs).length === 0 ? (
              <p className="pd-empty">No specifications available</p>
            ) : (
              <table className="pd-specs-table">
                <tbody>
                  {Object.entries(specs).map(([key, value]) => (
                    <tr key={key}>
                      <td className="pd-spec-key">{key}</td>
                      <td className="pd-spec-value">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'features' && (
          <div className="pd-features">
            {features.length === 0 ? (
              <p className="pd-empty">No features listed</p>
            ) : (
              <ul className="pd-features-list">
                {features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="pd-assets">
            {assets.length === 0 ? (
              <p className="pd-empty">No downloadable assets</p>
            ) : (
              <div className="pd-assets-list">
                {assets.map((asset, idx) => (
                  <a
                    key={idx}
                    href={getAssetDownloadUrl(asset)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pd-asset-item"
                  >
                    <span className="pd-asset-type">{asset.asset_type}</span>
                    <span className="pd-asset-name">{asset.name || 'Download'}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .product-detail {
          padding: 20px;
        }

        .pd-loading, .pd-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #666;
        }

        .pd-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f0f0f0;
          border-top-color: #2196F3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .pd-error button {
          margin-top: 16px;
          padding: 10px 20px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        .pd-back {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
          margin-bottom: 24px;
        }

        .pd-back:hover {
          background: #eee;
        }

        .pd-main {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 32px;
        }

        .pd-gallery {
          position: sticky;
          top: 20px;
        }

        .pd-brand {
          font-size: 12px;
          color: #2196F3;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pd-name {
          margin: 8px 0 4px 0;
          font-size: 28px;
          font-weight: 600;
          color: #1a1a2e;
          line-height: 1.2;
        }

        .pd-model {
          font-size: 14px;
          color: #666;
          font-family: monospace;
          margin-bottom: 8px;
        }

        .pd-category {
          font-size: 13px;
          color: #888;
          margin-bottom: 20px;
        }

        .pd-pricing {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .pd-price-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .pd-price-row:last-child {
          margin-bottom: 0;
        }

        .pd-price-label {
          color: #666;
          font-size: 14px;
        }

        .pd-price-value {
          font-size: 18px;
          font-weight: 600;
          color: #1a1a2e;
        }

        .pd-dealer .pd-price-value {
          color: #4CAF50;
        }

        .pd-description {
          margin-bottom: 20px;
          line-height: 1.6;
          color: #444;
        }

        .pd-quick-info {
          border-top: 1px solid #eee;
          padding-top: 16px;
        }

        .pd-qi-item {
          display: flex;
          margin-bottom: 8px;
        }

        .pd-qi-label {
          width: 120px;
          color: #666;
          font-size: 13px;
        }

        .pd-qi-value {
          color: #1a1a2e;
          font-size: 13px;
        }

        .pd-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 2px solid #e0e0e0;
          margin-bottom: 20px;
        }

        .pd-tabs button {
          padding: 12px 24px;
          border: none;
          background: none;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
        }

        .pd-tabs button:hover {
          color: #2196F3;
        }

        .pd-tabs button.active {
          color: #2196F3;
          border-bottom-color: #2196F3;
        }

        .pd-tab-content {
          min-height: 200px;
        }

        .pd-empty {
          text-align: center;
          color: #888;
          padding: 40px;
        }

        .pd-specs-table {
          width: 100%;
          border-collapse: collapse;
        }

        .pd-specs-table tr:nth-child(even) {
          background: #f9f9f9;
        }

        .pd-specs-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
        }

        .pd-spec-key {
          width: 40%;
          font-weight: 500;
          color: #444;
        }

        .pd-spec-value {
          color: #666;
        }

        .pd-features-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .pd-features-list li {
          padding: 12px 0;
          border-bottom: 1px solid #eee;
          position: relative;
          padding-left: 24px;
        }

        .pd-features-list li:before {
          content: '';
          position: absolute;
          left: 0;
          top: 18px;
          width: 8px;
          height: 8px;
          background: #2196F3;
          border-radius: 50%;
        }

        .pd-assets-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .pd-asset-item {
          display: flex;
          flex-direction: column;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
        }

        .pd-asset-item:hover {
          background: #e3f2fd;
        }

        .pd-asset-type {
          font-size: 11px;
          color: #2196F3;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .pd-asset-name {
          font-size: 14px;
          color: #1a1a2e;
        }

        @media (max-width: 900px) {
          .pd-main {
            grid-template-columns: 1fr;
          }

          .pd-gallery {
            position: static;
          }
        }
      `}</style>
    </div>
  );
}

export default ProductDetail;
